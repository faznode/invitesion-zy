//! The HTTP edge without a database: the pool is lazy and points at a closed port, so every assertion here proves the
//! request was refused (or answered) before any SQL ran.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use http_body_util::BodyExt;
use invitesion_api::config::Config;
use invitesion_api::limits::Limits;
use invitesion_api::openapi::document_json;
use invitesion_api::problem::PROBLEM_CONTENT_TYPE;
use invitesion_api::service_auth::{MAX_BODY_BYTES, SIGNATURE_HEADER, sign, unix_now};
use invitesion_api::{AppState, router};
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

const SECRET: &[u8] = b"http-contract-test-secret-0123456789abcdef";

fn app() -> axum::Router {
    // The production pool's acquire timeout (config.rs), shorter than the request timeout.
    let pool = PgPoolOptions::new()
        .acquire_timeout(std::time::Duration::from_secs(5))
        .connect_lazy("postgres://nobody@127.0.0.1:9/none")
        .expect("lazy pool");
    router(AppState {
        pool,
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner: None,
        limits: Limits::default(),
    })
}

async fn send(request: Request<Body>) -> (StatusCode, Option<String>, Option<String>, Value) {
    let response = app().oneshot(request).await.unwrap();
    let status = response.status();
    let content_type = response.headers().get(header::CONTENT_TYPE).map(|v| v.to_str().unwrap().to_string());
    let request_id = response.headers().get("x-request-id").map(|v| v.to_str().unwrap().to_string());
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, content_type, request_id, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn signed(method: Method, path: &str, body: &str, secret: &[u8], at: i64) -> Request<Body> {
    Request::builder()
        .method(method.clone())
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(SIGNATURE_HEADER, sign(secret, at, method.as_str(), path, body.as_bytes()))
        .body(Body::from(body.to_string()))
        .unwrap()
}

fn assert_problem(result: &(StatusCode, Option<String>, Option<String>, Value), status: StatusCode, code: &str) {
    assert_eq!(result.0, status, "{:?}", result.3);
    assert_eq!(result.1.as_deref(), Some(PROBLEM_CONTENT_TYPE));
    assert_eq!(result.3["code"], code);
    assert_eq!(result.3["status"], status.as_u16());
    assert_eq!(result.3["type"], format!("https://invitesion.id/problems/{code}"));
}

#[tokio::test]
async fn liveness_is_public_and_carries_a_request_id() {
    let result = send(Request::get("/v1/health").body(Body::empty()).unwrap()).await;
    assert_eq!(result.0, StatusCode::OK);
    assert_eq!(result.3["status"], "ok");
    assert!(result.2.as_deref().is_some_and(|id| id.len() >= 32), "a minted request id");
    let forwarded = Request::get("/v1/health").header("x-request-id", "next-req-123").body(Body::empty()).unwrap();
    assert_eq!(send(forwarded).await.2.as_deref(), Some("next-req-123"), "Next.js request id is propagated");
}

#[tokio::test]
async fn every_signed_route_refuses_missing_and_invalid_signatures_before_the_database() {
    let now = unix_now();
    for (method, path) in [(Method::GET, "/v1/health/ready"), (Method::GET, "/v1/me"), (Method::POST, "/v1/views")] {
        let bare = Request::builder().method(method.clone()).uri(path).body(Body::from("{}")).unwrap();
        assert_problem(&send(bare).await, StatusCode::UNAUTHORIZED, "auth.signature_missing");
        let wrong_secret = signed(method.clone(), path, "{}", b"another-secret-0123456789abcdef-0123", now);
        assert_problem(&send(wrong_secret).await, StatusCode::UNAUTHORIZED, "auth.signature_invalid");
        let stale = signed(method.clone(), path, "{}", SECRET, now - 61);
        assert_problem(&send(stale).await, StatusCode::UNAUTHORIZED, "auth.signature_invalid");
    }
    let mut other_body = signed(Method::POST, "/v1/views", r#"{"invitationId":1}"#, SECRET, now);
    *other_body.body_mut() = Body::from(r#"{"invitationId":2}"#);
    assert_problem(&send(other_body).await, StatusCode::UNAUTHORIZED, "auth.signature_invalid");
    let mut other_query = signed(Method::GET, "/v1/health/ready", "", SECRET, now);
    *other_query.uri_mut() = "/v1/health/ready?x=1".parse().unwrap();
    assert_problem(&send(other_query).await, StatusCode::UNAUTHORIZED, "auth.signature_invalid");
}

#[tokio::test]
async fn signed_but_invalid_bodies_are_refused_before_the_database() {
    let now = unix_now();
    for (body, code) in [
        ("not json", "request.invalid_body"),
        (r#"{"invitationId":1,"extra":true}"#, "request.invalid_body"),
        (r#"{"guestId":3}"#, "request.invalid_body"),
        (r#"{"invitationId":0}"#, "request.invalid_id"),
        (r#"{"invitationId":4,"guestId":-1}"#, "request.invalid_id"),
    ] {
        assert_problem(
            &send(signed(Method::POST, "/v1/views", body, SECRET, now)).await,
            StatusCode::BAD_REQUEST,
            code,
        );
    }
    let oversized = "x".repeat(MAX_BODY_BYTES + 1);
    assert_problem(
        &send(signed(Method::POST, "/v1/views", &oversized, SECRET, now)).await,
        StatusCode::PAYLOAD_TOO_LARGE,
        "request.too_large",
    );
}

#[tokio::test]
async fn owner_routes_answer_503_until_owner_tokens_are_configured() {
    let request = signed(Method::GET, "/v1/me", "", SECRET, unix_now());
    assert_problem(&send(request).await, StatusCode::SERVICE_UNAVAILABLE, "owner_auth.not_configured");
}

#[test]
fn a_timeout_is_a_problem_document_too() {
    let problem = invitesion_api::problem::ApiError::Timeout.problem();
    assert_eq!((problem.status, problem.code.as_str()), (504, "request.timeout"));
    assert!(
        invitesion_api::app_request_timeout() > std::time::Duration::from_secs(5),
        "longer than the pool's acquire timeout"
    );
}

#[tokio::test]
async fn readiness_reports_an_unreachable_database_as_503() {
    let request = signed(Method::GET, "/v1/health/ready", "", SECRET, unix_now());
    assert_problem(&send(request).await, StatusCode::SERVICE_UNAVAILABLE, "database.unavailable");
}

fn lookup(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> + use<> {
    let owned: Vec<(String, String)> = pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
    move |name| owned.iter().find(|(k, _)| k == name).map(|(_, v)| v.clone())
}

#[test]
fn configuration_fails_closed() {
    let db = ("POSTGRES_URL", "postgres://x@127.0.0.1/db");
    let strong = "s".repeat(32);
    assert!(Config::from_lookup(&lookup(&[])).is_err(), "no database URL");
    assert!(Config::from_lookup(&lookup(&[db])).is_err(), "no service secret");
    assert!(Config::from_lookup(&lookup(&[db, ("INTERNAL_API_SECRET", "short")])).is_err(), "a weak secret");
    let half_owner = [db, ("INTERNAL_API_SECRET", strong.as_str()), ("OWNER_TOKEN_ISSUER", "https://issuer.invalid")];
    assert!(Config::from_lookup(&lookup(&half_owner)).is_err(), "issuer without JWKS URL");
    let ok = [
        ("DATABASE_URL", "postgres://x@127.0.0.1/db"),
        ("INTERNAL_API_SECRET", strong.as_str()),
        ("INTERNAL_API_SECRET_PREVIOUS", strong.as_str()),
    ];
    let config = Config::from_lookup(&lookup(&ok)).expect("valid");
    assert_eq!(config.service_secrets.len(), 2);
    assert_eq!(config.statement_cache_capacity, 0, "safe behind a transaction pooler by default");
    assert_eq!(config.port, 8080);
}

/// Contract drift: the committed document must equal the one generated from the code.
#[test]
fn committed_openapi_matches_the_code() {
    let committed = include_str!("../openapi.json");
    assert_eq!(committed, document_json(), "run: bash scripts/api/contract.sh generate");
    let doc: Value = serde_json::from_str(committed).unwrap();
    assert_eq!(doc["openapi"], "3.1.0");
    for path in ["/v1/health", "/v1/health/ready", "/v1/me", "/v1/views"] {
        assert!(doc["paths"][path].is_object(), "{path}");
    }
}
