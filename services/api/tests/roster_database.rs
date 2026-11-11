//! B-033 against a database migrated by drizzle-kit (`TEST_DATABASE_URL`): every roster endpoint through the router,
//! signed as Next.js signs it, with owner tokens verified against a JWKS served by a local endpoint (keys made per run,
//! no Clerk credential). Each owner endpoint refuses another owner's invitation and an administrator; a key replays
//! instead of writing twice; imports are atomic and serialised per invitation; undo keeps touched guests; registration
//! honours its link, its invitation's state, its limits and its queue. Fixture rows are fictional, tagged per run and
//! removed before the assertions. The same flows run through both writers against the binary in
//! `scripts/verify-roster-api.ts`.

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

const SECRET: &[u8] = b"roster-database-test-secret-0123456789ab";
const ISSUER: &str = "https://issuer.invalid";

const ROOMY: Limits = Limits {
    rsvp_per_link: Limit { max: 1000, window_seconds: 600 },
    rsvp_per_ip: Limit { max: 1000, window_seconds: 600 },
    wish_per_link: Limit { max: 1000, window_seconds: 600 },
    wish_per_ip: Limit { max: 1000, window_seconds: 600 },
    registration_per_link: Limit { max: 1000, window_seconds: 600 },
    registration_per_ip: Limit { max: 1000, window_seconds: 600 },
};

fn flags(opaque: bool, invite_only: bool) -> Value {
    json!({ "opaqueLinks": opaque, "inviteOnlyEvents": invite_only })
}

struct Keys {
    encoding: EncodingKey,
    verifier: Arc<OwnerVerifier>,
}

async fn owner_keys() -> Keys {
    install_crypto_provider();
    let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
    let encoding = EncodingKey::from_rsa_der(private.to_pkcs1_der().unwrap().as_bytes());
    let jwks = json!({ "keys": [{ "kid": "roster-key", "kty": "RSA", "alg": "RS256",
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
    header.kid = Some("roster-key".into());
    let now = unix_now();
    encode(&header, &json!({ "sub": sub, "iss": ISSUER, "exp": now + 300, "nbf": now - 1 }), &keys.encoding).unwrap()
}

fn app(pool: &PgPool, limits: Limits, keys: &Keys) -> Router {
    router(AppState {
        pool: pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner: Some(keys.verifier.clone()),
        limits,
    })
}

struct Answer {
    status: StatusCode,
    body: Value,
    replayed: bool,
    retry_after: Option<String>,
}

async fn post(app: &Router, path: &str, body: &Value, bearer: Option<&str>, key: Option<&str>) -> Answer {
    let body = body.to_string();
    let mut request = Request::builder()
        .method(Method::POST)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(SIGNATURE_HEADER, sign(SECRET, unix_now(), "POST", path, body.as_bytes()));
    if let Some(bearer) = bearer {
        request = request.header(header::AUTHORIZATION, format!("Bearer {bearer}"));
    }
    if let Some(key) = key {
        request = request.header("idempotency-key", key);
    }
    let response = app.clone().oneshot(request.body(Body::from(body)).unwrap()).await.unwrap();
    let status = response.status();
    let replayed = response.headers().get("idempotent-replayed").is_some();
    let retry_after = response.headers().get(header::RETRY_AFTER).map(|value| value.to_str().unwrap().to_string());
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    Answer { status, body: serde_json::from_slice(&bytes).unwrap_or(Value::Null), replayed, retry_after }
}

/// Per-test rows: two customers (the owner and another host), an administrator and their invitations.
struct Fixture {
    pool: PgPool,
    tag: String,
    users: Vec<i32>,
    invitations: Vec<i32>,
    addresses: Vec<&'static str>,
}

impl Fixture {
    async fn new(addresses: &[&'static str]) -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(16).connect(&url).await.expect("connect");
        Self {
            pool,
            tag: uuid::Uuid::new_v4().simple().to_string(),
            users: vec![],
            invitations: vec![],
            addresses: addresses.to_vec(),
        }
    }

    /// A user; returns (id, clerk subject).
    async fn user(&mut self, label: &str, role: &str) -> (i32, String) {
        let sub = format!("user_roster_{label}_{}", self.tag);
        let id: i32 =
            sqlx::query_scalar("insert into users (email, clerk_user_id, role) values ($1, $2, $3) returning id")
                .bind(format!("roster-{label}-{}@example.invalid", self.tag))
                .bind(&sub)
                .bind(role)
                .fetch_one(&self.pool)
                .await
                .expect("fixture user");
        self.users.push(id);
        (id, sub)
    }

    async fn invitation(&mut self, owner: i32, label: &str, status: &str, config: Value) -> i32 {
        let id: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type, status, config) values ($1, $2, 'wedding', $3, $4) returning id",
        )
        .bind(owner)
        .bind(format!("roster-{label}-{}", self.tag))
        .bind(status)
        .bind(config)
        .fetch_one(&self.pool)
        .await
        .expect("fixture invitation");
        self.invitations.push(id);
        id
    }

    async fn guests(&self, invitation: i32) -> Vec<Value> {
        sqlx::query_scalar(
            "select json_build_object('name', name, 'phone', phone, 'category', category, 'seats', guest_count, \
             'slug', slug, 'token', link_token, 'invited', invited_event_ids, 'batch', import_batch_id, \
             'sent', sent_at is not null, 'checkedIn', checked_in_at is not null) \
             from guests where invitation_id = $1 order by id",
        )
        .bind(invitation)
        .fetch_all(&self.pool)
        .await
        .expect("guests")
    }

    async fn scalar(&self, sql: &'static str, invitation: i32) -> i64 {
        sqlx::query_scalar(sql).bind(invitation).fetch_one(&self.pool).await.expect("count")
    }

    async fn remove(&self) {
        for statement in [
            "delete from analytics_events where invitation_id = any($1)",
            "delete from guest_registrations where invitation_id = any($1)",
            "delete from guest_registration_links where invitation_id = any($1)",
            "delete from guests where invitation_id = any($1)",
            "delete from invitations where id = any($1)",
        ] {
            sqlx::query(statement).bind(&self.invitations).execute(&self.pool).await.unwrap();
        }
        sqlx::query("delete from users where id = any($1)").bind(&self.users).execute(&self.pool).await.unwrap();
        let buckets: Vec<String> = self
            .invitations
            .iter()
            .map(|id| format!("registration:link:{id}"))
            .chain(self.addresses.iter().map(|address| ip_bucket(SECRET, "registration", address)))
            .collect();
        sqlx::query("delete from api_rate_limits where bucket = any($1)")
            .bind(&buckets)
            .execute(&self.pool)
            .await
            .unwrap();
        let mut scopes: Vec<String> = self.invitations.iter().map(|id| format!("registration:link:{id}")).collect();
        scopes.extend(self.users.iter().map(|id| format!("roster:%:{id}:%")));
        sqlx::query("delete from api_idempotency_keys where scope like any($1)")
            .bind(&scopes)
            .execute(&self.pool)
            .await
            .unwrap();
    }
}

const EVENTS: &str =
    r#"{"events": [{"id": "ev-akad", "title": "Akad", "inviteOnly": true}, {"id": "ev-resepsi", "title": "Resepsi"}]}"#;

#[tokio::test]
async fn adding_a_guest_judges_stores_replays_and_refuses_another_owner() {
    let keys = owner_keys().await;
    let mut f = Fixture::new(&[]).await;
    let (owner, owner_sub) = f.user("owner", "CUSTOMER").await;
    let (_other, other_sub) = f.user("other", "CUSTOMER").await;
    let (_admin, admin_sub) = f.user("admin", "ADMIN").await;
    let invitation = f.invitation(owner, "add", "PUBLISHED", serde_json::from_str(EVENTS).unwrap()).await;
    let app = app(&f.pool, ROOMY, &keys);
    let (bearer, other, admin) = (token(&keys, &owner_sub), token(&keys, &other_sub), token(&keys, &admin_sub));
    let path = format!("/v1/invitations/{invitation}/guests");
    let budi = json!({ "guest": { "name": "  Budi   Santoso ", "phone": "0812-3456-7890", "category": " Keluarga ", "guestCount": "2" },
        "invitedEventIds": ["ev-akad", "ev-resepsi", "ev-hilang"], "flags": flags(false, true) });

    let first = post(&app, &path, &budi, Some(&bearer), Some("add-1")).await;
    let again = post(&app, &path, &budi, Some(&bearer), Some("add-1")).await;
    let twin = post(
        &app,
        &path,
        &json!({ "guest": { "name": "Budi Santoso" }, "flags": flags(true, true) }),
        Some(&bearer),
        None,
    )
    .await;
    let bad_phone = post(
        &app,
        &path,
        &json!({ "guest": { "name": "Joko", "phone": "021-5551234" }, "flags": flags(false, true) }),
        Some(&bearer),
        None,
    )
    .await;
    let bad_seats = post(
        &app,
        &path,
        &json!({ "guest": { "name": "Joko", "guestCount": "51" }, "flags": flags(false, true) }),
        Some(&bearer),
        None,
    )
    .await;
    let foreign = post(&app, &path, &budi, Some(&other), Some("add-1")).await;
    let foreign_invalid =
        post(&app, &path, &json!({ "guest": { "name": "" }, "flags": flags(false, true) }), Some(&other), None).await;
    let administrator = post(&app, &path, &budi, Some(&admin), None).await;
    let no_token = post(&app, &path, &budi, None, None).await;
    let rows = f.guests(invitation).await;
    f.remove().await;

    assert_eq!(first.status, StatusCode::OK, "{:?}", first.body);
    assert_eq!(first.body["slug"], "budi-santoso");
    assert!(again.replayed && again.body == first.body, "a retry under the key replays the stored guest");
    assert_eq!(twin.status, StatusCode::OK);
    assert_eq!(
        twin.body["slug"], "budi-santoso-2",
        "the add path keeps no duplicate check (as before) and suffixes the slug"
    );
    assert_eq!(
        (bad_phone.status, bad_phone.body["reason"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("phone"))
    );
    assert_eq!(bad_phone.body["code"], "roster.row_invalid");
    assert_eq!(bad_seats.body["reason"], "seats");
    assert_eq!((foreign.status, foreign.body["code"].as_str()), (StatusCode::NOT_FOUND, Some("roster.not_found")));
    assert_eq!(foreign_invalid.status, StatusCode::NOT_FOUND, "ownership is judged before the row");
    assert_eq!(
        (administrator.status, administrator.body["code"].as_str()),
        (StatusCode::FORBIDDEN, Some("owner.role_not_allowed"))
    );
    assert_eq!(
        (no_token.status, no_token.body["code"].as_str()),
        (StatusCode::UNAUTHORIZED, Some("owner.token_missing"))
    );
    assert_eq!(rows.len(), 2, "one row per accepted add, none for the replay or the refusals: {rows:?}");
    assert_eq!(
        rows[0],
        json!({ "name": "Budi Santoso", "phone": "0812-3456-7890", "category": "Keluarga", "seats": 2, "slug": "budi-santoso",
            "token": null, "invited": ["ev-akad"], "batch": null, "sent": false, "checkedIn": false })
    );
    let minted = rows[1]["token"].as_str().expect("opaque links mint a token");
    assert!(
        minted.len() == 22 && minted.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
        "{minted}"
    );
}

fn file(rows: usize, prefix: &str) -> Vec<Value> {
    (1..=rows)
        .map(|i| json!({ "name": format!("{prefix} {i}"), "phone": format!("0812{:08}", 10_000_000 + i) }))
        .collect()
}

#[tokio::test]
async fn imports_preview_then_write_atomically_and_serialise_per_invitation() {
    let keys = owner_keys().await;
    let mut f = Fixture::new(&[]).await;
    let (owner, owner_sub) = f.user("owner", "CUSTOMER").await;
    let (_other, other_sub) = f.user("other", "CUSTOMER").await;
    let invitation = f.invitation(owner, "import", "PUBLISHED", json!({})).await;
    let full = f.invitation(owner, "full", "PUBLISHED", json!({})).await;
    let app = app(&f.pool, ROOMY, &keys);
    let (bearer, other) = (token(&keys, &owner_sub), token(&keys, &other_sub));
    let path = format!("/v1/invitations/{invitation}/guest-imports");
    let mixed = json!([
        { "name": "Rina Kartika", "phone": "0813-1111-2222", "category": "Teman", "guestCount": "2" },
        { "name": "Rina  Kartika", "phone": "+62 813 1111 2222" },
        { "name": "Joko", "phone": "021-5551234" },
        { "name": "Sari" }
    ]);

    let preview =
        post(&app, &path, &json!({ "rows": mixed, "dryRun": true, "flags": flags(false, false) }), Some(&bearer), None)
            .await;
    let after_preview = f.scalar("select count(*) from guests where invitation_id = $1", invitation).await;
    let written =
        post(&app, &path, &json!({ "rows": mixed, "flags": flags(false, false) }), Some(&bearer), Some("import-1"))
            .await;
    let replayed =
        post(&app, &path, &json!({ "rows": mixed, "flags": flags(false, false) }), Some(&bearer), Some("import-1"))
            .await;
    let foreign =
        post(&app, &path, &json!({ "rows": file(3, "Asing"), "flags": flags(false, false) }), Some(&other), None).await;
    let rows = f.guests(invitation).await;

    // Two concurrent imports of one 60-row file into an empty invitation: the lock serialises them, so the first writes
    // 60 guests and the second finds every row a duplicate and writes nothing.
    let race = f.invitation(owner, "race", "PUBLISHED", json!({})).await;
    let race_path = format!("/v1/invitations/{race}/guest-imports");
    let body = json!({ "rows": file(60, "Tamu"), "flags": flags(false, false) });
    let (a, b) = tokio::join!(
        post(&app, &race_path, &body, Some(&bearer), None),
        post(&app, &race_path, &body, Some(&bearer), None)
    );
    let raced = f.scalar("select count(*) from guests where invitation_id = $1", race).await;
    let race_slugs = f.scalar("select count(distinct slug) from guests where invitation_id = $1", race).await;

    // The ceiling: 2,999 guests already, two more rows refused as a whole.
    sqlx::query("insert into guests (invitation_id, name, slug) select $1, 'Isi ' || n, 'isi-' || n from generate_series(1, 2999) n")
        .bind(full)
        .execute(&f.pool)
        .await
        .unwrap();
    let too_many = post(
        &app,
        &format!("/v1/invitations/{full}/guest-imports"),
        &json!({ "rows": [{ "name": "A1" }, { "name": "A2" }], "flags": flags(false, false) }),
        Some(&bearer),
        None,
    )
    .await;
    let full_count = f.scalar("select count(*) from guests where invitation_id = $1", full).await;
    let oversized =
        post(&app, &path, &json!({ "rows": file(1001, "Baris"), "flags": flags(false, false) }), Some(&bearer), None)
            .await;
    f.remove().await;

    assert_eq!(preview.status, StatusCode::OK);
    assert_eq!(
        preview.body["verdicts"],
        json!([
            { "status": "ok", "slug": "rina-kartika" }, { "status": "duplicate", "of": "file" },
            { "status": "invalid", "reason": "phone" }, { "status": "ok", "slug": "sari" }
        ])
    );
    assert_eq!(
        (preview.body["ok"].as_i64(), preview.body["batchId"].is_null(), after_preview),
        (Some(2), true, 0),
        "a preview writes nothing"
    );
    assert_eq!((written.body["imported"].as_i64(), written.body["refusal"].is_null()), (Some(2), true));
    let batch = written.body["batchId"].as_str().expect("a batch id").to_string();
    assert!(replayed.replayed && replayed.body == written.body, "a retried import replays, never imports twice");
    assert_eq!(foreign.status, StatusCode::NOT_FOUND);
    assert_eq!(rows.len(), 2);
    assert!(rows.iter().all(|row| row["batch"] == json!(batch)), "{rows:?}");
    assert_eq!(rows[0]["phone"], "0813-1111-2222", "the number is stored as typed");
    assert_eq!(
        (a.status, b.status),
        (StatusCode::OK, StatusCode::OK),
        "no unique-index failure: {:?} / {:?}",
        a.body,
        b.body
    );
    let mut outcomes = [
        (a.body["imported"].as_i64(), a.body["refusal"].as_str().map(str::to_string)),
        (b.body["imported"].as_i64(), b.body["refusal"].as_str().map(str::to_string)),
    ];
    outcomes.sort();
    assert_eq!(
        outcomes,
        [(Some(0), Some("nothing_to_import".to_string())), (Some(60), None)],
        "the lock serialises the imports: the second sees the first's rows as duplicates"
    );
    assert_eq!((raced, race_slugs), (60, 60));
    assert_eq!(
        (too_many.body["refusal"].as_str(), too_many.body["imported"].as_i64(), full_count),
        (Some("roster_full"), Some(0), 2999)
    );
    assert_eq!(
        (oversized.body["refusal"].as_str(), oversized.body["verdicts"].as_array().map(Vec::len)),
        (Some("too_many_rows"), Some(0))
    );
}

#[tokio::test]
async fn undo_deletes_untouched_guests_keeps_touched_ones_and_replays() {
    let keys = owner_keys().await;
    let mut f = Fixture::new(&[]).await;
    let (owner, owner_sub) = f.user("owner", "CUSTOMER").await;
    let (_other, other_sub) = f.user("other", "CUSTOMER").await;
    let invitation = f.invitation(owner, "undo", "PUBLISHED", json!({})).await;
    let app = app(&f.pool, ROOMY, &keys);
    let (bearer, other) = (token(&keys, &owner_sub), token(&keys, &other_sub));
    let written = post(
        &app,
        &format!("/v1/invitations/{invitation}/guest-imports"),
        &json!({ "rows": file(3, "Tamu"), "flags": flags(false, false) }),
        Some(&bearer),
        None,
    )
    .await;
    let batch = written.body["batchId"].as_str().unwrap().to_string();
    let sent_guest: i32 = sqlx::query_scalar("select id from guests where invitation_id = $1 order by id limit 1")
        .bind(invitation)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    let sent = post(
        &app,
        &format!("/v1/invitations/{invitation}/guests/{sent_guest}/operation"),
        &json!({ "operation": "SENT" }),
        Some(&bearer),
        None,
    )
    .await;
    let undo_path = format!("/v1/invitations/{invitation}/guest-imports/{batch}/undo");

    let foreign = post(&app, &undo_path, &json!(null), Some(&other), None).await;
    let first = post(&app, &undo_path, &json!(null), Some(&bearer), Some("undo-1")).await;
    let retried = post(&app, &undo_path, &json!(null), Some(&bearer), Some("undo-1")).await;
    let fresh = post(&app, &undo_path, &json!(null), Some(&bearer), None).await;
    let unknown = post(
        &app,
        &format!("/v1/invitations/{invitation}/guest-imports/00000000-0000-4000-8000-000000000000/undo"),
        &json!(null),
        Some(&bearer),
        None,
    )
    .await;
    let malformed = post(
        &app,
        &format!("/v1/invitations/{invitation}/guest-imports/not-a-batch/undo"),
        &json!(null),
        Some(&bearer),
        None,
    )
    .await;
    let left = f.guests(invitation).await;
    f.remove().await;

    assert_eq!(sent.status, StatusCode::OK);
    assert_eq!(foreign.status, StatusCode::NOT_FOUND, "another host undoes nothing");
    assert_eq!(first.body, json!({ "deleted": 2, "kept": 1 }));
    assert!(retried.replayed && retried.body == first.body, "a retried undo replays instead of answering differently");
    assert_eq!(fresh.body, json!({ "deleted": 0, "kept": 1 }), "the touched guest stays in its batch");
    assert_eq!((unknown.status, malformed.status), (StatusCode::NOT_FOUND, StatusCode::NOT_FOUND));
    assert_eq!(left.len(), 1);
    assert_eq!(left[0]["sent"], true);
}

#[tokio::test]
async fn operations_and_invite_only_events_write_what_the_typescript_writer_writes() {
    let keys = owner_keys().await;
    let mut f = Fixture::new(&[]).await;
    let (owner, owner_sub) = f.user("owner", "CUSTOMER").await;
    let (_other, other_sub) = f.user("other", "CUSTOMER").await;
    let invitation = f.invitation(owner, "ops", "PUBLISHED", serde_json::from_str(EVENTS).unwrap()).await;
    let app = app(&f.pool, ROOMY, &keys);
    let (bearer, other) = (token(&keys, &owner_sub), token(&keys, &other_sub));
    let guest: i32 = sqlx::query_scalar(
        "insert into guests (invitation_id, name, slug, category, invited_event_ids) values ($1, 'Ani', 'ani', 'Kantor', '[\"ev-lama\"]') returning id",
    )
    .bind(invitation).fetch_one(&f.pool).await.unwrap();
    sqlx::query("insert into guests (invitation_id, name, slug, category) values ($1, 'Bayu', 'bayu', 'Kantor'), ($1, 'Citra', 'citra', null)")
        .bind(invitation).execute(&f.pool).await.unwrap();
    let operation = format!("/v1/invitations/{invitation}/guests/{guest}/operation");
    let invited = format!("/v1/invitations/{invitation}/guests/{guest}/invited-events");
    let category = format!("/v1/invitations/{invitation}/category-invitations");

    let checkin = post(&app, &operation, &json!({ "operation": "CHECKIN" }), Some(&bearer), None).await;
    let checked = f.guests(invitation).await[0]["checkedIn"].clone();
    let checkins = f
        .scalar("select count(*) from analytics_events where invitation_id = $1 and event_type = 'CHECKIN'", invitation)
        .await;
    let undo = post(&app, &operation, &json!({ "operation": "UNDO_CHECKIN" }), Some(&bearer), None).await;
    let foreign_operation = post(&app, &operation, &json!({ "operation": "SENT" }), Some(&other), None).await;
    let ticked = post(
        &app,
        &invited,
        &json!({ "ticked": ["ev-akad", "ev-resepsi", "ev-x"], "flags": flags(false, true) }),
        Some(&bearer),
        None,
    )
    .await;
    let flag_off =
        post(&app, &invited, &json!({ "ticked": [], "flags": flags(false, false) }), Some(&bearer), None).await;
    let add_kantor = post(
        &app,
        &category,
        &json!({ "eventId": "ev-akad", "category": " Kantor ", "mode": "ADD", "flags": flags(false, true) }),
        Some(&bearer),
        None,
    )
    .await;
    let add_blank = post(
        &app,
        &category,
        &json!({ "eventId": "ev-akad", "category": "", "mode": "ADD", "flags": flags(false, true) }),
        Some(&bearer),
        None,
    )
    .await;
    let open_event = post(
        &app,
        &category,
        &json!({ "eventId": "ev-resepsi", "category": "Kantor", "mode": "ADD", "flags": flags(false, true) }),
        Some(&bearer),
        None,
    )
    .await;
    let remove_kantor = post(
        &app,
        &category,
        &json!({ "eventId": "ev-akad", "category": "Kantor", "mode": "REMOVE", "flags": flags(false, true) }),
        Some(&bearer),
        None,
    )
    .await;
    let foreign_category = post(
        &app,
        &category,
        &json!({ "eventId": "ev-akad", "category": "", "mode": "ADD", "flags": flags(false, true) }),
        Some(&other),
        None,
    )
    .await;
    let rows = f.guests(invitation).await;
    f.remove().await;

    assert_eq!((checkin.status, checked, checkins), (StatusCode::OK, json!(true), 1));
    assert_eq!(undo.status, StatusCode::OK);
    assert_eq!(foreign_operation.status, StatusCode::NOT_FOUND);
    assert_eq!(
        ticked.body["invitedEventIds"],
        json!(["ev-lama", "ev-akad"]),
        "stored ids the form cannot show stay; only current invite-only events are added"
    );
    assert_eq!(
        (flag_off.status, flag_off.body["code"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("roster.invite_invalid"))
    );
    assert_eq!(add_kantor.body["changed"], 1, "Ani already had the event; Bayu is added");
    assert_eq!(add_blank.body["changed"], 1, "Citra, without a category");
    assert_eq!(open_event.status, StatusCode::UNPROCESSABLE_ENTITY, "an open event cannot be invite-only");
    assert_eq!(remove_kantor.body["changed"], 2);
    assert_eq!(foreign_category.status, StatusCode::NOT_FOUND);
    assert_eq!(rows[0]["invited"], json!(["ev-lama"]));
    assert_eq!(rows[0]["checkedIn"], json!(false));
    assert_eq!(rows[1]["invited"], Value::Null, "an emptied list is stored as null");
    assert_eq!(rows[2]["invited"], json!(["ev-akad"]));
}

const LIMIT_ADDRESS: &str = "198.51.100.33";

#[tokio::test]
async fn self_registration_from_link_to_guest() {
    let keys = owner_keys().await;
    let mut f = Fixture::new(&[LIMIT_ADDRESS]).await;
    let (owner, owner_sub) = f.user("owner", "CUSTOMER").await;
    let (_other, other_sub) = f.user("other", "CUSTOMER").await;
    let invitation = f.invitation(owner, "reg", "PUBLISHED", json!({})).await;
    let draft = f.invitation(owner, "draft", "DRAFT", json!({})).await;
    let expired = f.invitation(owner, "expired", "EXPIRED", json!({})).await;
    let app = app(&f.pool, ROOMY, &keys);
    let tight =
        self::app(&f.pool, Limits { registration_per_link: Limit { max: 3, window_seconds: 600 }, ..ROOMY }, &keys);
    let (bearer, other) = (token(&keys, &owner_sub), token(&keys, &other_sub));
    let link = |id: i32| format!("/v1/invitations/{id}/registration-link");

    let opened = post(&app, &link(invitation), &json!({ "action": "OPEN" }), Some(&bearer), None).await;
    let kept = post(&app, &link(invitation), &json!({ "action": "OPEN" }), Some(&bearer), None).await;
    let rotated = post(&app, &link(invitation), &json!({ "action": "ROTATE" }), Some(&bearer), None).await;
    let foreign_link = post(&app, &link(invitation), &json!({ "action": "CLOSE" }), Some(&other), None).await;
    let token_now = rotated.body["token"].as_str().unwrap().to_string();
    let old = opened.body["token"].as_str().unwrap().to_string();
    let register = |token: &str| format!("/v1/registration-links/{token}/registrations");
    let draft_token = post(&app, &link(draft), &json!({ "action": "OPEN" }), Some(&bearer), None).await.body["token"]
        .as_str()
        .unwrap()
        .to_string();
    let expired_token =
        post(&app, &link(expired), &json!({ "action": "OPEN" }), Some(&bearer), None).await.body["token"]
            .as_str()
            .unwrap()
            .to_string();

    let dewi = json!({ "name": "Dewi", "phone": "0812-0000-1111", "guestCount": "2", "clientIp": LIMIT_ADDRESS });
    let received = post(&app, &register(&token_now), &dewi, None, Some("reg-1")).await;
    let replayed = post(&app, &register(&token_now), &dewi, None, Some("reg-1")).await;
    let duplicate =
        post(&app, &register(&token_now), &json!({ "name": "Dewi L.", "phone": "+62 812 0000 1111" }), None, None)
            .await;
    let invalid = post(&app, &register(&token_now), &json!({ "name": "Eka", "guestCount": "6" }), None, None).await;
    let stale = post(&app, &register(&old), &dewi, None, None).await;
    let in_draft = post(&app, &register(&draft_token), &dewi, None, None).await;
    let in_expired = post(&app, &register(&expired_token), &dewi, None, None).await;
    let pending = f.scalar("select count(*) from guest_registrations where invitation_id = $1", invitation).await;

    let registration: i32 = sqlx::query_scalar("select id from guest_registrations where invitation_id = $1")
        .bind(invitation)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    let decide = |id: i32| format!("/v1/invitations/{invitation}/registrations/{id}/decision");
    let foreign_decision = post(
        &app,
        &decide(registration),
        &json!({ "decision": "APPROVE", "flags": flags(false, false) }),
        Some(&other),
        None,
    )
    .await;
    let approved = post(
        &app,
        &decide(registration),
        &json!({ "decision": "APPROVE", "flags": flags(false, false) }),
        Some(&bearer),
        Some("decide-1"),
    )
    .await;
    let approved_again = post(
        &app,
        &decide(registration),
        &json!({ "decision": "APPROVE", "flags": flags(false, false) }),
        Some(&bearer),
        Some("decide-1"),
    )
    .await;
    let after_approval = f.guests(invitation).await;
    let eka = post(&app, &register(&token_now), &json!({ "name": "Eka", "phone": "0813-2222-3333" }), None, None).await;
    let eka_id: i32 = sqlx::query_scalar("select id from guest_registrations where invitation_id = $1")
        .bind(invitation)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    sqlx::query(
        "insert into guests (invitation_id, name, phone, slug) values ($1, 'Eka Putri', '081322223333', 'eka-putri')",
    )
    .bind(invitation)
    .execute(&f.pool)
    .await
    .unwrap();
    let duplicate_approval = post(
        &app,
        &decide(eka_id),
        &json!({ "decision": "APPROVE", "flags": flags(false, false) }),
        Some(&bearer),
        None,
    )
    .await;
    let rejected = post(
        &app,
        &decide(eka_id),
        &json!({ "decision": "REJECT", "flags": flags(false, false) }),
        Some(&bearer),
        None,
    )
    .await;
    let pending_after = f.scalar("select count(*) from guest_registrations where invitation_id = $1", invitation).await;

    // The limit on an invitation of its own, so the bucket starts empty.
    let limited_invitation = f.invitation(owner, "limited", "PUBLISHED", json!({})).await;
    let limited_token =
        post(&app, &link(limited_invitation), &json!({ "action": "OPEN" }), Some(&bearer), None).await.body["token"]
            .as_str()
            .unwrap()
            .to_string();
    let mut limited = Vec::new();
    for n in 0..4 {
        limited.push(
            post(
                &tight,
                &register(&limited_token),
                &json!({ "name": format!("Fajar {n}"), "clientIp": LIMIT_ADDRESS }),
                None,
                None,
            )
            .await,
        );
    }
    let limited_pending =
        f.scalar("select count(*) from guest_registrations where invitation_id = $1", limited_invitation).await;
    let closed = post(&app, &link(invitation), &json!({ "action": "CLOSE" }), Some(&bearer), None).await;
    let after_close = post(&app, &register(&token_now), &dewi, None, None).await;
    f.remove().await;

    assert_eq!(opened.status, StatusCode::OK);
    assert_eq!(kept.body["token"], opened.body["token"], "open keeps an open link");
    assert_ne!(rotated.body["token"], opened.body["token"]);
    assert_eq!(foreign_link.status, StatusCode::NOT_FOUND);
    assert_eq!((received.status, received.body["status"].as_str()), (StatusCode::OK, Some("RECEIVED")));
    assert!(replayed.replayed);
    assert_eq!(duplicate.body, received.body, "a duplicate is answered like a new request");
    assert_eq!((invalid.status, invalid.body["reason"].as_str()), (StatusCode::UNPROCESSABLE_ENTITY, Some("seats")));
    assert_eq!(
        (stale.status, stale.body["code"].as_str()),
        (StatusCode::NOT_FOUND, Some("registration.link_not_found")),
        "a rotated link stops at once"
    );
    assert_eq!(in_draft.status, StatusCode::NOT_FOUND);
    assert_eq!(
        (in_expired.status, in_expired.body["code"].as_str()),
        (StatusCode::CONFLICT, Some("registration.closed"))
    );
    assert_eq!(pending, 1, "one request stored for Dewi: no replay, duplicate or refusal stored another");
    assert_eq!(foreign_decision.status, StatusCode::NOT_FOUND);
    assert_eq!(approved.body["status"], "APPROVED");
    assert!(
        approved_again.replayed && approved_again.body == approved.body,
        "a retried approval replays instead of answering 404"
    );
    assert_eq!(after_approval.len(), 1);
    assert_eq!(
        (
            after_approval[0]["name"].as_str(),
            after_approval[0]["seats"].as_i64(),
            after_approval[0]["category"].is_null()
        ),
        (Some("Dewi"), Some(2), true)
    );
    assert_eq!(eka.status, StatusCode::OK);
    assert_eq!(
        (duplicate_approval.status, duplicate_approval.body["code"].as_str()),
        (StatusCode::CONFLICT, Some("roster.duplicate"))
    );
    assert_eq!(
        (rejected.body["status"].as_str(), pending_after),
        (Some("REJECTED"), 0),
        "a rejected request is deleted"
    );
    let statuses: Vec<u16> = limited.iter().map(|answer| answer.status.as_u16()).collect();
    assert_eq!(statuses, vec![200, 200, 200, 429], "the per-link limit refuses the fourth in its window");
    assert!(limited[3].retry_after.is_some(), "a 429 says when to retry");
    assert_eq!(limited_pending, 3, "the refused registration wrote nothing");
    assert_eq!((closed.body["token"].clone(), after_close.status), (Value::Null, StatusCode::NOT_FOUND));
}
