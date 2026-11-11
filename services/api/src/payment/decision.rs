//! The settlement rules of `lib/payment/settlement-decision.ts`, pinned by `contracts/vectors/payment-settlement.json`
//! (`tests/payment_vectors.rs`): a duplicate delivery first, then the order (unknown, another rail, no longer pending),
//! then FAILED / EXPIRED, then the amount (present, same currency, same minor units), then the activation (no invitation,
//! deleted or purged, already published, another theme than the one bought, else activated for twelve months without
//! restarting a window that is already set).

use serde::{Deserialize, Serialize};
use time::{Date, Month, PrimitiveDateTime};
use utoipa::ToSchema;

/// The window a payment opens (`ACTIVE_PERIOD_MONTHS` in `lib/invitation/publish-rules.ts`).
pub const ACTIVE_PERIOD_MONTHS: i32 = 12;
/// `SUPPORTED_CURRENCIES` in `lib/payment/money.ts`; amounts are integer minor units in our exponent (IDR 0, USD 2).
pub const SUPPORTED_CURRENCIES: [&str; 2] = ["IDR", "USD"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EventStatus {
    Paid,
    Failed,
    Expired,
}

impl EventStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            EventStatus::Paid => "PAID",
            EventStatus::Failed => "FAILED",
            EventStatus::Expired => "EXPIRED",
        }
    }
}

/// What a provider says it collected, in our minor units.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct Paid {
    pub amount: i64,
    pub currency: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventInput {
    pub rail: String,
    pub status: EventStatus,
    pub paid: Option<Paid>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrderInput {
    pub status: String,
    pub rail: String,
    pub amount: i64,
    pub currency: String,
    pub invitation_id: Option<i32>,
    /// The theme the order bought; none on orders older than the column (grandfathered for any theme).
    pub template_id: Option<i32>,
}

/// The invitation as read under its row lock with `deleted_at is null`: absent when the order has none, or when it is
/// deleted or purged (B-031, D-063).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvitationInput {
    pub status: String,
    pub template_id: Option<i32>,
    pub published_at: Option<PrimitiveDateTime>,
    pub expires_at: Option<PrimitiveDateTime>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ActivationKind {
    Activated,
    NoInvitation,
    NotLive,
    AlreadyPublished,
    ThemeMismatch,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Activation {
    Activated { published_at: PrimitiveDateTime, expires_at: PrimitiveDateTime },
    NoInvitation,
    NotLive,
    AlreadyPublished,
    ThemeMismatch,
}

impl Activation {
    pub fn kind(&self) -> ActivationKind {
        match self {
            Activation::Activated { .. } => ActivationKind::Activated,
            Activation::NoInvitation => ActivationKind::NoInvitation,
            Activation::NotLive => ActivationKind::NotLive,
            Activation::AlreadyPublished => ActivationKind::AlreadyPublished,
            Activation::ThemeMismatch => ActivationKind::ThemeMismatch,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// The event row conflicted on UNIQUE (rail, event_id): nothing more is read or written.
    Duplicate,
    UnknownOrder,
    RailMismatch,
    /// The order is no longer PENDING: the event is kept against it, nothing else changes.
    AlreadyFinal,
    /// FAILED or EXPIRED closes a pending order with that status.
    Closed(EventStatus),
    AmountUnverifiable,
    AmountMismatch,
    Paid(Activation),
}

/// Whole months from `from`, clamped to the last day of a shorter target month, the time of day kept: `addMonths` in
/// `lib/invitation/publish-rules.ts` evaluated in UTC, the deployment's timezone.
pub fn add_months(from: PrimitiveDateTime, months: i32) -> PrimitiveDateTime {
    let total = from.year() * 12 + (i32::from(u8::from(from.month())) - 1) + months;
    let year = total.div_euclid(12);
    let month = Month::try_from(u8::try_from(total.rem_euclid(12) + 1).expect("1 to 12")).expect("a month");
    let day = from.day().min(month.length(year));
    PrimitiveDateTime::new(Date::from_calendar_date(year, month, day).expect("a clamped day exists"), from.time())
}

/// The order's amount and currency as money: a stored currency we no longer support reads as IDR, as the Next.js writer
/// always has (`orderMoney`).
pub fn order_currency(currency: &str) -> &str {
    if SUPPORTED_CURRENCIES.contains(&currency) { currency } else { "IDR" }
}

pub fn decide_activation(
    order_invitation_id: Option<i32>,
    order_template_id: Option<i32>,
    invitation: Option<&InvitationInput>,
    paid_at: PrimitiveDateTime,
) -> Activation {
    if order_invitation_id.is_none() {
        return Activation::NoInvitation;
    }
    let Some(invitation) = invitation else { return Activation::NotLive };
    if invitation.status == "PUBLISHED" {
        return Activation::AlreadyPublished;
    }
    if let (Some(bought), Some(shown)) = (order_template_id, invitation.template_id)
        && bought != shown
    {
        return Activation::ThemeMismatch;
    }
    let published_at = invitation.published_at.unwrap_or(paid_at);
    let expires_at = invitation.expires_at.unwrap_or_else(|| add_months(published_at, ACTIVE_PERIOD_MONTHS));
    Activation::Activated { published_at, expires_at }
}

pub fn decide_settlement(
    recorded: bool,
    event: &EventInput,
    order: Option<&OrderInput>,
    invitation: Option<&InvitationInput>,
    paid_at: PrimitiveDateTime,
) -> Decision {
    if !recorded {
        return Decision::Duplicate;
    }
    let Some(order) = order else { return Decision::UnknownOrder };
    if order.rail != event.rail {
        return Decision::RailMismatch;
    }
    if order.status != "PENDING" {
        return Decision::AlreadyFinal;
    }
    if event.status != EventStatus::Paid {
        return Decision::Closed(event.status);
    }
    let Some(paid) = &event.paid else { return Decision::AmountUnverifiable };
    if !SUPPORTED_CURRENCIES.contains(&paid.currency.as_str())
        || paid.currency != order_currency(&order.currency)
        || paid.amount != order.amount
    {
        return Decision::AmountMismatch;
    }
    Decision::Paid(decide_activation(order.invitation_id, order.template_id, invitation, paid_at))
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn months_clamp_to_the_end_of_a_shorter_month_and_keep_the_time() {
        assert_eq!(add_months(datetime!(2028-02-29 10:15:30), 12), datetime!(2029-02-28 10:15:30));
        assert_eq!(add_months(datetime!(2026-08-31 00:00), 6), datetime!(2027-02-28 00:00));
        assert_eq!(add_months(datetime!(2027-08-31 00:00), 6), datetime!(2028-02-29 00:00));
        assert_eq!(add_months(datetime!(2026-01-31 23:59:59.999), 1), datetime!(2026-02-28 23:59:59.999));
        assert_eq!(add_months(datetime!(2026-11-10 03:00), 12), datetime!(2027-11-10 03:00));
        assert_eq!(add_months(datetime!(2026-03-31 12:00), -1), datetime!(2026-02-28 12:00));
    }

    #[test]
    fn an_unsupported_stored_currency_reads_as_idr() {
        assert_eq!(order_currency("USD"), "USD");
        assert_eq!(order_currency("XXX"), "IDR");
    }
}
