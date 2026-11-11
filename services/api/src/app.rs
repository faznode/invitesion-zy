use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::Request;
use axum::middleware::{Next, from_fn, from_fn_with_state};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use sqlx::PgPool;

use crate::config::{Config, ConfigError};
use crate::limits::Limits;
use crate::owner_auth::{OwnerAuthError, OwnerVerifier};
use crate::problem::ApiError;
use crate::{content, health, identity, payment, roster, rsvp, service_auth, telemetry, views, wishes};

/// Longer than the pool's 5 s acquire timeout, so an unreachable database answers its own 503 first.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub service_secrets: Arc<Vec<Vec<u8>>>,
    /// B-024: the guest-pass secrets, current first (`GUEST_PASS_SECRET`, `GUEST_PASS_SECRET_PREVIOUS`); empty = passes
    /// are not configured and the check-in endpoint answers 503.
    pub guest_pass_secrets: Arc<Vec<Vec<u8>>>,
    pub owner: Option<Arc<OwnerVerifier>>,
    /// Write limits (B-013).
    pub limits: Limits,
}

#[derive(Debug, thiserror::Error)]
pub enum StartupError {
    #[error(transparent)]
    Config(#[from] ConfigError),
    #[error("owner-token verifier: {0}")]
    Owner(#[from] OwnerAuthError),
}

impl AppState {
    pub fn from_config(config: &Config) -> Result<Self, StartupError> {
        let owner = match &config.owner_tokens {
            Some(owner) => Some(Arc::new(OwnerVerifier::new(owner.clone())?)),
            None => None,
        };
        Ok(Self {
            pool: config.pool()?,
            service_secrets: Arc::new(config.service_secrets.clone()),
            guest_pass_secrets: Arc::new(config.guest_pass_secrets.clone()),
            owner,
            limits: config.limits,
        })
    }
}

/// Every route. Only liveness is unsigned; the signature check runs before any extractor.
pub fn router(state: AppState) -> Router {
    let signed = Router::new()
        .route("/v1/health/ready", get(health::ready))
        .route("/v1/me", get(identity::me))
        .route("/v1/views", post(views::record_view))
        .route("/v1/guest-links/{slug}/{guest}/rsvp", post(rsvp::http::guest_rsvp))
        .route("/v1/invitations/{invitation}/guests/{guest}/rsvp-override", post(rsvp::http::host_rsvp_override))
        .route("/v1/guest-links/{slug}/{guest}/wishes", post(wishes::http::guest_wish))
        .route("/v1/invitations/{invitation}/wishes/{wish}/moderation", post(wishes::http::moderate_wish))
        .route("/v1/invitations/{invitation}/wishes/{wish}/reply", post(wishes::http::reply_to_wish))
        .route("/v1/invitations/{invitation}/guests", post(roster::http::add_guest))
        .route("/v1/invitations/{invitation}/guest-imports", post(roster::http::import_guests))
        .route("/v1/invitations/{invitation}/guest-imports/{batch}/undo", post(roster::http::undo_import))
        .route("/v1/invitations/{invitation}/guests/{guest}/operation", post(roster::http::guest_operation))
        .route("/v1/invitations/{invitation}/guests/{guest}/invited-events", post(roster::http::set_invited_events))
        .route("/v1/invitations/{invitation}/category-invitations", post(roster::http::set_category_invitation))
        .route("/v1/invitations/{invitation}/registration-link", post(roster::http::registration_link))
        .route("/v1/registration-links/{token}/registrations", post(roster::http::register))
        .route("/v1/invitations/{invitation}/registrations/{registration}/decision", post(roster::http::decide))
        .route("/v1/invitations/{invitation}/guest-pass-checkins", post(roster::http::pass_checkins))
        .route("/v1/invitations/{invitation}/content", post(content::http::write_content))
        .route("/v1/invitations", post(content::create::create_draft))
        .route("/v1/payments/settlements", post(payment::http::settle))
        .route_layer(from_fn_with_state(state.clone(), service_auth::require_signature));
    let app =
        Router::new().route("/v1/health", get(health::health)).merge(signed).with_state(state).layer(from_fn(timeout));
    telemetry::layer(app)
}

/// Every answer is a problem document, including a timeout.
async fn timeout(request: Request, next: Next) -> Response {
    match tokio::time::timeout(REQUEST_TIMEOUT, next.run(request)).await {
        Ok(response) => response,
        Err(_) => ApiError::Timeout.into_response(),
    }
}
