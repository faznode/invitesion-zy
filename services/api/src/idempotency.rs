//! `Idempotency-Key` for writes: the key is recorded in the same transaction as the write it protects, together with
//! the response, so a retry of a committed write replays that response instead of writing again (a double tap on the
//! RSVP button, a retried request after a timeout). Refused requests write nothing and record nothing, so they are
//! simply evaluated again. A key reused with a different request is a 422. Records are kept for 24 hours.

use axum::Json;
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgExecutor, Postgres, Transaction};
use time::{Duration, PrimitiveDateTime};

use crate::problem::{ApiError, Subject};

pub const KEY_HEADER: &str = "idempotency-key";
pub const REPLAYED_HEADER: &str = "idempotent-replayed";
pub const RETENTION: Duration = Duration::hours(24);
const MAX_KEY_LEN: usize = 255;

/// The request's key: 1–255 visible ASCII characters, or none.
pub fn key_from(headers: &HeaderMap) -> Result<Option<String>, ApiError> {
    let Some(value) = headers.get(KEY_HEADER) else { return Ok(None) };
    let key = value.to_str().unwrap_or_default();
    let valid = (1..=MAX_KEY_LEN).contains(&key.len()) && key.bytes().all(|b| b.is_ascii_graphic());
    if valid {
        Ok(Some(key.to_string()))
    } else {
        Err(ApiError::BadRequest("request.invalid_idempotency_key", "1 to 255 visible ASCII characters".into()))
    }
}

/// The scope a host's write is recorded under: the operation, the caller resolved from the verified token (the owner or a
/// member, never the member's owner: G-044, D-057), the invitation and the guest or wish. A key replays only inside its
/// scope, so another customer, another invitation or another resource never reads a cached answer or learns that the key
/// exists: their request is judged afresh and refused by the access check. Host writers read the stored answer inside
/// their transaction after that check, so a member whose grant was revoked is refused too. A legitimate retry (the same
/// caller, path and body, with access) still replays, including a delete whose row is gone.
pub fn host_scope(operation: &str, owner_user_id: i32, invitation_id: i32, resource_id: i32) -> String {
    format!("{operation}:{owner_user_id}:{invitation_id}:{resource_id}")
}

/// SHA-256 of the request's canonical JSON (struct fields in declaration order, maps sorted), so a retry of the same
/// request matches and any change does not.
pub fn request_hash(request: &impl Serialize) -> String {
    hex::encode(Sha256::digest(serde_json::to_vec(request).expect("requests serialise")))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Prior {
    None,
    Replay { status: u16, body: Value },
    Mismatch,
}

/// On the pool for a guest's write; on the write's own transaction for a host's, after its access check.
pub async fn lookup<'e>(
    executor: impl PgExecutor<'e>,
    scope: &str,
    key: &str,
    hash: &str,
) -> Result<Prior, sqlx::Error> {
    let row = sqlx::query!(
        "select request_hash, response_status, response_body from api_idempotency_keys \
         where scope = $1 and key = $2 and created_at >= $3",
        scope,
        key,
        crate::views::utc_now() - RETENTION
    )
    .fetch_optional(executor)
    .await?;
    Ok(match row {
        None => Prior::None,
        Some(row) if row.request_hash == hash => {
            Prior::Replay { status: u16::try_from(row.response_status).unwrap_or(200), body: row.response_body }
        }
        Some(_) => Prior::Mismatch,
    })
}

/// A committed response for this key replays (with `Idempotent-Replayed: true`); the key with another request is a 422.
pub async fn replay<'e>(
    executor: impl PgExecutor<'e>,
    scope: &str,
    key: &str,
    hash: &str,
) -> Result<Option<Response>, ApiError> {
    match lookup(executor, scope, key, hash).await.map_err(|error| ApiError::internal("idempotency_lookup", error))? {
        Prior::None => Ok(None),
        Prior::Mismatch => Err(ApiError::Unprocessable("idempotency.key_reused", Subject::None)),
        Prior::Replay { status, body } => {
            let mut response = (StatusCode::from_u16(status).unwrap_or(StatusCode::OK), Json(body)).into_response();
            response.headers_mut().insert(REPLAYED_HEADER, HeaderValue::from_static("true"));
            Ok(Some(response))
        }
    }
}

/// Records the key with the response inside the write's transaction. False when another request with this key
/// committed first: the caller rolls back and answers from `lookup`. An expired record is replaced.
pub async fn record(
    tx: &mut Transaction<'_, Postgres>,
    scope: &str,
    key: &str,
    hash: &str,
    status: u16,
    body: &Value,
    now: PrimitiveDateTime,
) -> Result<bool, sqlx::Error> {
    let inserted = sqlx::query_scalar!(
        r#"insert into api_idempotency_keys (scope, key, request_hash, response_status, response_body, created_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (scope, key) do update set
             request_hash = excluded.request_hash, response_status = excluded.response_status,
             response_body = excluded.response_body, created_at = excluded.created_at
           where api_idempotency_keys.created_at < $7
           returning true as "inserted!""#,
        scope,
        key,
        hash,
        i32::from(status),
        body,
        now,
        now - RETENTION
    )
    .fetch_optional(&mut **tx)
    .await?
    .is_some();
    if inserted {
        sqlx::query!(
            "delete from api_idempotency_keys where (scope, key) in \
             (select scope, key from api_idempotency_keys where created_at < $1 order by created_at limit 100)",
            now - RETENTION
        )
        .execute(&mut **tx)
        .await?;
    }
    Ok(inserted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn keys_are_visible_ascii_up_to_255() {
        let mut headers = HeaderMap::new();
        assert_eq!(key_from(&headers).unwrap(), None);
        headers.insert(KEY_HEADER, HeaderValue::from_static("rsvp-6f1c2b"));
        assert_eq!(key_from(&headers).unwrap().as_deref(), Some("rsvp-6f1c2b"));
        for bad in ["", "has space", &"k".repeat(256)] {
            headers.insert(KEY_HEADER, HeaderValue::from_str(bad).unwrap());
            assert!(key_from(&headers).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn host_scopes_bind_the_owner_the_invitation_and_the_resource() {
        let scope = host_scope("wish:host", 7, 11, 13);
        assert_eq!(scope, "wish:host:7:11:13");
        for other in [
            host_scope("wish:host", 8, 11, 13),
            host_scope("wish:host", 7, 12, 13),
            host_scope("wish:host", 7, 11, 14),
            host_scope("wish:reply", 7, 11, 13),
        ] {
            assert_ne!(scope, other);
        }
        assert!(host_scope("wish:reply", i32::MAX, i32::MAX, i32::MAX).len() <= 120, "fits api_idempotency_keys.scope");
    }

    #[test]
    fn the_hash_follows_the_request() {
        #[derive(Serialize)]
        struct Request<'a> {
            status: &'a str,
        }
        assert_eq!(request_hash(&Request { status: "CONFIRMED" }), request_hash(&Request { status: "CONFIRMED" }));
        assert_ne!(request_hash(&Request { status: "CONFIRMED" }), request_hash(&Request { status: "DECLINED" }));
        assert_eq!(request_hash(&Request { status: "x" }).len(), 64);
    }
}
