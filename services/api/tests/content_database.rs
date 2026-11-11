//! B-035 against a database migrated by drizzle-kit (`TEST_DATABASE_URL`): the content endpoint through the router,
//! signed as Next.js signs it, with owner tokens verified against a JWKS served by a local endpoint (keys made per run, no
//! Clerk credential). A save writes the config, moves the live flag and adds the next version in one transaction; a stale
//! base is refused and writes nothing; two saves from one version store one; a retry under one key replays, also when it
//! waited for its own first attempt's lock; another owner, an administrator and a missing token are refused; references
//! (D-040) and the theme (B-041, with B-036's switch within the tier) are judged on the locked row. Fixture rows are
//! fictional, tagged per run and removed before the assertions. The same flows run through both writers against the
//! binary in `scripts/verify-content-api.ts`.

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

const SECRET: &[u8] = b"content-database-test-secret-0123456789";
const ISSUER: &str = "https://issuer.invalid";
const LIMITS: Limits = Limits {
    rsvp_per_link: Limit { max: 1000, window_seconds: 600 },
    rsvp_per_ip: Limit { max: 1000, window_seconds: 600 },
    wish_per_link: Limit { max: 1000, window_seconds: 600 },
    wish_per_ip: Limit { max: 1000, window_seconds: 600 },
    registration_per_link: Limit { max: 1000, window_seconds: 600 },
    registration_per_ip: Limit { max: 1000, window_seconds: 600 },
};
const PROTECTED: &str = "/media/protected/{id}/0123456789abcdef01234567.png";

struct Keys {
    encoding: EncodingKey,
    verifier: Arc<OwnerVerifier>,
}

async fn owner_keys() -> Keys {
    install_crypto_provider();
    let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
    let encoding = EncodingKey::from_rsa_der(private.to_pkcs1_der().unwrap().as_bytes());
    let jwks = json!({ "keys": [{ "kid": "content-key", "kty": "RSA", "alg": "RS256",
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
    header.kid = Some("content-key".into());
    let now = unix_now();
    encode(&header, &json!({ "sub": sub, "iss": ISSUER, "exp": now + 300, "nbf": now - 1 }), &keys.encoding).unwrap()
}

fn app(pool: &PgPool, keys: &Keys) -> Router {
    router(AppState {
        pool: pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner: Some(keys.verifier.clone()),
        limits: LIMITS,
    })
}

struct Answer {
    status: StatusCode,
    body: Value,
    replayed: bool,
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
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    Answer { status, body: serde_json::from_slice(&bytes).unwrap_or(Value::Null), replayed }
}

fn save(base_version: i32, config: Value, touched: &[&str]) -> Value {
    json!({ "baseVersion": base_version, "config": config, "touchedSections": touched })
}

fn path(invitation: i32) -> String {
    format!("/v1/invitations/{invitation}/content")
}

/// Per-test rows: customers, an administrator, invitations (with creation's version 1 unless asked otherwise), templates
/// and orders.
struct Fixture {
    pool: PgPool,
    tag: String,
    users: Vec<i32>,
    invitations: Vec<i32>,
    templates: Vec<i32>,
}

impl Fixture {
    async fn new() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(16).connect(&url).await.expect("connect");
        Self {
            pool,
            tag: uuid::Uuid::new_v4().simple().to_string(),
            users: vec![],
            invitations: vec![],
            templates: vec![],
        }
    }

    async fn user(&mut self, label: &str, role: &str) -> (i32, String) {
        let sub = format!("user_content_{label}_{}", self.tag);
        let id: i32 =
            sqlx::query_scalar("insert into users (email, clerk_user_id, role) values ($1, $2, $3) returning id")
                .bind(format!("content-{label}-{}@example.invalid", self.tag))
                .bind(&sub)
                .bind(role)
                .fetch_one(&self.pool)
                .await
                .expect("fixture user");
        self.users.push(id);
        (id, sub)
    }

    async fn invitation(
        &mut self,
        owner: i32,
        label: &str,
        event_type: &str,
        template: Option<i32>,
        config: Value,
        with_version: bool,
    ) -> i32 {
        let id: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, template_id, slug, event_type, status, config) \
             values ($1, $2, $3, $4, 'DRAFT', $5) returning id",
        )
        .bind(owner)
        .bind(template)
        .bind(format!("content-{label}-{}", self.tag))
        .bind(event_type)
        .bind(&config)
        .fetch_one(&self.pool)
        .await
        .expect("fixture invitation");
        if with_version {
            sqlx::query(
                "insert into invitation_versions (invitation_id, version_no, config, created_by, is_live) \
                 values ($1, 1, $2, 'customer', true)",
            )
            .bind(id)
            .bind(&config)
            .execute(&self.pool)
            .await
            .expect("fixture version");
        }
        self.invitations.push(id);
        id
    }

    async fn template(&mut self, premium: bool) -> i32 {
        let id: i32 = sqlx::query_scalar(
            "insert into templates (name, category, is_premium) values ($1, 'wedding', $2) returning id",
        )
        .bind(format!("content-template-{}", self.tag))
        .bind(premium)
        .fetch_one(&self.pool)
        .await
        .expect("fixture template");
        self.templates.push(id);
        id
    }

    async fn paid_premium_order(&self, owner: i32, invitation: i32) {
        sqlx::query(
            "insert into orders (user_id, invitation_id, tier, amount, status, rail, reference) \
             values ($1, $2, 'premium', 1, 'PAID', 'qris', $3)",
        )
        .bind(owner)
        .bind(invitation)
        .bind(format!("content-order-{}-{invitation}", self.tag))
        .execute(&self.pool)
        .await
        .expect("fixture order");
    }

    /// The stored config, every version number with its live flag, and the live count.
    async fn state(&self, invitation: i32) -> (Value, Vec<(i32, bool)>) {
        let config: Option<Value> = sqlx::query_scalar("select config from invitations where id = $1")
            .bind(invitation)
            .fetch_one(&self.pool)
            .await
            .expect("config");
        let versions: Vec<(i32, bool)> = sqlx::query_as(
            "select version_no, is_live from invitation_versions where invitation_id = $1 order by version_no, id",
        )
        .bind(invitation)
        .fetch_all(&self.pool)
        .await
        .expect("versions");
        (config.unwrap_or(Value::Null), versions)
    }

    async fn version_config(&self, invitation: i32, version: i32) -> Value {
        sqlx::query_scalar("select config from invitation_versions where invitation_id = $1 and version_no = $2")
            .bind(invitation)
            .bind(version)
            .fetch_one(&self.pool)
            .await
            .expect("version config")
    }

    async fn remove(&self) {
        for statement in [
            "delete from orders where invitation_id = any($1)",
            "delete from invitation_versions where invitation_id = any($1)",
            "delete from invitations where id = any($1)",
        ] {
            sqlx::query(statement).bind(&self.invitations).execute(&self.pool).await.unwrap();
        }
        sqlx::query("delete from templates where id = any($1)")
            .bind(&self.templates)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = any($1)").bind(&self.users).execute(&self.pool).await.unwrap();
        let scopes: Vec<String> = self.users.iter().map(|id| format!("content:{id}:%")).collect();
        sqlx::query("delete from api_idempotency_keys where scope like any($1)")
            .bind(&scopes)
            .execute(&self.pool)
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn a_save_writes_the_next_version_and_a_stale_base_writes_nothing() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let invitation = f.invitation(owner, "save", "wedding", None, json!({ "quote": { "enabled": false } }), true).await;
    let app = app(&f.pool, &keys);
    let bearer = token(&keys, &sub);

    let first = post(
        &app,
        &path(invitation),
        &save(1, json!({ "quote": { "enabled": true, "text": "Satu" } }), &["quote"]),
        Some(&bearer),
        None,
    )
    .await;
    let after_first = f.state(invitation).await;
    let stale = post(
        &app,
        &path(invitation),
        &save(1, json!({ "quote": { "enabled": true, "text": "Basi" } }), &["quote"]),
        Some(&bearer),
        None,
    )
    .await;
    let after_stale = f.state(invitation).await;
    let second = post(
        &app,
        &path(invitation),
        &save(2, json!({ "quote": { "enabled": true, "text": "Dua" } }), &["quote"]),
        Some(&bearer),
        None,
    )
    .await;
    let after_second = f.state(invitation).await;
    let version_three = f.version_config(invitation, 3).await;
    f.remove().await;

    assert_eq!((first.status, first.body.clone()), (StatusCode::OK, json!({ "version": 2 })));
    assert_eq!(after_first.0, json!({ "quote": { "enabled": true, "text": "Satu" } }));
    assert_eq!(after_first.1, vec![(1, false), (2, true)], "the next version is the only live one");
    assert_eq!(stale.status, StatusCode::CONFLICT);
    assert_eq!(stale.body["code"], "content.version_conflict");
    assert_eq!(stale.body["currentVersion"], 2);
    assert_eq!(after_stale, after_first, "a stale base writes nothing");
    assert_eq!(second.body, json!({ "version": 3 }));
    assert_eq!(after_second.1, vec![(1, false), (2, false), (3, true)]);
    assert_eq!(version_three, after_second.0, "the version row holds the stored config");
}

#[tokio::test]
async fn an_invitation_without_a_version_row_starts_at_one() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("legacy", "CUSTOMER").await;
    let invitation = f.invitation(owner, "legacy", "wedding", None, json!({}), false).await;
    let app = app(&f.pool, &keys);
    let saved = post(
        &app,
        &path(invitation),
        &save(0, json!({ "quote": { "enabled": true } }), &["quote"]),
        Some(&token(&keys, &sub)),
        None,
    )
    .await;
    let state = f.state(invitation).await;
    f.remove().await;
    assert_eq!(saved.body, json!({ "version": 1 }));
    assert_eq!(state.1, vec![(1, true)]);
}

#[tokio::test]
async fn two_saves_from_one_version_store_exactly_one() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("race", "CUSTOMER").await;
    let invitation = f.invitation(owner, "race", "wedding", None, json!({}), true).await;
    let app = app(&f.pool, &keys);
    let bearer = token(&keys, &sub);
    let tab_a = save(1, json!({ "quote": { "enabled": true, "text": "Tab A" } }), &["quote"]);
    let tab_b = save(1, json!({ "quote": { "enabled": true, "text": "Tab B" } }), &["quote"]);
    let target = path(invitation);
    let (a, b) = tokio::join!(
        post(&app, &target, &tab_a, Some(&bearer), Some("tab-a")),
        post(&app, &target, &tab_b, Some(&bearer), Some("tab-b")),
    );
    let state = f.state(invitation).await;
    f.remove().await;

    let mut statuses = [a.status, b.status];
    statuses.sort();
    assert_eq!(statuses, [StatusCode::OK, StatusCode::CONFLICT], "one save stores, the other is refused");
    let (winner, loser) = if a.status == StatusCode::OK { (&tab_a, &b) } else { (&tab_b, &a) };
    assert_eq!(loser.body["currentVersion"], 2);
    assert_eq!(state.0, winner["config"], "the stored config is the winner's, whole");
    assert_eq!(state.1, vec![(1, false), (2, true)]);
}

#[tokio::test]
async fn a_retry_under_one_key_replays_even_after_waiting_for_its_first_attempt() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("retry", "CUSTOMER").await;
    let invitation = f.invitation(owner, "retry", "wedding", None, json!({}), true).await;
    let app = app(&f.pool, &keys);
    let bearer = token(&keys, &sub);
    let request = save(1, json!({ "quote": { "enabled": true, "text": "Sekali" } }), &["quote"]);

    // Both attempts arrive while another transaction holds the row: both pass the first replay check and queue on the lock.
    let mut holder = f.pool.begin().await.unwrap();
    sqlx::query("select id from invitations where id = $1 for update")
        .bind(invitation)
        .execute(&mut *holder)
        .await
        .unwrap();
    let first = tokio::spawn({
        let (app, path, request, bearer) = (app.clone(), path(invitation), request.clone(), bearer.clone());
        async move { post(&app, &path, &request, Some(&bearer), Some("retry-key")).await }
    });
    let second = tokio::spawn({
        let (app, path, request, bearer) = (app.clone(), path(invitation), request.clone(), bearer.clone());
        async move { post(&app, &path, &request, Some(&bearer), Some("retry-key")).await }
    });
    tokio::time::sleep(StdDuration::from_millis(400)).await;
    holder.rollback().await.unwrap();
    let (first, second) = (first.await.unwrap(), second.await.unwrap());
    let replay_later = post(&app, &path(invitation), &request, Some(&bearer), Some("retry-key")).await;
    let reused = post(
        &app,
        &path(invitation),
        &save(1, json!({ "quote": { "enabled": false } }), &["quote"]),
        Some(&bearer),
        Some("retry-key"),
    )
    .await;
    let state = f.state(invitation).await;
    f.remove().await;

    for answer in [&first, &second, &replay_later] {
        assert_eq!((answer.status, answer.body.clone()), (StatusCode::OK, json!({ "version": 2 })));
    }
    assert_eq!(u8::from(first.replayed) + u8::from(second.replayed), 1, "exactly one attempt wrote");
    assert!(replay_later.replayed);
    assert_eq!(state.1, vec![(1, false), (2, true)], "one write for three requests under one key");
    assert_eq!(reused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(reused.body["code"], "idempotency.key_reused");
}

#[tokio::test]
async fn another_owner_an_administrator_and_a_missing_token_are_refused() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, _owner_sub) = f.user("mine", "CUSTOMER").await;
    let (_other, other_sub) = f.user("other", "CUSTOMER").await;
    let (_admin, admin_sub) = f.user("admin", "ADMIN").await;
    let invitation =
        f.invitation(owner, "tenant", "wedding", None, json!({ "quote": { "enabled": false } }), true).await;
    let app = app(&f.pool, &keys);
    let body = save(1, json!({ "quote": { "enabled": true, "text": "Bukan milikmu" } }), &["quote"]);
    let other = post(&app, &path(invitation), &body, Some(&token(&keys, &other_sub)), Some("tenant")).await;
    let admin = post(&app, &path(invitation), &body, Some(&token(&keys, &admin_sub)), None).await;
    let anonymous = post(&app, &path(invitation), &body, None, None).await;
    let missing = post(&app, &path(i32::MAX), &body, Some(&token(&keys, &other_sub)), None).await;
    let state = f.state(invitation).await;
    f.remove().await;

    assert_eq!((other.status, other.body["code"].clone()), (StatusCode::NOT_FOUND, json!("content.not_found")));
    assert_eq!(missing.body["code"], other.body["code"], "another owner's invitation looks like no invitation");
    assert_eq!((admin.status, admin.body["code"].clone()), (StatusCode::FORBIDDEN, json!("owner.role_not_allowed")));
    assert_eq!(anonymous.status, StatusCode::UNAUTHORIZED);
    assert_eq!(state.0, json!({ "quote": { "enabled": false } }));
    assert_eq!(state.1, vec![(1, true)], "nothing was written");
}

#[tokio::test]
async fn references_and_the_theme_are_judged_on_the_locked_row() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("rules", "CUSTOMER").await;
    let standard =
        f.invitation(owner, "standard", "wedding", None, json!({ "theme": { "paletteId": "sage" } }), true).await;
    let birthday = f.invitation(owner, "birthday", "birthday", None, json!({}), true).await;
    let premium_template = f.template(true).await;
    let by_template = f.invitation(owner, "premium-theme", "wedding", Some(premium_template), json!({}), true).await;
    let by_order = f.invitation(owner, "premium-order", "wedding", None, json!({}), true).await;
    f.paid_premium_order(owner, by_order).await;
    // B-036: catalog ids (103 Sage Garden and 107 Sand Minimal free, 102 Rose Gold Romance premium, 106 Orchid Monogram
    // premium on the Premium palette orchid), never `templates` row ids.
    let switcher_config =
        json!({ "theme": { "templateId": 107, "paletteId": "sand" }, "quote": { "enabled": true, "text": "Tetap" } });
    let switcher =
        f.invitation(owner, "switch", "wedding", Some(premium_template), switcher_config.clone(), true).await;
    let standard_switcher = f.invitation(owner, "switch-std", "wedding", None, switcher_config.clone(), true).await;
    let app = app(&f.pool, &keys);
    let bearer = token(&keys, &sub);
    let protected = |id: i32| PROTECTED.replace("{id}", &id.to_string());

    let public_field = post(
        &app,
        &path(standard),
        &save(
            1,
            json!({ "theme": { "paletteId": "sage" }, "couple": { "bride": { "photoUrl": protected(standard) } } }),
            &["couple"],
        ),
        Some(&bearer),
        None,
    )
    .await;
    let untouched = post(&app, &path(standard), &save(1, json!({ "theme": { "paletteId": "sage" }, "couple": { "bride": { "photoUrl": protected(standard) } }, "quote": { "enabled": true } }), &["quote"]), Some(&bearer), None).await;
    let premium_palette = post(
        &app,
        &path(standard),
        &save(2, json!({ "theme": { "paletteId": "midnight" } }), &["theme"]),
        Some(&bearer),
        None,
    )
    .await;
    let unknown_palette = post(
        &app,
        &path(standard),
        &save(2, json!({ "theme": { "paletteId": "neon", "templateId": 99 } }), &["theme"]),
        Some(&bearer),
        None,
    )
    .await;
    let own_child = post(
        &app,
        &path(birthday),
        &save(1, json!({ "birthdayPerson": { "photoUrl": protected(birthday) } }), &["birthdayPerson"]),
        Some(&bearer),
        None,
    )
    .await;
    let other_child = post(
        &app,
        &path(birthday),
        &save(2, json!({ "birthdayPerson": { "photoUrl": protected(standard) } }), &["birthdayPerson"]),
        Some(&bearer),
        None,
    )
    .await;
    let template_tier = post(
        &app,
        &path(by_template),
        &save(1, json!({ "theme": { "paletteId": "midnight" } }), &["theme"]),
        Some(&bearer),
        None,
    )
    .await;
    let order_tier = post(
        &app,
        &path(by_order),
        &save(1, json!({ "theme": { "paletteId": "gold-noir" } }), &["theme"]),
        Some(&bearer),
        None,
    )
    .await;
    let with_theme = |template: i32, palette: &str| json!({ "theme": { "templateId": template, "paletteId": palette }, "quote": { "enabled": true, "text": "Tetap" } });
    let standard_switch =
        post(&app, &path(standard_switcher), &save(1, with_theme(103, "sage"), &["theme"]), Some(&bearer), None).await;
    let premium_refused =
        post(&app, &path(standard_switcher), &save(2, with_theme(102, "rose-gold"), &["theme"]), Some(&bearer), None)
            .await;
    let both_refused =
        post(&app, &path(standard_switcher), &save(2, with_theme(106, "orchid"), &["theme"]), Some(&bearer), None)
            .await;
    let premium_switch =
        post(&app, &path(switcher), &save(1, with_theme(106, "orchid"), &["theme"]), Some(&bearer), None).await;
    let order_switch = post(
        &app,
        &path(by_order),
        &save(2, json!({ "theme": { "templateId": 102, "paletteId": "gold-noir" } }), &["theme"]),
        Some(&bearer),
        None,
    )
    .await;
    let standard_state = f.state(standard).await;
    let switched_state = f.state(standard_switcher).await;
    let purchased: Vec<(i32, Option<i32>)> =
        sqlx::query_as("select id, template_id from invitations where id = any($1) order by id")
            .bind(vec![standard_switcher, switcher])
            .fetch_all(&f.pool)
            .await
            .expect("purchased themes");
    f.remove().await;

    assert_eq!(public_field.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(public_field.body["code"], "content.media_refused");
    assert_eq!(
        public_field.body["issues"],
        json!([{ "path": "couple.bride.photoUrl", "reason": "protected-outside-child-photo" }])
    );
    assert_eq!(untouched.body, json!({ "version": 2 }), "a section the save did not send is not judged");
    assert_eq!(premium_palette.body["code"], "content.theme_not_entitled");
    assert_eq!(premium_palette.body["issues"], json!([{ "path": "theme.paletteId", "reason": "premium-palette" }]));
    assert_eq!(
        unknown_palette.body["issues"],
        json!([{ "path": "theme.templateId", "reason": "unknown-template" }, { "path": "theme.paletteId", "reason": "unknown-palette" }])
    );
    assert_eq!(standard_state.1.len(), 2, "refusals wrote nothing");
    assert_eq!(own_child.body, json!({ "version": 2 }));
    assert_eq!(
        other_child.body["issues"],
        json!([{ "path": "birthdayPerson.photoUrl", "reason": "not-this-invitation" }])
    );
    assert_eq!(template_tier.body, json!({ "version": 2 }), "a Premium purchased theme entitles a Premium palette");
    assert_eq!(order_tier.body, json!({ "version": 2 }), "a PAID Premium order entitles a Premium palette");

    // B-036 (D-054): a switch within the tier is a content save; above it, an upgrade is needed.
    assert_eq!(standard_switch.body, json!({ "version": 2 }), "a Standard invitation switches to a Standard theme");
    assert_eq!(premium_refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(premium_refused.body["code"], "content.theme_not_entitled");
    assert_eq!(premium_refused.body["issues"], json!([{ "path": "theme.templateId", "reason": "premium-template" }]));
    assert_eq!(
        both_refused.body["issues"],
        json!([{ "path": "theme.templateId", "reason": "premium-template" }, { "path": "theme.paletteId", "reason": "premium-palette" }])
    );
    assert_eq!(switched_state.0, with_theme(103, "sage"), "the switch stored the theme and kept the content");
    assert_eq!(switched_state.1, vec![(1, false), (2, true)], "refused switches wrote nothing");
    assert_eq!(premium_switch.body, json!({ "version": 2 }), "a Premium purchased theme may switch to a Premium theme");
    assert_eq!(order_switch.body, json!({ "version": 3 }), "a PAID Premium order may switch to a Premium theme");
    let mut expected = vec![(standard_switcher, None), (switcher, Some(premium_template))];
    expected.sort();
    assert_eq!(purchased, expected, "a switch never writes invitations.template_id");
}

#[tokio::test]
async fn malformed_saves_are_bad_requests() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("bad", "CUSTOMER").await;
    let invitation = f.invitation(owner, "bad", "wedding", None, json!({}), true).await;
    let app = app(&f.pool, &keys);
    let bearer = token(&keys, &sub);
    let not_object = post(
        &app,
        &path(invitation),
        &json!({ "baseVersion": 1, "config": [1], "touchedSections": [] }),
        Some(&bearer),
        None,
    )
    .await;
    let negative = post(&app, &path(invitation), &save(-1, json!({}), &[]), Some(&bearer), None).await;
    let unknown_field = post(
        &app,
        &path(invitation),
        &json!({ "baseVersion": 1, "config": {}, "touchedSections": [], "force": true }),
        Some(&bearer),
        None,
    )
    .await;
    let state = f.state(invitation).await;
    f.remove().await;
    for answer in [&not_object, &negative, &unknown_field] {
        assert_eq!(answer.status, StatusCode::BAD_REQUEST, "{}", answer.body);
    }
    assert_eq!(state.1, vec![(1, true)]);
}
