//! B-035 endpoint: the editor's content write (`app/api/invitations/[id]/detail` through `lib/invitation/content.ts`) when
//! Next.js sets `BACKEND_CONTENT=rust`; exactly one writer is live. Next.js prepares the whole config with the content
//! contract (merge, strict schema, event ids) from the version it read; this writer locks the owner's invitation row,
//! refuses a stale base, judges D-040's references and the theme (B-041, with B-036's switch within the tier), then
//! writes the config, the live flag and the next version row in that transaction: the statements and order of
//! `lib/invitation/content-next.ts`.

use axum::Json;
use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use super::rules::{ContentDecision, ContentWriteInput, Tier, content_decision, content_needs_tier};
use crate::app::AppState;
use crate::idempotency::{self, replay};
use crate::identity::{Owner, resolve_owner};
use crate::problem::{ApiError, Problem, Subject};
use crate::views::utc_now;

const NOT_FOUND: &str = "content.not_found";

/// One save: the whole config, prepared from `baseVersion`, and the sections the editor sent.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentWriteRequest {
    /// The version the config was prepared from: `max(invitation_versions.version_no)` when Next.js read it, 0 for an
    /// invitation without a version row.
    #[schema(minimum = 0)]
    pub base_version: i32,
    /// The whole config to store, as Next.js's content contract prepared it.
    // A free-form map (`additionalProperties: true`), so the TypeScript contract types it as `{ [key: string]: unknown }`;
    // a bare `Object` renders as `Record<string, never>`, which no config satisfies.
    #[schema(value_type = std::collections::HashMap<String, Value>, additional_properties = true)]
    pub config: Value,
    /// The top-level sections the save sent: D-040 judges only their references, and the theme is judged only when sent.
    pub touched_sections: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ContentSaved {
    /// The version this save wrote.
    pub version: i32,
}

fn db(context: &'static str) -> impl FnOnce(sqlx::Error) -> ApiError {
    move |error| ApiError::internal(context, error)
}

/// The signed-in customer behind the token; the editor refuses administrators, and so does this (and creation, B-037).
pub(crate) async fn host(state: &AppState, headers: &HeaderMap) -> Result<Owner, ApiError> {
    let owner = resolve_owner(state, headers).await?;
    if owner.role == "ADMIN" {
        return Err(ApiError::Forbidden("owner.role_not_allowed"));
    }
    Ok(owner)
}

/// The tier an invitation's theme writes are entitled to (B-041): Premium when its own catalog theme is Premium, or when a
/// PAID order bought a Premium tier (or a Premium theme) for it. The queries of the TypeScript writer's `themeTier`.
async fn theme_tier(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    invitation_id: i32,
    template_id: Option<i32>,
) -> Result<Tier, ApiError> {
    if let Some(template_id) = template_id {
        let premium = sqlx::query_scalar!("select is_premium from templates where id = $1", template_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db("content_template_tier"))?;
        if premium == Some(true) {
            return Ok(Tier::Premium);
        }
    }
    let order = sqlx::query_scalar!(
        "select o.id from orders o left join templates t on t.id = o.template_id \
         where o.invitation_id = $1 and o.status = 'PAID' and (o.tier = 'premium' or t.is_premium = true) limit 1",
        invitation_id
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(db("content_order_tier"))?;
    Ok(if order.is_some() { Tier::Premium } else { Tier::Standard })
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/content",
    tag = "content",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "1–255 visible ASCII characters, bound to the signed-in owner, this invitation and the base version: a retry of a committed save replays its answer for 24 hours (also when it waited for that save's lock), and anyone else's request is judged afresh"),
    ),
    request_body = ContentWriteRequest,
    responses(
        (status = 200, description = "Stored as the next version, or replayed (`Idempotent-Replayed: true`)", body = ContentSaved),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer (`owner.unknown_user`, `owner.role_not_allowed`)", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not this owner's invitation (`content.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "Another save stored a newer version (`content.version_conflict`, `currentVersion`); nothing was written", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "A refused reference (`content.media_refused`) or theme (`content.theme_not_entitled`), with `issues`; or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn write_content(
    State(state): State<AppState>,
    path: Result<Path<i32>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<ContentWriteRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Path(invitation_id) =
        path.map_err(|rejection| ApiError::BadRequest("request.invalid_path", rejection.body_text()))?;
    if invitation_id <= 0 {
        return Err(ApiError::BadRequest("request.invalid_id", "ids are positive integers".into()));
    }
    let owner = host(&state, &headers).await?;
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    if request.base_version < 0 {
        return Err(ApiError::BadRequest("request.invalid_body", "baseVersion is not negative".into()));
    }
    if !request.config.is_object() {
        return Err(ApiError::BadRequest("request.invalid_body", "config is a JSON object".into()));
    }
    let key = idempotency::key_from(&headers)?;
    let now = utc_now();
    let scope = idempotency::host_scope("content", owner.user_id, invitation_id, request.base_version);
    let hash = idempotency::request_hash(&request);
    if let Some(key) = &key
        && let Some(response) = replay(&state.pool, &scope, key, &hash).await?
    {
        return Ok(response);
    }

    let mut tx = state.pool.begin().await.map_err(db("content_begin"))?;
    let row = sqlx::query!(
        "select event_type, template_id, config from invitations where id = $1 and user_id = $2 \
         and deleted_at is null for update",
        invitation_id,
        owner.user_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("content_lock"))?
    .ok_or(ApiError::NotFound(NOT_FOUND))?;
    // A retry under this key that waited for the lock behind its own first attempt answers with that attempt's result,
    // never with a conflict against the version it wrote.
    if let Some(key) = &key
        && let Some(response) = replay(&state.pool, &scope, key, &hash).await?
    {
        return Ok(response);
    }
    let current_version = sqlx::query_scalar!(
        r#"select coalesce(max(version_no), 0) as "version!" from invitation_versions where invitation_id = $1"#,
        invitation_id
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(db("content_version"))?;

    let stored = row.config.unwrap_or_else(|| Value::Object(Default::default()));
    let input = ContentWriteInput {
        invitation_id,
        event_type: &row.event_type,
        stored_config: &stored,
        config: &request.config,
        touched_sections: &request.touched_sections,
        base_version: request.base_version,
        current_version,
    };
    // The tier is consulted only for a Premium palette or theme, so other saves cost no extra query (B-041, B-036). The
    // purchased theme (`template_id`) feeds that lookup and is never written here, also not by a theme switch (D-054).
    let tier = if content_needs_tier(&input) {
        theme_tier(&mut tx, invitation_id, row.template_id).await?
    } else {
        Tier::Standard
    };
    let next_version = match content_decision(&input, tier) {
        ContentDecision::Conflict { current_version } => {
            return Err(ApiError::StaleVersion("content.version_conflict", current_version));
        }
        ContentDecision::Media(issues) => {
            return Err(ApiError::Unprocessable("content.media_refused", Subject::Issues(issues)));
        }
        ContentDecision::Theme(issues) => {
            return Err(ApiError::Unprocessable("content.theme_not_entitled", Subject::Issues(issues)));
        }
        ContentDecision::Write { next_version } => next_version,
    };

    let saved = ContentSaved { version: next_version };
    let answer = serde_json::to_value(&saved).map_err(|error| ApiError::internal("content_json", error))?;
    if let Some(key) = &key
        && !idempotency::record(&mut tx, &scope, key, &hash, 200, &answer, now)
            .await
            .map_err(db("idempotency_record"))?
    {
        drop(tx);
        return replay(&state.pool, &scope, key, &hash).await?.ok_or(ApiError::Internal);
    }
    // The row is locked above with the same condition; repeated here so every statement on invitations carries it.
    sqlx::query!(
        "update invitations set config = $1 where id = $2 and deleted_at is null",
        request.config,
        invitation_id
    )
    .execute(&mut *tx)
    .await
    .map_err(db("content_update"))?;
    // Only the live row changes: rows already off stay off.
    sqlx::query!("update invitation_versions set is_live = false where invitation_id = $1 and is_live", invitation_id)
        .execute(&mut *tx)
        .await
        .map_err(db("content_unlive"))?;
    sqlx::query!(
        "insert into invitation_versions (invitation_id, version_no, config, created_by, is_live) \
         values ($1, $2, $3, 'customer', true)",
        invitation_id,
        next_version,
        request.config
    )
    .execute(&mut *tx)
    .await
    .map_err(db("content_version_insert"))?;
    tx.commit().await.map_err(db("content_commit"))?;
    Ok(Json(saved).into_response())
}
