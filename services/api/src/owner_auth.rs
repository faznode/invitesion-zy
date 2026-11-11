//! Owner tokens (09 §8.5). Next.js forwards the signed-in owner's Clerk session token as `Authorization: Bearer`, and
//! this module verifies it:
//! - RS256 only, against the issuer's JWKS, cached and refetched on an unknown `kid` at most once per
//!   [`MIN_REFRESH_INTERVAL`] (a flood of forged `kid`s cannot turn into a flood of fetches);
//! - issuer, `exp` and `nbf` with 5 s leeway, and `azp` among the allowed origins;
//! - `sub` is mapped to `users.clerk_user_id` by the caller; roles and ownership come from the database, never the token.
//!
//! Tested with locally generated keys served by a local JWKS endpoint only (DA-01: no Clerk credential is used).

use std::collections::HashMap;
use std::time::{Duration, Instant};

use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;
use tokio::sync::{Mutex, RwLock};

pub const MIN_REFRESH_INTERVAL: Duration = Duration::from_secs(30);
pub const LEEWAY_SECONDS: u64 = 5;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct OwnerClaims {
    pub sub: String,
    pub iss: String,
    pub exp: i64,
    #[serde(default)]
    pub nbf: Option<i64>,
    #[serde(default)]
    pub azp: Option<String>,
    #[serde(default)]
    pub sid: Option<String>,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum OwnerAuthError {
    #[error("unreadable JWKS")]
    BadJwks,
    #[error("signing keys unavailable")]
    KeysUnavailable,
    #[error("malformed token")]
    Malformed,
    #[error("algorithm not allowed")]
    Algorithm,
    #[error("unknown signing key")]
    UnknownKey,
    #[error("invalid token: {0}")]
    Invalid(String),
    #[error("authorized party not allowed")]
    AuthorizedParty,
}

#[derive(Debug, Clone)]
pub struct OwnerTokenConfig {
    pub issuer: String,
    pub jwks_url: String,
    pub authorized_parties: Vec<String>,
}

#[derive(Deserialize)]
struct Jwk {
    kid: Option<String>,
    kty: String,
    #[serde(default)]
    alg: Option<String>,
    #[serde(default)]
    n: Option<String>,
    #[serde(default)]
    e: Option<String>,
}

#[derive(Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

/// RSA keys by `kid`; keys of other types or algorithms are skipped, not trusted.
pub fn parse_jwks(json: &str) -> Result<HashMap<String, DecodingKey>, OwnerAuthError> {
    let parsed: Jwks = serde_json::from_str(json).map_err(|_| OwnerAuthError::BadJwks)?;
    let mut keys = HashMap::new();
    for key in parsed.keys {
        let usable = key.kty == "RSA" && key.alg.as_deref().is_none_or(|alg| alg == "RS256");
        if let (true, Some(kid), Some(n), Some(e)) = (usable, key.kid, key.n, key.e) {
            let decoding = DecodingKey::from_rsa_components(&n, &e).map_err(|_| OwnerAuthError::BadJwks)?;
            keys.insert(kid, decoding);
        }
    }
    if keys.is_empty() { Err(OwnerAuthError::BadJwks) } else { Ok(keys) }
}

pub struct OwnerVerifier {
    config: OwnerTokenConfig,
    client: reqwest::Client,
    keys: RwLock<HashMap<String, DecodingKey>>,
    last_fetch: Mutex<Option<Instant>>,
    min_refresh: Duration,
}

impl OwnerVerifier {
    pub fn new(config: OwnerTokenConfig) -> Result<Self, OwnerAuthError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| OwnerAuthError::KeysUnavailable)?;
        Ok(Self {
            config,
            client,
            keys: RwLock::new(HashMap::new()),
            last_fetch: Mutex::new(None),
            min_refresh: MIN_REFRESH_INTERVAL,
        })
    }

    /// Shorter refetch spacing, for tests that rotate keys.
    pub fn with_refresh_interval(mut self, interval: Duration) -> Self {
        self.min_refresh = interval;
        self
    }

    async fn fetch_keys(&self) -> Result<(), OwnerAuthError> {
        let mut last_fetch = self.last_fetch.lock().await;
        if last_fetch.is_some_and(|at| at.elapsed() < self.min_refresh) {
            return Ok(());
        }
        *last_fetch = Some(Instant::now());
        let response = self.client.get(&self.config.jwks_url).send().await.map_err(|error| {
            tracing::warn!(%error, "JWKS fetch failed");
            OwnerAuthError::KeysUnavailable
        })?;
        if !response.status().is_success() {
            tracing::warn!(status = response.status().as_u16(), "JWKS fetch refused");
            return Err(OwnerAuthError::KeysUnavailable);
        }
        let body = response.text().await.map_err(|_| OwnerAuthError::KeysUnavailable)?;
        let fresh = parse_jwks(&body)?;
        *self.keys.write().await = fresh;
        Ok(())
    }

    async fn key_for(&self, kid: &str) -> Result<DecodingKey, OwnerAuthError> {
        if let Some(key) = self.keys.read().await.get(kid) {
            return Ok(key.clone());
        }
        self.fetch_keys().await?;
        self.keys.read().await.get(kid).cloned().ok_or(OwnerAuthError::UnknownKey)
    }

    pub async fn verify(&self, token: &str) -> Result<OwnerClaims, OwnerAuthError> {
        let header = decode_header(token).map_err(|_| OwnerAuthError::Malformed)?;
        if header.alg != Algorithm::RS256 {
            return Err(OwnerAuthError::Algorithm);
        }
        let kid = header.kid.ok_or(OwnerAuthError::UnknownKey)?;
        let key = self.key_for(&kid).await?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.config.issuer.as_str()]);
        validation.set_required_spec_claims(&["exp", "iss", "sub"]);
        validation.validate_aud = false;
        validation.validate_nbf = true;
        validation.leeway = LEEWAY_SECONDS;
        let data =
            decode::<OwnerClaims>(token, &key, &validation).map_err(|e| OwnerAuthError::Invalid(e.to_string()))?;
        if !self.config.authorized_parties.is_empty() {
            match data.claims.azp.as_deref() {
                Some(party) if self.config.authorized_parties.iter().any(|p| p == party) => {}
                _ => return Err(OwnerAuthError::AuthorizedParty),
            }
        }
        Ok(data.claims)
    }
}

/// The bearer token of an `Authorization` header, if any.
pub fn bearer_token(headers: &axum::http::HeaderMap) -> Option<&str> {
    let value = headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?;
    let token = value.strip_prefix("Bearer ")?.trim();
    (!token.is_empty()).then_some(token)
}
