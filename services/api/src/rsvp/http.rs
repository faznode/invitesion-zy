//! R-03 endpoints. The guest's RSVP (`app/i/[slug]/actions.ts`) and the host's override (the dashboard guest actions)
//! write through here when Next.js sets `BACKEND_RSVP=rust`; exactly one writer is live. Each write is one transaction:
//! the guest row is locked (`for update`), the shared decision runs on the config read inside the transaction, and the
//! status, headcount, answers and per-event answers are set by one UPDATE with the RSVP analytics row beside it (the
//! TypeScript writer issues the same two statements without a transaction). Stored shapes are unchanged.

use axum::Json;
use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use time::PrimitiveDateTime;
use utoipa::ToSchema;

use super::content::read_rsvp_config;
use super::decision::{
    GuestDecision, GuestState, HostGuestState, RsvpFlags, RsvpSubmission, decide_guest_rsvp, decide_host_rsvp,
};
use crate::app::AppState;
use crate::guest_link::{self, LinkCodes, check_open};
use crate::idempotency::{self, replay};
use crate::identity::resolve_owner;
use crate::limits;
use crate::members::{self, Capability};
use crate::problem::{ApiError, Problem, Subject};
use crate::views::utc_now;

const RSVP_LINK: LinkCodes = LinkCodes { not_found: "rsvp.link_not_found", closed: "rsvp.closed" };

/// A guest's RSVP as the form submitted it.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuestRsvpRequest {
    pub submission: RsvpSubmission,
    pub flags: RsvpFlags,
    /// The guest's public address as Next.js's trusted proxies reported it (`TRUSTED_PROXY_HOPS`). Used only for the
    /// per-address limit: an IPv4 address, or the /64 of an IPv6 address, reduced to a keyed hash and never stored or
    /// logged. Absent or not an IP literal = no per-address limit (the per-link limit still applies).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_ip: Option<String>,
}

/// The guest's answer after the write.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RsvpSaved {
    /// `CONFIRMED`, `DECLINED`, `MAYBE`, or `PENDING` after a host clears an answer.
    pub status: String,
    /// People attending: 0 for a decline, null while unknown.
    pub attending_count: Option<i32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HostRsvpStatus {
    Pending,
    Confirmed,
    Declined,
    Maybe,
}

impl HostRsvpStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Confirmed => "CONFIRMED",
            Self::Declined => "DECLINED",
            Self::Maybe => "MAYBE",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostRsvpFlags {
    /// `RSVP_PER_EVENT`.
    pub per_event: bool,
    /// `INVITE_ONLY_EVENTS`.
    pub invite_only_events: bool,
}

/// A host sets one guest's answer: for the whole invitation, or for one event (`eventId`).
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostRsvpRequest {
    pub status: HostRsvpStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    pub flags: HostRsvpFlags,
}

fn db(context: &'static str) -> impl FnOnce(sqlx::Error) -> ApiError {
    move |error| ApiError::internal(context, error)
}

fn unix_ms(at: PrimitiveDateTime) -> i64 {
    (at.assume_utc().unix_timestamp_nanos() / 1_000_000) as i64
}

#[utoipa::path(
    post,
    path = "/v1/guest-links/{slug}/{guest}/rsvp",
    tag = "rsvp",
    security(("serviceSignature" = [])),
    params(
        ("slug" = String, Path, description = "The invitation's slug"),
        ("guest" = String, Path, description = "The last segment of the guest's personal link: an opaque token, or the slug of a guest without one (B-011)"),
        ("Idempotency-Key" = Option<String>, Header, description = "1–255 visible ASCII characters; a retry with the same key and request replays the committed answer for 24 hours"),
    ),
    request_body = GuestRsvpRequest,
    responses(
        (status = 200, description = "Saved, or replayed (`Idempotent-Replayed: true`)", body = RsvpSaved),
        (status = 400, description = "Malformed body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid service signature", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "No published invitation, or no guest for this link (`rsvp.link_not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "RSVP is closed (`rsvp.closed`; detail `disabled`, `deadline` or `expired`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "Refused by the rules: `rsvp.status_invalid`, `rsvp.event_answer_missing` (`eventId`), `rsvp.answer_invalid` (`questionId`), or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "Too many RSVP writes for this link or address (`rate_limit.exceeded`); nothing was written", body = Problem, content_type = "application/problem+json",
            headers(("Retry-After" = u64, description = "Seconds until the limit's window ends"))),
    )
)]
pub async fn guest_rsvp(
    State(state): State<AppState>,
    Path((slug, segment)): Path<(String, String)>,
    headers: HeaderMap,
    body: Result<Json<GuestRsvpRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    let key = idempotency::key_from(&headers)?;
    let now = utc_now();
    let (invitation_id, guest_id) = guest_link::resolve(&state, &slug, &segment, now, RSVP_LINK).await?;

    let scope = format!("rsvp:guest:{guest_id}");
    // The address is left out: a retry from another network is still the same request.
    let hash = idempotency::request_hash(&(&request.submission, &request.flags));
    if let Some(key) = &key
        && let Some(response) = replay(&state.pool, &scope, key, &hash).await?
    {
        return Ok(response);
    }
    limits::enforce(&state.pool, &format!("rsvp:link:{guest_id}"), state.limits.rsvp_per_link, now).await?;
    let secret = state.service_secrets.first().map(Vec::as_slice).unwrap_or_default();
    limits::enforce_address(&state.pool, secret, "rsvp", request.client_ip.as_deref(), state.limits.rsvp_per_ip, now)
        .await?;

    let mut tx = state.pool.begin().await.map_err(db("rsvp_begin"))?;
    // B-031: re-read inside the transaction, so a deletion after the link resolved still refuses the write.
    let invitation = sqlx::query!(
        "select status, expires_at, config from invitations where id = $1 and deleted_at is null",
        invitation_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("rsvp_invitation_tx"))?
    .ok_or(ApiError::NotFound(RSVP_LINK.not_found))?;
    check_open(&invitation.status, invitation.expires_at, now, RSVP_LINK)?;
    let guest = sqlx::query!(
        "select guest_count, invited_event_ids, rsvp_event_answers from guests \
         where id = $1 and invitation_id = $2 for update",
        guest_id,
        invitation_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("rsvp_guest_tx"))?
    .ok_or(ApiError::NotFound("rsvp.link_not_found"))?;

    let config = read_rsvp_config(invitation.config.as_ref().unwrap_or(&Value::Null));
    let state_of_guest = GuestState {
        guest_count: i64::from(guest.guest_count),
        invited_event_ids: guest.invited_event_ids.as_ref(),
        rsvp_event_answers: guest.rsvp_event_answers.as_ref(),
    };
    let write = match decide_guest_rsvp(&config, state_of_guest, &request.submission, request.flags, unix_ms(now)) {
        GuestDecision::Closed(reason) => return Err(ApiError::Conflict("rsvp.closed", Some(reason.as_str().into()))),
        GuestDecision::Invalid => return Err(ApiError::Unprocessable("rsvp.status_invalid", Subject::None)),
        GuestDecision::Events(id) => {
            return Err(ApiError::Unprocessable("rsvp.event_answer_missing", Subject::Event(id)));
        }
        GuestDecision::Answers(id) => {
            return Err(ApiError::Unprocessable("rsvp.answer_invalid", Subject::Question(id)));
        }
        GuestDecision::Write(write) => write,
    };

    let attending = write.attending_count.map(|count| count as i32);
    let saved = RsvpSaved { status: write.status.as_str().into(), attending_count: attending };
    let saved_json = serde_json::to_value(&saved).map_err(db_json)?;
    if let Some(key) = &key
        && !idempotency::record(&mut tx, &scope, key, &hash, 200, &saved_json, now)
            .await
            .map_err(db("idempotency_record"))?
    {
        drop(tx);
        return replay(&state.pool, &scope, key, &hash).await?.ok_or(ApiError::Internal);
    }

    let answers = write.rsvp_answers.to_json();
    let event_answers = write.rsvp_event_answers.to_json();
    sqlx::query!(
        "update guests set rsvp_status = $1, attending_count = $2, \
         rsvp_answers = case when $3 then $4 else rsvp_answers end, \
         rsvp_event_answers = case when $5 then $6 else rsvp_event_answers end \
         where id = $7",
        write.status.as_str(),
        attending,
        answers.is_some(),
        answers.flatten() as Option<Value>,
        event_answers.is_some(),
        event_answers.flatten() as Option<Value>,
        guest_id
    )
    .execute(&mut *tx)
    .await
    .map_err(db("rsvp_update"))?;
    // `guestCount` in RSVP event meta has always meant the people attending for this answer.
    let meta = json!({ "status": write.status.as_str(), "guestCount": attending, "source": "public" });
    sqlx::query!(
        "insert into analytics_events (invitation_id, guest_id, event_type, meta, created_at) values ($1, $2, 'RSVP', $3, $4)",
        invitation_id,
        guest_id,
        meta,
        now
    )
    .execute(&mut *tx)
    .await
    .map_err(db("rsvp_event"))?;
    tx.commit().await.map_err(db("rsvp_commit"))?;
    Ok(Json(saved).into_response())
}

fn db_json(error: serde_json::Error) -> ApiError {
    ApiError::internal("rsvp_json", error)
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/guests/{guest}/rsvp-override",
    tag = "rsvp",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("guest" = i32, Path, minimum = 1, description = "A guest of that invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "As for the guest RSVP, bound to the signed-in owner, this invitation and this guest: it replays only to the same owner on the same path, and anyone else's request is judged afresh"),
    ),
    request_body = HostRsvpRequest,
    responses(
        (status = 200, description = "Saved, or replayed (`Idempotent-Replayed: true`)", body = RsvpSaved),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer (`owner.unknown_user`, `owner.role_not_allowed`)", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057), or not its guest (`invitation_or_guest.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "An event the guest is not asked about, or an event answer without per-event RSVP (`rsvp.override_invalid`); `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn host_rsvp_override(
    State(state): State<AppState>,
    path: Result<Path<(i32, i32)>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<HostRsvpRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Path((invitation_id, guest_id)) =
        path.map_err(|rejection| ApiError::BadRequest("request.invalid_path", rejection.body_text()))?;
    if invitation_id <= 0 || guest_id <= 0 {
        return Err(ApiError::BadRequest("request.invalid_id", "ids are positive integers".into()));
    }
    let owner = resolve_owner(&state, &headers).await?;
    // The customer dashboard refuses administrators (`getUser()` → `role === 'ADMIN'` redirects); so does this.
    if owner.role == "ADMIN" {
        return Err(ApiError::Forbidden("owner.role_not_allowed"));
    }
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    let key = idempotency::key_from(&headers)?;
    let now = utc_now();
    let scope = idempotency::host_scope("rsvp:host", owner.user_id, invitation_id, guest_id);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("override_begin"))?;
    // G-044 (D-057): the owner, or a member whose role holds the guest list (a co-host), before any stored answer is
    // read, so a revoked member or another account never replays one.
    let invitation_config = members::caller_may(&mut tx, owner.user_id, invitation_id, Capability::Guests)
        .await
        .map_err(db("override_invitation"))?
        .ok_or(ApiError::NotFound("invitation_or_guest.not_found"))?;
    if let Some(key) = &key
        && let Some(response) = replay(&mut *tx, &scope, key, &hash).await?
    {
        return Ok(response);
    }
    let guest = sqlx::query!(
        "select invited_event_ids, rsvp_event_answers, rsvp_status, attending_count from guests \
         where id = $1 and invitation_id = $2 for update",
        guest_id,
        invitation_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("override_guest"))?
    .ok_or(ApiError::NotFound("invitation_or_guest.not_found"))?;

    let config = read_rsvp_config(&invitation_config);
    let guest_state = HostGuestState {
        invited_event_ids: guest.invited_event_ids.as_ref(),
        rsvp_event_answers: guest.rsvp_event_answers.as_ref(),
        rsvp_status: &guest.rsvp_status,
        attending_count: guest.attending_count.map(i64::from),
    };
    let update = decide_host_rsvp(
        &config,
        guest_state,
        request.status.as_str(),
        request.event_id.as_deref(),
        request.flags.per_event,
        request.flags.invite_only_events,
    )
    .ok_or(ApiError::Unprocessable("rsvp.override_invalid", Subject::None))?;

    let attending = update.attending_count.map(|count| count as i32);
    let saved = RsvpSaved { status: update.rsvp_status.as_str().into(), attending_count: attending };
    let saved_json = serde_json::to_value(&saved).map_err(db_json)?;
    if let Some(key) = &key
        && !idempotency::record(&mut tx, &scope, key, &hash, 200, &saved_json, now)
            .await
            .map_err(db("idempotency_record"))?
    {
        // A concurrent twin committed first: its answer, read in this transaction after the access check above; this
        // transaction ends without writing when it is dropped.
        return replay(&mut *tx, &scope, key, &hash).await?.ok_or(ApiError::Internal);
    }

    let event_answers = update.event_answers.to_json();
    sqlx::query!(
        "update guests set rsvp_status = $1, attending_count = $2, \
         rsvp_event_answers = case when $3 then $4 else rsvp_event_answers end \
         where id = $5 and invitation_id = $6",
        update.rsvp_status.as_str(),
        attending,
        event_answers.is_some(),
        event_answers.flatten() as Option<Value>,
        guest_id,
        invitation_id
    )
    .execute(&mut *tx)
    .await
    .map_err(db("override_update"))?;
    let meta = json!({ "status": update.rsvp_status.as_str(), "source": "dashboard" });
    sqlx::query!(
        "insert into analytics_events (invitation_id, guest_id, event_type, meta, created_at) values ($1, $2, 'RSVP', $3, $4)",
        invitation_id,
        guest_id,
        meta,
        now
    )
    .execute(&mut *tx)
    .await
    .map_err(db("override_event"))?;
    tx.commit().await.map_err(db("override_commit"))?;
    Ok(Json(saved).into_response())
}
