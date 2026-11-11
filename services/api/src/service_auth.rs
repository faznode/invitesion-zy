//! Internal service signature, Next.js server code → this API (09 §8.5, "service boundary"). The API is not
//! browser-facing: every call except the liveness probe carries
//! `x-invitesion-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "t.METHOD.path_and_query.sha256hex(body)")>`.
//! Two secrets are accepted while one is rotated (`INTERNAL_API_SECRET`, `INTERNAL_API_SECRET_PREVIOUS`). The TypeScript
//! signer (`lib/api/signature.ts`) and this module run the same vectors (`contracts/vectors/service-signature.json`).

use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;
use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};

use crate::app::AppState;
use crate::problem::ApiError;

pub const SIGNATURE_HEADER: &str = "x-invitesion-signature";
pub const MAX_SKEW_SECONDS: i64 = 60;
/// Next.js's server-action body limit (1 MB), so anything a form could submit through Next.js fits (an RSVP may carry
/// up to 50 answers of 2,000 characters); anything larger is refused before it is hashed.
pub const MAX_BODY_BYTES: usize = 1024 * 1024;
/// Secrets shorter than this are refused at startup (HMAC-SHA256 keys of at least 256 bits).
pub const MIN_SECRET_BYTES: usize = 32;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum ServiceAuthError {
    #[error("malformed signature header")]
    Malformed,
    #[error("timestamp outside the allowed skew")]
    Stale,
    #[error("signature mismatch")]
    Mismatch,
}

pub fn canonical_message(timestamp: i64, method: &str, path_and_query: &str, body: &[u8]) -> String {
    format!("{timestamp}.{method}.{path_and_query}.{}", hex::encode(Sha256::digest(body)))
}

fn mac_for(secret: &[u8], message: &str) -> HmacSha256 {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(message.as_bytes());
    mac
}

pub fn sign(secret: &[u8], timestamp: i64, method: &str, path_and_query: &str, body: &[u8]) -> String {
    let mac = mac_for(secret, &canonical_message(timestamp, method, path_and_query, body));
    format!("t={timestamp},v1={}", hex::encode(mac.finalize().into_bytes()))
}

fn parse(header: &str) -> Result<(i64, Vec<u8>), ServiceAuthError> {
    let mut timestamp = None;
    let mut signature = None;
    for part in header.split(',') {
        match part.trim().split_once('=') {
            Some(("t", value)) if timestamp.is_none() => timestamp = value.parse::<i64>().ok(),
            Some(("v1", value)) if signature.is_none() => signature = hex::decode(value).ok(),
            _ => return Err(ServiceAuthError::Malformed),
        }
    }
    timestamp.zip(signature).ok_or(ServiceAuthError::Malformed)
}

/// Verifies against every accepted secret in constant time per secret.
pub fn verify(
    secrets: &[Vec<u8>],
    header: &str,
    method: &str,
    path_and_query: &str,
    body: &[u8],
    now: i64,
) -> Result<(), ServiceAuthError> {
    let (timestamp, signature) = parse(header)?;
    if (now - timestamp).abs() > MAX_SKEW_SECONDS {
        return Err(ServiceAuthError::Stale);
    }
    let message = canonical_message(timestamp, method, path_and_query, body);
    let matched = secrets.iter().any(|secret| mac_for(secret, &message).verify_slice(&signature).is_ok());
    if matched { Ok(()) } else { Err(ServiceAuthError::Mismatch) }
}

pub fn unix_now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Route middleware: buffers the body (bounded), verifies the signature over method, path, query and body, then hands
/// the same bytes to the handler. Runs before any extractor, so an unsigned request never reaches validation or SQL.
pub async fn require_signature(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let (parts, body) = request.into_parts();
    let bytes = axum::body::to_bytes(body, MAX_BODY_BYTES).await.map_err(|_| ApiError::PayloadTooLarge)?;
    let header = parts
        .headers
        .get(SIGNATURE_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized("auth.signature_missing"))?;
    let path_and_query = parts.uri.path_and_query().map(|pq| pq.as_str()).unwrap_or("/");
    verify(&state.service_secrets, header, parts.method.as_str(), path_and_query, &bytes, unix_now()).map_err(
        |error| {
            tracing::info!(reason = %error, "service signature refused");
            ApiError::Unauthorized("auth.signature_invalid")
        },
    )?;
    Ok(next.run(Request::from_parts(parts, Body::from(bytes))).await)
}
