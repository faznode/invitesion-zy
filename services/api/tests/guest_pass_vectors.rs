//! B-024 parity (D-056): the guest-pass vectors the TypeScript suite runs (`tests/b024-guest-pass.test.ts`), run here
//! against the Rust port: every signed token, every read (shape, MAC with the accepted secrets, expiry), every scan time
//! and every opt-in reading, and every batch's serialised request, idempotency hash and scope, compared as the same
//! values.

use invitesion_api::idempotency;
use invitesion_api::roster::http::PassCheckinRequest;
use invitesion_api::roster::pass::{self, PassRead};
use serde_json::{Value, json};
use time::format_description::well_known::Rfc3339;
use time::{OffsetDateTime, PrimitiveDateTime};

fn vectors() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/guest-pass.json")).expect("guest-pass.json parses")
}

fn secret(vectors: &Value, name: &str) -> Vec<u8> {
    vectors["secrets"][name].as_str().expect("named secret").as_bytes().to_vec()
}

fn read_json(read: &PassRead) -> Value {
    match read {
        PassRead::Valid { pass_id, expires_at } => {
            json!({ "kind": "valid", "passId": pass_id, "expiresAt": expires_at })
        }
        PassRead::Expired { pass_id, expires_at } => {
            json!({ "kind": "expired", "passId": pass_id, "expiresAt": expires_at })
        }
        PassRead::Invalid => json!({ "kind": "invalid" }),
    }
}

fn instant(raw: &str) -> PrimitiveDateTime {
    let at = OffsetDateTime::parse(raw, &Rfc3339).expect("vector time");
    PrimitiveDateTime::new(at.date(), at.time())
}

#[test]
fn every_signed_token_is_the_typescript_one() {
    let v = vectors();
    let signs = v["signs"].as_array().expect("signs");
    assert!(!signs.is_empty());
    for case in signs {
        let token = pass::sign(
            &secret(&v, case["secret"].as_str().unwrap()),
            case["passId"].as_str().unwrap(),
            u32::try_from(case["expiresAt"].as_u64().unwrap()).unwrap(),
        );
        assert_eq!(token.as_deref(), case["token"].as_str(), "{case}");
    }
}

#[test]
fn every_read_matches_the_typescript_rules() {
    let v = vectors();
    let reads = v["reads"].as_array().expect("reads");
    assert_eq!(reads.len(), 20);
    for case in reads {
        let secrets: Vec<Vec<u8>> =
            case["secrets"].as_array().unwrap().iter().map(|name| secret(&v, name.as_str().unwrap())).collect();
        let read = pass::read(case["token"].as_str().unwrap(), &secrets, case["now"].as_i64().unwrap());
        assert_eq!(read_json(&read), case["expect"], "{}", case["name"]);
    }
}

#[test]
fn every_scan_time_and_opt_in_matches_the_typescript_rules() {
    let v = vectors();
    for case in v["scanTimes"].as_array().expect("scan times") {
        let at = pass::check_in_time(case["scannedAt"].as_str(), instant(case["now"].as_str().unwrap()));
        assert_eq!(pass::iso_millis(at), case["expect"].as_str().unwrap(), "{}", case["name"]);
    }
    for case in v["enabled"].as_array().expect("opt-in readings") {
        assert_eq!(pass::check_in_enabled(&case["config"]), case["expect"].as_bool().unwrap(), "{}", case["name"]);
    }
}

/// A batch the TypeScript writer recorded replays here and the other way round: the request the API receives serialises
/// to the TypeScript canonical JSON, so both writers store the same request hash under the same scope.
#[test]
fn every_batch_hash_and_scope_is_the_typescript_writers() {
    let v = vectors();
    let requests = v["requests"].as_array().expect("requests");
    assert_eq!(requests.len(), 6);
    for case in requests {
        let request: PassCheckinRequest =
            serde_json::from_value(json!({ "scans": case["sent"] })).expect("the request the API receives");
        assert_eq!(serde_json::to_string(&request).unwrap(), case["canonical"].as_str().unwrap(), "{}", case["name"]);
        assert_eq!(idempotency::request_hash(&request), case["hash"].as_str().unwrap(), "{}", case["name"]);
    }
    for case in v["scopes"].as_array().expect("scopes") {
        let owner = i32::try_from(case["owner"].as_i64().unwrap()).unwrap();
        let invitation = i32::try_from(case["invitation"].as_i64().unwrap()).unwrap();
        assert_eq!(
            idempotency::host_scope("roster:pass-checkins", owner, invitation, 0),
            case["scope"].as_str().unwrap()
        );
    }
}
