//! `POST /v1/payments/settlements`: one verified settlement event, applied once, in one transaction with the statements
//! and order of `applySettlement` in `lib/payment/service.ts`:
//!  1. the event row (`payment_events`, UNIQUE rail and event id): a conflict is a duplicate delivery and ends here;
//!  2. the order, locked by its reference; its id is written on the event;
//!  3. the decision (`decision.rs`); a refusal rolls everything back, the event included, so a retry is judged afresh;
//!  4. for FAILED / EXPIRED, the conditional transition `where status = 'PENDING'`;
//!  5. for PAID: the invitation read under the lock a deletion takes, live rows only (B-031); the conditional
//!     transition; the payment row; the activation when the decision allows it; the entitlement outbox row (`jobs`,
//!     one per order).
//!
//! An `Idempotency-Key` is recorded with the answer in the same transaction, so Next.js's single retry after an unknown
//! outcome replays the committed answer instead of reporting a duplicate.

use axum::Json;
use axum::extract::State;
use axum::extract::rejection::JsonRejection;
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use time::PrimitiveDateTime;
use utoipa::ToSchema;

use super::decision::{
    Activation, ActivationKind, Decision, EventInput, EventStatus, InvitationInput, OrderInput, Paid,
    decide_activation, decide_settlement,
};
use super::outbox::{PAYMENT_SETTLED_JOB, PAYMENT_SETTLED_MAX_ATTEMPTS, dedupe_key};
use crate::app::AppState;
use crate::idempotency::{self, replay};
use crate::problem::{ApiError, Problem};
use crate::views::utc_now;

const SCOPE: &str = "payment:settlement";
const RAILS: [&str; 2] = ["qris", "stripe"];
/// `payment_events.event_id` and `orders.provider_payment_id` are `varchar(200)`, `orders.reference` `varchar(120)`.
const EVENT_ID_MAX: usize = 200;
const REFERENCE_MAX: usize = 120;
const PROVIDER_ID_MAX: usize = 200;

/// A settlement event the rail adapter verified and normalised (`SettlementEvent` in `lib/payment/types.ts`).
#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettlementRequest {
    /// `qris` or `stripe`: the rail whose adapter verified the event.
    pub rail: String,
    /// The provider's id for this delivery, unique per rail (1 to 200 characters).
    pub event_id: String,
    /// Our order reference as the provider echoed it (1 to 120 characters).
    pub reference: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_payment_id: Option<String>,
    pub status: EventStatus,
    /// What the provider says it collected, in our minor units; a PAID event without it is refused.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub paid: Option<Paid>,
    /// The verified event as the adapter normalised it, stored with the event row and the payment row.
    #[serde(default)]
    pub raw: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "kebab-case")]
pub enum SettlementSkip {
    /// This delivery was already recorded.
    Duplicate,
    /// The order is no longer pending; the event is kept against it.
    AlreadyFinal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SettlementResult {
    /// True when this call moved the order (paid, failed or expired).
    pub applied: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order_id: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invitation_activated: Option<bool>,
    /// What a payment did to the order's invitation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation: Option<ActivationKind>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<SettlementSkip>,
}

impl SettlementResult {
    fn skipped(reason: SettlementSkip) -> Self {
        Self { applied: false, order_id: None, invitation_activated: None, activation: None, reason: Some(reason) }
    }
}

enum Answer {
    Fresh(SettlementResult),
    Replay(Response),
}

fn db(context: &'static str) -> impl FnOnce(sqlx::Error) -> ApiError {
    move |error| ApiError::internal(context, error)
}

fn bounded(value: &str, max: usize) -> bool {
    !value.is_empty() && value.chars().count() <= max
}

fn validate(request: &SettlementRequest) -> Result<(), ApiError> {
    if !RAILS.contains(&request.rail.as_str()) {
        return Err(ApiError::BadRequest("payment.invalid_rail", "qris or stripe".into()));
    }
    let invalid = |detail: &str| Err(ApiError::BadRequest("payment.invalid_event", detail.into()));
    if !bounded(&request.event_id, EVENT_ID_MAX) {
        return invalid("eventId: 1 to 200 characters");
    }
    if !bounded(&request.reference, REFERENCE_MAX) {
        return invalid("reference: 1 to 120 characters");
    }
    if let Some(id) = &request.provider_payment_id
        && !bounded(id, PROVIDER_ID_MAX)
    {
        return invalid("providerPaymentId: 1 to 200 characters");
    }
    if let Some(paid) = &request.paid
        && (paid.amount < 0 || paid.currency.len() != 3 || !paid.currency.bytes().all(|b| b.is_ascii_uppercase()))
    {
        return invalid("paid: non-negative minor units and a three-letter currency");
    }
    Ok(())
}

#[utoipa::path(
    post,
    path = "/v1/payments/settlements",
    tag = "payments",
    security(("serviceSignature" = [])),
    params(
        ("Idempotency-Key" = Option<String>, Header, description = "1–255 visible ASCII characters; a retry with the same key and body replays the committed answer for 24 hours"),
    ),
    request_body = SettlementRequest,
    responses(
        (status = 200, description = "Applied, a duplicate delivery (`reason: duplicate`) or an order already final (`reason: already-final`); replayed with `Idempotent-Replayed: true`", body = SettlementResult),
        (status = 400, description = "Malformed body, rail (`payment.invalid_rail`), event (`payment.invalid_event`) or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid service signature", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "No order for the reference (`payment.order_not_found`); nothing was kept", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "The event disagrees with its order: another rail (`payment.rail_mismatch`), a PAID event without an amount (`payment.amount_unverifiable`) or with another amount or currency (`payment.amount_mismatch`); nothing was kept and the order is unchanged", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "`idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn settle(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Result<Json<SettlementRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(request) =
        body.map_err(|rejection| ApiError::BadRequest("request.invalid_body", rejection.body_text()))?;
    validate(&request)?;
    let key = idempotency::key_from(&headers)?;
    let hash = idempotency::request_hash(&request);
    if let Some(key) = &key
        && let Some(response) = replay(&state.pool, SCOPE, key, &hash).await?
    {
        return Ok(response);
    }
    match apply(&state, &request, key.as_deref(), &hash, utc_now()).await? {
        Answer::Fresh(result) => Ok(Json(result).into_response()),
        Answer::Replay(response) => Ok(response),
    }
}

async fn apply(
    state: &AppState,
    request: &SettlementRequest,
    key: Option<&str>,
    hash: &str,
    now: PrimitiveDateTime,
) -> Result<Answer, ApiError> {
    let mut tx = state.pool.begin().await.map_err(db("settle_begin"))?;
    let event_row = sqlx::query_scalar!(
        "insert into payment_events (rail, event_id, status, raw_payload) values ($1, $2, $3, $4) \
         on conflict (rail, event_id) do nothing returning id",
        request.rail,
        request.event_id,
        request.status.as_str(),
        request.raw
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("settle_event"))?;
    let Some(event_row) = event_row else {
        tx.rollback().await.map_err(db("settle_rollback"))?;
        // The insert waited for a concurrent twin under the same key; once it committed, answer as it did.
        if let Some(key) = key
            && let Some(response) = replay(&state.pool, SCOPE, key, hash).await?
        {
            return Ok(Answer::Replay(response));
        }
        return Ok(Answer::Fresh(SettlementResult::skipped(SettlementSkip::Duplicate)));
    };

    let order = sqlx::query!(
        "select id, status, rail, amount, currency, invitation_id, template_id from orders where reference = $1 for update",
        request.reference
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("settle_order"))?
    .ok_or(ApiError::NotFound("payment.order_not_found"))?;
    sqlx::query!("update payment_events set order_id = $1 where id = $2", order.id, event_row)
        .execute(&mut *tx)
        .await
        .map_err(db("settle_event_order"))?;

    let event = EventInput { rail: request.rail.clone(), status: request.status, paid: request.paid.clone() };
    let order_input = OrderInput {
        status: order.status,
        rail: order.rail,
        amount: i64::from(order.amount),
        currency: order.currency,
        invitation_id: order.invitation_id,
        template_id: order.template_id,
    };
    // Decided without the invitation first: only a payment reads (and locks) it.
    let result = match decide_settlement(true, &event, Some(&order_input), None, now) {
        Decision::Duplicate | Decision::UnknownOrder => {
            return Err(ApiError::internal("settle_decision", "unreachable"));
        }
        Decision::RailMismatch => return Err(ApiError::Conflict("payment.rail_mismatch", None)),
        Decision::AmountUnverifiable => return Err(ApiError::Conflict("payment.amount_unverifiable", None)),
        Decision::AmountMismatch => return Err(ApiError::Conflict("payment.amount_mismatch", None)),
        Decision::AlreadyFinal => SettlementResult::skipped(SettlementSkip::AlreadyFinal),
        Decision::Closed(status) => {
            close(&mut tx, order.id, status).await?;
            SettlementResult {
                applied: true,
                order_id: Some(order.id),
                invitation_activated: Some(false),
                activation: None,
                reason: None,
            }
        }
        Decision::Paid(_) => {
            let activation = pay(&mut tx, order.id, &order_input, request, now).await?;
            SettlementResult {
                applied: true,
                order_id: Some(order.id),
                invitation_activated: Some(matches!(activation, Activation::Activated { .. })),
                activation: Some(activation.kind()),
                reason: None,
            }
        }
    };

    if let Some(key) = key {
        let body = serde_json::to_value(&result).map_err(|error| ApiError::internal("settle_json", error))?;
        if !idempotency::record(&mut tx, SCOPE, key, hash, 200, &body, now).await.map_err(db("settle_key"))? {
            // Another request with this key committed first: this one rolls back and answers as that one did.
            tx.rollback().await.map_err(db("settle_rollback"))?;
            return match replay(&state.pool, SCOPE, key, hash).await? {
                Some(response) => Ok(Answer::Replay(response)),
                None => Err(ApiError::internal("settle_key", "the winning key record is gone")),
            };
        }
    }
    tx.commit().await.map_err(db("settle_commit"))?;
    Ok(Answer::Fresh(result))
}

async fn close(tx: &mut Transaction<'_, Postgres>, order_id: i32, status: EventStatus) -> Result<(), ApiError> {
    let moved =
        sqlx::query!("update orders set status = $2 where id = $1 and status = 'PENDING'", order_id, status.as_str())
            .execute(&mut **tx)
            .await
            .map_err(db("settle_close"))?
            .rows_affected();
    if moved != 1 {
        return Err(ApiError::internal("settle_close", "the locked order was not pending"));
    }
    Ok(())
}

/// The payment: the transition, the payment row, the activation the decision allows and the outbox row.
async fn pay(
    tx: &mut Transaction<'_, Postgres>,
    order_id: i32,
    order: &OrderInput,
    request: &SettlementRequest,
    now: PrimitiveDateTime,
) -> Result<Activation, ApiError> {
    let invitation = match order.invitation_id {
        Some(invitation_id) => sqlx::query!(
            "select status, template_id, published_at, expires_at from invitations \
             where id = $1 and deleted_at is null for update",
            invitation_id
        )
        .fetch_optional(&mut **tx)
        .await
        .map_err(db("settle_invitation"))?
        .map(|row| InvitationInput {
            status: row.status,
            template_id: row.template_id,
            published_at: row.published_at,
            expires_at: row.expires_at,
        }),
        None => None,
    };
    let activation = decide_activation(order.invitation_id, order.template_id, invitation.as_ref(), now);

    let moved = sqlx::query!(
        "update orders set status = 'PAID', paid_at = $2, provider_payment_id = coalesce($3, provider_payment_id) \
         where id = $1 and status = 'PENDING'",
        order_id,
        now,
        request.provider_payment_id
    )
    .execute(&mut **tx)
    .await
    .map_err(db("settle_paid"))?
    .rows_affected();
    if moved != 1 {
        return Err(ApiError::internal("settle_paid", "the locked order was not pending"));
    }
    let payment_id = sqlx::query_scalar!(
        "insert into payments (order_id, provider, transaction_id, status, raw_payload) values ($1, $2, $3, 'PAID', $4) \
         returning id",
        order_id,
        request.rail,
        request.provider_payment_id,
        request.raw
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(db("settle_payment"))?;

    if let (Activation::Activated { published_at, expires_at }, Some(invitation_id)) = (activation, order.invitation_id)
    {
        let activated = sqlx::query!(
            "update invitations set status = 'PUBLISHED', published_at = $2, expires_at = $3 \
             where id = $1 and deleted_at is null and status <> 'PUBLISHED'",
            invitation_id,
            published_at,
            expires_at
        )
        .execute(&mut **tx)
        .await
        .map_err(db("settle_activate"))?
        .rows_affected();
        if activated != 1 {
            return Err(ApiError::internal("settle_activate", "the locked invitation changed"));
        }
    }

    let payload = json!({
        "orderId": order_id,
        "paymentId": payment_id,
        "invitationId": order.invitation_id,
        "templateId": order.template_id,
        "activation": activation.kind(),
    });
    sqlx::query!(
        "insert into jobs (kind, payload, dedupe_key, run_at, max_attempts) values ($1, $2, $3, $4, $5) \
         on conflict (kind, dedupe_key) do nothing",
        PAYMENT_SETTLED_JOB,
        payload,
        dedupe_key(order_id),
        now,
        PAYMENT_SETTLED_MAX_ATTEMPTS
    )
    .execute(&mut **tx)
    .await
    .map_err(db("settle_outbox"))?;
    Ok(activation)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> SettlementRequest {
        SettlementRequest {
            rail: "qris".into(),
            event_id: "manual:vne_1".into(),
            reference: "vne_1".into(),
            provider_payment_id: None,
            status: EventStatus::Paid,
            paid: Some(Paid { amount: 149_000, currency: "IDR".into() }),
            raw: json!({ "source": "test" }),
        }
    }

    #[test]
    fn requests_are_bounded_before_any_statement() {
        assert!(validate(&request()).is_ok());
        let cases: [fn(&mut SettlementRequest); 8] = [
            |r| r.rail = "midtrans".into(),
            |r| r.event_id = String::new(),
            |r| r.event_id = "e".repeat(201),
            |r| r.reference = "r".repeat(121),
            |r| r.provider_payment_id = Some(String::new()),
            |r| r.paid = Some(Paid { amount: -1, currency: "IDR".into() }),
            |r| r.paid = Some(Paid { amount: 1, currency: "idr".into() }),
            |r| r.paid = Some(Paid { amount: 1, currency: "RUPIAH".into() }),
        ];
        for change in cases {
            let mut bad = request();
            change(&mut bad);
            assert!(validate(&bad).is_err(), "{bad:?}");
        }
        let mut long_unicode = request();
        long_unicode.event_id = "é".repeat(200);
        assert!(validate(&long_unicode).is_ok(), "characters, not bytes, as varchar(200) counts");
    }

    #[test]
    fn results_serialise_as_the_typescript_outcome() {
        let skipped = serde_json::to_value(SettlementResult::skipped(SettlementSkip::AlreadyFinal)).unwrap();
        assert_eq!(skipped, json!({ "applied": false, "reason": "already-final" }));
        let paid = SettlementResult {
            applied: true,
            order_id: Some(7),
            invitation_activated: Some(true),
            activation: Some(ActivationKind::Activated),
            reason: None,
        };
        assert_eq!(
            serde_json::to_value(paid).unwrap(),
            json!({ "applied": true, "orderId": 7, "invitationActivated": true, "activation": "activated" })
        );
    }
}
