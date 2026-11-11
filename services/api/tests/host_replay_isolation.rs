//! Host replay isolation (s29, before any Rust rollout): an `Idempotency-Key` recorded by a host's successful write (the
//! RSVP override, wish moderation, wish reply) replays only to the same owner, on the same invitation and the same guest
//! or wish. Signed requests through the router; owner tokens verified against a JWKS served over HTTP by a local endpoint
//! (keys made per run, no Clerk credential); a database migrated by drizzle-kit (`TEST_DATABASE_URL`). Fixture rows are
//! fictional, tagged per run and removed before the assertions. The same scenarios run against the binary in
//! `scripts/verify-host-replay-isolation.ts`.

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

const SECRET: &[u8] = b"host-replay-test-secret-0123456789abcdef";
const ISSUER: &str = "https://issuer.invalid";
const ROOMY: Limits = Limits {
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
    let jwks = json!({ "keys": [{ "kid": "replay-key", "kty": "RSA", "alg": "RS256",
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
    header.kid = Some("replay-key".into());
    let now = unix_now();
    encode(&header, &json!({ "sub": sub, "iss": ISSUER, "exp": now + 120, "nbf": now - 1 }), &keys.encoding).unwrap()
}

struct Answer {
    status: StatusCode,
    body: Value,
    replayed: bool,
}

async fn post(app: &Router, path: &str, body: &Value, key: &str, bearer: &str) -> Answer {
    let body = body.to_string();
    let request = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::AUTHORIZATION, format!("Bearer {bearer}"))
        .header("idempotency-key", key)
        .header(SIGNATURE_HEADER, sign(SECRET, unix_now(), "POST", path, body.as_bytes()))
        .body(Body::from(body))
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let replayed = response.headers().get("idempotent-replayed").is_some();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    Answer { status, body: serde_json::from_slice(&bytes).unwrap_or(Value::Null), replayed }
}

fn override_path(invitation: i32, guest: i32) -> String {
    format!("/v1/invitations/{invitation}/guests/{guest}/rsvp-override")
}

fn moderation_path(invitation: i32, wish: i32) -> String {
    format!("/v1/invitations/{invitation}/wishes/{wish}/moderation")
}

fn reply_path(invitation: i32, wish: i32) -> String {
    format!("/v1/invitations/{invitation}/wishes/{wish}/reply")
}

/// Tests in this binary run in parallel; each removes only its own rows and the keys it tagged.
struct Fixture {
    pool: PgPool,
    tag: String,
    users: Vec<i32>,
    invitations: Vec<i32>,
}

impl Fixture {
    async fn new() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(8).connect(&url).await.expect("connect");
        Self { pool, tag: uuid::Uuid::new_v4().simple().to_string(), users: Vec::new(), invitations: Vec::new() }
    }

    fn key(&self, name: &str) -> String {
        format!("replay-{}-{name}", self.tag)
    }

    async fn customer(&mut self, name: &str, role: &str) -> (i32, String) {
        let clerk = format!("user_replay_{name}_{}", self.tag);
        let id: i32 =
            sqlx::query_scalar("insert into users (email, clerk_user_id, role) values ($1, $2, $3) returning id")
                .bind(format!("replay-{name}-{}@example.invalid", self.tag))
                .bind(&clerk)
                .bind(role)
                .fetch_one(&self.pool)
                .await
                .expect("fixture user");
        self.users.push(id);
        (id, clerk)
    }

    async fn invitation(&mut self, owner: i32) -> i32 {
        let id: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type, status, config) \
             values ($1, $2, 'wedding', 'PUBLISHED', '{}'::jsonb) returning id",
        )
        .bind(owner)
        .bind(format!("replay-{}-{}", self.invitations.len() + 1, self.tag))
        .fetch_one(&self.pool)
        .await
        .expect("fixture invitation");
        self.invitations.push(id);
        id
    }

    async fn guest(&self, invitation: i32, name: &str) -> i32 {
        sqlx::query_scalar(
            "insert into guests (invitation_id, name, slug, guest_count) values ($1, $2, $3, 2) returning id",
        )
        .bind(invitation)
        .bind(format!("{name} (fiktif)"))
        .bind(format!("{name}-{}", self.tag))
        .fetch_one(&self.pool)
        .await
        .expect("fixture guest")
    }

    async fn wish(&self, invitation: i32, guest: i32, message: &str) -> i32 {
        sqlx::query_scalar(
            "insert into guest_messages (invitation_id, guest_id, name, message, is_hidden) \
             values ($1, $2, 'Tamu (fiktif)', $3, false) returning id",
        )
        .bind(invitation)
        .bind(guest)
        .bind(message)
        .fetch_one(&self.pool)
        .await
        .expect("fixture wish")
    }

    /// Everything a refusal must leave as it was: the guest's answer with its RSVP analytics rows, or the wish.
    async fn state(&self, target: Target, id: i32) -> Value {
        let query = match target {
            Target::Guest => {
                "select json_build_object('status', rsvp_status, 'attending', attending_count, 'events', \
                 (select count(*) from analytics_events a where a.guest_id = g.id and a.event_type = 'RSVP')) \
                 from guests g where id = $1"
            }
            Target::Wish => {
                "select json_build_object('hidden', is_hidden, 'reviewed', reviewed_at is not null, 'reply', host_reply) \
                 from guest_messages where id = $1"
            }
        };
        let row: Option<Value> = sqlx::query_scalar(query).bind(id).fetch_optional(&self.pool).await.unwrap();
        row.unwrap_or(Value::Null)
    }

    async fn key_rows(&self, key: &str) -> i64 {
        sqlx::query_scalar("select count(*) from api_idempotency_keys where key = $1")
            .bind(key)
            .fetch_one(&self.pool)
            .await
            .unwrap()
    }

    /// Removes the fixture and returns what is left of it (invitations and tagged keys).
    async fn remove(&self) -> i64 {
        for statement in [
            "delete from analytics_events where invitation_id = any($1)",
            "delete from guest_messages where invitation_id = any($1)",
            "delete from guests where invitation_id = any($1)",
            "delete from invitations where id = any($1)",
        ] {
            sqlx::query(statement).bind(&self.invitations).execute(&self.pool).await.unwrap();
        }
        sqlx::query("delete from users where id = any($1)").bind(&self.users).execute(&self.pool).await.unwrap();
        let tagged = format!("replay-{}-%", self.tag);
        sqlx::query("delete from api_idempotency_keys where key like $1")
            .bind(&tagged)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query_scalar(
            "select (select count(*) from invitations where id = any($1)) + \
             (select count(*) from api_idempotency_keys where key like $2)",
        )
        .bind(&self.invitations)
        .bind(&tagged)
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }
}

#[derive(Clone, Copy)]
enum Target {
    Guest,
    Wish,
}

struct Case {
    name: &'static str,
    path: fn(i32, i32) -> String,
    target: Target,
    resource: i32,
    body: Value,
    changed: Value,
    not_found: &'static str,
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_hosts_key_replays_only_to_its_owner_on_the_same_invitation_and_resource() {
    let mut f = Fixture::new().await;
    let keys = owner_keys().await;
    let (owner, owner_clerk) = f.customer("owner", "CUSTOMER").await;
    let (other, other_clerk) = f.customer("other", "CUSTOMER").await;
    let (_, admin_clerk) = f.customer("admin", "ADMIN").await;
    let own = f.invitation(owner).await;
    let own_other = f.invitation(owner).await;
    let foreign = f.invitation(other).await;
    let guest = f.guest(own, "tamu").await;
    let hide_target = f.wish(own, guest, "Ucapan untuk disembunyikan").await;
    let reply_target = f.wish(own, guest, "Ucapan untuk dibalas").await;
    let app = router(AppState {
        pool: f.pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner: Some(keys.verifier.clone()),
        limits: ROOMY,
    });
    let owner_token = token(&keys, &owner_clerk);
    let other_token = token(&keys, &other_clerk);
    let admin_token = token(&keys, &admin_clerk);
    let flags = json!({ "perEvent": false, "inviteOnlyEvents": false });
    let cases = [
        Case {
            name: "rsvp-override",
            path: override_path,
            target: Target::Guest,
            resource: guest,
            body: json!({ "status": "CONFIRMED", "flags": flags }),
            changed: json!({ "status": "DECLINED", "flags": flags }),
            not_found: "invitation_or_guest.not_found",
        },
        Case {
            name: "moderation",
            path: moderation_path,
            target: Target::Wish,
            resource: hide_target,
            body: json!({ "action": "HIDE" }),
            changed: json!({ "action": "DELETE" }),
            not_found: "invitation_or_wish.not_found",
        },
        Case {
            name: "reply",
            path: reply_path,
            target: Target::Wish,
            resource: reply_target,
            body: json!({ "reply": "Terima kasih atas doanya." }),
            changed: json!({ "reply": "Balasan lain." }),
            not_found: "invitation_or_wish.not_found",
        },
    ];

    let mut failures: Vec<String> = Vec::new();
    for case in &cases {
        let key = f.key(case.name);
        let own_path = (case.path)(own, case.resource);
        let first = post(&app, &own_path, &case.body, &key, &owner_token).await;
        if first.status != StatusCode::OK || first.replayed {
            failures.push(format!("{}: the owner's write: {} {}", case.name, first.status, first.body));
            continue;
        }
        let written = f.state(case.target, case.resource).await;
        let reuses = [
            (
                "another customer, same body",
                post(&app, &own_path, &case.body, &key, &other_token).await,
                StatusCode::NOT_FOUND,
                case.not_found,
            ),
            (
                "another customer, changed body",
                post(&app, &own_path, &case.changed, &key, &other_token).await,
                StatusCode::NOT_FOUND,
                case.not_found,
            ),
            (
                "another customer, under their own invitation",
                post(&app, &(case.path)(foreign, case.resource), &case.body, &key, &other_token).await,
                StatusCode::NOT_FOUND,
                case.not_found,
            ),
            (
                "the owner, under another of their invitations",
                post(&app, &(case.path)(own_other, case.resource), &case.body, &key, &owner_token).await,
                StatusCode::NOT_FOUND,
                case.not_found,
            ),
            (
                "an administrator",
                post(&app, &own_path, &case.body, &key, &admin_token).await,
                StatusCode::FORBIDDEN,
                "owner.role_not_allowed",
            ),
        ];
        for (who, answer, status, code) in reuses {
            if answer.status != status || answer.body["code"] != code || answer.replayed || answer.body == first.body {
                failures.push(format!(
                    "{}: reused by {who}: {} {} (replayed: {})",
                    case.name, answer.status, answer.body, answer.replayed
                ));
            }
        }
        if f.state(case.target, case.resource).await != written || f.key_rows(&key).await != 1 {
            failures.push(format!("{}: a refusal changed the row or recorded a key", case.name));
        }
        let retry = post(&app, &own_path, &case.body, &key, &owner_token).await;
        if retry.status != StatusCode::OK
            || !retry.replayed
            || retry.body != first.body
            || f.state(case.target, case.resource).await != written
            || f.key_rows(&key).await != 1
        {
            failures.push(format!(
                "{}: the owner's retry: {} {} (replayed: {})",
                case.name, retry.status, retry.body, retry.replayed
            ));
        }
    }
    let leftover = f.remove().await;

    assert!(failures.is_empty(), "{} isolation failures:\n{}", failures.len(), failures.join("\n"));
    assert_eq!(leftover, 0);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn a_lost_delete_replays_to_its_owner_and_to_no_one_else() {
    let mut f = Fixture::new().await;
    let keys = owner_keys().await;
    let (owner, owner_clerk) = f.customer("owner", "CUSTOMER").await;
    let (other, other_clerk) = f.customer("other", "CUSTOMER").await;
    let own = f.invitation(owner).await;
    let own_other = f.invitation(owner).await;
    let foreign = f.invitation(other).await;
    let guest = f.guest(own, "tamu").await;
    let doomed = f.wish(own, guest, "Ucapan untuk dihapus").await;
    let foreign_guest = f.guest(foreign, "tamu-lain").await;
    let foreign_wish = f.wish(foreign, foreign_guest, "Ucapan pelanggan lain").await;
    let foreign_before = f.state(Target::Wish, foreign_wish).await;
    let app = router(AppState {
        pool: f.pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner: Some(keys.verifier.clone()),
        limits: ROOMY,
    });
    let owner_token = token(&keys, &owner_clerk);
    let other_token = token(&keys, &other_clerk);
    let delete = json!({ "action": "DELETE" });
    let key = f.key("delete");

    let deleted = post(&app, &moderation_path(own, doomed), &delete, &key, &owner_token).await;
    let after_delete = f.state(Target::Wish, doomed).await;
    // The answer counts as lost: every request below arrives under the delete's key.
    let reuses = [
        ("another customer", post(&app, &moderation_path(own, doomed), &delete, &key, &other_token).await),
        (
            "another customer, under their own invitation",
            post(&app, &moderation_path(foreign, doomed), &delete, &key, &other_token).await,
        ),
        (
            "the owner, under another of their invitations",
            post(&app, &moderation_path(own_other, doomed), &delete, &key, &owner_token).await,
        ),
    ];
    let owner_retry = post(&app, &moderation_path(own, doomed), &delete, &key, &owner_token).await;
    let foreign_after = f.state(Target::Wish, foreign_wish).await;
    let key_rows = f.key_rows(&key).await;
    let leftover = f.remove().await;

    let gone = json!({ "id": doomed, "state": "DELETED" });
    assert_eq!((deleted.status, deleted.body.clone()), (StatusCode::OK, gone.clone()));
    assert_eq!(after_delete, Value::Null, "the wish is deleted");
    for (who, answer) in &reuses {
        assert_eq!(
            (answer.status, answer.body["code"].clone(), answer.replayed),
            (StatusCode::NOT_FOUND, json!("invitation_or_wish.not_found"), false),
            "reused by {who}: {}",
            answer.body
        );
    }
    assert!(owner_retry.replayed, "the owner's retry replays: {}", owner_retry.body);
    assert_eq!((owner_retry.status, owner_retry.body), (StatusCode::OK, gone), "instead of answering not found");
    assert_eq!(foreign_after, foreign_before, "no reuse touched another customer's wish");
    assert_eq!(key_rows, 1, "no refusal recorded a key");
    assert_eq!(leftover, 0);
}
