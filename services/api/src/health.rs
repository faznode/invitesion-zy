//! Liveness (public, no database) and readiness (signed, one round trip to Postgres).

use axum::Json;
use axum::extract::State;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::app::AppState;
use crate::problem::{ApiError, Problem};

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
pub struct Health {
    /// Always `ok` when the process answers.
    pub status: String,
    /// Crate version of the running build.
    pub version: String,
}

fn ok() -> Health {
    Health { status: "ok".into(), version: env!("CARGO_PKG_VERSION").into() }
}

/// Liveness: the process answers. Touches nothing else, so probes stay cheap and reveal nothing.
#[utoipa::path(get, path = "/v1/health", tag = "health", responses((status = 200, description = "The process answers", body = Health)))]
pub async fn health() -> Json<Health> {
    Json(ok())
}

/// Readiness: the database answers a trivial query.
#[utoipa::path(
    get,
    path = "/v1/health/ready",
    tag = "health",
    security(("serviceSignature" = [])),
    responses(
        (status = 200, description = "The database answers", body = Health),
        (status = 401, description = "Missing or invalid service signature", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "The database does not answer", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn ready(State(state): State<AppState>) -> Result<Json<Health>, ApiError> {
    sqlx::query_scalar!(r#"select 1 as "one!""#).fetch_one(&state.pool).await.map_err(|error| {
        tracing::warn!(%error, "readiness query failed");
        ApiError::Unavailable("database.unavailable")
    })?;
    Ok(Json(ok()))
}
