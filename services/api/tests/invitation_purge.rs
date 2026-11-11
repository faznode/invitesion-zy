//! B-031 (D-063) on a real database migrated by drizzle-kit (`TEST_DATABASE_URL`) and both storage drivers. The shared
//! vectors (`contracts/vectors/invitation-purge.json`, also run by `tests/b031-retention.test.ts`); the local driver's
//! prefix listing and idempotent delete; then one sequential scenario (the runner claims any due job, so the database
//! steps share one test): the `invitation_purge` job on a populated invitation — dry run while live, not due, a restore
//! before the purge, a restore holding the row lock while the purge waits, the purge through the runner, exactly which
//! rows and objects remain (a key another invitation uses kept, another invitation untouched, accounting kept), a
//! duplicate delivery, the dry run afterwards — object deletions retried through the S3 driver against a stand-in that
//! verifies every signature and pages its listings, and the retention sweep. Fictional rows tagged per run; objects in
//! temporary directories removed at the end.

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, Method, StatusCode, Uri};
use axum::response::IntoResponse;
use axum::routing::any;
use invitesion_api::config::install_crypto_provider;
use invitesion_api::jobs::{Job, Outcome, run_due};
use invitesion_api::media::IMAGE_VARIANTS_JOB;
use invitesion_api::retention::{
    PURGE_JOB_KIND, PURGE_MAX_ATTEMPTS, PURGED_TABLES, RetentionConfig, js_instant, owns_key, parse_days,
    parse_js_instant, plan_purge, purge_job_for, run_invitation_purge, sweep_retention, to_millis,
};
use invitesion_api::storage::sigv4::{SignInput, sha256_hex, sign_request};
use invitesion_api::storage::{LocalStorage, S3Config, S3Storage, Storage};
use invitesion_api::views::utc_now;
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use sqlx::{AssertSqlSafe, PgPool};
use time::{Date, Duration, Month, OffsetDateTime, PrimitiveDateTime, Time};

#[test]
fn the_shared_vectors_hold_in_rust() {
    let vectors: Value =
        serde_json::from_str(include_str!("../../../contracts/vectors/invitation-purge.json")).unwrap();
    let days = vectors["days"].as_array().unwrap();
    assert!(days.len() >= 10);
    for case in days {
        assert_eq!(
            parse_days(case["raw"].as_str(), case["min"].as_i64().unwrap()),
            case["expected"].as_i64(),
            "{case}"
        );
    }
    for case in vectors["jobs"].as_array().unwrap() {
        let id = i32::try_from(case["invitationId"].as_i64().unwrap()).unwrap();
        let deleted_at = parse_js_instant(case["deletedAt"].as_str().unwrap()).unwrap();
        let purge_after = deleted_at + Duration::days(case["windowDays"].as_i64().unwrap());
        assert_eq!(js_instant(purge_after), case["purgeAfter"].as_str().unwrap());
        let job = purge_job_for(id, deleted_at, purge_after);
        assert_eq!(job.payload, case["payload"], "{case}");
        assert_eq!(job.dedupe_key, case["dedupeKey"].as_str().unwrap());
        assert_eq!(job.run_at, purge_after);
    }
    for case in vectors["ownership"].as_array().unwrap() {
        let id = i32::try_from(case["invitationId"].as_i64().unwrap()).unwrap();
        assert_eq!(owns_key(id, case["key"].as_str().unwrap()), case["owned"].as_bool().unwrap(), "{case}");
    }
    let only_window = |name: &str| (name == "INVITATION_DELETION_WINDOW_DAYS").then(|| " 30 ".to_string());
    assert_eq!(
        RetentionConfig::from_lookup(&only_window),
        RetentionConfig { window_days: Some(30), retention_days_after_expiry: None }
    );
    assert_eq!(RetentionConfig::from_lookup(&|_| None), RetentionConfig::default(), "nothing is decided by default");
}

#[tokio::test]
async fn local_storage_lists_and_deletes_within_a_prefix() {
    let root = std::env::temp_dir().join(format!("invitesion-b031-local-{}", uuid::Uuid::new_v4().simple()));
    let local = LocalStorage::new(&root);
    for key in ["12/a.jpg", "12/b.jpg", "variants/12/a/lite-320.webp", "123/c.jpg", "1/d.jpg"] {
        local.put(key, b"x").await.unwrap();
    }
    std::fs::write(root.join("12/.b.jpg.0123.tmp"), b"half").unwrap();
    let outside = root.with_extension("outside");
    std::fs::write(&outside, b"not ours").unwrap();
    std::os::unix::fs::symlink(&outside, root.join("12/link.jpg")).unwrap();

    assert_eq!(local.list("12/").await.unwrap(), ["12/.b.jpg.0123.tmp", "12/a.jpg", "12/b.jpg"], "no symlink, no 123/");
    assert_eq!(local.list("variants/12/").await.unwrap(), ["variants/12/a/lite-320.webp"]);
    assert!(local.list("99/").await.unwrap().is_empty(), "a missing prefix lists nothing");
    assert!(local.list("12").await.is_err(), "a prefix ends with a slash");
    assert!(local.list("../").await.is_err(), "and stays inside the root");

    local.delete("12/a.jpg").await.unwrap();
    local.delete("12/a.jpg").await.expect("deleting a missing object succeeds");
    assert_eq!(local.get("12/a.jpg").await.unwrap(), None);
    assert!(local.delete("../x").await.is_err());
    assert_eq!(std::fs::read(&outside).unwrap(), b"not ours");
    std::fs::remove_dir_all(&root).unwrap();
    std::fs::remove_file(&outside).unwrap();
}

struct Fixture {
    pool: PgPool,
    tag: String,
    users: Vec<i32>,
    invitations: Vec<i32>,
    root: PathBuf,
}

impl Fixture {
    async fn create() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(8).connect(&url).await.expect("connect");
        let tag = uuid::Uuid::new_v4().simple().to_string();
        let root = std::env::temp_dir().join(format!("invitesion-b031-{tag}"));
        std::fs::create_dir_all(&root).unwrap();
        Self { pool, tag, users: Vec::new(), invitations: Vec::new(), root }
    }

    async fn user(&mut self, name: &str) -> i32 {
        let id: i32 = sqlx::query_scalar("insert into users (email, clerk_user_id) values ($1, $2) returning id")
            .bind(format!("b031-{name}-{}@example.invalid", self.tag))
            .bind(format!("user_b031_{name}_{}", self.tag))
            .fetch_one(&self.pool)
            .await
            .unwrap();
        self.users.push(id);
        id
    }

    async fn invitation(&mut self, owner: i32, name: &str, expires_at: Option<PrimitiveDateTime>) -> i32 {
        let id: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type, status, expires_at) \
             values ($1, $2, 'wedding', 'PUBLISHED', $3) returning id",
        )
        .bind(owner)
        .bind(format!("b031-{name}-{}", self.tag))
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await
        .unwrap();
        self.invitations.push(id);
        id
    }

    /// `<invitation>/<24 hex>.<ext>`, the shape `invitationMediaKey` writes, unique per run.
    fn key(&self, prefix: &str, n: u8, ext: &str) -> String {
        format!("{prefix}/{}{n:02x}.{ext}", &self.tag[..22])
    }

    async fn exec(&self, sql: &'static str, binds: &[Value]) {
        let mut query = sqlx::query(sql);
        for bind in binds {
            query = match bind {
                Value::Number(n) => query.bind(n.as_i64().map(|v| i32::try_from(v).unwrap())),
                Value::String(s) => query.bind(s.clone()),
                other => query.bind(other.clone()),
            };
        }
        query.execute(&self.pool).await.unwrap_or_else(|e| panic!("{sql}: {e}"));
    }

    async fn scalar(&self, sql: &'static str, id: i32) -> i64 {
        sqlx::query_scalar(sql).bind(id).fetch_one(&self.pool).await.unwrap_or_else(|e| panic!("{sql}: {e}"))
    }

    async fn counts(&self, invitation: i32) -> BTreeMap<&'static str, i64> {
        let mut counts = BTreeMap::new();
        for &table in PURGED_TABLES {
            let n: i64 =
                sqlx::query_scalar(AssertSqlSafe(format!("select count(*) from {table} where invitation_id = $1")))
                    .bind(invitation)
                    .fetch_one(&self.pool)
                    .await
                    .unwrap();
            counts.insert(table, n);
        }
        counts
    }

    fn write(&self, key: &str) {
        let path = self.root.join(key);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"bytes").unwrap();
    }

    fn exists(&self, key: &str) -> bool {
        self.root.join(key).exists()
    }

    /// What `scheduleInvitationDeletion` writes in one transaction: the deletion and its job.
    async fn schedule(&self, invitation: i32, deleted_at: PrimitiveDateTime, window_days: i64) -> i64 {
        let purge_after = deleted_at + Duration::days(window_days);
        let mut tx = self.pool.begin().await.unwrap();
        let changed = sqlx::query(
            "update invitations set deleted_at = $2, purge_after = $3 where id = $1 and deleted_at is null",
        )
        .bind(invitation)
        .bind(deleted_at)
        .bind(purge_after)
        .execute(&mut *tx)
        .await
        .unwrap();
        assert_eq!(changed.rows_affected(), 1);
        let job = purge_job_for(invitation, deleted_at, purge_after);
        let id: i64 = sqlx::query_scalar(
            "insert into jobs (kind, payload, dedupe_key, run_at, max_attempts) values ($1, $2, $3, $4, $5) returning id",
        )
        .bind(PURGE_JOB_KIND)
        .bind(&job.payload)
        .bind(&job.dedupe_key)
        .bind(job.run_at)
        .bind(PURGE_MAX_ATTEMPTS)
        .fetch_one(&mut *tx)
        .await
        .unwrap();
        tx.commit().await.unwrap();
        id
    }

    async fn restore(&self, invitation: i32) {
        sqlx::query("update invitations set deleted_at = null, purge_after = null where id = $1 and purged_at is null")
            .bind(invitation)
            .execute(&self.pool)
            .await
            .unwrap();
    }

    async fn job(&self, id: i64) -> Job {
        let (kind, payload, attempts, max_attempts): (String, Value, i32, i32) =
            sqlx::query_as("select kind, payload, attempts, max_attempts from jobs where id = $1")
                .bind(id)
                .fetch_one(&self.pool)
                .await
                .unwrap();
        Job { id, kind, payload, attempts, max_attempts }
    }

    async fn run(&self, storage: &Storage, id: i64, now: PrimitiveDateTime) -> Outcome {
        run_invitation_purge(&self.pool, storage, &self.job(id).await, now).await
    }

    async fn cleanup(&self) {
        let ids = &self.invitations;
        for &table in PURGED_TABLES {
            sqlx::query(AssertSqlSafe(format!("delete from {table} where invitation_id = any($1)")))
                .bind(ids)
                .execute(&self.pool)
                .await
                .unwrap();
        }
        for sql in [
            "delete from payment_events where order_id in (select id from orders where invitation_id = any($1))",
            "delete from payments where order_id in (select id from orders where invitation_id = any($1))",
            "delete from orders where invitation_id = any($1)",
            "delete from customer_session_summary where invitation_id = any($1)",
            "delete from messages where conversation_id in (select id from conversations where invitation_id = any($1))",
            "delete from conversations where invitation_id = any($1)",
            "delete from workspace_credit_entries where invitation_id = any($1)",
            "delete from jobs where kind = 'invitation_purge' and (payload->>'invitationId')::int = any($1)",
            "delete from invitations where id = any($1)",
        ] {
            sqlx::query(sql).bind(ids).execute(&self.pool).await.unwrap_or_else(|e| panic!("{sql}: {e}"));
        }
        sqlx::query("delete from workspaces where owner_user_id = any($1)")
            .bind(&self.users)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from api_idempotency_keys where key like $1")
            .bind(format!("b031-{}%", self.tag))
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = any($1)").bind(&self.users).execute(&self.pool).await.unwrap();
        let _ = std::fs::remove_dir_all(&self.root);
    }
}

#[tokio::test]
async fn the_purge_and_the_sweep_on_a_real_database() {
    install_crypto_provider();
    let mut f = Fixture::create().await;
    let owner = f.user("owner").await;
    let doomed = f.invitation(owner, "doomed", None).await;
    // G-052 (D-067): a client's name on the invitation is cleared with its content.
    sqlx::query("update invitations set client_label = 'Klien Fiktif' where id = $1")
        .bind(doomed)
        .execute(&f.pool)
        .await
        .unwrap();
    let sharing = f.invitation(owner, "sharing", None).await;
    let bystander_owner = f.user("bystander").await;
    let bystander = f.invitation(bystander_owner, "bystander", None).await;

    // ── Storage: the doomed invitation's uploads (one referenced, one orphaned, one another invitation also uses),
    //    a variant, a protected child photo; another invitation's upload and an avatar.
    let referenced = f.key(&doomed.to_string(), 1, "jpg");
    let orphan = f.key(&doomed.to_string(), 2, "jpg");
    let shared = f.key(&doomed.to_string(), 3, "jpg");
    let child = f.key(&format!("protected/{doomed}"), 4, "png");
    let variant = format!("variants/{doomed}/{}01/standard-640.webp", &f.tag[..22]);
    let sharing_own = f.key(&sharing.to_string(), 6, "jpg");
    let bystander_own = f.key(&bystander.to_string(), 5, "jpg");
    let avatar = f.key(&format!("avatars/{owner}"), 7, "jpg");
    for key in [&referenced, &orphan, &shared, &child, &variant, &sharing_own, &bystander_own, &avatar] {
        f.write(key);
    }
    let storage = Storage::Local(LocalStorage::new(&f.root));

    // ── Rows: one of everything the purge empties, replay records, a queued variant job, and accounting.
    let config = json!({ "gallery": [format!("/media/{referenced}"), format!("/media/{shared}")],
                         "couple": { "photo": format!("/media/{child}") } });
    f.exec("update invitations set config = $2 where id = $1", &[json!(doomed), config.clone()]).await;
    f.exec(
        "update invitations set config = $2 where id = $1",
        &[json!(sharing), json!({ "gallery": [format!("/media/{shared}"), format!("/media/{sharing_own}")] })],
    )
    .await;
    f.exec(
        "update invitations set config = $2 where id = $1",
        &[json!(bystander), json!({ "cover": format!("https://app.invitesion.test/media/{bystander_own}") })],
    )
    .await;
    let guest = |name: &str, slug: &str, invitation: i32| {
        let pool = f.pool.clone();
        let (name, slug) = (name.to_string(), format!("{slug}-{}", f.tag));
        async move {
            sqlx::query_scalar::<_, i32>(
                "insert into guests (invitation_id, name, slug) values ($1, $2, $3) returning id",
            )
            .bind(invitation)
            .bind(name)
            .bind(slug)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    let budi = guest("Budi Hartono", "budi", doomed).await;
    let sari = guest("Sari Wulandari", "sari", doomed).await;
    let other_guest = guest("Rina Kartika", "rina", sharing).await;
    let table: i32 =
        sqlx::query_scalar("insert into seating_tables (invitation_id, name) values ($1, 'Meja 1') returning id")
            .bind(doomed)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    let version: i32 = sqlx::query_scalar(
        "insert into invitation_versions (invitation_id, version_no, created_by, config) values ($1, 1, 'owner', $2) returning id",
    )
    .bind(doomed)
    .bind(&config)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    let (d, b, s, t, v, o) = (json!(doomed), json!(budi), json!(sari), json!(table), json!(version), json!(owner));
    let tag = json!(f.tag);
    f.exec(
        "insert into guest_messages (invitation_id, guest_id, name, message) values ($1, $2, 'Budi', 'Selamat!')",
        &[d.clone(), b.clone()],
    )
    .await;
    f.exec(
        "insert into analytics_events (invitation_id, guest_id, event_type) values ($1, $2, 'VIEW')",
        &[d.clone(), b.clone()],
    )
    .await;
    f.exec(
        "insert into guest_logs (guest_id, invitation_id, table_id) values ($1, $2, $3)",
        &[b.clone(), d.clone(), t],
    )
    .await;
    f.exec("insert into gift_logs (invitation_id, guest_id, giver_name, kind, request_key) values ($1, $2, 'Sari', 'envelope', $3)", &[d.clone(), s.clone(), tag.clone()]).await;
    f.exec(
        "insert into guest_registration_links (invitation_id, token) values ($1, $2)",
        &[d.clone(), json!(format!("reg{}", &f.tag[..29]))],
    )
    .await;
    f.exec("insert into guest_registrations (invitation_id, name) values ($1, 'Dewi')", std::slice::from_ref(&d)).await;
    f.exec("insert into invitation_members (invitation_id, role, label, token_hash, expires_at) values ($1, 'usher', 'Pintu', $2, now())", &[d.clone(), json!(format!("hash{}", f.tag))]).await;
    f.exec("insert into agent_tasks (invitation_id, version_id, type) values ($1, $2, 'design')", &[d.clone(), v])
        .await;
    f.exec("insert into wa_log (invitation_id, guest_id, direction) values ($1, $2, 'out')", &[d.clone(), b.clone()])
        .await;
    f.exec("insert into intake_session (invitation_id) values ($1)", std::slice::from_ref(&d)).await;
    f.exec(
        "insert into media_assets (invitation_id, type, url) values ($1, 'image', $2)",
        &[d.clone(), json!(format!("/media/{referenced}"))],
    )
    .await;
    f.exec(
        "insert into media_variants (invitation_id, source_key, variant_key, format, tier, width, height, bytes) \
         values ($1, $2, $3, 'webp', 'standard', 640, 427, 5)",
        &[d.clone(), json!(referenced), json!(variant)],
    )
    .await;
    for (scope, n) in [
        (format!("rsvp:guest:{budi}"), 1),
        (format!("wish:guest:{sari}"), 2),
        (format!("rsvp:host:{owner}:{doomed}:{budi}"), 3),
        (format!("roster:pass-checkins:{owner}:{doomed}:0"), 4),
        (format!("rsvp:guest:{other_guest}"), 5),
        (format!("rsvp:host:{owner}:{sharing}:{other_guest}"), 6),
    ] {
        f.exec(
            "insert into api_idempotency_keys (scope, key, request_hash, response_status, response_body, created_at) \
             values ($1, $2, 'h', 200, '{}', now())",
            &[json!(scope), json!(format!("b031-{}-{n}", f.tag))],
        )
        .await;
    }
    f.exec(
        "insert into jobs (kind, payload, dedupe_key) values ($1, $2, $3)",
        &[json!(IMAGE_VARIANTS_JOB), json!({ "key": referenced }), json!(referenced)],
    )
    .await;
    let order: i32 = sqlx::query_scalar(
        "insert into orders (user_id, invitation_id, amount, rail, reference) values ($1, $2, 149000, 'qris', $3) returning id",
    )
    .bind(owner)
    .bind(doomed)
    .bind(format!("ref-{}", f.tag))
    .fetch_one(&f.pool)
    .await
    .unwrap();
    f.exec("insert into payments (order_id, provider) values ($1, 'qris')", &[json!(order)]).await;
    f.exec(
        "insert into payment_events (rail, event_id, order_id) values ('qris', $1, $2)",
        &[json!(format!("ev-{}", f.tag)), json!(order)],
    )
    .await;
    let conversation: i32 =
        sqlx::query_scalar("insert into conversations (invitation_id, user_id) values ($1, $2) returning id")
            .bind(doomed)
            .bind(owner)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    f.exec(
        "insert into messages (conversation_id, sender_type, content) values ($1, 'customer', 'Halo')",
        &[json!(conversation)],
    )
    .await;
    f.exec(
        "insert into customer_session_summary (user_id, invitation_id, summary) values ($1, $2, 'ringkasan')",
        &[o, d],
    )
    .await;
    // G-052 (D-067): a workspace's credit entry for this invitation is a ledger row, kept like the orders.
    let workspace: i32 = sqlx::query_scalar(
        "insert into workspaces (name, owner_user_id, credit_balance) values ('Ruang B-031', $1, 1) returning id",
    )
    .bind(owner)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    sqlx::query(
        "insert into workspace_credit_entries (workspace_id, operation_key, kind, delta, balance_after, invitation_id) \
         values ($1, $2, 'grant', 1, 1, $3)",
    )
    .bind(workspace)
    .bind(format!("b031-{}", f.tag))
    .bind(doomed)
    .execute(&f.pool)
    .await
    .unwrap();

    let before = f.counts(doomed).await;
    assert!(before.values().all(|n| *n >= 1), "every purged table holds a fixture row: {before:?}");
    let sharing_before = f.counts(sharing).await;
    let bystander_before = f.counts(bystander).await;

    // ── 1. The dry run while live: counts and lists, changes nothing.
    let t0 = to_millis(utc_now());
    let plan = plan_purge(&f.pool, &storage, doomed, t0).await.unwrap().expect("known invitation");
    assert_eq!(plan.state, "live");
    assert_eq!(plan.rows.iter().map(|c| (c.table, c.rows)).collect::<BTreeMap<_, _>>(), before);
    assert_eq!(plan.idempotency_records, 4, "two guest scopes and two host scopes of this invitation only");
    assert_eq!(plan.variant_jobs, 1);
    let mut doomed_objects = vec![referenced.clone(), orphan.clone(), child.clone(), variant.clone()];
    doomed_objects.sort();
    assert_eq!(plan.objects, doomed_objects, "the orphan is found by listing; the shared key is not among them");
    assert_eq!(plan.kept_shared, std::slice::from_ref(&shared));
    assert!(plan.retained.iter().all(|c| c.rows == 1), "{:?}", plan.retained);
    assert_eq!(f.counts(doomed).await, before, "the dry run changed nothing");
    assert!(f.exists(&orphan));
    assert!(plan_purge(&f.pool, &storage, i32::MAX, t0).await.unwrap().is_none());

    // ── 2. Deleted; the job is not due before `purge_after` (a runner with a skewed clock changes nothing).
    let first = f.schedule(doomed, t0, 30).await;
    assert_eq!(
        f.run(&storage, first, t0 + Duration::days(30) - Duration::minutes(1)).await,
        Outcome::Retry("purge not due yet".into())
    );
    assert_eq!(f.counts(doomed).await, before);
    let scheduled = plan_purge(&f.pool, &storage, doomed, t0).await.unwrap().unwrap();
    assert_eq!(
        (scheduled.state, scheduled.purge_after.as_deref()),
        ("scheduled", Some(js_instant(t0 + Duration::days(30))).as_deref())
    );

    // ── 3. Restored in the window: the job finds a different `deleted_at` and finishes without touching anything.
    f.restore(doomed).await;
    assert_eq!(f.run(&storage, first, t0 + Duration::days(31)).await, Outcome::Done);
    assert_eq!(f.counts(doomed).await, before);
    assert!(f.exists(&referenced) && f.exists(&orphan));

    // ── 4. Deleted again; a restore that holds the row lock makes the purge wait, then wins.
    let second_at = t0 + Duration::seconds(5);
    let second = f.schedule(doomed, second_at, 30).await;
    let mut restoring = f.pool.begin().await.unwrap();
    sqlx::query("select id from invitations where id = $1 for update")
        .bind(doomed)
        .execute(&mut *restoring)
        .await
        .unwrap();
    let purge = {
        let (pool, root, job) = (f.pool.clone(), f.root.clone(), f.job(second).await);
        tokio::spawn(async move {
            run_invitation_purge(&pool, &Storage::Local(LocalStorage::new(root)), &job, second_at + Duration::days(31))
                .await
        })
    };
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    assert!(!purge.is_finished(), "the purge waits for the restore's row lock");
    sqlx::query("update invitations set deleted_at = null, purge_after = null where id = $1")
        .bind(doomed)
        .execute(&mut *restoring)
        .await
        .unwrap();
    restoring.commit().await.unwrap();
    assert_eq!(purge.await.unwrap(), Outcome::Done);
    assert_eq!(f.counts(doomed).await, before, "the restore won the race");

    // ── 5. Deleted a third time and purged through the runner. Every due job of this test is claimed in one pass:
    //       the variant job (stops: invitation deleted), the two superseded purges, and the purge.
    let third_at = t0 + Duration::seconds(10);
    let third = f.schedule(doomed, third_at, 30).await;
    let due = third_at + Duration::days(30) + Duration::minutes(1);
    let foreign: i64 = sqlx::query_scalar(
        "select count(*) from jobs where done_at is null and attempts < max_attempts and run_at <= $1 \
         and (locked_until is null or locked_until <= $1) and not (id = any($2)) \
         and not (kind = $3 and dedupe_key = $4)",
    )
    .bind(due)
    .bind(vec![first, second, third])
    .bind(IMAGE_VARIANTS_JOB)
    .bind(&referenced)
    .fetch_one(&f.pool)
    .await
    .unwrap();
    let summary = run_due(&f.pool, &storage, due, 50).await.expect("runner pass");
    if foreign == 0 {
        assert_eq!((summary.claimed, summary.done, summary.retried, summary.gave_up), (4, 4, 0, 0), "{summary:?}");
    }

    let after = f.counts(doomed).await;
    assert!(after.values().all(|n| *n == 0), "every purged table is empty for the invitation: {after:?}");
    let replays: Vec<String> =
        sqlx::query_scalar("select scope from api_idempotency_keys where key like $1 order by key")
            .bind(format!("b031-{}%", f.tag))
            .fetch_all(&f.pool)
            .await
            .unwrap();
    assert_eq!(replays, [format!("rsvp:guest:{other_guest}"), format!("rsvp:host:{owner}:{sharing}:{other_guest}")]);
    assert_eq!(
        f.scalar(
            "select count(*) from jobs where kind = 'image-variants' and dedupe_key like (($1)::text || '/%')",
            doomed
        )
        .await,
        0
    );
    let (slug, stored, deleted, purged): (String, Option<Value>, Option<PrimitiveDateTime>, Option<PrimitiveDateTime>) =
        sqlx::query_as("select slug, config, deleted_at, purged_at from invitations where id = $1")
            .bind(doomed)
            .fetch_one(&f.pool)
            .await
            .unwrap();
    assert_eq!(slug, format!("b031-doomed-{}", f.tag), "the tombstone keeps the slug reserved");
    assert_eq!((stored, deleted, purged), (None, Some(third_at), Some(due)));
    let client_label: Option<String> = sqlx::query_scalar("select client_label from invitations where id = $1")
        .bind(doomed)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert_eq!(client_label, None, "the purge clears the client's name with the content");
    let job = f.job(third).await;
    assert_eq!(job.payload["objects"], json!(doomed_objects));
    assert_eq!(job.payload["keptShared"], json!([shared]));
    let done: Option<PrimitiveDateTime> =
        sqlx::query_scalar("select done_at from jobs where id = $1").bind(third).fetch_one(&f.pool).await.unwrap();
    assert_eq!(done, Some(due));
    for (table, sql) in [
        ("orders", "select count(*) from orders where invitation_id = $1"),
        ("payments", "select count(*) from payments p join orders o on o.id = p.order_id where o.invitation_id = $1"),
        (
            "payment_events",
            "select count(*) from payment_events e join orders o on o.id = e.order_id where o.invitation_id = $1",
        ),
        ("conversations", "select count(*) from conversations where invitation_id = $1"),
        (
            "messages",
            "select count(*) from messages m join conversations c on c.id = m.conversation_id where c.invitation_id = $1",
        ),
        ("customer_session_summary", "select count(*) from customer_session_summary where invitation_id = $1"),
        ("workspace_credit_entries", "select count(*) from workspace_credit_entries where invitation_id = $1"),
    ] {
        assert_eq!(f.scalar(sql, doomed).await, 1, "{table} is kept");
    }
    for key in &doomed_objects {
        assert!(!f.exists(key), "{key} deleted");
    }
    for key in [&shared, &sharing_own, &bystander_own, &avatar] {
        assert!(f.exists(key), "{key} kept");
    }
    assert_eq!(f.counts(sharing).await, sharing_before, "the invitation sharing a key is untouched");
    assert_eq!(f.counts(bystander).await, bystander_before);

    // ── 6. At least once: a second delivery of the purge (with or without its recorded objects) changes nothing.
    assert_eq!(f.run(&storage, third, due + Duration::hours(1)).await, Outcome::Done);
    let mut original = f.job(third).await;
    original.payload = json!({ "invitationId": doomed, "deletedAt": js_instant(third_at) });
    assert_eq!(run_invitation_purge(&f.pool, &storage, &original, due + Duration::hours(1)).await, Outcome::Done);
    original.payload = json!({ "invitationId": doomed });
    assert!(matches!(run_invitation_purge(&f.pool, &storage, &original, due).await, Outcome::GiveUp(_)));
    let afterwards = plan_purge(&f.pool, &storage, doomed, due).await.unwrap().unwrap();
    assert_eq!(afterwards.state, "purged");
    assert!(afterwards.rows.iter().all(|c| c.rows == 0) && afterwards.objects.is_empty());
    assert_eq!(afterwards.kept_shared, std::slice::from_ref(&shared));

    // ── 7. Object deletions retried through the S3 driver (a stand-in that checks every signature and pages listings).
    let endpoint = StandIn::start().await;
    let s3 = |secret: &str| {
        Storage::S3(S3Storage::new(S3Config {
            bucket: "invitesion-media".into(),
            region: "ap-southeast-1".into(),
            access_key_id: "AKIDEXAMPLE".into(),
            secret_access_key: secret.into(),
            session_token: None,
            endpoint: Some(endpoint.base.clone()),
            force_path_style: true,
        }))
    };
    let remote = s3(STAND_IN_SECRET);
    let remote_invitation = f.invitation(owner, "remote", None).await;
    let remote_keys: Vec<String> = {
        let mut keys = vec![
            f.key(&remote_invitation.to_string(), 8, "jpg"),
            f.key(&remote_invitation.to_string(), 9, "jpg"),
            f.key(&remote_invitation.to_string(), 10, "jpg"),
            f.key(&format!("protected/{remote_invitation}"), 11, "png"),
            format!("variants/{remote_invitation}/{}08/lite-320.webp", &f.tag[..22]),
        ];
        keys.sort();
        keys
    };
    for key in &remote_keys {
        remote.put(key, b"bytes".to_vec(), "image/jpeg").await.expect("S3 put");
    }
    remote.put(&f.key(&bystander.to_string(), 12, "jpg"), b"other".to_vec(), "image/jpeg").await.unwrap();
    assert_eq!(
        remote.list(&format!("{remote_invitation}/")).await.expect("S3 list over pages"),
        remote_keys.iter().filter(|k| k.starts_with(&format!("{remote_invitation}/"))).cloned().collect::<Vec<_>>()
    );
    let remote_at = t0 + Duration::seconds(20);
    let remote_job = f.schedule(remote_invitation, remote_at, 1).await;
    endpoint.fail_deletes.store(true, Ordering::SeqCst);
    let failed = f.run(&remote, remote_job, remote_at + Duration::days(2)).await;
    assert!(
        matches!(&failed, Outcome::Retry(e) if e.starts_with("5 of 5 objects not deleted")),
        "storage down: the rows are purged, the objects wait: {failed:?}"
    );
    let purged_at: Option<PrimitiveDateTime> = sqlx::query_scalar("select purged_at from invitations where id = $1")
        .bind(remote_invitation)
        .fetch_one(&f.pool)
        .await
        .unwrap();
    assert!(purged_at.is_some(), "the database step committed before the object deletions");
    assert_eq!(f.job(remote_job).await.payload["objects"], json!(remote_keys));
    assert_eq!(endpoint.keys_under(&format!("{remote_invitation}/")).len(), 3);
    endpoint.fail_deletes.store(false, Ordering::SeqCst);
    assert_eq!(f.run(&remote, remote_job, remote_at + Duration::days(2) + Duration::minutes(2)).await, Outcome::Done);
    for prefix in [
        format!("{remote_invitation}/"),
        format!("variants/{remote_invitation}/"),
        format!("protected/{remote_invitation}/"),
    ] {
        assert!(endpoint.keys_under(&prefix).is_empty(), "{prefix} emptied");
    }
    assert_eq!(endpoint.keys_under(&format!("{bystander}/")).len(), 1, "another invitation's object stays");
    assert!(
        endpoint.refusals.lock().unwrap().is_empty(),
        "every request carried a valid signature: {:?}",
        endpoint.refusals.lock().unwrap()
    );
    assert!(
        s3("not-the-secret").list(&format!("{bystander}/")).await.is_err(),
        "the stand-in really checks signatures"
    );
    assert_eq!(endpoint.refusals.lock().unwrap().len(), 1);

    // ── 8. The retention sweep: nothing without both durations; then only expired invitations past the retention.
    let long_ago = |days: i64| Some(t0 - Duration::days(days));
    let expired = f.invitation(owner, "expired", long_ago(3200)).await;
    let recent = f.invitation(owner, "recent", long_ago(2900)).await;
    let draft = f.invitation(owner, "draft", None).await;
    let already = f.invitation(owner, "already", long_ago(3300)).await;
    f.schedule(already, t0 - Duration::days(1), 30).await;
    let sweep_at = utc_now();
    assert_eq!(sweep_retention(&f.pool, sweep_at, &RetentionConfig::default(), 50).await.unwrap(), 0);
    let config = RetentionConfig { window_days: Some(30), retention_days_after_expiry: Some(3000) };
    let swept = sweep_retention(&f.pool, sweep_at, &config, 50).await.unwrap();
    assert!(swept >= 1, "swept {swept}");
    let state = |id: i32| {
        let pool = f.pool.clone();
        async move {
            sqlx::query_as::<_, (Option<PrimitiveDateTime>, Option<PrimitiveDateTime>)>(
                "select deleted_at, purge_after from invitations where id = $1",
            )
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    let swept_at = to_millis(sweep_at);
    assert_eq!(state(expired).await, (Some(swept_at), Some(swept_at + Duration::days(30))));
    assert_eq!(state(recent).await, (None, None), "inside the retention period");
    assert_eq!(state(draft).await, (None, None), "drafts never expire");
    assert_eq!(state(already).await.0, Some(t0 - Duration::days(1)), "an existing deletion keeps its date");
    let (payload, max_attempts, run_at): (Value, i32, PrimitiveDateTime) =
        sqlx::query_as("select payload, max_attempts, run_at from jobs where kind = $1 and dedupe_key = $2")
            .bind(PURGE_JOB_KIND)
            .bind(purge_job_for(expired, swept_at, swept_at + Duration::days(30)).dedupe_key)
            .fetch_one(&f.pool)
            .await
            .expect("the sweep queued the purge with the key Next.js would use");
    assert_eq!(payload, json!({ "invitationId": expired, "deletedAt": js_instant(swept_at) }));
    assert_eq!((max_attempts, run_at), (PURGE_MAX_ATTEMPTS, swept_at + Duration::days(30)));
    assert_eq!(sweep_retention(&f.pool, sweep_at, &config, 50).await.unwrap(), 0, "a second pass finds nothing new");

    f.cleanup().await;
}

const STAND_IN_SECRET: &str = "fictional-secret-for-the-stand-in";
/// Small pages, so a listing of three keys needs a continuation token.
const PAGE: usize = 2;

/// A path-style S3 stand-in: PUT, GET, DELETE of single objects and ListObjectsV2, each request's SigV4 signature
/// recomputed from what arrived (method, path, query, signed headers, payload hash) and refused with 403 on mismatch.
/// `fail_deletes` makes every DELETE answer 503, as an outage would.
struct StandIn {
    base: String,
    objects: Objects,
    refusals: Refusals,
    fail_deletes: Arc<AtomicBool>,
}

/// `bucket/key` → bytes.
type Objects = Arc<Mutex<HashMap<String, Vec<u8>>>>;
type Refusals = Arc<Mutex<Vec<String>>>;

#[derive(Clone)]
struct StandInState {
    base: String,
    objects: Objects,
    refusals: Refusals,
    fail_deletes: Arc<AtomicBool>,
}

impl StandIn {
    async fn start() -> Self {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let objects = Arc::new(Mutex::new(HashMap::new()));
        let refusals = Arc::new(Mutex::new(Vec::new()));
        let fail_deletes = Arc::new(AtomicBool::new(false));
        let state = StandInState {
            base: base.clone(),
            objects: objects.clone(),
            refusals: refusals.clone(),
            fail_deletes: fail_deletes.clone(),
        };
        let app = Router::new().route("/{*path}", any(stand_in)).with_state(state);
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Self { base, objects, refusals, fail_deletes }
    }

    fn keys_under(&self, prefix: &str) -> Vec<String> {
        let full = format!("invitesion-media/{prefix}");
        self.objects.lock().unwrap().keys().filter(|k| k.starts_with(&full)).cloned().collect()
    }
}

fn amz_instant(value: &str) -> Option<OffsetDateTime> {
    let digits = |range: std::ops::Range<usize>| value.get(range)?.parse::<u32>().ok();
    let date =
        Date::from_calendar_date(digits(0..4)? as i32, Month::try_from(digits(4..6)? as u8).ok()?, digits(6..8)? as u8)
            .ok()?;
    let time = Time::from_hms(digits(9..11)? as u8, digits(11..13)? as u8, digits(13..15)? as u8).ok()?;
    Some(PrimitiveDateTime::new(date, time).assume_utc())
}

fn verify(state: &StandInState, method: &Method, uri: &Uri, headers: &HeaderMap, body: &[u8]) -> Result<(), String> {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok()).map(str::to_string);
    let authorization = header("authorization").ok_or("no authorization")?;
    let signed =
        authorization.split("SignedHeaders=").nth(1).and_then(|r| r.split(',').next()).ok_or("no signed headers")?;
    let payload_hash = header("x-amz-content-sha256").ok_or("no payload hash")?;
    if payload_hash != sha256_hex(body) {
        return Err("payload hash does not match the body".into());
    }
    let date = header("x-amz-date").and_then(|d| amz_instant(&d)).ok_or("bad x-amz-date")?;
    let values: Vec<(String, String)> = signed
        .split(';')
        .filter(|name| !matches!(*name, "host" | "x-amz-date"))
        .map(|name| Ok((name.to_string(), header(name).ok_or(format!("signed header {name} missing"))?)))
        .collect::<Result<_, String>>()?;
    let pairs: Vec<(&str, &str)> = values.iter().map(|(n, v)| (n.as_str(), v.as_str())).collect();
    let url = format!("{}{}", state.base, uri.path_and_query().map(|p| p.as_str()).unwrap_or("/"));
    let expected = sign_request(&SignInput {
        method: method.as_str(),
        url: &url,
        region: "ap-southeast-1",
        service: "s3",
        access_key_id: "AKIDEXAMPLE",
        secret_access_key: STAND_IN_SECRET,
        session_token: None,
        payload_hash: &payload_hash,
        headers: &pairs,
        date,
    })
    .map_err(|e| e.to_string())?;
    let expected = expected.iter().find(|(n, _)| n == "authorization").map(|(_, v)| v.clone()).unwrap_or_default();
    if expected != authorization { Err(format!("signature mismatch for {method} {url}")) } else { Ok(()) }
}

fn escape(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

/// ListObjectsV2 over the stand-in's objects: `PAGE` keys per page; the continuation token is the last key returned
/// plus a suffix that needs XML escaping, so the driver's entity decoding is exercised too.
fn list(state: &StandInState, bucket: &str, query: &str) -> axum::response::Response {
    let params: HashMap<String, String> = url::form_urlencoded::parse(query.as_bytes()).into_owned().collect();
    let prefix = params.get("prefix").cloned().unwrap_or_default();
    let after = params.get("continuation-token").map(|t| t.trim_end_matches("&<page>").to_string());
    let full = format!("{bucket}/{prefix}");
    let mut keys: Vec<String> = state
        .objects
        .lock()
        .unwrap()
        .keys()
        .filter(|k| k.starts_with(&full))
        .map(|k| k[bucket.len() + 1..].to_string())
        .filter(|k| after.as_ref().is_none_or(|a| k.as_str() > a.as_str()))
        .collect();
    keys.sort();
    let truncated = keys.len() > PAGE;
    keys.truncate(PAGE);
    let token = if truncated {
        format!("<NextContinuationToken>{}</NextContinuationToken>", escape(&format!("{}&<page>", keys[PAGE - 1])))
    } else {
        String::new()
    };
    let contents: String =
        keys.iter().map(|k| format!("<Contents><Key>{}</Key><Size>5</Size></Contents>", escape(k))).collect();
    let body = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ListBucketResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">\
         <Name>{bucket}</Name><Prefix>{}</Prefix><KeyCount>{}</KeyCount><MaxKeys>{PAGE}</MaxKeys>\
         <IsTruncated>{truncated}</IsTruncated>{token}{contents}</ListBucketResult>",
        escape(&prefix),
        keys.len()
    );
    ([("content-type", "application/xml")], body).into_response()
}

async fn stand_in(
    State(state): State<StandInState>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: Bytes,
) -> axum::response::Response {
    if let Err(reason) = verify(&state, &method, &uri, &headers, &body) {
        state.refusals.lock().unwrap().push(reason);
        return StatusCode::FORBIDDEN.into_response();
    }
    let path = uri.path().trim_start_matches('/').to_string();
    if method == Method::GET && uri.query().is_some_and(|q| q.contains("list-type=2")) {
        return list(&state, path.trim_end_matches('/'), uri.query().unwrap_or_default());
    }
    match method {
        Method::PUT => {
            state.objects.lock().unwrap().insert(path, body.to_vec());
            StatusCode::OK.into_response()
        }
        Method::GET => match state.objects.lock().unwrap().get(&path) {
            Some(bytes) => bytes.clone().into_response(),
            None => StatusCode::NOT_FOUND.into_response(),
        },
        Method::DELETE if state.fail_deletes.load(Ordering::SeqCst) => StatusCode::SERVICE_UNAVAILABLE.into_response(),
        Method::DELETE => {
            state.objects.lock().unwrap().remove(&path);
            StatusCode::NO_CONTENT.into_response()
        }
        _ => StatusCode::METHOD_NOT_ALLOWED.into_response(),
    }
}
