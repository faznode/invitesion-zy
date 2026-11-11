//! Owner-token verification for dashboard calls: Next.js forwards the signed-in owner's session token and the API
//! verifies it against the issuer's JWKS (RS256 only), then maps `sub` to `users.clerk_user_id`; roles and ownership
//! stay in the database (AGENTS.md). Exercised here with locally generated keys only: no Clerk credentials (DA-01).

use std::collections::HashMap;

use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct OwnerClaims {
    pub sub: String,
    pub iss: String,
    pub exp: i64,
    #[serde(default)]
    pub azp: Option<String>,
    #[serde(default)]
    pub sid: Option<String>,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum OwnerAuthError {
    #[error("unreadable JWKS")]
    BadJwks,
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

#[derive(Deserialize)]
struct Jwk {
    kid: String,
    kty: String,
    n: String,
    e: String,
}

#[derive(Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

pub struct OwnerVerifier {
    issuer: String,
    authorized_parties: Vec<String>,
    keys: HashMap<String, DecodingKey>,
}

impl OwnerVerifier {
    pub fn from_jwks_json(issuer: &str, authorized_parties: &[&str], jwks: &str) -> Result<Self, OwnerAuthError> {
        let parsed: Jwks = serde_json::from_str(jwks).map_err(|_| OwnerAuthError::BadJwks)?;
        let mut keys = HashMap::new();
        for key in parsed.keys.into_iter().filter(|k| k.kty == "RSA") {
            let decoding = DecodingKey::from_rsa_components(&key.n, &key.e).map_err(|_| OwnerAuthError::BadJwks)?;
            keys.insert(key.kid, decoding);
        }
        if keys.is_empty() {
            return Err(OwnerAuthError::BadJwks);
        }
        Ok(Self {
            issuer: issuer.to_string(),
            authorized_parties: authorized_parties.iter().map(|p| p.to_string()).collect(),
            keys,
        })
    }

    pub fn verify(&self, token: &str) -> Result<OwnerClaims, OwnerAuthError> {
        let header = decode_header(token).map_err(|_| OwnerAuthError::Malformed)?;
        if header.alg != Algorithm::RS256 {
            return Err(OwnerAuthError::Algorithm);
        }
        let kid = header.kid.ok_or(OwnerAuthError::UnknownKey)?;
        let key = self.keys.get(&kid).ok_or(OwnerAuthError::UnknownKey)?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.issuer.as_str()]);
        validation.validate_aud = false;
        validation.validate_nbf = true;
        validation.leeway = 5;
        let data = decode::<OwnerClaims>(token, key, &validation).map_err(|e| OwnerAuthError::Invalid(e.to_string()))?;
        if !self.authorized_parties.is_empty() {
            match data.claims.azp.as_deref() {
                Some(party) if self.authorized_parties.iter().any(|p| p == party) => {}
                _ => return Err(OwnerAuthError::AuthorizedParty),
            }
        }
        Ok(data.claims)
    }
}
