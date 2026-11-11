//! B-037 endpoint (D-055): draft creation (the wizard's save, the catalog's "Pakai tema" path, the dashboard's template
//! picker, all through `lib/invitation/creation.ts`) when Next.js sets `BACKEND_CONTENT=rust`; exactly one writer is
//! live. Next.js prepares the config (`initialDraftConfig`) and the slug base; this writer resolves the owner from the
//! verified token, judges the template row it reads (`creation_decision`), and writes the row and version 1 in one
//! transaction: the statements and order of `lib/invitation/create-next.ts`.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use super::creation::{
    CreationDecision, CreationInput, SLUG_SUFFIX_LIMIT, base36, catalog_id_of_defaults, creation_decision,
    first_free_slug, is_creation_key, is_slug_base, slug_candidates,
};
use super::http::host;
use super::rules::Tier;
use crate::app::AppState;
use crate::problem::{ApiError, Problem, Subject};

const SLUG_ATTEMPTS: usize = 3;

/// One creation: the template, the event type, the slug before any suffix, the whole config and the creation's key.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftCreateRequest {
    /// The template row (`templates.id`, the price anchor of checkout, publishing and settlement), or null.
    #[schema(minimum = 1)]
    pub template_id: Option<i32>,
    /// One of the six core event types; for a template, the one its catalog category maps to.
    pub event_type: String,
    /// Lower-case letters and digits in hyphen-separated runs, at most 60 characters; the writer adds `-2`, `-3` … when
    /// the slug is taken.
    pub slug_base: String,
    /// The whole config to store, as Next.js prepared it.
    #[schema(value_type = std::collections::HashMap<String, Value>, additional_properties = true)]
    pub config: Value,
    /// 1–255 visible ASCII characters, stored on the row: a creation by the same owner with the same key answers with the
    /// draft it made (`replayed`), through either writer and without expiry.
    pub creation_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DraftCreated {
    pub invitation_id: i32,
    pub slug: String,
    /// The version this creation wrote: always 1.
    pub version: i32,
    /// True when an earlier creation with this owner and key made the draft.
    pub replayed: bool,
}

fn db(context: &'static str) -> impl FnOnce(sqlx::Error) -> ApiError {
    move |error| ApiError::internal(context, error)
}

async fn prior_creation(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: i32,
    key: &str,
) -> Result<Option<(i32, String)>, ApiError> {
    let row =
        sqlx::query!("select id, slug from invitations where user_id = $1 and creation_key = $2 limit 1", user_id, key)
            .fetch_optional(&mut **tx)
            .await
            .map_err(db("creation_prior"))?;
    Ok(row.map(|row| (row.id, row.slug)))
}

fn answer(invitation_id: i32, slug: String, replayed: bool) -> Response {
    Json(DraftCreated { invitation_id, slug, version: 1, replayed }).into_response()
}

#[utoipa::path(
    post,
    path = "/v1/invitations",
    tag = "content",
    security(("serviceSignature" = [], "ownerToken" = [])),
    request_body = DraftCreateRequest,
    responses(
        (status = 200, description = "The draft exists with version 1: made now, or by an earlier creation with this owner and key (`replayed`)", body = DraftCreated),
        (status = 400, description = "Malformed body, event type, slug base or creation key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer (`owner.unknown_user`, `owner.role_not_allowed`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "No such template (`creation.template_missing`); the event type or theme is not the template's (`creation.refused`); a refused reference (`content.media_refused`) or theme (`content.theme_not_entitled`), with `issues`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn create_draft(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Result<Json<DraftCreateRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let owner = host(&state, &headers).await?;
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    if request.template_id.is_some_and(|id| id <= 0) {
        return Err(ApiError::BadRequest("request.invalid_body", "templateId is a positive integer or null".into()));
    }
    if request.event_type.is_empty() || request.event_type.len() > 20 {
        return Err(ApiError::BadRequest("request.invalid_body", "eventType is 1 to 20 characters".into()));
    }
    if !is_slug_base(&request.slug_base) {
        return Err(ApiError::BadRequest(
            "request.invalid_body",
            "slugBase is lower-case letters and digits in runs".into(),
        ));
    }
    if !is_creation_key(&request.creation_key) {
        return Err(ApiError::BadRequest(
            "request.invalid_body",
            "creationKey is 1 to 255 visible ASCII characters".into(),
        ));
    }
    if !request.config.is_object() {
        return Err(ApiError::BadRequest("request.invalid_body", "config is a JSON object".into()));
    }

    let mut tx = state.pool.begin().await.map_err(db("creation_begin"))?;
    if let Some((id, slug)) = prior_creation(&mut tx, owner.user_id, &request.creation_key).await? {
        return Ok(answer(id, slug, true));
    }

    let (category, catalog_id, tier) = match request.template_id {
        None => (None, None, Tier::Standard),
        Some(template_id) => {
            let row =
                sqlx::query!("select category, is_premium, default_config from templates where id = $1", template_id)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(db("creation_template"))?
                    .ok_or(ApiError::Unprocessable("creation.template_missing", Subject::None))?;
            let tier = if row.is_premium { Tier::Premium } else { Tier::Standard };
            (Some(row.category), catalog_id_of_defaults(row.default_config.as_ref()), tier)
        }
    };
    let decision = creation_decision(&CreationInput {
        event_type: &request.event_type,
        template_category: category.as_deref(),
        template_catalog_id: catalog_id,
        template_tier: tier,
        config: &request.config,
    });
    match decision {
        CreationDecision::Creation(issues) => {
            return Err(ApiError::Unprocessable("creation.refused", Subject::Issues(issues)));
        }
        CreationDecision::Media(issues) => {
            return Err(ApiError::Unprocessable("content.media_refused", Subject::Issues(issues)));
        }
        CreationDecision::Theme(issues) => {
            return Err(ApiError::Unprocessable("content.theme_not_entitled", Subject::Issues(issues)));
        }
        CreationDecision::Write => {}
    }

    let candidates = slug_candidates(&request.slug_base);
    for _ in 0..SLUG_ATTEMPTS {
        let taken = sqlx::query_scalar!("select slug from invitations where slug = any($1)", &candidates[..])
            .fetch_all(&mut *tx)
            .await
            .map_err(db("creation_slugs"))?;
        let slug = first_free_slug(&request.slug_base, &taken, SLUG_SUFFIX_LIMIT).unwrap_or_else(|| {
            let millis = time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000;
            format!("{}-{}", request.slug_base, base36(u128::try_from(millis).unwrap_or_default()))
        });
        // A conflict is this key committed by a concurrent request (answered below) or the slug taken meanwhile (retried).
        let row = sqlx::query!(
            "insert into invitations (user_id, template_id, slug, event_type, config, status, creation_key) \
             values ($1, $2, $3, $4, $5, 'DRAFT', $6) on conflict do nothing returning id, slug",
            owner.user_id,
            request.template_id,
            slug,
            request.event_type,
            request.config,
            request.creation_key
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(db("creation_insert"))?;
        if let Some(row) = row {
            sqlx::query!(
                "insert into invitation_versions (invitation_id, version_no, config, created_by, is_live) \
                 values ($1, 1, $2, 'customer', true)",
                row.id,
                request.config
            )
            .execute(&mut *tx)
            .await
            .map_err(db("creation_version"))?;
            tx.commit().await.map_err(db("creation_commit"))?;
            return Ok(answer(row.id, row.slug, false));
        }
        if let Some((id, slug)) = prior_creation(&mut tx, owner.user_id, &request.creation_key).await? {
            return Ok(answer(id, slug, true));
        }
    }
    Err(ApiError::internal("creation_slug", "no free slug after retries"))
}
