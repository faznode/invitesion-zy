//! R-02: invitation opens (B-017a), ported from `lib/invitation/view-tracking.ts` and reviewed against the s26
//! experiment. One transaction serialised per guest (or per invitation for an anonymous open) by a transaction-scoped
//! advisory lock in the TypeScript writer's namespace; at most one VIEW row and one counter bump per 30-minute window
//! (inclusive lower bound). The shared vectors `contracts/vectors/view-dedupe.json` run against both writers.
//! Exactly one writer is live: Next.js selects it with `BACKEND_VIEWS` (`next` default, `rust`).

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use time::{Duration, OffsetDateTime, PrimitiveDateTime};
use utoipa::ToSchema;

use crate::app::AppState;
use crate::problem::{ApiError, Problem};

/// Same window as `VIEW_DEDUPE_WINDOW_MS` in `lib/invitation/view-tracking.ts`.
pub const VIEW_DEDUPE_WINDOW: Duration = Duration::minutes(30);

/// The ASCII bytes of "VIEW" as an int4: the advisory-lock namespace both writers use.
pub const VIEW_LOCK_NAMESPACE: i32 = 0x5649_4557;

/// The guest id, or the negated invitation id for an open without a personal link (ids are positive serials).
pub fn view_lock_key(invitation_id: i32, guest_id: Option<i32>) -> i32 {
    match guest_id {
        Some(id) if id > 0 => id,
        _ => -invitation_id,
    }
}

/// `timestamp without time zone` holding UTC wall time, as the TypeScript writer stores it.
pub fn utc_now() -> PrimitiveDateTime {
    let now = OffsetDateTime::now_utc();
    PrimitiveDateTime::new(now.date(), now.time())
}

/// Returns true when a VIEW row was written.
pub async fn record_invitation_view(
    pool: &PgPool,
    invitation_id: i32,
    guest_id: Option<i32>,
    now: PrimitiveDateTime,
) -> Result<bool, sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query_scalar!(
        r#"select true as "locked!" from pg_advisory_xact_lock($1::int4, $2::int4)"#,
        VIEW_LOCK_NAMESPACE,
        view_lock_key(invitation_id, guest_id)
    )
    .fetch_one(&mut *tx)
    .await?;

    let since = now - VIEW_DEDUPE_WINDOW;
    // Two statements instead of `is not distinct from`, so both use analytics_events_view_dedupe_idx.
    let recent = match guest_id {
        Some(id) => {
            sqlx::query_scalar!(
                "select id from analytics_events where invitation_id = $1 and event_type = 'VIEW' \
             and guest_id = $2 and created_at >= $3 limit 1",
                invitation_id,
                id,
                since
            )
            .fetch_optional(&mut *tx)
            .await?
        }
        None => {
            sqlx::query_scalar!(
                "select id from analytics_events where invitation_id = $1 and event_type = 'VIEW' \
             and guest_id is null and created_at >= $2 limit 1",
                invitation_id,
                since
            )
            .fetch_optional(&mut *tx)
            .await?
        }
    };
    if recent.is_some() {
        tx.commit().await?;
        return Ok(false);
    }

    sqlx::query!(
        "insert into analytics_events (invitation_id, guest_id, event_type, created_at) values ($1, $2, 'VIEW', $3)",
        invitation_id,
        guest_id,
        now
    )
    .execute(&mut *tx)
    .await?;
    if let Some(id) = guest_id {
        sqlx::query!("update guests set opened_at = $1, opened_count = opened_count + 1 where id = $2", now, id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(true)
}

/// One open of an invitation page.
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecordView {
    #[schema(minimum = 1)]
    pub invitation_id: i32,
    /// The guest of a personal link; absent for an anonymous open.
    #[serde(default)]
    #[schema(minimum = 1)]
    pub guest_id: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
pub struct ViewRecorded {
    /// False when the open fell inside the dedupe window of an earlier one.
    pub recorded: bool,
}

#[utoipa::path(
    post,
    path = "/v1/views",
    tag = "views",
    security(("serviceSignature" = [])),
    request_body = RecordView,
    responses(
        (status = 200, description = "Recorded, or deduplicated", body = ViewRecorded),
        (status = 400, description = "Malformed body or non-positive id", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid service signature", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "No such invitation or guest", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn record_view(
    State(state): State<AppState>,
    body: Result<Json<RecordView>, JsonRejection>,
) -> Result<Json<ViewRecorded>, ApiError> {
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    if request.invitation_id <= 0 || request.guest_id.is_some_and(|id| id <= 0) {
        return Err(ApiError::BadRequest("request.invalid_id", "ids are positive integers".into()));
    }
    let recorded = record_invitation_view(&state.pool, request.invitation_id, request.guest_id, utc_now())
        .await
        .map_err(|error| match error.as_database_error().and_then(|e| e.code()) {
            Some(code) if code == "23503" => ApiError::NotFound("invitation_or_guest.not_found"),
            _ => ApiError::internal("record_invitation_view", error),
        })?;
    Ok(Json(ViewRecorded { recorded }))
}
