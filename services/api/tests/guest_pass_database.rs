//! B-024 (D-056) against a database migrated by drizzle-kit (`TEST_DATABASE_URL`): guest-pass check-ins through the
//! router, signed as Next.js signs it, with owner tokens verified against a JWKS served by a local endpoint (keys made per
//! run, no Clerk credential). A first scan checks the guest in with one CHECKIN event and a replay answers `already`
//! with nothing written; concurrent scans of one pass check in once; forged, expired, unknown and malformed passes write
//! nothing and name no one; the opt-in, the owner and the secret are required; a resent batch replays its first answer;
//! a scan time within the day is kept. Fixture rows are fictional, tagged per run and removed before the assertions. The
//! same flows run through both writers against the binary in `scripts/verify-guest-pass-api.ts`.

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
use invitesion_api::limits::{Limit, Limits};
use invitesion_api::owner_auth::{OwnerTokenConfig, OwnerVerifier};
use invitesion_api::roster::pass;
use invitesion_api::service_auth::{SIGNATURE_HEADER, sign, unix_now};
use invitesion_api::{AppState, router};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use rsa::RsaPrivateKey;
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::traits::PublicKeyParts;
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

const SECRET: &[u8] = b"guest-pass-database-test-secret-0123456";
const PASS_SECRET: &[u8] = b"guest-pass-database-pass-secret-0123456789";
const ISSUER: &str = "https://issuer.invalid";
const LIMITS: Limits = Limits {
    rsvp_per_link: Limit { max: 1000, window_seconds: 600 },
    rsvp_per_ip: Limit { max: 1000, window_seconds: 600 },
    wish_per_link: Limit { max: 1000, window_seconds: 600 },
    wish_per_ip: Limit { max: 1000, window_seconds: 600 },
    registration_per_link: Limit { max: 1000, window_seconds: 600 },
    registration_per_ip: Limit { max: 1000, window_seconds: 600 },
};

struct Keys {
    encoding: EncodingKey,
    verifier: Arc<OwnerVerifier>,
}

async fn owner_keys() -> Keys {
    install_crypto_provider();
    let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
    let encoding = EncodingKey::from_rsa_der(private.to_pkcs1_der().unwrap().as_bytes());
    let jwks = json!({ "keys": [{ "kid": "pass-key", "kty": "RSA", "alg": "RS256",
        "n": URL_SAFE_NO_PAD.encode(private.n().to_bytes_be()), "e": URL_SAFE_NO_PAD.encode(private.e().to_bytes_be()) }] })
    .to_string();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/jwks", listener.local_addr().unwrap());
    tokio::spawn(async move {
        axum::serve(listener, Router::new().route("/jwks", get(move || async move { jwks }))).await.unwrap()
    });
    let verifier =
        OwnerVerifier::new(OwnerTokenConfig { issuer: ISSUER.into(), jwks_url: url, authorized_parties: vec![] })
            .unwrap()
            .with_refresh_interval(StdDuration::from_millis(1));
    Keys { encoding, verifier: Arc::new(verifier) }
}

fn token(keys: &Keys, sub: &str) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some("pass-key".into());
    let now = unix_now();
    encode(&header, &json!({ "sub": sub, "iss": ISSUER, "exp": now + 300, "nbf": now - 1 }), &keys.encoding).unwrap()
}

fn app(pool: &PgPool, keys: &Keys, pass_secrets: Vec<Vec<u8>>) -> Router {
    router(AppState {
        pool: pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(pass_secrets),
        owner: Some(keys.verifier.clone()),
        limits: LIMITS,
    })
}

fn path(invitation: i32) -> String {
    format!("/v1/invitations/{invitation}/guest-pass-checkins")
}

async fn post(
    app: &Router,
    invitation: i32,
    body: &Value,
    bearer: &str,
    key: Option<&str>,
) -> (StatusCode, Value, bool) {
    let path = path(invitation);
    let body = body.to_string();
    let mut request = Request::builder()
        .method(Method::POST)
        .uri(&path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {bearer}"))
        .header(SIGNATURE_HEADER, sign(SECRET, unix_now(), "POST", &path, body.as_bytes()));
    if let Some(key) = key {
        request = request.header("idempotency-key", key);
    }
    let response = app.clone().oneshot(request.body(Body::from(body)).unwrap()).await.unwrap();
    let status = response.status();
    let replayed = response.headers().get("idempotent-replayed").is_some();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null), replayed)
}

fn scans(tokens: &[&str]) -> Value {
    json!({ "scans": tokens.iter().map(|token| json!({ "token": token })).collect::<Vec<_>>() })
}

fn far_future() -> u32 {
    u32::try_from(unix_now() + 86_400 * 30).unwrap()
}

fn opted_in() -> Value {
    json!({ "checkInSettings": { "enabled": true, "allowManual": true, "requireQr": false } })
}

struct Fixture {
    pool: PgPool,
    tag: String,
    users: Vec<i32>,
}

impl Fixture {
    async fn new() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(16).connect(&url).await.expect("connect");
        Self { pool, tag: uuid::Uuid::new_v4().simple().to_string()[..12].to_string(), users: vec![] }
    }

    async fn user(&mut self, label: &str, role: &str) -> (i32, String) {
        let sub = format!("user_pass_{label}_{}", self.tag);
        let id: i32 =
            sqlx::query_scalar("insert into users (email, clerk_user_id, role) values ($1, $2, $3) returning id")
                .bind(format!("pass-{label}-{}@example.invalid", self.tag))
                .bind(&sub)
                .bind(role)
                .fetch_one(&self.pool)
                .await
                .expect("fixture user");
        self.users.push(id);
        (id, sub)
    }

    async fn invitation(&self, owner: i32, label: &str, config: Value) -> i32 {
        sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type, config) values ($1, $2, 'wedding', $3) returning id",
        )
        .bind(owner)
        .bind(format!("pass-{label}-{}", self.tag))
        .bind(config)
        .fetch_one(&self.pool)
        .await
        .expect("fixture invitation")
    }

    /// A guest and the pass id the database gave it.
    async fn guest(&self, invitation: i32, name: &str) -> (i32, String) {
        sqlx::query_as("insert into guests (invitation_id, name, slug) values ($1, $2, $3) returning id, pass_id")
            .bind(invitation)
            .bind(name)
            .bind(format!("guest-{}", uuid::Uuid::new_v4().simple()))
            .fetch_one(&self.pool)
            .await
            .expect("fixture guest")
    }

    async fn checked_in(&self, guest: i32) -> Option<String> {
        let at: Option<time::PrimitiveDateTime> = sqlx::query_scalar("select checked_in_at from guests where id = $1")
            .bind(guest)
            .fetch_one(&self.pool)
            .await
            .expect("guest");
        at.map(pass::iso_millis)
    }

    async fn events(&self, invitation: i32) -> Vec<(Option<i32>, Option<Value>)> {
        sqlx::query_as(
            "select guest_id, meta from analytics_events where invitation_id = $1 and event_type = 'CHECKIN' order by id",
        )
        .bind(invitation)
        .fetch_all(&self.pool)
        .await
        .expect("events")
    }

    async fn remove(&self) {
        for statement in [
            "delete from analytics_events where invitation_id in (select id from invitations where user_id = any($1))",
            "delete from guests where invitation_id in (select id from invitations where user_id = any($1))",
            "delete from invitations where user_id = any($1)",
            "delete from users where id = any($1)",
        ] {
            sqlx::query(statement).bind(&self.users).execute(&self.pool).await.unwrap();
        }
    }
}

#[tokio::test]
async fn a_first_scan_checks_in_once_and_a_replay_answers_already() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let invitation = f.invitation(owner, "first", opted_in()).await;
    let (guest, pass_id) = f.guest(invitation, "Budi Hartono & keluarga").await;
    let app = app(&f.pool, &keys, vec![PASS_SECRET.to_vec()]);
    let pass = pass::sign(PASS_SECRET, &pass_id, far_future()).unwrap();
    let bearer = token(&keys, &sub);

    let (first_status, first, _) = post(&app, invitation, &scans(&[&pass]), &bearer, None).await;
    let stored = f.checked_in(guest).await;
    let (again_status, again, _) = post(&app, invitation, &scans(&[&pass]), &bearer, None).await;
    let events = f.events(invitation).await;
    f.remove().await;

    assert_eq!(first_status, StatusCode::OK, "{first}");
    assert_eq!(first["results"][0]["outcome"], "checked-in");
    assert_eq!(first["results"][0]["name"], "Budi Hartono & keluarga");
    assert_eq!(first["results"][0]["checkedInAt"].as_str(), stored.as_deref());
    assert_eq!(again_status, StatusCode::OK, "{again}");
    assert_eq!(again["results"][0]["outcome"], "already", "a replayed pass never counts twice");
    assert_eq!(again["results"][0]["checkedInAt"], first["results"][0]["checkedInAt"]);
    assert_eq!(events, vec![(Some(guest), Some(json!({ "source": "pass" })))], "one CHECKIN event");
}

#[tokio::test]
async fn forged_expired_unknown_and_malformed_passes_write_nothing() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let invitation = f.invitation(owner, "refusals", opted_in()).await;
    let (guest, pass_id) = f.guest(invitation, "Sari Lestari").await;
    let app = app(&f.pool, &keys, vec![PASS_SECRET.to_vec()]);
    let forged = pass::sign(b"a-forger-without-the-pass-secret-0123456", &pass_id, far_future()).unwrap();
    let expired = pass::sign(PASS_SECRET, &pass_id, u32::try_from(unix_now() - 60).unwrap()).unwrap();
    let unknown = pass::sign(PASS_SECRET, "00000000000000000000000000000000", far_future()).unwrap();

    let (status, body, _) = post(
        &app,
        invitation,
        &scans(&[&forged, &expired, &unknown, "https://example.invalid/not-a-pass", ""]),
        &token(&keys, &sub),
        None,
    )
    .await;
    let stored = f.checked_in(guest).await;
    let events = f.events(invitation).await;
    f.remove().await;

    assert_eq!(status, StatusCode::OK, "{body}");
    let outcomes: Vec<&str> =
        body["results"].as_array().unwrap().iter().map(|result| result["outcome"].as_str().unwrap()).collect();
    assert_eq!(outcomes, ["invalid", "expired", "unknown", "invalid", "invalid"]);
    assert!(body["results"].as_array().unwrap().iter().all(|result| result.get("name").is_none()), "{body}");
    assert_eq!(stored, None);
    assert!(events.is_empty());
}

#[tokio::test]
async fn concurrent_scans_of_one_pass_check_in_once() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let invitation = f.invitation(owner, "race", opted_in()).await;
    let (_guest, pass_id) = f.guest(invitation, "Rina").await;
    let app = app(&f.pool, &keys, vec![PASS_SECRET.to_vec()]);
    let pass = pass::sign(PASS_SECRET, &pass_id, far_future()).unwrap();
    let bearer = token(&keys, &sub);

    let ushers = (0..8).map(|_| {
        let (app, pass, bearer) = (app.clone(), pass.clone(), bearer.clone());
        tokio::spawn(async move { post(&app, invitation, &scans(&[&pass]), &bearer, None).await })
    });
    let mut outcomes = Vec::new();
    for usher in ushers {
        let (status, body, _) = usher.await.unwrap();
        assert_eq!(status, StatusCode::OK, "{body}");
        outcomes.push(body["results"][0]["outcome"].as_str().unwrap().to_string());
    }
    let events = f.events(invitation).await;
    f.remove().await;

    outcomes.sort();
    assert_eq!(outcomes.iter().filter(|o| *o == "checked-in").count(), 1, "{outcomes:?}");
    assert_eq!(outcomes.iter().filter(|o| *o == "already").count(), 7, "{outcomes:?}");
    assert_eq!(events.len(), 1);
}

#[tokio::test]
async fn the_opt_in_the_owner_and_the_secret_are_required() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let (_other, other_sub) = f.user("other", "CUSTOMER").await;
    let (_admin, admin_sub) = f.user("admin", "ADMIN").await;
    let closed = f.invitation(owner, "closed", json!({ "checkInSettings": { "enabled": false } })).await;
    let open = f.invitation(owner, "open", opted_in()).await;
    let elsewhere = f.invitation(owner, "elsewhere", opted_in()).await;
    let (closed_guest, closed_pass) = f.guest(closed, "Tamu Satu").await;
    let (_, elsewhere_pass) = f.guest(elsewhere, "Tamu Dua").await;
    let with_secret = app(&f.pool, &keys, vec![PASS_SECRET.to_vec()]);
    let without_secret = app(&f.pool, &keys, Vec::new());
    let closed_token = pass::sign(PASS_SECRET, &closed_pass, far_future()).unwrap();
    let elsewhere_token = pass::sign(PASS_SECRET, &elsewhere_pass, far_future()).unwrap();

    let not_enabled = post(&with_secret, closed, &scans(&[&closed_token]), &token(&keys, &sub), None).await;
    let not_owner = post(&with_secret, open, &scans(&[&closed_token]), &token(&keys, &other_sub), None).await;
    let admin = post(&with_secret, open, &scans(&[&closed_token]), &token(&keys, &admin_sub), None).await;
    let unconfigured = post(&without_secret, open, &scans(&[&closed_token]), &token(&keys, &sub), None).await;
    let other_invitation = post(&with_secret, open, &scans(&[&elsewhere_token]), &token(&keys, &sub), None).await;
    let empty = post(&with_secret, open, &json!({ "scans": [] }), &token(&keys, &sub), None).await;
    let too_many = post(&with_secret, open, &scans(&[closed_token.as_str(); 51]), &token(&keys, &sub), None).await;
    let stored = f.checked_in(closed_guest).await;
    f.remove().await;

    assert_eq!((not_enabled.0, not_enabled.1["code"].as_str()), (StatusCode::CONFLICT, Some("guest_pass.not_enabled")));
    assert_eq!((not_owner.0, not_owner.1["code"].as_str()), (StatusCode::NOT_FOUND, Some("roster.not_found")));
    assert_eq!(admin.0, StatusCode::FORBIDDEN);
    assert_eq!(
        (unconfigured.0, unconfigured.1["code"].as_str()),
        (StatusCode::SERVICE_UNAVAILABLE, Some("guest_pass.not_configured"))
    );
    assert_eq!(other_invitation.0, StatusCode::OK);
    assert_eq!(other_invitation.1["results"][0]["outcome"], "unknown", "a pass works only at its own invitation");
    assert_eq!(empty.0, StatusCode::BAD_REQUEST);
    assert_eq!(too_many.0, StatusCode::BAD_REQUEST);
    assert_eq!(stored, None, "nothing written by any refusal");
}

#[tokio::test]
async fn a_resent_batch_replays_its_first_answer_and_keeps_a_scan_time_within_the_day() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let invitation = f.invitation(owner, "resend", opted_in()).await;
    let (guest, pass_id) = f.guest(invitation, "Dewi").await;
    let app = app(&f.pool, &keys, vec![b"rotated-in-guest-pass-secret-0123456789".to_vec(), PASS_SECRET.to_vec()]);
    let pass = pass::sign(PASS_SECRET, &pass_id, far_future()).unwrap();
    let scanned = time::OffsetDateTime::from_unix_timestamp(unix_now() - 1_800).unwrap();
    let scanned_at = pass::iso_millis(time::PrimitiveDateTime::new(scanned.date(), scanned.time()));
    let body = json!({ "scans": [{ "token": pass, "scannedAt": scanned_at }] });
    let key = uuid::Uuid::new_v4().to_string();
    let bearer = token(&keys, &sub);

    let (first_status, first, first_replayed) = post(&app, invitation, &body, &bearer, Some(&key)).await;
    let (again_status, again, again_replayed) = post(&app, invitation, &body, &bearer, Some(&key)).await;
    let stored = f.checked_in(guest).await;
    let events = f.events(invitation).await;
    f.remove().await;

    assert_eq!(first_status, StatusCode::OK, "{first}");
    assert!(!first_replayed);
    assert_eq!(first["results"][0]["outcome"], "checked-in", "the previous secret verifies during a rotation");
    assert_eq!(first["results"][0]["checkedInAt"], scanned_at.as_str(), "the scanner's time within the day");
    assert_eq!(stored.as_deref(), Some(scanned_at.as_str()));
    assert_eq!(again_status, StatusCode::OK);
    assert!(again_replayed, "the stored answer, not a new decision");
    assert_eq!(again, first, "a resent batch answers `checked-in` again, never `already`");
    assert_eq!(events.len(), 1);
}
