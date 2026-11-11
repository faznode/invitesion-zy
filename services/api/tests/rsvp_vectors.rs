//! R-03 parity: the RSVP vectors the TypeScript suite runs (`tests/rsvp-vectors.test.ts`, `tests/rsvp-decisions.test.ts`),
//! run here against the Rust RSVP module. `rsvp-rules.json` pins the single rules; `rsvp-decisions.json` the lenient
//! read, every guest decision and every host override, compared as the same JSON shapes.

use invitesion_api::rsvp::content::{RsvpConfig, read_rsvp_config};
use invitesion_api::rsvp::decision::{
    GuestDecision, GuestState, HostGuestState, RsvpFlags, RsvpSubmission, decide_guest_rsvp, decide_host_rsvp,
};
use invitesion_api::rsvp::js::date_parse_ms;
use invitesion_api::rsvp::rules::{
    Audience, EventFieldsRef, RsvpStatus, event_visible_to, parse_rsvp_status, read_invited_event_ids,
    requested_headcount, rsvp_attendance, rsvp_closed_reason,
};
use serde_json::{Map, Value, json};

fn rules() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/rsvp-rules.json")).expect("rsvp-rules.json parses")
}

fn decisions() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/rsvp-decisions.json"))
        .expect("rsvp-decisions.json parses")
}

fn status(value: &str) -> RsvpStatus {
    parse_rsvp_status(value, true).unwrap_or_else(|| panic!("status {value}"))
}

fn ms(text: &str) -> i64 {
    date_parse_ms(text).unwrap_or_else(|| panic!("instant {text}"))
}

/// `{ ...defaults, ...override }` for one level, as the TypeScript runner spreads them.
fn merged(defaults: &Value, over: Option<&Value>) -> Value {
    let mut object: Map<String, Value> = defaults.as_object().cloned().unwrap_or_default();
    if let Some(Value::Object(over)) = over {
        object.extend(over.clone());
    }
    Value::Object(object)
}

#[test]
fn single_rules_match_the_typescript_vectors() {
    let v = rules();
    for case in v["status"].as_array().unwrap() {
        let accepted = parse_rsvp_status(case["value"].as_str().unwrap(), case["maybe"].as_bool().unwrap()).is_some();
        assert_eq!(accepted, case["accepted"].as_bool().unwrap(), "status {case}");
    }
    for case in v["attendance"].as_array().unwrap() {
        let attending = rsvp_attendance(
            status(case["status"].as_str().unwrap()),
            requested_headcount(case["requestedField"].as_str()),
            case["allowance"].as_i64().unwrap(),
        );
        assert_eq!(attending, case["attending"].as_i64(), "attendance {case}");
    }
    for case in v["closed"].as_array().unwrap() {
        let rsvp = &case["rsvp"];
        let reason =
            rsvp_closed_reason(rsvp["enabled"].as_bool(), rsvp["deadline"].as_str(), ms(case["now"].as_str().unwrap()));
        assert_eq!(reason.map(|r| r.as_str()), case["reason"].as_str(), "closed {case}");
    }
    let events = v["eligibility"]["events"].as_array().unwrap();
    for case in v["eligibility"]["cases"].as_array().unwrap() {
        let audience = match &case["guest"] {
            Value::Null => Audience::Public,
            guest => Audience::Guest(read_invited_event_ids(guest.get("invitedEventIds"))),
        };
        let visible: Vec<i64> = events
            .iter()
            .enumerate()
            .filter(|(_, event)| {
                event_visible_to(
                    event["id"].as_str(),
                    event["inviteOnly"] == json!(true),
                    &audience,
                    case["enabled"].as_bool().unwrap(),
                )
            })
            .map(|(index, _)| index as i64)
            .collect();
        assert_eq!(json!(visible), case["visible"], "eligibility {case}");
    }
    assert_eq!(EventFieldsRef::default().status, "");
}

fn project(config: &RsvpConfig) -> Value {
    json!({
        "rsvp": config.rsvp.as_ref().map(|r| json!({ "enabled": r.enabled, "deadline": r.deadline, "perEvent": r.per_event })),
        "events": config.events.as_ref().map(|events| events.iter().map(|e| json!({ "id": e.id, "inviteOnly": e.invite_only })).collect::<Vec<_>>()),
        "form": config.form.as_ref().map(|form| json!({
            "enabled": form.enabled,
            "questions": form.questions.iter().map(|q| json!({
                "id": q.id,
                "type": q.kind.as_str(),
                "required": q.required,
                "options": q.options,
                "conditional": q.conditional.as_ref().map(|c| json!({ "questionId": c.question_id, "equals": c.equals, "in": c.one_of })),
            })).collect::<Vec<_>>(),
        })),
    })
}

#[test]
fn the_lenient_read_matches_the_typescript_vectors() {
    let v = decisions();
    let cases = v["read"].as_array().unwrap();
    assert!(cases.len() >= 40);
    for case in cases {
        assert_eq!(project(&read_rsvp_config(&case["config"])), case["expect"], "{}", case["name"]);
    }
}

fn decision_json(decision: &GuestDecision) -> Value {
    match decision {
        GuestDecision::Closed(reason) => json!({ "kind": "closed", "reason": reason.as_str() }),
        GuestDecision::Invalid => json!({ "kind": "invalid" }),
        GuestDecision::Events(id) => json!({ "kind": "events", "eventId": id }),
        GuestDecision::Answers(id) => json!({ "kind": "answers", "questionId": id }),
        GuestDecision::Write(write) => {
            let mut object =
                json!({ "kind": "write", "status": write.status.as_str(), "attendingCount": write.attending_count });
            if let Some(value) = write.rsvp_answers.to_json() {
                object["rsvpAnswers"] = value.unwrap_or(Value::Null);
            }
            if let Some(value) = write.rsvp_event_answers.to_json() {
                object["rsvpEventAnswers"] = value.unwrap_or(Value::Null);
            }
            object
        }
    }
}

#[test]
fn guest_decisions_match_the_typescript_vectors() {
    let v = decisions();
    let defaults = &v["defaults"];
    let cases = v["guest"].as_array().unwrap();
    assert!(cases.len() >= 50);
    let mut kinds = std::collections::BTreeSet::new();
    for case in cases {
        let config = read_rsvp_config(&v["configs"][case["config"].as_str().unwrap()]);
        let guest = merged(&defaults["guest"], case.get("guest"));
        let flags: RsvpFlags = serde_json::from_value(merged(&defaults["flags"], case.get("flags"))).unwrap();
        let submission: RsvpSubmission = serde_json::from_value(case["submission"].clone()).unwrap();
        let now = ms(case.get("now").unwrap_or(&defaults["now"]).as_str().unwrap());
        let state = GuestState {
            guest_count: guest["guestCount"].as_i64().unwrap(),
            invited_event_ids: guest.get("invitedEventIds"),
            rsvp_event_answers: guest.get("rsvpEventAnswers"),
        };
        let decision = decision_json(&decide_guest_rsvp(&config, state, &submission, flags, now));
        kinds.insert(decision["kind"].as_str().unwrap().to_string());
        assert_eq!(decision, case["expect"], "{}", case["name"]);
    }
    assert_eq!(kinds.into_iter().collect::<Vec<_>>(), ["answers", "closed", "events", "invalid", "write"]);
}

#[test]
fn host_overrides_match_the_typescript_vectors() {
    let v = decisions();
    let defaults = &v["defaults"];
    let cases = v["host"].as_array().unwrap();
    assert!(cases.len() >= 15);
    for case in cases {
        let config = read_rsvp_config(&v["configs"][case["config"].as_str().unwrap()]);
        let guest = merged(&defaults["hostGuest"], case.get("guest"));
        let flags = merged(&defaults["flags"], case.get("flags"));
        let state = HostGuestState {
            invited_event_ids: guest.get("invitedEventIds"),
            rsvp_event_answers: guest.get("rsvpEventAnswers"),
            rsvp_status: guest["rsvpStatus"].as_str().unwrap(),
            attending_count: guest["attendingCount"].as_i64(),
        };
        let update = decide_host_rsvp(
            &config,
            state,
            case["status"].as_str().unwrap(),
            case.get("eventId").and_then(Value::as_str),
            flags["perEvent"].as_bool().unwrap(),
            flags["inviteOnlyEvents"].as_bool().unwrap(),
        );
        let actual = match update {
            None => Value::Null,
            Some(update) => {
                let mut object =
                    json!({ "rsvpStatus": update.rsvp_status.as_str(), "attendingCount": update.attending_count });
                if let Some(value) = update.event_answers.to_json() {
                    object["rsvpEventAnswers"] = value.unwrap_or(Value::Null);
                }
                object
            }
        };
        assert_eq!(actual, case["expect"], "{}", case["name"]);
    }
}
