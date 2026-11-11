//! Contract of the HTTP edge without a database: every refusal is RFC 9457 problem+json with a stable code, and
//! refusals happen before any database work (the pool here is lazy and points nowhere).

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use invitesion_api_feasibility::http::{AppState, VIEWS_PATH, router};
use invitesion_api_feasibility::service_auth::{self, SIGNATURE_HEADER, ServiceAuthError};
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

const SECRET: &[u8] = b"feasibility-test-secret";

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn app() -> Router {
    let pool = PgPoolOptions::new().connect_lazy("postgres://unused@127.0.0.1:1/none").expect("lazy pool");
    router(AppState { pool, service_secret: Arc::new(SECRET.to_vec()) })
}

async fn post(body: &str, signature: Option<String>) -> (StatusCode, String, Value) {
    let mut request = Request::post(VIEWS_PATH).header(header::CONTENT_TYPE, "application/json");
    if let Some(signature) = signature {
        request = request.header(SIGNATURE_HEADER, signature);
    }
    let response = app().oneshot(request.body(Body::from(body.to_string())).unwrap()).await.unwrap();
    let status = response.status();
    let content_type = response.headers().get(header::CONTENT_TYPE).map(|v| v.to_str().unwrap().to_string()).unwrap_or_default();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, content_type, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn signed(body: &str) -> Option<String> {
    Some(service_auth::sign(SECRET, now(), "POST", VIEWS_PATH, body.as_bytes()))
}

#[tokio::test]
async fn missing_signature_is_a_401_problem() {
    let (status, content_type, problem) = post(r#"{"invitationId":1}"#, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(content_type, "application/problem+json");
    assert_eq!(problem["code"], "auth.signature_missing");
    assert_eq!(problem["status"], 401);
    assert_eq!(problem["type"], "https://invitesion.id/problems/auth.signature_missing");
}

#[tokio::test]
async fn wrong_stale_or_misdirected_signatures_are_refused() {
    let body = r#"{"invitationId":1}"#;
    let wrong_secret = service_auth::sign(b"another-secret", now(), "POST", VIEWS_PATH, body.as_bytes());
    let stale = service_auth::sign(SECRET, now() - 3_600, "POST", VIEWS_PATH, body.as_bytes());
    let other_path = service_auth::sign(SECRET, now(), "POST", "/v1/other", body.as_bytes());
    let other_body = service_auth::sign(SECRET, now(), "POST", VIEWS_PATH, br#"{"invitationId":2}"#);
    for signature in [wrong_secret, stale, other_path, other_body, "t=abc,v1=zz".to_string()] {
        let (status, _, problem) = post(body, Some(signature)).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert_eq!(problem["code"], "auth.signature_invalid");
    }
}

#[tokio::test]
async fn malformed_or_unknown_fields_are_a_400_problem() {
    for body in ["not json", r#"{"invitationId":1,"extra":true}"#, r#"{"guestId":3}"#] {
        let (status, content_type, problem) = post(body, signed(body)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(content_type, "application/problem+json");
        assert_eq!(problem["code"], "request.invalid_body");
    }
}

#[tokio::test]
async fn non_positive_ids_are_refused_before_the_database() {
    for body in [r#"{"invitationId":0}"#, r#"{"invitationId":5,"guestId":-1}"#] {
        let (status, _, problem) = post(body, signed(body)).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(problem["code"], "request.invalid_id");
    }
}

#[tokio::test]
async fn health_answers_ok() {
    let response = app().oneshot(Request::get("/v1/health").body(Body::empty()).unwrap()).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[test]
fn signature_round_trip_and_failure_modes() {
    let body = br#"{"invitationId":7}"#;
    let t = now();
    let header = service_auth::sign(SECRET, t, "POST", VIEWS_PATH, body);
    assert_eq!(service_auth::verify(SECRET, &header, "POST", VIEWS_PATH, body, t), Ok(()));
    assert_eq!(service_auth::verify(SECRET, &header, "POST", VIEWS_PATH, b"{}", t), Err(ServiceAuthError::Mismatch));
    assert_eq!(service_auth::verify(SECRET, &header, "POST", VIEWS_PATH, body, t + 61), Err(ServiceAuthError::Stale));
    assert_eq!(service_auth::verify(SECRET, "garbage", "POST", VIEWS_PATH, body, t), Err(ServiceAuthError::Malformed));
}
