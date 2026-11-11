//! B-033 parity: the roster vectors the TypeScript suite runs (`tests/b033-roster-rules.test.ts`), run here against the
//! Rust port: the constants, B-018's number rule, every row case, slugs, whole imports and self-registrations, compared
//! as the same JSON shapes; and the limiter's identities (`rateLimit`) against `src/limits.rs`.

use std::collections::HashSet;

use invitesion_api::limits::{Limit, address_key, ip_bucket};
use invitesion_api::roster::phone::{WhatsAppNumber, parse_whatsapp_number};
use invitesion_api::roster::rules::{
    self, Existing, ImportVerdict, Known, RegistrationVerdict, RosterRow, RowInput, check_row, claim_slug,
    decide_registration, plan_import,
};
use serde_json::{Map, Value, json};

fn vectors() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/roster-rules.json"))
        .expect("roster-rules.json parses")
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

fn name(entry: &Value) -> &str {
    entry["name"].as_str().unwrap_or("?")
}

/// A field as the API receives it: strings as they are, a number as JavaScript's `String()` writes an integer.
fn field(object: &Value, key: &str) -> Option<String> {
    match object.get(key) {
        Some(Value::String(text)) => Some(text.clone()),
        Some(Value::Number(number)) => Some(number.to_string()),
        _ => None,
    }
}

struct Owned {
    name: Option<String>,
    phone: Option<String>,
    category: Option<String>,
    guest_count: Option<String>,
}

impl Owned {
    fn of(object: &Value) -> Self {
        Owned {
            name: field(object, "name"),
            phone: field(object, "phone"),
            category: field(object, "category"),
            guest_count: field(object, "guestCount"),
        }
    }

    fn input(&self) -> RowInput<'_> {
        RowInput {
            name: self.name.as_deref(),
            phone: self.phone.as_deref(),
            category: self.category.as_deref(),
            guest_count: self.guest_count.as_deref(),
        }
    }
}

fn row_json(row: &RosterRow) -> Value {
    json!({
        "name": row.name,
        "phone": row.phone,
        "category": row.category,
        "guestCount": row.guest_count,
        "digits": row.digits,
    })
}

#[test]
fn the_constants_match() {
    let limits = &vectors()["limits"];
    let got = json!({
        "maxGuests": rules::MAX_GUESTS,
        "maxImportRows": rules::MAX_IMPORT_ROWS,
        "maxPendingRegistrations": rules::MAX_PENDING_REGISTRATIONS,
        "maxSeats": rules::MAX_SEATS,
        "maxRegistrationSeats": rules::MAX_REGISTRATION_SEATS,
        "maxName": rules::MAX_NAME,
        "maxCategory": rules::MAX_CATEGORY,
        "maxPhone": rules::MAX_PHONE,
        "maxBaseSlug": rules::MAX_BASE_SLUG,
    });
    assert_eq!(&got, limits);
}

/// B-013 / D-043: a self-registration counts against the same windows whichever writer is live.
#[test]
fn rate_limit_identities_match_the_typescript_writer() {
    let cases = &vectors()["rateLimit"];
    for entry in cases["addresses"].as_array().expect("address cases") {
        let input = entry["input"].as_str().expect("an address");
        assert_eq!(address_key(input).map_or(Value::Null, Value::from), entry["expect"], "{input:?}");
    }
    for entry in cases["buckets"].as_array().expect("bucket cases") {
        let secret = entry["secret"].as_str().expect("a secret");
        let scope = entry["scope"].as_str().expect("a scope");
        let address = entry["address"].as_str().expect("an address");
        assert_eq!(ip_bucket(secret.as_bytes(), scope, address), entry["expect"].as_str().expect("a bucket"));
    }
    for entry in cases["limitStrings"].as_array().expect("limit cases") {
        let input = entry["input"].as_str().expect("a limit");
        let got = Limit::parse(input)
            .map_or(Value::Null, |limit| json!({ "max": limit.max, "windowSeconds": limit.window_seconds }));
        assert_eq!(got, entry["expect"], "{input:?}");
    }
}

#[test]
fn phone_numbers_follow_b018() {
    for entry in vectors()["phones"].as_array().expect("phone cases") {
        let got = match parse_whatsapp_number(entry["input"].as_str()) {
            WhatsAppNumber::Digits(digits) => json!({ "ok": true, "digits": digits }),
            WhatsAppNumber::Missing => json!({ "ok": false, "reason": "missing" }),
            WhatsAppNumber::Invalid => json!({ "ok": false, "reason": "invalid" }),
        };
        assert_eq!(got, entry["expect"], "{}", name(entry));
    }
}

#[test]
fn every_row_case() {
    for entry in vectors()["rows"].as_array().expect("row cases") {
        let input = Owned::of(&expand(&entry["input"]));
        let max_seats = entry.get("maxSeats").and_then(Value::as_i64).map_or(rules::MAX_SEATS, |seats| seats as i32);
        let got = match check_row(&input.input(), max_seats) {
            Ok(row) => json!({ "ok": true, "row": row_json(&row) }),
            Err(reason) => json!({ "ok": false, "reason": reason.as_str() }),
        };
        assert_eq!(got, expand(&entry["expect"]), "{}", name(entry));
    }
}

#[test]
fn slugs() {
    for entry in vectors()["slugs"].as_array().expect("slug cases") {
        let mut taken: HashSet<String> = entry["taken"]
            .as_array()
            .expect("taken")
            .iter()
            .map(|text| expand(text).as_str().expect("a slug").to_string())
            .collect();
        let expected = expand(&entry["expect"]).as_str().expect("a slug").to_string();
        let got = claim_slug(expand(&entry["input"]).as_str().expect("a name"), &mut taken);
        assert_eq!(got, expected, "{}", name(entry));
        assert!(taken.contains(&expected), "{}: the claimed slug is recorded", name(entry));
    }
}

fn padded(prefix: &str, count: u64) -> Vec<Value> {
    (1..=count).map(|i| json!({ "name": format!("{prefix} {i}"), "phone": null, "slug": format!("isi-{i}") })).collect()
}

#[test]
fn whole_imports() {
    for entry in vectors()["imports"].as_array().expect("import cases") {
        let mut existing_json = entry["existing"].as_array().expect("existing").clone();
        existing_json.extend(padded("Isi", entry.get("padExisting").and_then(Value::as_u64).unwrap_or(0)));
        let existing: Vec<Existing<'_>> = existing_json
            .iter()
            .map(|guest| Existing {
                name: guest["name"].as_str().expect("a name"),
                phone: guest["phone"].as_str(),
                slug: guest["slug"].as_str().expect("a slug"),
            })
            .collect();
        let mut rows_json = entry["rows"].as_array().expect("rows").clone();
        let pad_rows = entry.get("padRows").and_then(Value::as_u64).unwrap_or(0);
        rows_json.extend((1..=pad_rows).map(|i| json!({ "name": format!("Baris {i}") })));
        let owned: Vec<Owned> = rows_json.iter().map(Owned::of).collect();
        let rows: Vec<RowInput<'_>> = owned.iter().map(Owned::input).collect();
        let plan = plan_import(&existing, &rows);
        let refusal = plan.refusal.map(|refusal| serde_json::to_value(refusal).expect("a refusal"));
        let counts = json!({
            "ok": plan.ok,
            "invalid": plan.invalid,
            "duplicate": plan.duplicate,
            "refusal": refusal.unwrap_or(Value::Null),
        });
        if let Some(expect) = entry.get("expect") {
            let verdicts: Vec<Value> = plan
                .verdicts
                .iter()
                .map(|verdict| match verdict {
                    ImportVerdict::Ok { slug, .. } => json!({ "status": "ok", "slug": slug }),
                    ImportVerdict::Invalid(reason) => json!({ "status": "invalid", "reason": reason.as_str() }),
                    ImportVerdict::Duplicate(of) => json!({ "status": "duplicate", "of": of }),
                })
                .collect();
            assert_eq!(Value::Array(verdicts), expect["verdicts"], "{}", name(entry));
            let wanted = json!({
                "ok": expect["ok"],
                "invalid": expect["invalid"],
                "duplicate": expect["duplicate"],
                "refusal": expect["refusal"],
            });
            assert_eq!(counts, wanted, "{}", name(entry));
        }
        if let Some(expect) = entry.get("expectCounts") {
            assert_eq!(&counts, expect, "{}", name(entry));
        }
    }
}

#[test]
fn self_registrations() {
    for entry in vectors()["registrations"].as_array().expect("registration cases") {
        let input = Owned::of(&entry["input"]);
        let people = |list: &Value| -> Vec<(String, Option<String>)> {
            list.as_array()
                .expect("people")
                .iter()
                .map(|person| (person["name"].as_str().expect("a name").to_string(), field(person, "phone")))
                .collect()
        };
        let guests = people(&entry["guests"]);
        let mut pending = people(&entry["pending"]);
        let pad = entry.get("padPending").and_then(Value::as_u64).unwrap_or(0);
        pending.extend((1..=pad).map(|i| (format!("Isi {i}"), None)));
        let guests: Vec<Known<'_>> =
            guests.iter().map(|(name, phone)| Known { name, phone: phone.as_deref() }).collect();
        let pending: Vec<Known<'_>> =
            pending.iter().map(|(name, phone)| Known { name, phone: phone.as_deref() }).collect();
        let got = match decide_registration(&input.input(), &guests, &pending) {
            RegistrationVerdict::Ok(row) => json!({ "status": "ok", "row": row_json(&row) }),
            RegistrationVerdict::Invalid(reason) => json!({ "status": "invalid", "reason": reason.as_str() }),
            RegistrationVerdict::Duplicate => json!({ "status": "duplicate" }),
            RegistrationVerdict::Full => json!({ "status": "full" }),
        };
        assert_eq!(got, entry["expect"], "{}", name(entry));
    }
}
