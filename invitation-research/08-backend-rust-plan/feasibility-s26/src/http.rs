use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::problem::ApiError;
use crate::service_auth::{self, SIGNATURE_HEADER};
use crate::views;

pub const VIEWS_PATH: &str = "/v1/views";

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub service_secret: Arc<Vec<u8>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordView {
    pub invitation_id: i32,
    #[serde(default)]
    pub guest_id: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct ViewRecorded {
    pub recorded: bool,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/v1/health", get(|| async { "ok" }))
        .route(VIEWS_PATH, post(record_view))
        .with_state(state)
}

fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

async fn record_view(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<ViewRecorded>, ApiError> {
    let signature = headers
        .get(SIGNATURE_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized("auth.signature_missing"))?;
    service_auth::verify(&state.service_secret, signature, "POST", VIEWS_PATH, &body, unix_now())
        .map_err(|_| ApiError::Unauthorized("auth.signature_invalid"))?;

    let request: RecordView = serde_json::from_slice(&body)
        .map_err(|error| ApiError::BadRequest("request.invalid_body", error.to_string()))?;
    if request.invitation_id <= 0 || request.guest_id.is_some_and(|id| id <= 0) {
        return Err(ApiError::BadRequest("request.invalid_id", "ids are positive integers".into()));
    }

    let recorded = views::record_invitation_view(&state.pool, request.invitation_id, request.guest_id, views::utc_now())
        .await
        .map_err(|error| match error.as_database_error().and_then(|e| e.code()) {
            Some(code) if code == "23503" => ApiError::NotFound("invitation_or_guest.not_found"),
            _ => {
                tracing::error!(%error, "record_invitation_view failed");
                ApiError::Internal
            }
        })?;
    Ok(Json(ViewRecorded { recorded }))
}
