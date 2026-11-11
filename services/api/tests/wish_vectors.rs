//! R-04 parity: the wish vectors the TypeScript suite runs (`tests/wish-decisions.test.ts`), run here against the Rust
//! wishes module: the lenient read of the guestbook section, every guest decision, every reply, the wish states and the
//! moderation outcomes, compared as the same JSON shapes.

use invitesion_api::wishes::content::read_guestbook;
use invitesion_api::wishes::decision::{
    GuestWishDecision, HostReplyDecision, WishState, decide_guest_wish, decide_host_reply, wish_state,
};
use serde_json::{Map, Value, json};

fn vectors() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/wish-decisions.json"))
        .expect("wish-decisions.json parses")
}

/// A text is a string or `{ prefix?, repeat, times, suffix? }`; every text inside a value is expanded.
fn expand(value: &Value) -> Value {
    match value {
        Value::Object(object) if object.contains_key("repeat") && object.contains_key("times") => {
            let part = |key: &str| object.get(key).and_then(Value::as_str).unwrap_or_default().to_string();
            let times = object["times"].as_u64().expect("times is a count") as usize;
            Value::String(format!("{}{}{}", part("prefix"), part("repeat").repeat(times), part("suffix")))
        }
        Value::Object(object) => {
            Value::Object(object.iter().map(|(key, value)| (key.clone(), expand(value))).collect::<Map<_, _>>())
        }
        Value::Array(items) => Value::Array(items.iter().map(expand).collect()),
        other => other.clone(),
    }
}

fn text(value: &Value) -> String {
    expand(value).as_str().expect("a text").to_string()
}

fn config_of(vectors: &Value, entry: &Value) -> Value {
    match entry.get("raw") {
        Some(raw) => expand(raw),
        None => expand(&vectors["configs"][entry["config"].as_str().expect("a config name")]),
    }
}

fn name(entry: &Value) -> &str {
    entry["name"].as_str().unwrap_or("?")
}

#[test]
fn read_the_guestbook_section() {
    let vectors = vectors();
    for entry in vectors["read"].as_array().expect("read cases") {
        let rules = read_guestbook(&config_of(&vectors, entry));
        let got = json!({ "enabled": rules.enabled, "moderation": rules.moderation, "visibility": rules.visibility.as_str() });
        assert_eq!(got, entry["expect"], "{}", name(entry));
    }
}

#[test]
fn guest_decisions() {
    let vectors = vectors();
    for entry in vectors["guest"].as_array().expect("guest cases") {
        let rules = read_guestbook(&config_of(&vectors, entry));
        let got = match decide_guest_wish(rules, &text(&entry["message"])) {
            GuestWishDecision::Closed => json!({ "kind": "closed", "reason": "disabled" }),
            GuestWishDecision::Invalid => json!({ "kind": "invalid" }),
            GuestWishDecision::Write { message, is_hidden } => {
                json!({ "kind": "write", "message": message, "isHidden": is_hidden })
            }
        };
        assert_eq!(got, expand(&entry["expect"]), "{}", name(entry));
    }
}

#[test]
fn host_replies() {
    for entry in vectors()["reply"].as_array().expect("reply cases") {
        let got = match decide_host_reply(&text(&entry["reply"])) {
            HostReplyDecision::Invalid => json!({ "kind": "invalid" }),
            HostReplyDecision::Write(reply) => json!({ "kind": "write", "hostReply": reply }),
        };
        assert_eq!(got, expand(&entry["expect"]), "{}", name(entry));
    }
}

#[test]
fn states_and_moderation() {
    let vectors = vectors();
    for entry in vectors["state"].as_array().expect("state cases") {
        let state = wish_state(entry["isHidden"].as_bool().unwrap(), entry["reviewed"].as_bool().unwrap());
        assert_eq!(serde_json::to_value(state).unwrap(), entry["expect"], "{}", name(entry));
    }
    // `moderationUpdate`: showing and hiding both mark the wish reviewed, so a shown wish is never PENDING again.
    for entry in vectors["moderate"].as_array().expect("moderate cases") {
        let hidden = entry["action"] == "hide";
        assert_eq!(json!({ "isHidden": hidden, "reviewed": true }), entry["expect"], "{}", name(entry));
        assert_ne!(wish_state(hidden, true), WishState::Pending);
    }
}
