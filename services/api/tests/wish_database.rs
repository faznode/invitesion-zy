//! R-04 against a database migrated by drizzle-kit (`TEST_DATABASE_URL`): the guest's wish through the router, signed as
//! Next.js signs it. The rows it writes are the TypeScript writer's (the trimmed message, the guest's name, `is_hidden`
//! from the moderation switch, one GUESTBOOK analytics row); a key replays instead of writing twice, concurrent sends of
//! one form store one wish; limits refuse at their boundary and write nothing. The host's moderation and replies run
//! end to end with owner tokens in `scripts/verify-wishes-api.ts`.

use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use http_body_util::BodyExt;
use invitesion_api::limits::{Limit, Limits, ip_bucket};
use invitesion_api::service_auth::{SIGNATURE_HEADER, sign, unix_now};
use invitesion_api::{AppState, router};
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

const SECRET: &[u8] = b"wish-database-test-secret-0123456789abcd";

const ROOMY: Limits = Limits {
    rsvp_per_link: Limit { max: 1000, window_seconds: 600 },
    rsvp_per_ip: Limit { max: 1000, window_seconds: 600 },
    wish_per_link: Limit { max: 1000, window_seconds: 600 },
    wish_per_ip: Limit { max: 1000, window_seconds: 600 },
    registration_per_link: Limit { max: 1000, window_seconds: 600 },
    registration_per_ip: Limit { max: 1000, window_seconds: 600 },
};

/// Tests in this binary run in parallel and share the limiter table, so each uses its own addresses and removes only
/// its own rows, buckets and idempotency scopes.
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

    async fn invitation(&mut self, name: &str, status: &str, config: Value) -> String {
        if self.users.is_empty() {
            let id: i32 = sqlx::query_scalar(
                "insert into users (email, clerk_user_id, role) values ($1, $2, 'CUSTOMER') returning id",
            )
            .bind(format!("wish-{}@example.invalid", self.tag))
            .bind(format!("user_wish_{}", self.tag))
            .fetch_one(&self.pool)
            .await
            .expect("fixture user");
            self.users.push(id);
        }
        let slug = format!("wish-{name}-{}", self.tag);
        let id: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type, status, config) values ($1, $2, 'wedding', $3, $4) returning id",
        )
        .bind(self.users[0])
        .bind(&slug)
        .bind(status)
        .bind(config)
        .fetch_one(&self.pool)
        .await
        .expect("fixture invitation");
        self.invitations.push(id);
        slug
    }

    /// A guest of the invitation named by `slug`; the link segment is the guest's slug.
    async fn guest(&mut self, slug: &str, name: &str) -> (i32, String) {
        let segment = format!("{name}-{}", self.tag);
        let id = sqlx::query_scalar(
            "insert into guests (invitation_id, name, slug) select id, $2, $3 from invitations where slug = $1 returning id",
        )
        .bind(slug)
        .bind(format!("{name} (fiktif)"))
        .bind(&segment)
        .fetch_one(&self.pool)
        .await
        .expect("fixture guest");
        self.guests.push(id);
        (id, segment)
    }

    async fn wishes(&self, guest: i32) -> Vec<Value> {
        sqlx::query_scalar(
            "select json_build_object('name', name, 'message', message, 'hidden', is_hidden, \
             'reviewed', reviewed_at is not null, 'reply', host_reply) from guest_messages where guest_id = $1 order by id",
        )
        .bind(guest)
        .fetch_all(&self.pool)
        .await
        .expect("wishes")
    }

    async fn guestbook_events(&self, guest: i32) -> Vec<Option<Value>> {
        sqlx::query_scalar(
            "select meta from analytics_events where guest_id = $1 and event_type = 'GUESTBOOK' order by id",
        )
        .bind(guest)
        .fetch_all(&self.pool)
        .await
        .expect("guestbook events")
    }

    async fn remove(&self) -> i64 {
        for statement in [
            "delete from analytics_events where invitation_id = any($1)",
            "delete from guest_messages where invitation_id = any($1)",
            "delete from guests where invitation_id = any($1)",
        ] {
            sqlx::query(statement).bind(&self.invitations).execute(&self.pool).await.unwrap();
        }
        sqlx::query("delete from invitations where id = any($1)")
            .bind(&self.invitations)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = any($1)").bind(&self.users).execute(&self.pool).await.unwrap();
        let buckets: Vec<String> = self
            .guests
            .iter()
            .map(|id| format!("wish:link:{id}"))
            .chain(self.addresses.iter().map(|address| ip_bucket(SECRET, "wish", address)))
            .collect();
        let scopes: Vec<String> = self.guests.iter().map(|id| format!("wish:guest:{id}")).collect();
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

fn app(pool: &PgPool, limits: Limits) -> Router {
    router(AppState {
        pool: pool.clone(),
        service_secrets: Arc::new(vec![SECRET.to_vec()]),
        guest_pass_secrets: Arc::new(Vec::new()),
        owner: None,
        limits,
    })
}

struct Answer {
    status: StatusCode,
    body: Value,
    retry_after: Option<String>,
    replayed: bool,
}

async fn send(app: &Router, slug: &str, segment: &str, body: Value, key: Option<&str>) -> Answer {
    let path = format!("/v1/guest-links/{slug}/{segment}/wishes");
    let body = body.to_string();
    let mut request = Request::builder()
        .method(Method::POST)
        .uri(&path)
        .header(header::CONTENT_TYPE, "application/json")
        .header(SIGNATURE_HEADER, sign(SECRET, unix_now(), "POST", &path, body.as_bytes()));
    if let Some(key) = key {
        request = request.header("idempotency-key", key);
    }
    let response = app.clone().oneshot(request.body(Body::from(body)).unwrap()).await.unwrap();
    let status = response.status();
    let retry_after = response.headers().get(header::RETRY_AFTER).map(|v| v.to_str().unwrap().to_string());
    let replayed = response.headers().get("idempotent-replayed").is_some();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    Answer { status, body: serde_json::from_slice(&bytes).unwrap_or(Value::Null), retry_after, replayed }
}

const SHAPES_ADDRESS: &str = "198.51.100.41";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn guest_wishes_write_the_typescript_writers_rows() {
    let mut f = Fixture::new(&[SHAPES_ADDRESS]).await;
    let open = f.invitation("open", "PUBLISHED", json!({ "guestbook": { "enabled": true } })).await;
    let moderated = f.invitation("moderated", "PUBLISHED", json!({ "guestbook": { "moderation": true } })).await;
    let off = f.invitation("off", "PUBLISHED", json!({ "guestbook": { "enabled": false } })).await;
    let draft = f.invitation("draft", "DRAFT", json!({})).await;
    let expired = f.invitation("expired", "EXPIRED", json!({})).await;
    let (budi, budi_link) = f.guest(&open, "budi").await;
    let (sari, sari_link) = f.guest(&moderated, "sari").await;
    let (_, off_link) = f.guest(&off, "tono").await;
    let (_, draft_link) = f.guest(&draft, "dewi").await;
    let (_, expired_link) = f.guest(&expired, "eko").await;
    let app = app(&f.pool, ROOMY);
    let body = |message: &str| json!({ "message": message, "clientIp": SHAPES_ADDRESS });

    let saved = send(&app, &open, &budi_link, body("  Selamat ya!\n"), None).await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.body);
    assert_eq!(saved.body["state"], "VISIBLE");
    assert_eq!(
        f.wishes(budi).await,
        vec![
            json!({ "name": "budi (fiktif)", "message": "Selamat ya!", "hidden": false, "reviewed": false, "reply": null })
        ]
    );
    assert_eq!(f.guestbook_events(budi).await, vec![None], "one GUESTBOOK row without meta, as the TypeScript writer");

    let pending = send(&app, &moderated, &sari_link, body("Semoga sakinah"), None).await;
    assert_eq!((pending.status, pending.body["state"].clone()), (StatusCode::OK, json!("PENDING")));
    assert_eq!(f.wishes(sari).await[0]["hidden"], true, "a moderated guestbook stores the wish hidden and unreviewed");
    assert_eq!(f.wishes(sari).await[0]["reviewed"], false);

    let refusals = [
        (send(&app, &off, &off_link, body("Halo"), None).await, StatusCode::CONFLICT, "wish.closed", Some("disabled")),
        (
            send(&app, &open, &budi_link, body(" \u{a0}\u{feff} "), None).await,
            StatusCode::UNPROCESSABLE_ENTITY,
            "wish.message_invalid",
            None,
        ),
        (
            send(&app, &open, &budi_link, body(&"a".repeat(1001)), None).await,
            StatusCode::UNPROCESSABLE_ENTITY,
            "wish.message_invalid",
            None,
        ),
        (
            send(&app, &open, &budi_link, body("Halo\u{0}"), None).await,
            StatusCode::UNPROCESSABLE_ENTITY,
            "wish.message_invalid",
            None,
        ),
        (send(&app, &draft, &draft_link, body("Halo"), None).await, StatusCode::NOT_FOUND, "wish.link_not_found", None),
        (
            send(&app, &expired, &expired_link, body("Halo"), None).await,
            StatusCode::CONFLICT,
            "wish.closed",
            Some("expired"),
        ),
        (
            send(&app, &open, "no-such-guest", body("Halo"), None).await,
            StatusCode::NOT_FOUND,
            "wish.link_not_found",
            None,
        ),
    ];
    for (answer, status, code, detail) in refusals {
        assert_eq!((answer.status, answer.body["code"].as_str()), (status, Some(code)), "{}", answer.body);
        assert_eq!(answer.body["detail"].as_str(), detail);
    }
    assert_eq!(f.wishes(budi).await.len(), 1, "no refusal wrote a wish");
    assert_eq!(f.guestbook_events(budi).await.len(), 1, "or an analytics row");

    let unknown_field = send(&app, &open, &budi_link, json!({ "message": "x", "name": "Spoofed" }), None).await;
    assert_eq!(
        (unknown_field.status, unknown_field.body["code"].as_str()),
        (StatusCode::BAD_REQUEST, Some("request.invalid_body"))
    );
    assert_eq!(f.remove().await, 0);
}

const REPLAY_ADDRESS: &str = "198.51.100.42";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn one_form_stores_one_wish_however_often_it_is_sent() {
    let mut f = Fixture::new(&[REPLAY_ADDRESS]).await;
    let slug = f.invitation("replay", "PUBLISHED", json!({})).await;
    let (guest, link) = f.guest(&slug, "rina").await;
    let app = app(&f.pool, ROOMY);
    let body = json!({ "message": "Bahagia selalu", "clientIp": REPLAY_ADDRESS });
    let key = format!("wish-{}", f.tag);

    let first = send(&app, &slug, &link, body.clone(), Some(&key)).await;
    let again = send(&app, &slug, &link, body.clone(), Some(&key)).await;
    assert_eq!((first.status, again.status), (StatusCode::OK, StatusCode::OK));
    assert!(!first.replayed && again.replayed, "the second send replays");
    assert_eq!(first.body, again.body, "with the stored wish's id");
    let changed =
        send(&app, &slug, &link, json!({ "message": "Lain lagi", "clientIp": REPLAY_ADDRESS }), Some(&key)).await;
    assert_eq!(
        (changed.status, changed.body["code"].as_str()),
        (StatusCode::UNPROCESSABLE_ENTITY, Some("idempotency.key_reused"))
    );
    assert_eq!(f.wishes(guest).await.len(), 1);

    let twin_key = format!("wish-twins-{}", f.tag);
    let twins =
        futures_like_join(&app, &slug, &link, json!({ "message": "Kembar", "clientIp": REPLAY_ADDRESS }), &twin_key, 6)
            .await;
    assert!(twins.iter().all(|answer| answer.status == StatusCode::OK), "every twin answers 200");
    let ids: std::collections::HashSet<String> = twins.iter().map(|answer| answer.body["id"].to_string()).collect();
    assert_eq!(ids.len(), 1, "all twins name one wish");
    assert_eq!(f.wishes(guest).await.len(), 2, "six concurrent sends of one form store one wish");
    assert_eq!(f.guestbook_events(guest).await.len(), 2, "and one analytics row");
    assert_eq!(f.remove().await, 0);
}

async fn futures_like_join(app: &Router, slug: &str, link: &str, body: Value, key: &str, n: usize) -> Vec<Answer> {
    let handles: Vec<_> = (0..n)
        .map(|_| {
            let (app, slug, link, body, key) =
                (app.clone(), slug.to_string(), link.to_string(), body.clone(), key.to_string());
            tokio::spawn(async move { send(&app, &slug, &link, body, Some(&key)).await })
        })
        .collect();
    let mut answers = Vec::new();
    for handle in handles {
        answers.push(handle.await.unwrap());
    }
    answers
}

const LIMIT_ADDRESS: &str = "198.51.100.43";

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn limits_refuse_at_their_boundary_and_write_nothing() {
    let mut f = Fixture::new(&[LIMIT_ADDRESS]).await;
    let slug = f.invitation("limits", "PUBLISHED", json!({})).await;
    let (first, first_link) = f.guest(&slug, "ani").await;
    let (second, second_link) = f.guest(&slug, "bayu").await;
    let tight = Limits {
        wish_per_link: Limit { max: 2, window_seconds: 600 },
        wish_per_ip: Limit { max: 3, window_seconds: 600 },
        ..ROOMY
    };
    let app = app(&f.pool, tight);
    let body = |n: usize| json!({ "message": format!("Ucapan {n}"), "clientIp": LIMIT_ADDRESS });

    let link_answers = [
        send(&app, &slug, &first_link, body(1), None).await,
        send(&app, &slug, &first_link, body(2), None).await,
        send(&app, &slug, &first_link, body(3), None).await,
    ];
    assert_eq!(link_answers.iter().map(|a| a.status.as_u16()).collect::<Vec<_>>(), vec![200, 200, 429]);
    assert_eq!(link_answers[2].body["code"], "rate_limit.exceeded");
    let retry: u64 = link_answers[2].retry_after.as_deref().unwrap().parse().unwrap();
    assert!((1..=600).contains(&retry), "Retry-After is inside the window: {retry}");
    assert_eq!(f.wishes(first).await.len(), 2, "the refused wish wrote nothing");

    // The link bucket refuses before the address bucket is hit, so the address has counted two hits: a second guest
    // behind the same address gets one more wish (the third hit) and is refused at the fourth.
    let address_answers =
        [send(&app, &slug, &second_link, body(4), None).await, send(&app, &slug, &second_link, body(5), None).await];
    assert_eq!(address_answers.iter().map(|a| a.status.as_u16()).collect::<Vec<_>>(), vec![200, 429]);
    assert_eq!(address_answers[1].body["code"], "rate_limit.exceeded");
    assert_eq!(f.wishes(second).await.len(), 1, "the refused wish wrote nothing");
    let (third, third_link) = f.guest(&slug, "citra").await;
    let other_network = send(&app, &slug, &third_link, json!({ "message": "Dari jaringan lain" }), None).await;
    assert_eq!(other_network.status, StatusCode::OK, "without an address only the link limit applies");
    assert_eq!(f.wishes(third).await.len(), 1);
    let stored: Vec<String> = sqlx::query_scalar("select bucket from api_rate_limits where bucket = $1")
        .bind(ip_bucket(SECRET, "wish", LIMIT_ADDRESS))
        .fetch_all(&f.pool)
        .await
        .unwrap();
    assert_eq!(stored.len(), 1, "one bucket for the address");
    assert!(
        stored.iter().all(|bucket| !bucket.contains(LIMIT_ADDRESS)),
        "the table holds a keyed hash, never the address"
    );
    assert_eq!(f.remove().await, 0);
}
