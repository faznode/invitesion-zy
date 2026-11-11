//! B-039 parity: the settlement vectors the TypeScript suite runs (`tests/payment-settlement.test.ts`), run here against
//! the Rust payment module's `decide_settlement`, compared as the same JSON shapes. Times are the file's UTC wall-time
//! strings (`YYYY-MM-DDTHH:MM:SS.mmmZ`).

use std::collections::BTreeSet;

use invitesion_api::payment::decision::{
    Activation, Decision, EventInput, EventStatus, InvitationInput, OrderInput, Paid, decide_settlement,
};
use serde_json::{Value, json};
use time::{Date, Month, PrimitiveDateTime, Time};

fn vectors() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/payment-settlement.json"))
        .expect("payment-settlement.json parses")
}

fn utc(text: &str) -> PrimitiveDateTime {
    assert!(text.len() == 24 && text.ends_with('Z'), "{text}: YYYY-MM-DDTHH:MM:SS.mmmZ");
    let n = |range: std::ops::Range<usize>| text[range].parse::<u32>().expect("digits");
    let month = Month::try_from(u8::try_from(n(5..7)).unwrap()).unwrap();
    let date =
        Date::from_calendar_date(i32::try_from(n(0..4)).unwrap(), month, u8::try_from(n(8..10)).unwrap()).unwrap();
    let time = Time::from_hms_milli(
        u8::try_from(n(11..13)).unwrap(),
        u8::try_from(n(14..16)).unwrap(),
        u8::try_from(n(17..19)).unwrap(),
        u16::try_from(n(20..23)).unwrap(),
    )
    .unwrap();
    PrimitiveDateTime::new(date, time)
}

fn iso(value: PrimitiveDateTime) -> String {
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        value.year(),
        u8::from(value.month()),
        value.day(),
        value.hour(),
        value.minute(),
        value.second(),
        value.millisecond()
    )
}

fn optional_time(value: &Value) -> Option<PrimitiveDateTime> {
    value.as_str().map(utc)
}

fn optional_id(value: &Value) -> Option<i32> {
    value.as_i64().map(|id| i32::try_from(id).unwrap())
}

fn order(fixture: &Value) -> OrderInput {
    OrderInput {
        status: fixture["status"].as_str().unwrap().into(),
        rail: fixture["rail"].as_str().unwrap().into(),
        amount: fixture["amount"].as_i64().unwrap(),
        currency: fixture["currency"].as_str().unwrap().into(),
        invitation_id: optional_id(&fixture["invitationId"]),
        template_id: optional_id(&fixture["templateId"]),
    }
}

fn invitation(fixture: &Value) -> InvitationInput {
    InvitationInput {
        status: fixture["status"].as_str().unwrap().into(),
        template_id: optional_id(&fixture["templateId"]),
        published_at: optional_time(&fixture["publishedAt"]),
        expires_at: optional_time(&fixture["expiresAt"]),
    }
}

fn event(value: &Value) -> EventInput {
    let status = match value["status"].as_str().unwrap() {
        "PAID" => EventStatus::Paid,
        "FAILED" => EventStatus::Failed,
        "EXPIRED" => EventStatus::Expired,
        other => panic!("unknown status {other}"),
    };
    let paid = (!value["paid"].is_null()).then(|| Paid {
        amount: value["paid"]["amount"].as_i64().unwrap(),
        currency: value["paid"]["currency"].as_str().unwrap().into(),
    });
    EventInput { rail: value["rail"].as_str().unwrap().into(), status, paid }
}

fn shape(decision: Decision) -> Value {
    match decision {
        Decision::Duplicate => json!({ "outcome": "duplicate" }),
        Decision::UnknownOrder => json!({ "outcome": "unknown_order" }),
        Decision::RailMismatch => json!({ "outcome": "rail_mismatch" }),
        Decision::AlreadyFinal => json!({ "outcome": "already_final" }),
        Decision::Closed(status) => json!({ "outcome": "closed", "status": status.as_str() }),
        Decision::AmountUnverifiable => json!({ "outcome": "amount_unverifiable" }),
        Decision::AmountMismatch => json!({ "outcome": "amount_mismatch" }),
        Decision::Paid(Activation::Activated { published_at, expires_at }) => json!({
            "outcome": "paid",
            "activation": { "kind": "activated", "publishedAt": iso(published_at), "expiresAt": iso(expires_at) },
        }),
        Decision::Paid(activation) => json!({ "outcome": "paid", "activation": { "kind": activation.kind() } }),
    }
}

#[test]
fn every_settlement_vector_matches() {
    let vectors = vectors();
    let default_paid_at = vectors["paidAt"].as_str().unwrap();
    let cases = vectors["cases"].as_array().unwrap();
    assert!(cases.len() >= 30, "{} cases", cases.len());
    for case in cases {
        let name = case["name"].as_str().unwrap();
        let order = case["order"].as_str().map(|key| order(&vectors["orders"][key]));
        let invitation = case["invitation"].as_str().map(|key| invitation(&vectors["invitations"][key]));
        let paid_at = utc(case["paidAt"].as_str().unwrap_or(default_paid_at));
        let decision = decide_settlement(
            case["recorded"].as_bool().unwrap(),
            &event(&case["event"]),
            order.as_ref(),
            invitation.as_ref(),
            paid_at,
        );
        assert_eq!(shape(decision), case["expect"], "{name}");
    }
}

#[test]
fn the_vectors_cover_every_outcome_and_activation() {
    let vectors = vectors();
    let cases = vectors["cases"].as_array().unwrap();
    let outcomes: BTreeSet<&str> = cases.iter().map(|case| case["expect"]["outcome"].as_str().unwrap()).collect();
    for outcome in [
        "duplicate",
        "unknown_order",
        "rail_mismatch",
        "already_final",
        "closed",
        "amount_unverifiable",
        "amount_mismatch",
        "paid",
    ] {
        assert!(outcomes.contains(outcome), "{outcome}");
    }
    let activations: BTreeSet<&str> =
        cases.iter().filter_map(|case| case["expect"]["activation"]["kind"].as_str()).collect();
    for kind in ["activated", "no_invitation", "not_live", "already_published", "theme_mismatch"] {
        assert!(activations.contains(kind), "{kind}");
    }
}
