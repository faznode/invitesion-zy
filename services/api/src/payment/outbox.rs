//! The entitlement outbox (09 §8.6). Every paid settlement, whichever writer applied it, writes one `payment_settled`
//! row in `jobs` inside its own transaction (dedupe key `order:<id>`, so one per order), beside the order, the payment
//! and the activation. The activation itself stays in that transaction, under the invitation's row lock (B-031), so
//! the outbox never publishes anything: it is the durable fan-out point for what may follow a recorded payment (G-050's
//! receipt first) and has to stay safe to deliver again.
//!
//! Delivery (`invitesion-jobs`, at least once): the order must be PAID with the payment the row names; then its receipt
//! is issued (G-050, `receipt.rs`) and the row is done. Nothing else is written: no order, payment or invitation.
//!  - delivered again (a lease expired after the work, a second runner, an owner's request): the same read, and the
//!    receipt is found instead of issued, so no number is taken;
//!  - the invitation deleted or purged meanwhile: nothing here reads or writes it, and a purge keeps orders, payments
//!    and receipts (D-063), so the delivery still completes;
//!  - a worker failing midway: the receipt's transaction commits whole or not at all; the lease (`jobs::LEASE`) expires
//!    and the job is taken again; a database error retries with backoff; a payload or row that cannot be right is given
//!    up with its order id, never personal data.

use serde_json::Value;
use sqlx::PgPool;

use super::receipt::{self, Issued};
use crate::jobs::{Job, Outcome};
use crate::views::utc_now;

pub const PAYMENT_SETTLED_JOB: &str = "payment_settled";
pub const PAYMENT_SETTLED_MAX_ATTEMPTS: i32 = 20;

pub fn dedupe_key(order_id: i32) -> String {
    format!("order:{order_id}")
}

fn id(payload: &Value, field: &str) -> Option<i32> {
    payload.get(field)?.as_i64().and_then(|value| i32::try_from(value).ok())
}

pub async fn run_payment_settled(pool: &PgPool, job: &Job) -> Outcome {
    let (Some(order_id), Some(payment_id)) = (id(&job.payload, "orderId"), id(&job.payload, "paymentId")) else {
        return Outcome::GiveUp("payload without orderId and paymentId".into());
    };
    let row = sqlx::query!(
        r#"select o.status,
                  exists(select 1 from payments p where p.id = $2 and p.order_id = o.id and p.status = 'PAID') as "paid!"
           from orders o where o.id = $1"#,
        order_id,
        payment_id
    )
    .fetch_optional(pool)
    .await;
    match row {
        Err(error) => Outcome::Retry(format!("reading order {order_id}: {error}")),
        Ok(None) => Outcome::GiveUp(format!("order {order_id} not found")),
        Ok(Some(row)) if row.status != "PAID" || !row.paid => {
            Outcome::GiveUp(format!("order {order_id} is {} without its payment {payment_id}", row.status))
        }
        Ok(Some(_)) => {
            let activation = job.payload.get("activation").and_then(Value::as_str).unwrap_or("unknown");
            if matches!(activation, "not_live" | "theme_mismatch") {
                tracing::info!(order = order_id, activation, "paid without activation; publishing waits for the owner");
            }
            match receipt::issue(pool, order_id, payment_id, utc_now()).await {
                Ok(Some(Issued::New(number))) => {
                    tracing::info!(order = order_id, receipt = number, "receipt issued");
                    Outcome::Done
                }
                Ok(Some(Issued::Existing(_))) => Outcome::Done,
                Ok(None) => Outcome::GiveUp(format!("order {order_id} changed before its receipt")),
                Err(error) => Outcome::Retry(format!("issuing the receipt of order {order_id}: {error}")),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn one_row_per_order() {
        assert_eq!(dedupe_key(42), "order:42");
        assert_ne!(dedupe_key(42), dedupe_key(43));
        assert!(PAYMENT_SETTLED_JOB.len() <= 40, "fits jobs.kind");
    }

    #[test]
    fn payload_ids_must_be_integers_in_range() {
        assert_eq!(id(&json!({ "orderId": 7 }), "orderId"), Some(7));
        assert_eq!(id(&json!({ "orderId": "7" }), "orderId"), None);
        assert_eq!(id(&json!({ "orderId": 4_294_967_296_i64 }), "orderId"), None);
        assert_eq!(id(&json!({}), "orderId"), None);
    }
}
