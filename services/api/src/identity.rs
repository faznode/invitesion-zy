//! `GET /v1/me`: the owner-token chain end to end (signature → token → `users.clerk_user_id` → role from the
//! database). Not a domain endpoint; owner-scoped endpoints in later slices resolve their caller the same way.

use axum::Json;
use axum::extract::State;
use axum::http::HeaderMap;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::app::AppState;
use crate::owner_auth::{OwnerAuthError, bearer_token};
use crate::problem::{ApiError, Problem};

/// The caller as this application knows it.
#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Me {
    pub user_id: i32,
    /// `CUSTOMER` or `ADMIN`, from `users.role`.
    pub role: String,
}

/// An owner verified from a token and resolved to a live user row.
pub struct Owner {
    pub user_id: i32,
    pub role: String,
}

pub async fn resolve_owner(state: &AppState, headers: &HeaderMap) -> Result<Owner, ApiError> {
    let verifier = state.owner.as_ref().ok_or(ApiError::Unavailable("owner_auth.not_configured"))?;
    let token = bearer_token(headers).ok_or(ApiError::Unauthorized("owner.token_missing"))?;
    let claims = verifier.verify(token).await.map_err(|error| match error {
        OwnerAuthError::KeysUnavailable => ApiError::Unavailable("owner_auth.keys_unavailable"),
        refused => {
            tracing::info!(reason = %refused, "owner token refused");
            ApiError::Unauthorized("owner.token_invalid")
        }
    })?;
    let row = sqlx::query!("select id, role from users where clerk_user_id = $1 and deleted_at is null", claims.sub)
        .fetch_optional(&state.pool)
        .await
        .map_err(|error| ApiError::internal("resolve_owner", error))?
        .ok_or(ApiError::Forbidden("owner.unknown_user"))?;
    Ok(Owner { user_id: row.id, role: row.role })
}

#[utoipa::path(
    get,
    path = "/v1/me",
    tag = "identity",
    security(("serviceSignature" = [], "ownerToken" = [])),
    responses(
        (status = 200, description = "The verified caller", body = Me),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A valid token for no live user", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> Result<Json<Me>, ApiError> {
    let owner = resolve_owner(&state, &headers).await?;
    Ok(Json(Me { user_id: owner.user_id, role: owner.role }))
}
