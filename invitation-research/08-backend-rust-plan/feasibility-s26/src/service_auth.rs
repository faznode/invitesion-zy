//! Internal service signature: Next.js server code → Rust API. Header
//! `x-invitesion-signature: t=<unix seconds>,v1=<hex HMAC-SHA256>` over `t.METHOD.path.sha256hex(body)`.
//! The API is not called from browsers in the first slices; this keeps arbitrary internet clients out.

use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};

pub const SIGNATURE_HEADER: &str = "x-invitesion-signature";
pub const MAX_SKEW_SECONDS: i64 = 60;

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

fn message(timestamp: i64, method: &str, path: &str, body: &[u8]) -> String {
    format!("{timestamp}.{method}.{path}.{}", hex::encode(Sha256::digest(body)))
}

pub fn sign(secret: &[u8], timestamp: i64, method: &str, path: &str, body: &[u8]) -> String {
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(message(timestamp, method, path, body).as_bytes());
    format!("t={timestamp},v1={}", hex::encode(mac.finalize().into_bytes()))
}

pub fn verify(
    secret: &[u8],
    header: &str,
    method: &str,
    path: &str,
    body: &[u8],
    now: i64,
) -> Result<(), ServiceAuthError> {
    let mut timestamp = None;
    let mut signature = None;
    for part in header.split(',') {
        match part.trim().split_once('=') {
            Some(("t", value)) => timestamp = value.parse::<i64>().ok(),
            Some(("v1", value)) => signature = hex::decode(value).ok(),
            _ => return Err(ServiceAuthError::Malformed),
        }
    }
    let (timestamp, signature) = timestamp.zip(signature).ok_or(ServiceAuthError::Malformed)?;
    if (now - timestamp).abs() > MAX_SKEW_SECONDS {
        return Err(ServiceAuthError::Stale);
    }
    let mut mac = HmacSha256::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(message(timestamp, method, path, body).as_bytes());
    mac.verify_slice(&signature).map_err(|_| ServiceAuthError::Mismatch)
}
