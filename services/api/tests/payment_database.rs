//! B-039: the entitlement outbox's delivery (`payment::outbox::run_payment_settled`) on a real database migrated by
//! drizzle-kit (`TEST_DATABASE_URL`). The handler is called on the rows this test writes, never through `run_due`, so
//! the suite's other tests and their jobs are untouched. Delivery completes for a paid order with its payment (again on
//! a second delivery, writing nothing), completes when the invitation was deleted or purged meanwhile (a purge keeps
//! orders and payments), and gives up, naming only ids, on a payload or rows that cannot be right.
//!
//! G-050: each completed delivery issues the order's receipt from the payment record, once, numbered without gaps even
//! when one order is delivered several times at once. Every test here issues receipts, so they take `RECEIPTS` in turn
//! and a test's numbers are exactly the next ones.

use std::sync::LazyLock;

use invitesion_api::jobs::{Job, Outcome};
use invitesion_api::payment::outbox::{
    PAYMENT_SETTLED_JOB, PAYMENT_SETTLED_MAX_ATTEMPTS, dedupe_key, run_payment_settled,
};
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

static RECEIPTS: LazyLock<tokio::sync::Mutex<()>> = LazyLock::new(|| tokio::sync::Mutex::new(()));

async fn counter(pool: &PgPool) -> i32 {
    sqlx::query_scalar("select coalesce((select last_number from receipt_counters where scope = 'receipt'), 0)")
        .fetch_one(pool)
        .await
        .unwrap()
}

struct Fixture {
    pool: PgPool,
    tag: String,
    user: i32,
    invitations: Vec<i32>,
    orders: Vec<i32>,
    jobs: Vec<i64>,
}

impl Fixture {
    async fn create() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(4).connect(&url).await.expect("connect");
        let tag = uuid::Uuid::new_v4().simple().to_string();
        let user: i32 = sqlx::query_scalar("insert into users (email, clerk_user_id) values ($1, $2) returning id")
            .bind(format!("b039-outbox-{tag}@example.invalid"))
            .bind(format!("user_b039_{tag}"))
            .fetch_one(&pool)
            .await
            .unwrap();
        Self { pool, tag, user, invitations: Vec::new(), orders: Vec::new(), jobs: Vec::new() }
    }

    /// A draft invitation with a paid order and its payment, as a settlement leaves them, plus its outbox row.
    async fn settled(&mut self, name: &str, order_status: &str, with_payment: bool) -> (i32, i32, Job) {
        let invitation: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type, status) values ($1, $2, 'wedding', 'DRAFT') returning id",
        )
        .bind(self.user)
        .bind(format!("b039-{name}-{}", self.tag))
        .fetch_one(&self.pool)
        .await
        .unwrap();
        self.invitations.push(invitation);
        let order: i32 = sqlx::query_scalar(
            "insert into orders (user_id, invitation_id, tier, amount, currency, rail, reference, status) \
             values ($1, $2, 'standard', 149000, 'IDR', 'qris', $3, $4) returning id",
        )
        .bind(self.user)
        .bind(invitation)
        .bind(format!("vne_b039_{name}_{}", self.tag))
        .bind(order_status)
        .fetch_one(&self.pool)
        .await
        .unwrap();
        self.orders.push(order);
        let payment: i32 = if with_payment {
            sqlx::query_scalar(
                "insert into payments (order_id, provider, status, raw_payload) values ($1, 'qris', 'PAID', '{}') returning id",
            )
            .bind(order)
            .fetch_one(&self.pool)
            .await
            .unwrap()
        } else {
            i32::MAX
        };
        let payload = json!({ "orderId": order, "paymentId": payment, "invitationId": invitation, "templateId": null, "activation": "activated" });
        let job = self.job(order, payload).await;
        (invitation, order, job)
    }

    /// The production key is one per order; these rows add the run's tag and a counter, because the refusal cases
    /// deliberately write several payloads naming one order.
    async fn job(&mut self, order: i32, payload: Value) -> Job {
        let id: i64 = sqlx::query_scalar(
            "insert into jobs (kind, payload, dedupe_key, max_attempts) values ($1, $2, $3, $4) returning id",
        )
        .bind(PAYMENT_SETTLED_JOB)
        .bind(&payload)
        .bind(format!("{}:{}:{}", dedupe_key(order), self.tag, self.jobs.len()))
        .bind(PAYMENT_SETTLED_MAX_ATTEMPTS)
        .fetch_one(&self.pool)
        .await
        .unwrap();
        self.jobs.push(id);
        Job { id, kind: PAYMENT_SETTLED_JOB.into(), payload, attempts: 1, max_attempts: PAYMENT_SETTLED_MAX_ATTEMPTS }
    }

    /// Every row of this fixture's orders, payments and invitations, as text, to prove a delivery writes nothing.
    async fn digest(&self) -> String {
        sqlx::query_scalar(
            "select coalesce(string_agg(r, '|' order by r), '') from ( \
               select o::text as r from orders o where o.id = any($1) \
               union all select p::text from payments p where p.order_id = any($1) \
               union all select i::text from invitations i where i.id = any($2)) rows",
        )
        .bind(&self.orders)
        .bind(&self.invitations)
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }

    async fn clean(self) {
        sqlx::query("delete from jobs where id = any($1)").bind(&self.jobs).execute(&self.pool).await.unwrap();
        sqlx::query("delete from receipts where order_id = any($1)")
            .bind(&self.orders)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from payments where order_id = any($1)")
            .bind(&self.orders)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from orders where id = any($1)").bind(&self.orders).execute(&self.pool).await.unwrap();
        sqlx::query("delete from invitations where id = any($1)")
            .bind(&self.invitations)
            .execute(&self.pool)
            .await
            .unwrap();
        sqlx::query("delete from users where id = $1").bind(self.user).execute(&self.pool).await.unwrap();
    }
}

#[tokio::test]
async fn delivery_completes_once_paid_again_without_writes_and_after_a_deletion() {
    let _serial = RECEIPTS.lock().await;
    let mut fixture = Fixture::create().await;
    let (_, _, job) = fixture.settled("paid", "PAID", true).await;
    let before = fixture.digest().await;
    assert_eq!(run_payment_settled(&fixture.pool, &job).await, Outcome::Done);
    assert_eq!(run_payment_settled(&fixture.pool, &job).await, Outcome::Done, "a second delivery (lease expired)");
    assert_eq!(fixture.digest().await, before, "delivery writes nothing");

    let (deleted, _, deleted_job) = fixture.settled("deleted", "PAID", true).await;
    sqlx::query(
        "update invitations set deleted_at = (now() at time zone 'utc'), purge_after = (now() at time zone 'utc') + interval '30 days' \
         where id = $1",
    )
    .bind(deleted)
    .execute(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(run_payment_settled(&fixture.pool, &deleted_job).await, Outcome::Done, "deleted in its window");
    sqlx::query("update invitations set purged_at = (now() at time zone 'utc'), config = null where id = $1")
        .bind(deleted)
        .execute(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(
        run_payment_settled(&fixture.pool, &deleted_job).await,
        Outcome::Done,
        "purged: orders and payments kept"
    );
    let status: String = sqlx::query_scalar("select status from invitations where id = $1")
        .bind(deleted)
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(status, "DRAFT", "the outbox never publishes");
    fixture.clean().await;
}

#[tokio::test]
async fn delivery_gives_up_on_rows_or_payloads_that_cannot_be_right() {
    let _serial = RECEIPTS.lock().await;
    let mut fixture = Fixture::create().await;
    let start = counter(&fixture.pool).await;
    let (_, order, pending) = fixture.settled("pending", "PENDING", true).await;
    match run_payment_settled(&fixture.pool, &pending).await {
        Outcome::GiveUp(error) => {
            assert!(error.contains(&format!("order {order} is PENDING")), "{error}");
            assert!(!error.contains(&fixture.tag), "ids only: {error}");
        }
        other => panic!("a pending order: {other:?}"),
    }
    let (_, _, unpaid) = fixture.settled("no-payment", "PAID", false).await;
    assert!(
        matches!(run_payment_settled(&fixture.pool, &unpaid).await, Outcome::GiveUp(_)),
        "the named payment is missing"
    );

    let (_, paid_a, own_a) = fixture.settled("cross-a", "PAID", true).await;
    let (_, paid_b, _) = fixture.settled("cross-b", "PAID", true).await;
    assert_eq!(run_payment_settled(&fixture.pool, &own_a).await, Outcome::Done, "its own payment");
    let payment_b: i32 = sqlx::query_scalar("select id from payments where order_id = $1")
        .bind(paid_b)
        .fetch_one(&fixture.pool)
        .await
        .unwrap();
    let crossed = fixture.job(paid_a, json!({ "orderId": paid_a, "paymentId": payment_b })).await;
    assert!(
        matches!(run_payment_settled(&fixture.pool, &crossed).await, Outcome::GiveUp(_)),
        "another order's payment"
    );

    for payload in [json!({}), json!({ "orderId": "1", "paymentId": 1 }), json!({ "orderId": 1 })] {
        let bad = fixture.job(order, payload.clone()).await;
        assert_eq!(
            run_payment_settled(&fixture.pool, &bad).await,
            Outcome::GiveUp("payload without orderId and paymentId".into()),
            "{payload}"
        );
    }
    let unknown = fixture.job(order, json!({ "orderId": i32::MAX, "paymentId": 1 })).await;
    assert_eq!(
        run_payment_settled(&fixture.pool, &unknown).await,
        Outcome::GiveUp(format!("order {} not found", i32::MAX))
    );
    let issued: Vec<i32> = sqlx::query_scalar("select number from receipts where order_id = any($1) order by number")
        .bind(&fixture.orders)
        .fetch_all(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(issued, vec![start + 1], "only the order delivered with its own payment has a receipt");
    assert_eq!(counter(&fixture.pool).await, start + 1, "a refused delivery takes no number");
    fixture.clean().await;
}

#[tokio::test]
async fn receipts_copy_the_payment_record_once_and_are_numbered_without_gaps() {
    let _serial = RECEIPTS.lock().await;
    let mut fixture = Fixture::create().await;
    let start = counter(&fixture.pool).await;

    let (_, order, job) = fixture.settled("receipt", "PAID", true).await;
    sqlx::query("update payments set transaction_id = $2 where order_id = $1")
        .bind(order)
        .bind(format!("trx-{}", fixture.tag))
        .execute(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(run_payment_settled(&fixture.pool, &job).await, Outcome::Done);
    assert_eq!(run_payment_settled(&fixture.pool, &job).await, Outcome::Done, "delivered again");
    let receipt: (i32, i32, String, Option<String>, i32, String, String, Option<String>, i64) = sqlx::query_as(
        "select r.number, r.user_id, r.reference, r.tier, r.amount, r.currency, r.rail, r.transaction_id, \
                (select count(*) from receipts where order_id = $1) \
         from receipts r where r.order_id = $1",
    )
    .bind(order)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    let record: (i32, String, Option<String>, i32, String, String, Option<String>) = sqlx::query_as(
        "select o.user_id, o.reference, o.tier, o.amount, o.currency, o.rail, p.transaction_id \
         from orders o join payments p on p.order_id = o.id where o.id = $1",
    )
    .bind(order)
    .fetch_one(&fixture.pool)
    .await
    .unwrap();
    assert_eq!(receipt.0, start + 1, "the next number");
    assert_eq!(receipt.8, 1, "one receipt for the order");
    assert_eq!(
        (receipt.1, receipt.2, receipt.3, receipt.4, receipt.5, receipt.6, receipt.7),
        record,
        "the payment record"
    );
    assert_eq!(counter(&fixture.pool).await, start + 1, "the second delivery took no number");

    // Eight orders, each delivered three times at once: one receipt each, the next eight numbers, none skipped.
    let mut raced = Vec::new();
    for i in 0..8 {
        let (_, _, job) = fixture.settled(&format!("race-{i}"), "PAID", true).await;
        raced.push(job);
    }
    let mut tasks = tokio::task::JoinSet::new();
    for job in &raced {
        for _ in 0..3 {
            let (pool, job) = (fixture.pool.clone(), job.clone());
            tasks.spawn(async move { run_payment_settled(&pool, &job).await });
        }
    }
    while let Some(outcome) = tasks.join_next().await {
        assert_eq!(outcome.unwrap(), Outcome::Done);
    }
    let numbers: Vec<i32> = sqlx::query_scalar("select number from receipts where order_id = any($1) order by number")
        .bind(&fixture.orders)
        .fetch_all(&fixture.pool)
        .await
        .unwrap();
    assert_eq!(numbers, ((start + 1)..=(start + 9)).collect::<Vec<_>>(), "one receipt per order, no gap");
    assert_eq!(counter(&fixture.pool).await, start + 9, "duplicate deliveries gave their numbers back");
    fixture.clean().await;
}
