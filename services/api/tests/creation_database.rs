//! B-037 (D-055) against a database migrated by drizzle-kit (`TEST_DATABASE_URL`): draft creation through the router,
//! signed as Next.js signs it, with owner tokens verified against a JWKS served by a local endpoint (keys made per run, no
//! Clerk credential). A creation writes the row and version 1 in one transaction for the verified owner; a retry or a
//! concurrent duplicate with the same key answers with the same draft; a taken slug gets the next number; refusals write
//! nothing; administrators and missing tokens are refused; a key is scoped to its owner. Fixture rows are fictional,
//! tagged per run and removed before the assertions. The same flows run through both writers against the binary in
//! `scripts/verify-creation-api.ts`.

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

const SECRET: &[u8] = b"creation-database-test-secret-0123456789";
const ISSUER: &str = "https://issuer.invalid";
const PATH: &str = "/v1/invitations";
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
    let jwks = json!({ "keys": [{ "kid": "creation-key", "kty": "RSA", "alg": "RS256",
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
    header.kid = Some("creation-key".into());
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

async fn post(app: &Router, body: &Value, bearer: Option<&str>) -> (StatusCode, Value) {
    let body = body.to_string();
    let mut request = Request::builder()
        .method(Method::POST)
        .uri(PATH)
        .header(header::CONTENT_TYPE, "application/json")
        .header(SIGNATURE_HEADER, sign(SECRET, unix_now(), "POST", PATH, body.as_bytes()));
    if let Some(bearer) = bearer {
        request = request.header(header::AUTHORIZATION, format!("Bearer {bearer}"));
    }
    let response = app.clone().oneshot(request.body(Body::from(body)).unwrap()).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn sage_config() -> Value {
    json!({
        "theme": { "templateId": 103, "paletteId": "sage" },
        "couple": { "bride": { "nickName": "Sari" }, "groom": { "nickName": "Budi" } },
        "events": [{ "id": "ev-3f9a2b1c4d", "title": "Resepsi", "startAt": "2027-02-14T10:00:00+07:00" }],
        "gift": { "personalOnly": true }
    })
}

fn request(template: Option<i32>, slug_base: &str, config: Value, key: &str) -> Value {
    json!({ "templateId": template, "eventType": "wedding", "slugBase": slug_base, "config": config, "creationKey": key })
}

struct Fixture {
    pool: PgPool,
    tag: String,
    users: Vec<i32>,
    templates: Vec<i32>,
}

impl Fixture {
    async fn new() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(16).connect(&url).await.expect("connect");
        Self {
            pool,
            tag: uuid::Uuid::new_v4().simple().to_string()[..12].to_string(),
            users: vec![],
            templates: vec![],
        }
    }

    async fn user(&mut self, label: &str, role: &str) -> (i32, String) {
        let sub = format!("user_creation_{label}_{}", self.tag);
        let id: i32 =
            sqlx::query_scalar("insert into users (email, clerk_user_id, role) values ($1, $2, $3) returning id")
                .bind(format!("creation-{label}-{}@example.invalid", self.tag))
                .bind(&sub)
                .bind(role)
                .fetch_one(&self.pool)
                .await
                .expect("fixture user");
        self.users.push(id);
        (id, sub)
    }

    /// A template row as `template-sync.ts` stores a catalog theme: its catalog id and palette in the defaults.
    async fn template(&mut self, catalog_id: i64, palette: &str, premium: bool) -> i32 {
        let id: i32 = sqlx::query_scalar(
            "insert into templates (name, category, is_premium, default_config) values ($1, 'wedding', $2, $3) returning id",
        )
        .bind(format!("creation-template-{catalog_id}-{}", self.tag))
        .bind(premium)
        .bind(json!({ "theme": { "templateId": catalog_id, "paletteId": palette } }))
        .fetch_one(&self.pool)
        .await
        .expect("fixture template");
        self.templates.push(id);
        id
    }

    fn slug(&self, label: &str) -> String {
        format!("creation-{label}-{}", self.tag)
    }

    /// Every draft of `owner`: id, slug, template, type, status, key and config, oldest first.
    async fn drafts(&self, owner: i32) -> Vec<(i32, String, Option<i32>, String, String, Option<String>, Value)> {
        sqlx::query_as(
            "select id, slug, template_id, event_type, status, creation_key, config from invitations \
             where user_id = $1 order by id",
        )
        .bind(owner)
        .fetch_all(&self.pool)
        .await
        .expect("drafts")
    }

    async fn versions(&self, invitation: i32) -> Vec<(i32, bool, Value)> {
        sqlx::query_as(
            "select version_no, is_live, config from invitation_versions where invitation_id = $1 order by version_no, id",
        )
        .bind(invitation)
        .fetch_all(&self.pool)
        .await
        .expect("versions")
    }

    async fn remove(&self) {
        sqlx::query(
            "delete from invitation_versions where invitation_id in (select id from invitations where user_id = any($1))",
        )
        .bind(&self.users)
        .execute(&self.pool)
        .await
        .unwrap();
        sqlx::query("delete from invitations where user_id = any($1)")
            .bind(&self.users)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from templates where id = any($1)")
            .bind(&self.templates)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = any($1)").bind(&self.users).execute(&self.pool).await.unwrap();
    }
}

#[tokio::test]
async fn a_creation_writes_the_draft_and_version_one_for_the_verified_owner() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let template = f.template(103, "sage", false).await;
    let app = app(&f.pool, &keys);
    let slug = f.slug("save");
    let key = uuid::Uuid::new_v4().to_string();

    let (status, body) =
        post(&app, &request(Some(template), &slug, sage_config(), &key), Some(&token(&keys, &sub))).await;
    let drafts = f.drafts(owner).await;
    let versions = match drafts.first() {
        Some(draft) => f.versions(draft.0).await,
        None => vec![],
    };
    f.remove().await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["slug"], slug);
    assert_eq!(body["version"], 1);
    assert_eq!(body["replayed"], false);
    assert_eq!(drafts.len(), 1);
    let (id, stored_slug, template_id, event_type, draft_status, creation_key, config) = &drafts[0];
    assert_eq!(body["invitationId"], *id);
    assert_eq!(stored_slug, &slug);
    assert_eq!(*template_id, Some(template), "the purchased row is the price anchor");
    assert_eq!(event_type, "wedding");
    assert_eq!(draft_status, "DRAFT");
    assert_eq!(creation_key.as_deref(), Some(key.as_str()));
    assert_eq!(config, &sage_config());
    assert_eq!(versions, vec![(1, true, sage_config())], "version 1, live, the same config");
}

#[tokio::test]
async fn a_retry_or_a_concurrent_duplicate_with_one_key_answers_with_one_draft() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let template = f.template(103, "sage", false).await;
    let app = app(&f.pool, &keys);
    let bearer = token(&keys, &sub);
    let key = uuid::Uuid::new_v4().to_string();
    let body = request(Some(template), &f.slug("retry"), sage_config(), &key);

    let first = post(&app, &body, Some(&bearer)).await;
    let retry = post(&app, &body, Some(&bearer)).await;
    let other_key = uuid::Uuid::new_v4().to_string();
    let concurrent = request(Some(template), &f.slug("race"), sage_config(), &other_key);
    let (a, b, c) = tokio::join!(
        post(&app, &concurrent, Some(&bearer)),
        post(&app, &concurrent, Some(&bearer)),
        post(&app, &concurrent, Some(&bearer))
    );
    let drafts = f.drafts(owner).await;
    let versions: usize = {
        let mut total = 0;
        for draft in &drafts {
            total += f.versions(draft.0).await.len();
        }
        total
    };
    f.remove().await;

    assert_eq!(first.0, StatusCode::OK, "{}", first.1);
    assert_eq!(retry.0, StatusCode::OK, "{}", retry.1);
    assert_eq!(retry.1["invitationId"], first.1["invitationId"]);
    assert_eq!(retry.1["replayed"], true);
    for answer in [&a, &b, &c] {
        assert_eq!(answer.0, StatusCode::OK, "{}", answer.1);
        assert_eq!(answer.1["invitationId"], a.1["invitationId"], "one draft for one key");
    }
    assert_eq!(
        [&a, &b, &c].iter().filter(|answer| answer.1["replayed"] == false).count(),
        1,
        "one creation, two replays"
    );
    assert_eq!(drafts.len(), 2, "two keys, two drafts");
    assert_eq!(versions, 2, "one version row per draft");
}

#[tokio::test]
async fn a_taken_slug_gets_the_next_number_and_keys_are_scoped_to_their_owner() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let (other, other_sub) = f.user("other", "CUSTOMER").await;
    let template = f.template(103, "sage", false).await;
    let app = app(&f.pool, &keys);
    let slug = f.slug("same");
    let shared_key = uuid::Uuid::new_v4().to_string();

    let first =
        post(&app, &request(Some(template), &slug, sage_config(), &shared_key), Some(&token(&keys, &sub))).await;
    let second = post(
        &app,
        &request(Some(template), &slug, sage_config(), &uuid::Uuid::new_v4().to_string()),
        Some(&token(&keys, &sub)),
    )
    .await;
    let theirs =
        post(&app, &request(Some(template), &slug, sage_config(), &shared_key), Some(&token(&keys, &other_sub))).await;
    let mine = f.drafts(owner).await;
    let others = f.drafts(other).await;
    f.remove().await;

    assert_eq!(first.1["slug"], slug);
    assert_eq!(second.1["slug"], format!("{slug}-2"));
    assert_eq!(theirs.0, StatusCode::OK, "{}", theirs.1);
    assert_eq!(theirs.1["replayed"], false, "another owner's key never replays this owner's draft");
    assert_eq!(theirs.1["slug"], format!("{slug}-3"));
    assert_eq!(mine.len(), 2);
    assert_eq!(others.len(), 1);
}

#[tokio::test]
async fn refusals_write_nothing() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let standard = f.template(103, "sage", false).await;
    let app = app(&f.pool, &keys);
    let bearer = token(&keys, &sub);
    let key = || uuid::Uuid::new_v4().to_string();

    let missing =
        post(&app, &request(Some(2_000_000_000), &f.slug("missing"), sage_config(), &key()), Some(&bearer)).await;
    let mut other_theme = sage_config();
    other_theme["theme"] = json!({ "templateId": 101, "paletteId": "ivory" });
    let mismatch = post(&app, &request(Some(standard), &f.slug("mismatch"), other_theme, &key()), Some(&bearer)).await;
    let mut premium_palette = sage_config();
    premium_palette["theme"]["paletteId"] = json!("orchid");
    let palette =
        post(&app, &request(Some(standard), &f.slug("palette"), premium_palette, &key()), Some(&bearer)).await;
    let mut protected = sage_config();
    protected["couple"]["bride"]["photoUrl"] = json!("/media/protected/7/0123456789abcdef01234567.png");
    let media = post(&app, &request(Some(standard), &f.slug("media"), protected, &key()), Some(&bearer)).await;
    let mut birthday = request(Some(standard), &f.slug("type"), sage_config(), &key());
    birthday["eventType"] = json!("birthday");
    let event_type = post(&app, &birthday, Some(&bearer)).await;
    let drafts = f.drafts(owner).await;
    f.remove().await;

    assert_eq!(
        (missing.0, missing.1["code"].clone()),
        (StatusCode::UNPROCESSABLE_ENTITY, json!("creation.template_missing"))
    );
    assert_eq!((mismatch.0, mismatch.1["code"].clone()), (StatusCode::UNPROCESSABLE_ENTITY, json!("creation.refused")));
    assert_eq!(mismatch.1["issues"], json!([{ "path": "theme.templateId", "reason": "template-mismatch" }]));
    assert_eq!(
        (palette.0, palette.1["code"].clone()),
        (StatusCode::UNPROCESSABLE_ENTITY, json!("content.theme_not_entitled"))
    );
    assert_eq!(palette.1["issues"], json!([{ "path": "theme.paletteId", "reason": "premium-palette" }]));
    assert_eq!((media.0, media.1["code"].clone()), (StatusCode::UNPROCESSABLE_ENTITY, json!("content.media_refused")));
    assert_eq!(event_type.1["issues"], json!([{ "path": "eventType", "reason": "event-type" }]));
    assert!(drafts.is_empty(), "nothing written");
}

#[tokio::test]
async fn administrators_missing_tokens_and_malformed_bodies_are_refused() {
    let keys = owner_keys().await;
    let mut f = Fixture::new().await;
    let (admin, admin_sub) = f.user("admin", "ADMIN").await;
    let (owner, sub) = f.user("owner", "CUSTOMER").await;
    let template = f.template(103, "sage", false).await;
    let app = app(&f.pool, &keys);
    let body = request(Some(template), &f.slug("roles"), sage_config(), &uuid::Uuid::new_v4().to_string());

    let as_admin = post(&app, &body, Some(&token(&keys, &admin_sub))).await;
    let anonymous = post(&app, &body, None).await;
    let mut bad_slug = body.clone();
    bad_slug["slugBase"] = json!("Budi & Sari");
    let malformed = post(&app, &bad_slug, Some(&token(&keys, &sub))).await;
    let mut spaced_key = body.clone();
    spaced_key["creationKey"] = json!("has space");
    let bad_key = post(&app, &spaced_key, Some(&token(&keys, &sub))).await;
    let drafts = [f.drafts(admin).await.len(), f.drafts(owner).await.len()];
    f.remove().await;

    assert_eq!((as_admin.0, as_admin.1["code"].clone()), (StatusCode::FORBIDDEN, json!("owner.role_not_allowed")));
    assert_eq!(anonymous.0, StatusCode::UNAUTHORIZED);
    assert_eq!(malformed.0, StatusCode::BAD_REQUEST);
    assert_eq!(bad_key.0, StatusCode::BAD_REQUEST);
    assert_eq!(drafts, [0, 0]);
}
