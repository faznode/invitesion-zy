use sqlx::PgPool;
use time::{Duration, OffsetDateTime, PrimitiveDateTime};

/// Same window as `VIEW_DEDUPE_WINDOW_MS` in `lib/invitation/view-tracking.ts`.
pub const VIEW_DEDUPE_WINDOW: Duration = Duration::minutes(30);

/// The ASCII bytes of "VIEW" as an int4, the advisory-lock namespace the TypeScript writer uses.
pub const VIEW_LOCK_NAMESPACE: i32 = 0x5649_4557;

/// The guest id, or the negated invitation id for an open without a personal link (ids are positive serials).
pub fn view_lock_key(invitation_id: i32, guest_id: Option<i32>) -> i32 {
    match guest_id {
        Some(id) if id > 0 => id,
        _ => -invitation_id,
    }
}

/// The schema stores `timestamp without time zone` holding UTC wall time, as the TypeScript writer does.
pub fn utc_now() -> PrimitiveDateTime {
    let now = OffsetDateTime::now_utc();
    PrimitiveDateTime::new(now.date(), now.time())
}

/// Records one open and bumps the guest's counter at most once per window, serialised per guest (or per
/// invitation for anonymous opens) by a transaction-scoped advisory lock: the B-017a contract.
/// Returns true when a VIEW row was written.
pub async fn record_invitation_view(
    pool: &PgPool,
    invitation_id: i32,
    guest_id: Option<i32>,
    now: PrimitiveDateTime,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("select pg_advisory_xact_lock($1::int4, $2::int4)")
        .bind(VIEW_LOCK_NAMESPACE)
        .bind(view_lock_key(invitation_id, guest_id))
        .execute(&mut *tx)
        .await?;

    let since = now - VIEW_DEDUPE_WINDOW;
    // Two statements instead of `is not distinct from`, so both use analytics_events_view_dedupe_idx.
    let recent: Option<i32> = match guest_id {
        Some(id) => {
            sqlx::query_scalar(
                "select id from analytics_events where invitation_id = $1 and event_type = 'VIEW' \
                 and guest_id = $2 and created_at >= $3 limit 1",
            )
            .bind(invitation_id)
            .bind(id)
            .bind(since)
            .fetch_optional(&mut *tx)
            .await?
        }
        None => {
            sqlx::query_scalar(
                "select id from analytics_events where invitation_id = $1 and event_type = 'VIEW' \
                 and guest_id is null and created_at >= $2 limit 1",
            )
            .bind(invitation_id)
            .bind(since)
            .fetch_optional(&mut *tx)
            .await?
        }
    };
    if recent.is_some() {
        tx.commit().await?;
        return Ok(false);
    }

    sqlx::query(
        "insert into analytics_events (invitation_id, guest_id, event_type, created_at) values ($1, $2, 'VIEW', $3)",
    )
    .bind(invitation_id)
    .bind(guest_id)
    .bind(now)
    .execute(&mut *tx)
    .await?;
    if let Some(id) = guest_id {
        sqlx::query("update guests set opened_at = $1, opened_count = opened_count + 1 where id = $2")
            .bind(now)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(true)
}
