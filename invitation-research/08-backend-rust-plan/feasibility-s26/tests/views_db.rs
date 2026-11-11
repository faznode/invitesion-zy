//! The B-017a contract on a real database migrated through 0015 (TEST_DATABASE_URL), mirroring
//! `scripts/verify-view-dedupe.ts`: concurrent first opens, repeats inside the window, an open after it, concurrent
//! anonymous opens, independent guests, the shared vectors, and the HTTP edge. Fixture rows are fictional and
//! removed before the assertions run.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use invitesion_api_feasibility::http::{AppState, VIEWS_PATH, router};
use invitesion_api_feasibility::service_auth::{self, SIGNATURE_HEADER};
use invitesion_api_feasibility::views::{
    VIEW_DEDUPE_WINDOW, VIEW_LOCK_NAMESPACE, record_invitation_view, utc_now, view_lock_key,
};
use serde_json::Value;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use time::Duration;
use tower::ServiceExt;

const CONCURRENCY: usize = 20;
const SECRET: &[u8] = b"feasibility-test-secret";

/// Both writers must take the same advisory lock and window, or a transition with both deployed would not serialise.
/// Read from the TypeScript source itself so drift on either side fails here.
#[test]
fn lock_key_and_window_match_the_typescript_writer() {
    let source = include_str!("../../../../lib/invitation/view-tracking.ts");
    let hex = source
        .split("VIEW_LOCK_NAMESPACE = 0x")
        .nth(1)
        .and_then(|rest| rest.split(';').next())
        .expect("VIEW_LOCK_NAMESPACE in view-tracking.ts");
    assert_eq!(i64::from(VIEW_LOCK_NAMESPACE), i64::from_str_radix(hex.trim(), 16).unwrap());
    assert!(source.contains("VIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000"), "TypeScript window changed");
    assert_eq!(VIEW_DEDUPE_WINDOW, Duration::minutes(30));
    assert!(source.contains("return guestId ? guestId : -invitationId;"), "TypeScript lock key rule changed");
    assert_eq!(view_lock_key(7, Some(3)), 3);
    assert_eq!(view_lock_key(7, None), -7);
}

async fn views(pool: &PgPool, invitation: i32, guest: Option<i32>) -> i64 {
    match guest {
        Some(id) => sqlx::query_scalar(
            "select count(*) from analytics_events where invitation_id = $1 and guest_id = $2 and event_type = 'VIEW'",
        )
        .bind(invitation)
        .bind(id),
        None => sqlx::query_scalar(
            "select count(*) from analytics_events where invitation_id = $1 and guest_id is null and event_type = 'VIEW'",
        )
        .bind(invitation),
    }
    .fetch_one(pool)
    .await
    .expect("count views")
}

async fn opened(pool: &PgPool, guest: i32) -> i32 {
    sqlx::query_scalar("select opened_count from guests where id = $1").bind(guest).fetch_one(pool).await.expect("opened_count")
}

async fn concurrent_opens(pool: &PgPool, invitation: i32, guest: Option<i32>, at: time::PrimitiveDateTime) -> usize {
    let mut tasks = Vec::new();
    for _ in 0..CONCURRENCY {
        let pool = pool.clone();
        tasks.push(tokio::spawn(async move { record_invitation_view(&pool, invitation, guest, at).await.expect("open") }));
    }
    let mut written = 0;
    for task in tasks {
        if task.await.expect("join") {
            written += 1;
        }
    }
    written
}

async fn signed_post(app: axum::Router, body: String) -> (StatusCode, Value) {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
    let signature = service_auth::sign(SECRET, now, "POST", VIEWS_PATH, body.as_bytes());
    let request = Request::post(VIEWS_PATH)
        .header(header::CONTENT_TYPE, "application/json")
        .header(SIGNATURE_HEADER, signature)
        .body(Body::from(body))
        .unwrap();
    let response = app.oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

#[derive(Debug, Default)]
struct Observed {
    concurrent_written: usize,
    concurrent_rows: i64,
    concurrent_opened: i32,
    repeat_written: bool,
    repeat_rows: i64,
    after_window_written: bool,
    after_window_rows: i64,
    after_window_opened: i32,
    anonymous_written: usize,
    anonymous_rows: i64,
    other_guest_written: bool,
    vector_results: Vec<(i64, bool, bool)>,
    vector_opened: i32,
    http_first: (u16, Value),
    http_repeat: (u16, Value),
    http_missing_guest: (u16, Value),
    leftover_rows: i64,
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn the_b017a_contract_holds_on_the_real_schema() {
    let url = std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated through 0015");
    let pool = PgPoolOptions::new().max_connections(12).connect(&url).await.expect("connect");
    let tag = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();

    let user: i32 = sqlx::query_scalar("insert into users (email) values ($1) returning id")
        .bind(format!("feasibility-{tag}@example.invalid"))
        .fetch_one(&pool)
        .await
        .expect("fixture user");
    let invitation: i32 =
        sqlx::query_scalar("insert into invitations (user_id, slug, event_type) values ($1, $2, 'wedding') returning id")
            .bind(user)
            .bind(format!("feasibility-{tag}"))
            .fetch_one(&pool)
            .await
            .expect("fixture invitation");
    let mut guests = Vec::new();
    for (name, slug) in [("Budi Feasibility", "budi"), ("Sari Feasibility", "sari"), ("Rina Feasibility", "rina"), ("Dodi Feasibility", "dodi")] {
        let id: i32 = sqlx::query_scalar("insert into guests (invitation_id, name, slug) values ($1, $2, $3) returning id")
            .bind(invitation)
            .bind(name)
            .bind(format!("{slug}-{tag}"))
            .fetch_one(&pool)
            .await
            .expect("fixture guest");
        guests.push(id);
    }
    let (guest_a, guest_b, guest_c, guest_d) = (guests[0], guests[1], guests[2], guests[3]);
    let t0 = utc_now() - Duration::days(1);
    let mut seen = Observed::default();

    seen.concurrent_written = concurrent_opens(&pool, invitation, Some(guest_a), t0).await;
    seen.concurrent_rows = views(&pool, invitation, Some(guest_a)).await;
    seen.concurrent_opened = opened(&pool, guest_a).await;

    seen.repeat_written = record_invitation_view(&pool, invitation, Some(guest_a), t0 + Duration::minutes(5)).await.unwrap();
    seen.repeat_rows = views(&pool, invitation, Some(guest_a)).await;

    seen.after_window_written =
        record_invitation_view(&pool, invitation, Some(guest_a), t0 + Duration::minutes(31)).await.unwrap();
    seen.after_window_rows = views(&pool, invitation, Some(guest_a)).await;
    seen.after_window_opened = opened(&pool, guest_a).await;

    seen.anonymous_written = concurrent_opens(&pool, invitation, None, t0).await;
    seen.anonymous_rows = views(&pool, invitation, None).await;

    seen.other_guest_written = record_invitation_view(&pool, invitation, Some(guest_b), t0).await.unwrap();

    let vectors: Value = serde_json::from_str(include_str!("../vectors/view-dedupe.json")).unwrap();
    for open in vectors["opens"].as_array().unwrap() {
        let minute = open["atMinute"].as_i64().unwrap();
        let written = record_invitation_view(&pool, invitation, Some(guest_c), t0 + Duration::minutes(minute)).await.unwrap();
        seen.vector_results.push((minute, open["recorded"].as_bool().unwrap(), written));
    }
    seen.vector_opened = opened(&pool, guest_c).await;

    let app = router(AppState { pool: pool.clone(), service_secret: Arc::new(SECRET.to_vec()) });
    let body = format!(r#"{{"invitationId":{invitation},"guestId":{guest_d}}}"#);
    let (status, value) = signed_post(app.clone(), body.clone()).await;
    seen.http_first = (status.as_u16(), value);
    let (status, value) = signed_post(app.clone(), body).await;
    seen.http_repeat = (status.as_u16(), value);
    let (status, value) = signed_post(app, format!(r#"{{"invitationId":{invitation},"guestId":2147480000}}"#)).await;
    seen.http_missing_guest = (status.as_u16(), value);

    for statement in [
        "delete from analytics_events where invitation_id = $1",
        "delete from guests where invitation_id = $1",
        "delete from invitations where id = $1",
    ] {
        sqlx::query(statement).bind(invitation).execute(&pool).await.expect("cleanup");
    }
    sqlx::query("delete from users where id = $1").bind(user).execute(&pool).await.expect("cleanup user");
    seen.leftover_rows = sqlx::query_scalar::<_, i64>("select count(*) from analytics_events where invitation_id = $1")
        .bind(invitation)
        .fetch_one(&pool)
        .await
        .unwrap();
    println!("{seen:#?}");

    assert_eq!(seen.concurrent_written, 1, "{CONCURRENCY} concurrent first opens: exactly one call writes");
    assert_eq!(seen.concurrent_rows, 1, "one VIEW row after the concurrent opens");
    assert_eq!(seen.concurrent_opened, 1, "opened_count rises by one");
    assert!(!seen.repeat_written && seen.repeat_rows == 1, "a repeat inside the window writes nothing");
    assert!(seen.after_window_written && seen.after_window_rows == 2 && seen.after_window_opened == 2, "after the window");
    assert_eq!((seen.anonymous_written, seen.anonymous_rows), (1, 1), "concurrent anonymous opens write one row");
    assert!(seen.other_guest_written, "another guest is independent");
    for (minute, expected, written) in &seen.vector_results {
        assert_eq!(expected, written, "vector at minute {minute}");
    }
    assert_eq!(seen.vector_opened as i64, vectors["finalOpenedCount"].as_i64().unwrap());
    assert_eq!(seen.http_first, (200, serde_json::json!({ "recorded": true })));
    assert_eq!(seen.http_repeat, (200, serde_json::json!({ "recorded": false })));
    assert_eq!(seen.http_missing_guest.0, 404);
    assert_eq!(seen.http_missing_guest.1["code"], "invitation_or_guest.not_found");
    assert_eq!(seen.leftover_rows, 0, "fixture removed");
}
