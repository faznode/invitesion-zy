//! Contracts on a real database migrated by drizzle-kit (`TEST_DATABASE_URL`): the B-017a view writer (shared vectors,
//! concurrency, window, anonymous opens, the HTTP slice) and the owner mapping behind `GET /v1/me`. Fixture rows are
//! fictional, tagged per run and removed before the assertions, so a failure never leaves rows behind.

use std::sync::Arc;
use std::time::Duration as StdDuration;

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use axum::routing::get;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use http_body_util::BodyExt;
use invitesion_api::config::install_crypto_provider;
use invitesion_api::limits::Limits;
use invitesion_api::owner_auth::{OwnerTokenConfig, OwnerVerifier};
use invitesion_api::service_auth::{SIGNATURE_HEADER, sign, unix_now};
use invitesion_api::views::{VIEW_DEDUPE_WINDOW, VIEW_LOCK_NAMESPACE, record_invitation_view, utc_now, view_lock_key};
use invitesion_api::{AppState, router};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use rsa::RsaPrivateKey;
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::traits::PublicKeyParts;
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use time::{Duration, PrimitiveDateTime};
use tower::ServiceExt;

const CONCURRENCY: usize = 20;
const SECRET: &[u8] = b"database-contract-test-secret-0123456789";

/// Both writers take the same lock and window; a transition with both deployed would otherwise not serialise. The
/// vectors below are the behavioural check; this guard catches a constant that drifts without a vector noticing.
#[test]
fn lock_key_and_window_match_the_typescript_writer() {
    let source = include_str!("../../../lib/invitation/view-tracking.ts");
    let hex = source.split("VIEW_LOCK_NAMESPACE = 0x").nth(1).and_then(|r| r.split(';').next()).expect("namespace");
    assert_eq!(i64::from(VIEW_LOCK_NAMESPACE), i64::from_str_radix(hex.trim(), 16).unwrap());
    assert!(source.contains("VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000"));
    assert_eq!(VIEW_DEDUPE_WINDOW, Duration::minutes(30));
    assert_eq!(view_lock_key(7, Some(3)), 3);
    assert_eq!(view_lock_key(7, None), -7);
}

struct Fixture {
    pool: PgPool,
    user: i32,
    invitation: i32,
    guests: Vec<i32>,
    clerk_user_id: String,
}

impl Fixture {
    async fn create() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(12).connect(&url).await.expect("connect");
        let tag = uuid::Uuid::new_v4().simple();
        let clerk_user_id = format!("user_api_test_{tag}");
        let user: i32 = sqlx::query_scalar("insert into users (email, clerk_user_id) values ($1, $2) returning id")
            .bind(format!("api-test-{tag}@example.invalid"))
            .bind(&clerk_user_id)
            .fetch_one(&pool)
            .await
            .expect("fixture user");
        let invitation: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type) values ($1, $2, 'wedding') returning id",
        )
        .bind(user)
        .bind(format!("api-test-{tag}"))
        .fetch_one(&pool)
        .await
        .expect("fixture invitation");
        let mut guests = Vec::new();
        for slug in ["budi", "sari", "rina", "dodi"] {
            let id: i32 =
                sqlx::query_scalar("insert into guests (invitation_id, name, slug) values ($1, $2, $3) returning id")
                    .bind(invitation)
                    .bind(format!("{slug} (api test)"))
                    .bind(format!("{slug}-{tag}"))
                    .fetch_one(&pool)
                    .await
                    .expect("fixture guest");
            guests.push(id);
        }
        Self { pool, user, invitation, guests, clerk_user_id }
    }

    async fn views(&self, guest: Option<i32>) -> i64 {
        sqlx::query_scalar(
            "select count(*) from analytics_events where invitation_id = $1 and event_type = 'VIEW' and guest_id is not distinct from $2",
        )
        .bind(self.invitation)
        .bind(guest)
        .fetch_one(&self.pool)
        .await
        .expect("count views")
    }

    async fn opened(&self, guest: i32) -> i32 {
        sqlx::query_scalar("select opened_count from guests where id = $1")
            .bind(guest)
            .fetch_one(&self.pool)
            .await
            .expect("opened")
    }

    async fn remove(&self) -> i64 {
        sqlx::query("delete from analytics_events where invitation_id = $1")
            .bind(self.invitation)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from guests where invitation_id = $1")
            .bind(self.invitation)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from invitations where id = $1").bind(self.invitation).execute(&self.pool).await.unwrap();
        sqlx::query("delete from users where id = $1").bind(self.user).execute(&self.pool).await.unwrap();
        sqlx::query_scalar("select count(*) from users where id = $1")
            .bind(self.user)
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }
}

async fn concurrent_opens(pool: &PgPool, invitation: i32, guest: Option<i32>, at: PrimitiveDateTime) -> usize {
    let tasks: Vec<_> = (0..CONCURRENCY)
        .map(|_| {
            let pool = pool.clone();
            tokio::spawn(async move { record_invitation_view(&pool, invitation, guest, at).await.expect("open") })
        })
        .collect();
    let mut written = 0;
    for task in tasks {
        written += usize::from(task.await.expect("join"));
    }
    written
}

async fn call(app: Router, method: Method, path: &str, body: &str, bearer: Option<&str>) -> (StatusCode, Value) {
    let mut request = Request::builder()
        .method(method.clone())
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(SIGNATURE_HEADER, sign(SECRET, unix_now(), method.as_str(), path, body.as_bytes()));
    if let Some(token) = bearer {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = app.oneshot(request.body(Body::from(body.to_string())).unwrap()).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_view_writer_holds_the_b017a_contract() {
    let f = Fixture::create().await;
    let (a, b, c, d) = (f.guests[0], f.guests[1], f.guests[2], f.guests[3]);
    let t0 = utc_now();

    let concurrent = concurrent_opens(&f.pool, f.invitation, Some(a), t0).await;
    let (concurrent_rows, concurrent_opened) = (f.views(Some(a)).await, f.opened(a).await);
    let repeat = record_invitation_view(&f.pool, f.invitation, Some(a), t0 + Duration::minutes(5)).await.unwrap();
    let after = record_invitation_view(&f.pool, f.invitation, Some(a), t0 + Duration::minutes(31)).await.unwrap();
    let (after_rows, after_opened) = (f.views(Some(a)).await, f.opened(a).await);
    let anonymous = concurrent_opens(&f.pool, f.invitation, None, t0).await;
    let anonymous_rows = f.views(None).await;
    let other_guest = record_invitation_view(&f.pool, f.invitation, Some(b), t0 + Duration::minutes(5)).await.unwrap();

    // The shared vectors (contracts/vectors/view-dedupe.json), also run by scripts/verify-view-dedupe.ts.
    let vectors: Value = serde_json::from_str(include_str!("../../../contracts/vectors/view-dedupe.json")).unwrap();
    assert_eq!(vectors["windowMinutes"].as_i64(), Some(VIEW_DEDUPE_WINDOW.whole_minutes()));
    let mut vector_results = Vec::new();
    for open in vectors["opens"].as_array().unwrap() {
        let minute = open["atMinute"].as_i64().unwrap();
        let written =
            record_invitation_view(&f.pool, f.invitation, Some(c), t0 + Duration::minutes(minute)).await.unwrap();
        vector_results.push((minute, open["recorded"].as_bool().unwrap(), written));
    }
    let vector_opened = f.opened(c).await;

    let app = router(AppState {
        pool: f.pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner: None,
        limits: Limits::default(),
    });
    let first = call(
        app.clone(),
        Method::POST,
        "/v1/views",
        &json!({ "invitationId": f.invitation, "guestId": d }).to_string(),
        None,
    )
    .await;
    let repeat_http = call(
        app.clone(),
        Method::POST,
        "/v1/views",
        &json!({ "invitationId": f.invitation, "guestId": d }).to_string(),
        None,
    )
    .await;
    let missing = call(
        app.clone(),
        Method::POST,
        "/v1/views",
        &json!({ "invitationId": f.invitation, "guestId": i32::MAX }).to_string(),
        None,
    )
    .await;
    let ready = call(app, Method::GET, "/v1/health/ready", "", None).await;

    let leftover = f.remove().await;

    assert_eq!(concurrent, 1, "{CONCURRENCY} concurrent first opens write once");
    assert_eq!((concurrent_rows, concurrent_opened), (1, 1));
    assert!(!repeat, "a repeat inside the window writes nothing");
    assert!(after, "an open after the window writes again");
    assert_eq!((after_rows, after_opened), (2, 2));
    assert_eq!((anonymous, anonymous_rows), (1, 1), "concurrent anonymous opens write once");
    assert!(other_guest, "another guest is independent");
    for (minute, expected, written) in &vector_results {
        assert_eq!(written, expected, "vector at minute {minute}");
    }
    assert_eq!(i64::from(vector_opened), vectors["finalOpenedCount"].as_i64().unwrap());
    assert_eq!(first, (StatusCode::OK, json!({ "recorded": true })));
    assert_eq!(repeat_http, (StatusCode::OK, json!({ "recorded": false })));
    assert_eq!(missing.0, StatusCode::NOT_FOUND);
    assert_eq!(missing.1["code"], "invitation_or_guest.not_found");
    assert_eq!(ready.0, StatusCode::OK);
    assert_eq!(leftover, 0, "fixture removed");
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn me_maps_a_verified_token_to_a_live_user_and_its_database_role() {
    install_crypto_provider();
    let f = Fixture::create().await;
    let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
    let encoding = EncodingKey::from_rsa_der(private.to_pkcs1_der().unwrap().as_bytes());
    let jwks = json!({ "keys": [{ "kid": "db-key", "kty": "RSA", "alg": "RS256",
        "n": URL_SAFE_NO_PAD.encode(private.n().to_bytes_be()), "e": URL_SAFE_NO_PAD.encode(private.e().to_bytes_be()) }] })
    .to_string();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/jwks", listener.local_addr().unwrap());
    tokio::spawn(async move {
        axum::serve(listener, Router::new().route("/jwks", get(move || async move { jwks }))).await.unwrap()
    });
    let verifier = OwnerVerifier::new(OwnerTokenConfig {
        issuer: "https://issuer.invalid".into(),
        jwks_url: url,
        authorized_parties: vec![],
    })
    .unwrap()
    .with_refresh_interval(StdDuration::from_millis(1));
    let app = router(AppState {
        pool: f.pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner: Some(Arc::new(verifier)),
        limits: Limits::default(),
    });
    let token = |sub: &str| {
        let mut h = Header::new(Algorithm::RS256);
        h.kid = Some("db-key".into());
        let now = unix_now();
        encode(&h, &json!({ "sub": sub, "iss": "https://issuer.invalid", "exp": now + 60, "nbf": now - 1 }), &encoding)
            .unwrap()
    };

    let customer = call(app.clone(), Method::GET, "/v1/me", "", Some(&token(&f.clerk_user_id))).await;
    sqlx::query("update users set role = 'ADMIN' where id = $1").bind(f.user).execute(&f.pool).await.unwrap();
    let admin = call(app.clone(), Method::GET, "/v1/me", "", Some(&token(&f.clerk_user_id))).await;
    let stranger = call(app.clone(), Method::GET, "/v1/me", "", Some(&token("user_nobody"))).await;
    sqlx::query("update users set deleted_at = now() where id = $1").bind(f.user).execute(&f.pool).await.unwrap();
    let deleted = call(app.clone(), Method::GET, "/v1/me", "", Some(&token(&f.clerk_user_id))).await;
    let missing = call(app, Method::GET, "/v1/me", "", None).await;
    let leftover = f.remove().await;

    assert_eq!(customer, (StatusCode::OK, json!({ "userId": f.user, "role": "CUSTOMER" })));
    assert_eq!(
        admin,
        (StatusCode::OK, json!({ "userId": f.user, "role": "ADMIN" })),
        "the role is read from the database"
    );
    assert_eq!((stranger.0, stranger.1["code"].clone()), (StatusCode::FORBIDDEN, json!("owner.unknown_user")));
    assert_eq!(
        (deleted.0, deleted.1["code"].clone()),
        (StatusCode::FORBIDDEN, json!("owner.unknown_user")),
        "a deleted user"
    );
    assert_eq!((missing.0, missing.1["code"].clone()), (StatusCode::UNAUTHORIZED, json!("owner.token_missing")));
    assert_eq!(leftover, 0);
}
