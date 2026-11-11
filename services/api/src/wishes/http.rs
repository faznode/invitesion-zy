//! R-04 endpoints. The guest's wish (`app/i/[slug]/actions.ts`) and the host's moderation and reply (the dashboard's
//! wishes actions) write through here when Next.js sets `BACKEND_WISHES=rust`; exactly one writer is live. Each write is
//! one transaction: the wish row plus its GUESTBOOK analytics row for a guest (the TypeScript writer issues the same two
//! statements), one locked row for the host. `created_at` columns take the database default, as the TypeScript writer's
//! inserts do.

use axum::Json;
use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use super::content::read_guestbook;
use super::decision::{GuestWishDecision, HostReplyDecision, WishState, decide_guest_wish, decide_host_reply};
use crate::app::AppState;
use crate::guest_link::{self, LinkCodes, check_open};
use crate::idempotency::{self, replay};
use crate::identity::{Owner, resolve_owner};
use crate::limits;
use crate::members::{self, Capability};
use crate::problem::{ApiError, Problem, Subject};
use crate::views::utc_now;

const WISH_LINK: LinkCodes = LinkCodes { not_found: "wish.link_not_found", closed: "wish.closed" };
const NOT_FOUND: &str = "invitation_or_wish.not_found";

/// A guest's wish as the form submitted it.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuestWishRequest {
    /// As typed; trimmed and judged by the rules (1 to 1,000 UTF-16 units after trimming).
    pub message: String,
    /// The guest's public address as Next.js's trusted proxies reported it (`TRUSTED_PROXY_HOPS`), for the per-address
    /// limit only: reduced to a keyed hash, never stored or logged. Absent or not an IP literal = no per-address limit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WishSaved {
    pub id: i32,
    /// `VISIBLE`, or `PENDING` while the guestbook is moderated.
    pub state: WishState,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WishAction {
    /// Approve a pending wish or restore a hidden one.
    Show,
    Hide,
    Delete,
}

/// The host shows, hides or deletes one wish.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WishModerationRequest {
    pub action: WishAction,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ModeratedState {
    Visible,
    Hidden,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WishModerated {
    pub id: i32,
    pub state: ModeratedState,
}

/// The host's reply to one wish; an empty or blank reply clears it.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WishReplyRequest {
    pub reply: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct WishReplied {
    pub id: i32,
    /// The stored reply, trimmed; null after clearing.
    pub host_reply: Option<String>,
}

fn db(context: &'static str) -> impl FnOnce(sqlx::Error) -> ApiError {
    move |error| ApiError::internal(context, error)
}

fn to_json(value: &impl Serialize) -> Result<Value, ApiError> {
    serde_json::to_value(value).map_err(|error| ApiError::internal("wish_json", error))
}

#[utoipa::path(
    post,
    path = "/v1/guest-links/{slug}/{guest}/wishes",
    tag = "wishes",
    security(("serviceSignature" = [])),
    params(
        ("slug" = String, Path, description = "The invitation's slug"),
        ("guest" = String, Path, description = "The last segment of the guest's personal link: an opaque token, or the slug of a guest without one (B-011)"),
        ("Idempotency-Key" = Option<String>, Header, description = "1–255 visible ASCII characters; a retry with the same key and message replays the stored wish for 24 hours"),
    ),
    request_body = GuestWishRequest,
    responses(
        (status = 200, description = "Stored, or replayed (`Idempotent-Replayed: true`)", body = WishSaved),
        (status = 400, description = "Malformed body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid service signature", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "No published invitation, or no guest for this link (`wish.link_not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "The guestbook is closed (`wish.closed`; detail `disabled` or `expired`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "An empty or too long message (`wish.message_invalid`), or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "Too many wishes for this link or address (`rate_limit.exceeded`); nothing was written", body = Problem, content_type = "application/problem+json",
            headers(("Retry-After" = u64, description = "Seconds until the limit's window ends"))),
    )
)]
pub async fn guest_wish(
    State(state): State<AppState>,
    Path((slug, segment)): Path<(String, String)>,
    headers: HeaderMap,
    body: Result<Json<GuestWishRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    let key = idempotency::key_from(&headers)?;
    let now = utc_now();
    let (invitation_id, guest_id) = guest_link::resolve(&state, &slug, &segment, now, WISH_LINK).await?;

    let scope = format!("wish:guest:{guest_id}");
    // The address is left out: a retry from another network is still the same request.
    let hash = idempotency::request_hash(&request.message);
    if let Some(key) = &key
        && let Some(response) = replay(&state.pool, &scope, key, &hash).await?
    {
        return Ok(response);
    }
    limits::enforce(&state.pool, &format!("wish:link:{guest_id}"), state.limits.wish_per_link, now).await?;
    let secret = state.service_secrets.first().map(Vec::as_slice).unwrap_or_default();
    limits::enforce_address(&state.pool, secret, "wish", request.client_ip.as_deref(), state.limits.wish_per_ip, now)
        .await?;

    let mut tx = state.pool.begin().await.map_err(db("wish_begin"))?;
    // B-031: re-read inside the transaction, so a deletion after the link resolved still refuses the write.
    let invitation = sqlx::query!(
        "select status, expires_at, config from invitations where id = $1 and deleted_at is null",
        invitation_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("wish_invitation_tx"))?
    .ok_or(ApiError::NotFound(WISH_LINK.not_found))?;
    check_open(&invitation.status, invitation.expires_at, now, WISH_LINK)?;
    let guest = sqlx::query!("select name from guests where id = $1 and invitation_id = $2", guest_id, invitation_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(db("wish_guest_tx"))?
        .ok_or(ApiError::NotFound(WISH_LINK.not_found))?;

    let rules = read_guestbook(invitation.config.as_ref().unwrap_or(&Value::Null));
    let (message, is_hidden) = match decide_guest_wish(rules, &request.message) {
        GuestWishDecision::Closed => return Err(ApiError::Conflict(WISH_LINK.closed, Some("disabled".into()))),
        GuestWishDecision::Invalid => return Err(ApiError::Unprocessable("wish.message_invalid", Subject::None)),
        GuestWishDecision::Write { message, is_hidden } => (message, is_hidden),
    };

    let id = sqlx::query_scalar!(
        "insert into guest_messages (invitation_id, guest_id, name, message, is_hidden) values ($1, $2, $3, $4, $5) \
         returning id",
        invitation_id,
        guest_id,
        guest.name,
        message,
        is_hidden
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(db("wish_insert"))?;
    sqlx::query!(
        "insert into analytics_events (invitation_id, guest_id, event_type) values ($1, $2, 'GUESTBOOK')",
        invitation_id,
        guest_id
    )
    .execute(&mut *tx)
    .await
    .map_err(db("wish_event"))?;

    let saved = WishSaved { id, state: if is_hidden { WishState::Pending } else { WishState::Visible } };
    // Recorded after the insert because the answer names the new wish; a concurrent twin that committed first rolls
    // this transaction back, wish included, and the replay answers.
    if let Some(key) = &key
        && !idempotency::record(&mut tx, &scope, key, &hash, 200, &to_json(&saved)?, now)
            .await
            .map_err(db("idempotency_record"))?
    {
        drop(tx);
        return replay(&state.pool, &scope, key, &hash).await?.ok_or(ApiError::Internal);
    }
    tx.commit().await.map_err(db("wish_commit"))?;
    Ok(Json(saved).into_response())
}

/// The signed-in customer behind the token; the dashboard refuses administrators, and so does this.
async fn host(state: &AppState, headers: &HeaderMap) -> Result<Owner, ApiError> {
    let owner = resolve_owner(state, headers).await?;
    if owner.role == "ADMIN" {
        return Err(ApiError::Forbidden("owner.role_not_allowed"));
    }
    Ok(owner)
}

fn ids(path: Result<Path<(i32, i32)>, PathRejection>) -> Result<(i32, i32), ApiError> {
    let Path((invitation_id, wish_id)) =
        path.map_err(|rejection| ApiError::BadRequest("request.invalid_path", rejection.body_text()))?;
    if invitation_id <= 0 || wish_id <= 0 {
        return Err(ApiError::BadRequest("request.invalid_id", "ids are positive integers".into()));
    }
    Ok((invitation_id, wish_id))
}

/// The stored answer for the request's key, read only once the caller may moderate the invitation now (G-044, D-057:
/// the owner or a co-host), so a revoked member or another account never reads it or learns that the key exists. A
/// retried delete still replays to its caller although the wish is gone. `invitation_or_wish.not_found` otherwise.
async fn authorized_replay(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    owner: &Owner,
    invitation_id: i32,
    key: Option<&str>,
    scope: &str,
    hash: &str,
) -> Result<Option<Response>, ApiError> {
    members::caller_may(tx, owner.user_id, invitation_id, Capability::Wishes)
        .await
        .map_err(db("wish_access"))?
        .ok_or(ApiError::NotFound(NOT_FOUND))?;
    match key {
        Some(key) => replay(&mut **tx, scope, key, hash).await,
        None => Ok(None),
    }
}

/// Locks the wish for this transaction: `invitation_or_wish.not_found` unless the caller may moderate its invitation
/// and the wish belongs to it. Access is `members::caller_may`, the one check (the owner, a co-host's grant under G-044,
/// a workspace manager under G-052): a copy of the grant predicate here once missed the workspace staff (s41).
async fn lock_owned_wish(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    owner: &Owner,
    invitation_id: i32,
    wish_id: i32,
) -> Result<(), ApiError> {
    members::caller_may(tx, owner.user_id, invitation_id, Capability::Wishes)
        .await
        .map_err(db("wish_access"))?
        .ok_or(ApiError::NotFound(NOT_FOUND))?;
    sqlx::query_scalar!(
        "select w.id from guest_messages w where w.id = $1 and w.invitation_id = $2 for update",
        wish_id,
        invitation_id
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(db("wish_owned"))?
    .ok_or(ApiError::NotFound(NOT_FOUND))?;
    Ok(())
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/wishes/{wish}/moderation",
    tag = "wishes",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("wish" = i32, Path, minimum = 1, description = "A wish of that invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "As for the guest's wish, bound to the signed-in owner, this invitation and this wish: a retried delete replays to its owner instead of answering 404, and anyone else's request is judged afresh"),
    ),
    request_body = WishModerationRequest,
    responses(
        (status = 200, description = "Applied, or replayed (`Idempotent-Replayed: true`)", body = WishModerated),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer (`owner.unknown_user`, `owner.role_not_allowed`)", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057), or not its wish (`invitation_or_wish.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "`idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn moderate_wish(
    State(state): State<AppState>,
    path: Result<Path<(i32, i32)>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<WishModerationRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let (invitation_id, wish_id) = ids(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    let key = idempotency::key_from(&headers)?;
    let now = utc_now();
    let scope = idempotency::host_scope("wish:host", owner.user_id, invitation_id, wish_id);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("moderation_begin"))?;
    if let Some(response) = authorized_replay(&mut tx, &owner, invitation_id, key.as_deref(), &scope, &hash).await? {
        return Ok(response);
    }
    lock_owned_wish(&mut tx, &owner, invitation_id, wish_id).await?;
    let state_after = match request.action {
        WishAction::Show => ModeratedState::Visible,
        WishAction::Hide => ModeratedState::Hidden,
        WishAction::Delete => ModeratedState::Deleted,
    };
    let moderated = WishModerated { id: wish_id, state: state_after };
    if let Some(key) = &key
        && !idempotency::record(&mut tx, &scope, key, &hash, 200, &to_json(&moderated)?, now)
            .await
            .map_err(db("idempotency_record"))?
    {
        // A concurrent twin committed first: its answer, read in this transaction after the access check.
        return replay(&mut *tx, &scope, key, &hash).await?.ok_or(ApiError::Internal);
    }
    match request.action {
        WishAction::Delete => {
            sqlx::query!("delete from guest_messages where id = $1 and invitation_id = $2", wish_id, invitation_id)
                .execute(&mut *tx)
                .await
                .map_err(db("moderation_delete"))?;
        }
        WishAction::Show | WishAction::Hide => {
            sqlx::query!(
                "update guest_messages set is_hidden = $1, reviewed_at = $2 where id = $3 and invitation_id = $4",
                request.action == WishAction::Hide,
                now,
                wish_id,
                invitation_id
            )
            .execute(&mut *tx)
            .await
            .map_err(db("moderation_update"))?;
        }
    }
    tx.commit().await.map_err(db("moderation_commit"))?;
    Ok(Json(moderated).into_response())
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/wishes/{wish}/reply",
    tag = "wishes",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("wish" = i32, Path, minimum = 1, description = "A wish of that invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "As for the guest's wish, bound to the signed-in owner, this invitation and this wish: it replays only to the same owner on the same path, and anyone else's request is judged afresh"),
    ),
    request_body = WishReplyRequest,
    responses(
        (status = 200, description = "Stored or cleared, or replayed (`Idempotent-Replayed: true`)", body = WishReplied),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer (`owner.unknown_user`, `owner.role_not_allowed`)", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057), or not its wish (`invitation_or_wish.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "A reply longer than 1,000 UTF-16 units (`wish.reply_invalid`), or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn reply_to_wish(
    State(state): State<AppState>,
    path: Result<Path<(i32, i32)>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<WishReplyRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let (invitation_id, wish_id) = ids(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    let key = idempotency::key_from(&headers)?;
    let now = utc_now();
    let host_reply = match decide_host_reply(&request.reply) {
        HostReplyDecision::Invalid => return Err(ApiError::Unprocessable("wish.reply_invalid", Subject::None)),
        HostReplyDecision::Write(reply) => reply,
    };
    let scope = idempotency::host_scope("wish:reply", owner.user_id, invitation_id, wish_id);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("reply_begin"))?;
    if let Some(response) = authorized_replay(&mut tx, &owner, invitation_id, key.as_deref(), &scope, &hash).await? {
        return Ok(response);
    }
    lock_owned_wish(&mut tx, &owner, invitation_id, wish_id).await?;
    let replied = WishReplied { id: wish_id, host_reply: host_reply.clone() };
    if let Some(key) = &key
        && !idempotency::record(&mut tx, &scope, key, &hash, 200, &to_json(&replied)?, now)
            .await
            .map_err(db("idempotency_record"))?
    {
        // A concurrent twin committed first: its answer, read in this transaction after the access check.
        return replay(&mut *tx, &scope, key, &hash).await?.ok_or(ApiError::Internal);
    }
    sqlx::query!(
        "update guest_messages set host_reply = $1, \
         replied_at = case when $1::text is null then null else $2::timestamp end \
         where id = $3 and invitation_id = $4",
        host_reply,
        now,
        wish_id,
        invitation_id
    )
    .execute(&mut *tx)
    .await
    .map_err(db("reply_update"))?;
    tx.commit().await.map_err(db("reply_commit"))?;
    Ok(Json(replied).into_response())
}
