//! R-03 on a real database migrated by drizzle-kit (`TEST_DATABASE_URL`, through 0016): both RSVP endpoints through the
//! router, the stored shapes they write, limits, idempotency and the row lock. Fixture rows are fictional, tagged per
//! run and removed before the assertions.

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
use invitesion_api::limits::{Limit, Limits, ip_bucket};
use invitesion_api::owner_auth::{OwnerTokenConfig, OwnerVerifier};
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

const SECRET: &[u8] = b"rsvp-database-test-secret-0123456789abcd";
const FLAGS: &str = r#"{ "maybe": true, "perEvent": true, "inviteOnlyEvents": true, "questions": true }"#;

/// Tests in this binary run in parallel and share the limiter table, so each uses its own addresses and removes only
/// its own buckets and idempotency scopes.
struct Fixture {
    pool: PgPool,
    tag: String,
    users: Vec<i32>,
    invitations: Vec<i32>,
    guests: Vec<i32>,
    addresses: Vec<&'static str>,
}

impl Fixture {
    async fn new(addresses: &[&'static str]) -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(16).connect(&url).await.expect("connect");
        let tag = uuid::Uuid::new_v4().simple().to_string();
        Self {
            pool,
            tag,
            users: Vec::new(),
            invitations: Vec::new(),
            guests: Vec::new(),
            addresses: addresses.to_vec(),
        }
    }

    async fn user(&mut self, name: &str, role: &str) -> (i32, String) {
        let clerk = format!("user_rsvp_{name}_{}", self.tag);
        let id: i32 =
            sqlx::query_scalar("insert into users (email, clerk_user_id, role) values ($1, $2, $3) returning id")
                .bind(format!("rsvp-{name}-{}@example.invalid", self.tag))
                .bind(&clerk)
                .bind(role)
                .fetch_one(&self.pool)
                .await
                .expect("fixture user");
        self.users.push(id);
        (id, clerk)
    }

    async fn invitation(&mut self, user: i32, name: &str, status: &str, config: Value) -> (i32, String) {
        let slug = format!("rsvp-{name}-{}", self.tag);
        let id: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type, status, config) values ($1, $2, 'wedding', $3, $4) returning id",
        )
        .bind(user)
        .bind(&slug)
        .bind(status)
        .bind(config)
        .fetch_one(&self.pool)
        .await
        .expect("fixture invitation");
        self.invitations.push(id);
        (id, slug)
    }

    async fn guest(&mut self, invitation: i32, slug: &str, token: Option<&str>) -> i32 {
        let id = sqlx::query_scalar(
            "insert into guests (invitation_id, name, slug, link_token, guest_count) values ($1, $2, $3, $4, 4) returning id",
        )
        .bind(invitation)
        .bind(format!("{slug} (rsvp test)"))
        .bind(slug)
        .bind(token)
        .fetch_one(&self.pool)
        .await
        .expect("fixture guest");
        self.guests.push(id);
        id
    }

    async fn row(&self, guest: i32) -> Value {
        sqlx::query_scalar(
            "select json_build_object('status', rsvp_status, 'attending', attending_count, 'answers', rsvp_answers, \
             'answersNull', rsvp_answers is null, 'events', rsvp_event_answers, 'eventsNull', rsvp_event_answers is null, \
             'allowance', guest_count) from guests where id = $1",
        )
        .bind(guest)
        .fetch_one(&self.pool)
        .await
        .expect("guest row")
    }

    async fn rsvp_events(&self, guest: i32) -> Vec<Value> {
        sqlx::query_scalar("select meta from analytics_events where guest_id = $1 and event_type = 'RSVP' order by id")
            .bind(guest)
            .fetch_all(&self.pool)
            .await
            .expect("rsvp events")
    }

    async fn remove(&self) -> i64 {
        sqlx::query("delete from analytics_events where invitation_id = any($1)")
            .bind(&self.invitations)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from guests where invitation_id = any($1)")
            .bind(&self.invitations)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from invitations where id = any($1)")
            .bind(&self.invitations)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = any($1)").bind(&self.users).execute(&self.pool).await.unwrap();
        let buckets: Vec<String> = self
            .guests
            .iter()
            .map(|id| format!("rsvp:link:{id}"))
            .chain(self.addresses.iter().map(|address| ip_bucket(SECRET, "rsvp", address)))
            .collect();
        // Host scopes are `rsvp:host:<owner>:<invitation>:<guest>` (`idempotency::host_scope`).
        let scopes: Vec<String> = self
            .guests
            .iter()
            .map(|id| format!("rsvp:guest:{id}"))
            .chain(self.users.iter().flat_map(|owner| {
                self.invitations.iter().flat_map(move |invitation| {
                    self.guests.iter().map(move |guest| format!("rsvp:host:{owner}:{invitation}:{guest}"))
                })
            }))
            .collect();
        sqlx::query("delete from api_rate_limits where bucket = any($1)")
            .bind(&buckets)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from api_idempotency_keys where scope = any($1)")
            .bind(&scopes)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query_scalar("select count(*) from invitations where id = any($1)")
            .bind(&self.invitations)
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }
}

struct Reply {
    status: StatusCode,
    body: Value,
    retry_after: Option<String>,
    replayed: bool,
}

async fn post(app: &Router, path: &str, body: &str, key: Option<&str>, bearer: Option<&str>) -> Reply {
    let mut request = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(SIGNATURE_HEADER, sign(SECRET, unix_now(), "POST", path, body.as_bytes()));
    if let Some(key) = key {
        request = request.header("idempotency-key", key);
    }
    if let Some(token) = bearer {
        request = request.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = app.clone().oneshot(request.body(Body::from(body.to_string())).unwrap()).await.unwrap();
    let status = response.status();
    let retry_after = response.headers().get(header::RETRY_AFTER).map(|v| v.to_str().unwrap().to_string());
    let replayed = response.headers().get("idempotent-replayed").is_some();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    Reply { status, body: serde_json::from_slice(&bytes).unwrap_or(Value::Null), retry_after, replayed }
}

fn guest_body_from(submission: Value, address: &str) -> String {
    json!({ "submission": submission, "flags": serde_json::from_str::<Value>(FLAGS).unwrap(), "clientIp": address })
        .to_string()
}

const SHAPES_ADDRESS: &str = "198.51.100.1";

fn guest_body(submission: Value) -> String {
    guest_body_from(submission, SHAPES_ADDRESS)
}

fn rsvp_path(slug: &str, guest: &str) -> String {
    format!("/v1/guest-links/{slug}/{guest}/rsvp")
}

fn state(pool: &PgPool, limits: Limits, owner: Option<Arc<OwnerVerifier>>) -> AppState {
    AppState {
        pool: pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner,
        limits,
    }
}

const ROOMY: Limits = Limits {
    rsvp_per_link: Limit { max: 1000, window_seconds: 600 },
    rsvp_per_ip: Limit { max: 1000, window_seconds: 600 },
    wish_per_link: Limit { max: 1000, window_seconds: 600 },
    wish_per_ip: Limit { max: 1000, window_seconds: 600 },
    registration_per_link: Limit { max: 1000, window_seconds: 600 },
    registration_per_ip: Limit { max: 1000, window_seconds: 600 },
};

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn guest_rsvp_writes_the_shapes_the_typescript_writer_writes() {
    let mut f = Fixture::new(&[SHAPES_ADDRESS]).await;
    let (owner, _) = f.user("owner", "CUSTOMER").await;
    let plain = json!({ "rsvp": { "enabled": true } });
    let per_event = json!({ "rsvp": { "perEvent": true }, "events": [{ "id": "akad", "title": "Akad" }, { "id": "resepsi", "title": "Resepsi" }],
        "registrationForm": { "enabled": true, "customQuestions": [{ "id": "menu", "label": "Menu", "type": "radio", "options": ["Biasa", "Vegetarian"], "required": true }] } });
    let (inv, slug) = f.invitation(owner, "open", "PUBLISHED", plain).await;
    let (ev_inv, ev_slug) = f.invitation(owner, "events", "PUBLISHED", per_event).await;
    let (_, closed_slug) = f.invitation(owner, "closed", "PUBLISHED", json!({ "rsvp": { "enabled": false } })).await;
    let (_, draft_slug) = f.invitation(owner, "draft", "DRAFT", json!({})).await;
    let (_, expired_slug) = f.invitation(owner, "expired", "EXPIRED", json!({})).await;
    let legacy = f.guest(inv, &format!("budi-{}", f.tag), None).await;
    let token = format!("{:0>22}", &f.tag[f.tag.len().saturating_sub(22)..]);
    let _tokened = f.guest(inv, &format!("sari-{}", f.tag), Some(&token)).await;
    let ev_guest = f.guest(ev_inv, &format!("rina-{}", f.tag), None).await;
    let closed_inv = *f.invitations.get(2).unwrap();
    let closed_guest = f.guest(closed_inv, &format!("dodi-{}", f.tag), None).await;
    sqlx::query("update guests set rsvp_event_answers = $1 where id = $2")
        .bind(json!({ "old": { "status": "CONFIRMED", "attending": 2 } }))
        .bind(ev_guest)
        .execute(&f.pool)
        .await
        .unwrap();
    let app = router(state(&f.pool, ROOMY, None));

    let legacy_path = rsvp_path(&slug, &format!("budi-{}", f.tag));
    let saved =
        post(&app, &legacy_path, &guest_body(json!({ "status": "CONFIRMED", "guestCount": "9" })), None, None).await;
    let saved_row = f.row(legacy).await;
    let by_token = post(&app, &rsvp_path(&slug, &token), &guest_body(json!({ "status": "MAYBE" })), None, None).await;
    let by_token_slug = post(
        &app,
        &rsvp_path(&slug, &format!("sari-{}", f.tag)),
        &guest_body(json!({ "status": "DECLINED" })),
        None,
        None,
    )
    .await;
    let unknown =
        post(&app, &rsvp_path(&slug, "nobody"), &guest_body(json!({ "status": "CONFIRMED" })), None, None).await;
    let draft =
        post(&app, &rsvp_path(&draft_slug, "x"), &guest_body(json!({ "status": "CONFIRMED" })), None, None).await;
    let expired =
        post(&app, &rsvp_path(&expired_slug, "x"), &guest_body(json!({ "status": "CONFIRMED" })), None, None).await;
    let closed = post(
        &app,
        &rsvp_path(&closed_slug, &format!("dodi-{}", f.tag)),
        &guest_body(json!({ "status": "CONFIRMED" })),
        None,
        None,
    )
    .await;
    let invalid = post(&app, &legacy_path, &guest_body(json!({ "status": "confirmed" })), None, None).await;
    let ev_path = rsvp_path(&ev_slug, &format!("rina-{}", f.tag));
    let missing_event = post(
        &app,
        &ev_path,
        &guest_body(json!({ "events": { "akad": { "status": "CONFIRMED", "guestCount": "2" } } })),
        None,
        None,
    )
    .await;
    let bad_answer = post(
        &app,
        &ev_path,
        &guest_body(json!({ "events": { "akad": { "status": "CONFIRMED", "guestCount": "2" }, "resepsi": { "status": "DECLINED" } }, "answers": { "menu": ["Lainnya"] } })),
        None,
        None,
    )
    .await;
    let per_event_saved = post(
        &app,
        &ev_path,
        &guest_body(json!({ "events": { "akad": { "status": "CONFIRMED", "guestCount": "2" }, "resepsi": { "status": "DECLINED" } }, "answers": { "menu": [" Vegetarian "] } })),
        None,
        None,
    )
    .await;
    let per_event_row = f.row(ev_guest).await;
    let declined = post(
        &app,
        &ev_path,
        &guest_body(json!({ "events": { "akad": { "status": "DECLINED" }, "resepsi": { "status": "DECLINED" } } })),
        None,
        None,
    )
    .await;
    let declined_row = f.row(ev_guest).await;
    let legacy_events = f.rsvp_events(legacy).await;
    let closed_row = f.row(closed_guest).await;
    let closed_events = f.rsvp_events(closed_guest).await;
    let leftover = f.remove().await;

    assert_eq!(
        (saved.status, saved.body.clone()),
        (StatusCode::OK, json!({ "status": "CONFIRMED", "attendingCount": 4 }))
    );
    assert_eq!(saved_row["status"], "CONFIRMED");
    assert_eq!(saved_row["attending"], 4, "clamped to the allowance (B-007)");
    assert_eq!(saved_row["allowance"], 4, "the allowance is never written");
    assert_eq!(saved_row["eventsNull"], true, "per-event on without events clears to SQL NULL, not a jsonb null");
    assert_eq!(saved_row["answersNull"], true, "no questions: the column is left alone");
    assert_eq!(
        legacy_events,
        vec![json!({ "status": "CONFIRMED", "guestCount": 4, "source": "public" })],
        "one RSVP event per accepted write"
    );
    assert_eq!((by_token.status, by_token.body["attendingCount"].clone()), (StatusCode::OK, Value::Null));
    assert_eq!(
        (by_token_slug.status, by_token_slug.body["code"].clone()),
        (StatusCode::NOT_FOUND, json!("rsvp.link_not_found")),
        "a guest with a token is never reachable by slug (B-011)"
    );
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);
    assert_eq!((draft.status, draft.body["code"].clone()), (StatusCode::NOT_FOUND, json!("rsvp.link_not_found")));
    assert_eq!((expired.status, expired.body["detail"].clone()), (StatusCode::CONFLICT, json!("expired")));
    assert_eq!(
        (closed.status, closed.body["code"].clone(), closed.body["detail"].clone()),
        (StatusCode::CONFLICT, json!("rsvp.closed"), json!("disabled"))
    );
    assert_eq!((closed_row["status"].clone(), closed_events.len()), (json!("PENDING"), 0), "a refusal writes nothing");
    assert_eq!(
        (invalid.status, invalid.body["code"].clone()),
        (StatusCode::UNPROCESSABLE_ENTITY, json!("rsvp.status_invalid"))
    );
    assert_eq!(
        (missing_event.status, missing_event.body["eventId"].clone()),
        (StatusCode::UNPROCESSABLE_ENTITY, json!("resepsi"))
    );
    assert_eq!(
        (bad_answer.status, bad_answer.body["questionId"].clone()),
        (StatusCode::UNPROCESSABLE_ENTITY, json!("menu"))
    );
    assert_eq!(
        (per_event_saved.status, per_event_saved.body.clone()),
        (StatusCode::OK, json!({ "status": "CONFIRMED", "attendingCount": 2 }))
    );
    assert_eq!(
        per_event_row["events"],
        json!({ "old": { "status": "CONFIRMED", "attending": 2 }, "akad": { "status": "CONFIRMED", "attending": 2 }, "resepsi": { "status": "DECLINED", "attending": 0 } }),
        "answers to deleted events stay"
    );
    assert_eq!(per_event_row["answers"], json!({ "menu": "Vegetarian" }));
    assert_eq!(
        (declined.status, declined_row["status"].clone(), declined_row["attending"].clone()),
        (StatusCode::OK, json!("DECLINED"), json!(0))
    );
    assert_eq!(declined_row["answersNull"], true, "a decline clears answers to SQL NULL");
    assert_eq!(leftover, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn idempotency_keys_replay_and_limits_refuse_without_writing() {
    const REPLAY_ADDRESS: &str = "198.51.100.2";
    const LIMIT_ADDRESS: &str = "198.51.100.3";
    let mut f = Fixture::new(&[REPLAY_ADDRESS, LIMIT_ADDRESS]).await;
    let (owner, _) = f.user("owner", "CUSTOMER").await;
    let (inv, slug) = f.invitation(owner, "limits", "PUBLISHED", json!({})).await;
    let mut guests = Vec::new();
    for name in ["a", "b", "c", "d"] {
        let segment = format!("{name}-{}", f.tag);
        guests.push((f.guest(inv, &segment, None).await, segment));
    }
    let tight = Limits {
        rsvp_per_link: Limit { max: 3, window_seconds: 600 },
        rsvp_per_ip: Limit { max: 6, window_seconds: 600 },
        ..ROOMY
    };
    let app = router(state(&f.pool, ROOMY, None));
    let limited = router(state(&f.pool, tight, None));

    let (first, first_path) = (&guests[0].0, rsvp_path(&slug, &guests[0].1));
    let body = guest_body_from(json!({ "status": "CONFIRMED", "guestCount": "2" }), REPLAY_ADDRESS);
    let limited_body = guest_body_from(json!({ "status": "CONFIRMED", "guestCount": "2" }), LIMIT_ADDRESS);
    let key = format!("rsvp-{}", f.tag);
    let concurrent: Vec<_> = (0..10)
        .map(|_| {
            let (app, path, body, key) = (app.clone(), first_path.clone(), body.clone(), key.clone());
            tokio::spawn(async move { post(&app, &path, &body, Some(&key), None).await })
        })
        .collect();
    let mut replies = Vec::new();
    for task in concurrent {
        replies.push(task.await.unwrap());
    }
    let after_concurrent = f.rsvp_events(*first).await.len();
    let reused =
        post(&app, &first_path, &guest_body_from(json!({ "status": "DECLINED" }), REPLAY_ADDRESS), Some(&key), None)
            .await;
    let bad_key = post(&app, &first_path, &body, Some("has space"), None).await;

    let (second, second_path) = (&guests[1].0, rsvp_path(&slug, &guests[1].1));
    let mut link_statuses = Vec::new();
    for _ in 0..5 {
        link_statuses.push(post(&limited, &second_path, &limited_body, None, None).await);
    }
    let link_events = f.rsvp_events(*second).await.len();
    let mut ip_statuses = Vec::new();
    for (_, segment) in &guests[2..] {
        for _ in 0..2 {
            ip_statuses.push(post(&limited, &rsvp_path(&slug, segment), &limited_body, None, None).await.status);
        }
    }
    let third_events = f.rsvp_events(guests[2].0).await.len() + f.rsvp_events(guests[3].0).await.len();
    let stored_buckets: Vec<String> =
        sqlx::query_scalar("select bucket from api_rate_limits where bucket like 'rsvp:ip:%'")
            .fetch_all(&f.pool)
            .await
            .unwrap();
    let leftover = f.remove().await;

    assert!(
        replies
            .iter()
            .all(|r| r.status == StatusCode::OK && r.body == json!({ "status": "CONFIRMED", "attendingCount": 2 }))
    );
    assert_eq!(replies.iter().filter(|r| !r.replayed).count(), 1, "one request wrote; the other nine replayed it");
    assert_eq!(after_concurrent, 1, "ten concurrent requests with one key write one RSVP event");
    assert_eq!(
        (reused.status, reused.body["code"].clone()),
        (StatusCode::UNPROCESSABLE_ENTITY, json!("idempotency.key_reused"))
    );
    assert_eq!(
        (bad_key.status, bad_key.body["code"].clone()),
        (StatusCode::BAD_REQUEST, json!("request.invalid_idempotency_key"))
    );
    let statuses: Vec<StatusCode> = link_statuses.iter().map(|r| r.status).collect();
    assert_eq!(statuses[..3], [StatusCode::OK; 3]);
    assert_eq!(statuses[3..], [StatusCode::TOO_MANY_REQUESTS; 2], "the 4th and 5th write in the window are refused");
    assert_eq!(link_statuses[3].body["code"], "rate_limit.exceeded");
    assert!(
        link_statuses[3].retry_after.as_deref().is_some_and(|s| s.parse::<u64>().is_ok_and(|n| (1..=600).contains(&n)))
    );
    assert_eq!(link_events, 3, "a refused write writes nothing");
    // The per-link refusal answers before the address is counted, so the address holds 3 hits; 6 are allowed.
    assert_eq!(ip_statuses, [StatusCode::OK, StatusCode::OK, StatusCode::OK, StatusCode::TOO_MANY_REQUESTS]);
    assert_eq!(third_events, 3);
    assert!(
        stored_buckets.iter().all(|b| !b.contains(LIMIT_ADDRESS) && !b.contains(REPLAY_ADDRESS)),
        "no address in the table"
    );
    assert_eq!(leftover, 0);
}

struct Keys {
    encoding: EncodingKey,
    verifier: Arc<OwnerVerifier>,
}

async fn owner_keys() -> Keys {
    install_crypto_provider();
    let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
    let encoding = EncodingKey::from_rsa_der(private.to_pkcs1_der().unwrap().as_bytes());
    let jwks = json!({ "keys": [{ "kid": "rsvp-key", "kty": "RSA", "alg": "RS256",
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
    Keys { encoding, verifier: Arc::new(verifier) }
}

fn token(keys: &Keys, sub: &str) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some("rsvp-key".into());
    let now = unix_now();
    encode(
        &header,
        &json!({ "sub": sub, "iss": "https://issuer.invalid", "exp": now + 60, "nbf": now - 1 }),
        &keys.encoding,
    )
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn host_overrides_are_owner_scoped_and_never_lose_a_concurrent_event_answer() {
    let mut f = Fixture::new(&[]).await;
    let keys = owner_keys().await;
    let (owner, owner_clerk) = f.user("host", "CUSTOMER").await;
    let (_, other_clerk) = f.user("other", "CUSTOMER").await;
    let (_, admin_clerk) = f.user("admin", "ADMIN").await;
    let config = json!({ "rsvp": { "perEvent": true }, "events": [{ "id": "akad", "title": "Akad" }, { "id": "resepsi", "title": "Resepsi" }] });
    let (inv, _) = f.invitation(owner, "host", "PUBLISHED", config).await;
    let guest = f.guest(inv, &format!("tamu-{}", f.tag), None).await;
    let app = router(state(&f.pool, ROOMY, Some(keys.verifier.clone())));
    let path = format!("/v1/invitations/{inv}/guests/{guest}/rsvp-override");
    let body = |status: &str, event: Option<&str>| {
        let mut body = json!({ "status": status, "flags": { "perEvent": true, "inviteOnlyEvents": true } });
        if let Some(event) = event {
            body["eventId"] = json!(event);
        }
        body.to_string()
    };

    let owner_token = token(&keys, &owner_clerk);
    let mut lost_updates = 0;
    for _ in 0..5 {
        sqlx::query("update guests set rsvp_event_answers = null, rsvp_status = 'PENDING' where id = $1")
            .bind(guest)
            .execute(&f.pool)
            .await
            .unwrap();
        let (akad, resepsi) = (body("DECLINED", Some("akad")), body("DECLINED", Some("resepsi")));
        let (a, b) = tokio::join!(
            post(&app, &path, &akad, None, Some(&owner_token)),
            post(&app, &path, &resepsi, None, Some(&owner_token)),
        );
        assert_eq!((a.status, b.status), (StatusCode::OK, StatusCode::OK));
        let row = f.row(guest).await;
        if row["events"]
            != json!({ "akad": { "status": "DECLINED", "attending": 0 }, "resepsi": { "status": "DECLINED", "attending": 0 } })
            || row["status"] != "DECLINED"
        {
            lost_updates += 1;
        }
    }
    let one_event = post(&app, &path, &body("PENDING", Some("akad")), None, Some(&owner_token)).await;
    let one_event_row = f.row(guest).await;
    let refused = post(&app, &path, &body("CONFIRMED", Some("missing")), None, Some(&owner_token)).await;
    let stranger = post(&app, &path, &body("CONFIRMED", None), None, Some(&token(&keys, &other_clerk))).await;
    let admin = post(&app, &path, &body("CONFIRMED", None), None, Some(&token(&keys, &admin_clerk))).await;
    let unsigned_token = post(&app, &path, &body("CONFIRMED", None), None, None).await;
    let bad_path = post(
        &app,
        &format!("/v1/invitations/x/guests/{guest}/rsvp-override"),
        &body("CONFIRMED", None),
        None,
        Some(&owner_token),
    )
    .await;
    let events = f.rsvp_events(guest).await;
    let leftover = f.remove().await;

    assert_eq!(lost_updates, 0, "the row lock serialises concurrent per-event overrides");
    assert_eq!(
        (one_event.status, one_event.body.clone()),
        (StatusCode::OK, json!({ "status": "PENDING", "attendingCount": null }))
    );
    assert_eq!(one_event_row["events"], json!({ "resepsi": { "status": "DECLINED", "attending": 0 } }));
    assert_eq!(
        (refused.status, refused.body["code"].clone()),
        (StatusCode::UNPROCESSABLE_ENTITY, json!("rsvp.override_invalid"))
    );
    assert_eq!(
        (stranger.status, stranger.body["code"].clone()),
        (StatusCode::NOT_FOUND, json!("invitation_or_guest.not_found"))
    );
    assert_eq!((admin.status, admin.body["code"].clone()), (StatusCode::FORBIDDEN, json!("owner.role_not_allowed")));
    assert_eq!(
        (unsigned_token.status, unsigned_token.body["code"].clone()),
        (StatusCode::UNAUTHORIZED, json!("owner.token_missing"))
    );
    assert_eq!(
        (bad_path.status, bad_path.body["code"].clone()),
        (StatusCode::BAD_REQUEST, json!("request.invalid_path"))
    );
    assert_eq!(events.len(), 11, "ten overrides and one clear, each with its RSVP event");
    assert!(events.iter().all(|meta| meta["source"] == "dashboard" && meta.get("guestCount").is_none()));
    assert_eq!(leftover, 0);
}
