//! Configuration from the environment. The service refuses to start without a database URL and a strong service
//! secret (fail closed); owner-token verification is optional until the first owner endpoint ships behind a flag.

use std::time::Duration;

use sqlx::PgPool;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

use crate::limits::{Limit, Limits};
use crate::owner_auth::OwnerTokenConfig;
use crate::service_auth::MIN_SECRET_BYTES;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("{0} is not set")]
    Missing(&'static str),
    #[error("{0} must be at least {MIN_SECRET_BYTES} bytes")]
    WeakSecret(&'static str),
    #[error("{0} is not a valid value")]
    Invalid(&'static str),
}

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    /// The current secret first; the previous one is accepted only while a rotation is in progress.
    pub service_secrets: Vec<Vec<u8>>,
    /// B-024: the guest-pass secrets, current first; optional (the check-in endpoint answers 503 without one), but a
    /// set secret must be strong, and a previous one needs a current one.
    pub guest_pass_secrets: Vec<Vec<u8>>,
    pub owner_tokens: Option<OwnerTokenConfig>,
    pub port: u16,
    /// 0 behind a transaction pooler (the ADR-A2 default): no named prepared statements survive a pooled connection.
    pub statement_cache_capacity: usize,
    /// Write limits; `RATE_LIMIT_RSVP_LINK`, `RATE_LIMIT_RSVP_IP`, `RATE_LIMIT_WISH_LINK`, `RATE_LIMIT_WISH_IP`,
    /// `RATE_LIMIT_REGISTRATION_LINK` and `RATE_LIMIT_REGISTRATION_IP` as `<count>/<seconds>` override the defaults.
    pub limits: Limits,
}

type Env<'a> = &'a dyn Fn(&str) -> Option<String>;

fn non_empty(env: Env, name: &str) -> Option<String> {
    env(name).map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(&|name| std::env::var(name).ok())
    }

    pub fn from_lookup(env: Env) -> Result<Self, ConfigError> {
        let database_url = non_empty(env, "DATABASE_URL")
            .or_else(|| non_empty(env, "POSTGRES_URL"))
            .ok_or(ConfigError::Missing("DATABASE_URL or POSTGRES_URL"))?;

        let mut service_secrets = Vec::new();
        for name in ["INTERNAL_API_SECRET", "INTERNAL_API_SECRET_PREVIOUS"] {
            match non_empty(env, name) {
                Some(secret) if secret.len() < MIN_SECRET_BYTES => return Err(ConfigError::WeakSecret(name)),
                Some(secret) => service_secrets.push(secret.into_bytes()),
                None if name == "INTERNAL_API_SECRET" => return Err(ConfigError::Missing(name)),
                None => {}
            }
        }

        let mut guest_pass_secrets = Vec::new();
        for name in ["GUEST_PASS_SECRET", "GUEST_PASS_SECRET_PREVIOUS"] {
            match non_empty(env, name) {
                Some(secret) if secret.len() < crate::roster::pass::MIN_SECRET_BYTES => {
                    return Err(ConfigError::WeakSecret(name));
                }
                Some(_) if name == "GUEST_PASS_SECRET_PREVIOUS" && guest_pass_secrets.is_empty() => {
                    return Err(ConfigError::Missing("GUEST_PASS_SECRET"));
                }
                Some(secret) => guest_pass_secrets.push(secret.into_bytes()),
                None => {}
            }
        }

        let owner_tokens = match (non_empty(env, "OWNER_TOKEN_ISSUER"), non_empty(env, "OWNER_TOKEN_JWKS_URL")) {
            (Some(issuer), Some(jwks_url)) => Some(OwnerTokenConfig {
                issuer,
                jwks_url,
                authorized_parties: non_empty(env, "OWNER_TOKEN_AUTHORIZED_PARTIES")
                    .map(|list| list.split(',').map(|p| p.trim().to_string()).filter(|p| !p.is_empty()).collect())
                    .unwrap_or_default(),
            }),
            (None, None) => None,
            (None, Some(_)) => return Err(ConfigError::Missing("OWNER_TOKEN_ISSUER")),
            (Some(_), None) => return Err(ConfigError::Missing("OWNER_TOKEN_JWKS_URL")),
        };

        let port = match non_empty(env, "PORT") {
            Some(raw) => raw.parse().map_err(|_| ConfigError::Invalid("PORT"))?,
            None => 8080,
        };
        let statement_cache_capacity = match non_empty(env, "DATABASE_STATEMENT_CACHE") {
            Some(raw) => raw.parse().map_err(|_| ConfigError::Invalid("DATABASE_STATEMENT_CACHE"))?,
            None => 0,
        };

        let mut limits = Limits::default();
        for (name, limit) in [
            ("RATE_LIMIT_RSVP_LINK", &mut limits.rsvp_per_link),
            ("RATE_LIMIT_RSVP_IP", &mut limits.rsvp_per_ip),
            ("RATE_LIMIT_WISH_LINK", &mut limits.wish_per_link),
            ("RATE_LIMIT_WISH_IP", &mut limits.wish_per_ip),
            ("RATE_LIMIT_REGISTRATION_LINK", &mut limits.registration_per_link),
            ("RATE_LIMIT_REGISTRATION_IP", &mut limits.registration_per_ip),
        ] {
            if let Some(raw) = non_empty(env, name) {
                *limit = Limit::parse(&raw).ok_or(ConfigError::Invalid(name))?;
            }
        }

        Ok(Self {
            database_url,
            service_secrets,
            guest_pass_secrets,
            owner_tokens,
            port,
            statement_cache_capacity,
            limits,
        })
    }

    /// A lazy pool: a cold start never waits for the database, and the first query connects.
    pub fn pool(&self) -> Result<PgPool, ConfigError> {
        let options: PgConnectOptions = self.database_url.parse().map_err(|_| ConfigError::Invalid("DATABASE_URL"))?;
        let options =
            options.statement_cache_capacity(self.statement_cache_capacity).application_name("invitesion-api");
        Ok(PgPoolOptions::new().max_connections(5).acquire_timeout(Duration::from_secs(5)).connect_lazy_with(options))
    }
}

/// rustls needs one process-wide crypto provider (ring: no C toolchain beyond `cc`, no cmake). Idempotent.
pub fn install_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}
