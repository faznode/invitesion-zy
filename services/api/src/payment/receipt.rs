//! G-050: receipts from recorded payments, the entitlement outbox's first consumer. Delivering a paid order's
//! `payment_settled` row issues that order's receipt: one per order (UNIQUE `order_id`), copied from the order and its
//! payment in the issuing transaction, so it carries only the payment record's data and never changes afterwards.
//!
//! Numbering is monotonic and gapless: the number is the `receipt_counters` row's increment, and that row stays locked
//! until the transaction ends, so receipts are numbered in commit order. A delivery of an order that already has its
//! receipt (a lease expired after the work, a second runner, an owner's request for an issued one) takes no number:
//! it finds the receipt first, and if a concurrent delivery of the same order commits between that look and the insert,
//! the insert yields and the whole transaction, the increment included, is rolled back.

use sqlx::PgPool;
use time::PrimitiveDateTime;

/// The one counter row (`receipt_counters.scope`).
pub const COUNTER_SCOPE: &str = "receipt";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Issued {
    /// This delivery issued the receipt with this number.
    New(i32),
    /// The order already had its receipt; nothing was written.
    Existing(i32),
}

/// Issues the receipt of `order_id` paid by `payment_id`, once. `None` when the order is not PAID with that PAID payment
/// (nothing is written and no number is taken).
pub async fn issue(
    pool: &PgPool,
    order_id: i32,
    payment_id: i32,
    now: PrimitiveDateTime,
) -> Result<Option<Issued>, sqlx::Error> {
    if let Some(number) = existing(pool, order_id).await? {
        return Ok(Some(Issued::Existing(number)));
    }
    let mut tx = pool.begin().await?;
    // Both writers set `paid_at` with PAID; a row from before that took the payment's own time, so it is the fallback.
    let record = sqlx::query!(
        r#"select o.user_id, o.reference, o.tier, o.amount, o.currency, o.rail,
                  coalesce(o.paid_at, p.created_at) as "paid_at!", p.transaction_id
           from orders o join payments p on p.order_id = o.id
           where o.id = $1 and p.id = $2 and o.status = 'PAID' and p.status = 'PAID'"#,
        order_id,
        payment_id
    )
    .fetch_optional(&mut *tx)
    .await?;
    let Some(record) = record else {
        tx.rollback().await?;
        return Ok(None);
    };
    let number = sqlx::query_scalar!(
        r#"insert into receipt_counters (scope, last_number) values ($1, 1)
           on conflict (scope) do update set last_number = receipt_counters.last_number + 1
           returning last_number"#,
        COUNTER_SCOPE
    )
    .fetch_one(&mut *tx)
    .await?;
    let inserted = sqlx::query_scalar!(
        r#"insert into receipts (number, order_id, payment_id, user_id, reference, tier, amount, currency, rail,
                                 transaction_id, paid_at, issued_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           on conflict (order_id) do nothing
           returning number"#,
        number,
        order_id,
        payment_id,
        record.user_id,
        record.reference,
        record.tier,
        record.amount,
        record.currency,
        record.rail,
        record.transaction_id,
        record.paid_at,
        now
    )
    .fetch_optional(&mut *tx)
    .await?;
    match inserted {
        Some(number) => {
            tx.commit().await?;
            Ok(Some(Issued::New(number)))
        }
        None => {
            // A concurrent delivery of this order committed first: give its number back by rolling back the increment.
            tx.rollback().await?;
            Ok(existing(pool, order_id).await?.map(Issued::Existing))
        }
    }
}

async fn existing(pool: &PgPool, order_id: i32) -> Result<Option<i32>, sqlx::Error> {
    sqlx::query_scalar!("select number from receipts where order_id = $1", order_id).fetch_optional(pool).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_counter_row_that_fits_its_column() {
        assert_eq!(COUNTER_SCOPE, "receipt");
        assert!(COUNTER_SCOPE.len() <= 20, "fits receipt_counters.scope");
    }

    #[test]
    fn a_new_receipt_and_an_existing_one_are_told_apart() {
        assert_ne!(Issued::New(7), Issued::Existing(7));
    }
}
