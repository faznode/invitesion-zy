//! The shared service-signature vectors (`contracts/vectors/service-signature.json`), whose expected headers were
//! computed by an independent implementation. `tests/api-contract.test.ts` runs the same file against the TypeScript
//! signer, so both sides of the boundary agree byte for byte.

use invitesion_api::service_auth::{MAX_SKEW_SECONDS, ServiceAuthError, sign, verify};
use serde_json::Value;

fn vectors() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/service-signature.json")).expect("vectors parse")
}

fn text<'a>(case: &'a Value, key: &str) -> &'a str {
    case[key].as_str().unwrap_or_else(|| panic!("{key} in {case}"))
}

#[test]
fn signs_every_vector_exactly() {
    let v = vectors();
    assert_eq!(v["maxSkewSeconds"].as_i64(), Some(MAX_SKEW_SECONDS));
    let secret = text(&v, "secret").as_bytes();
    let cases = v["signs"].as_array().expect("signs");
    assert!(cases.len() >= 5);
    for case in cases {
        let t = case["timestamp"].as_i64().unwrap();
        let header = sign(secret, t, text(case, "method"), text(case, "pathAndQuery"), text(case, "body").as_bytes());
        assert_eq!(header, text(case, "header"), "{}", text(case, "name"));
        let accepted = verify(
            &[secret.to_vec()],
            &header,
            text(case, "method"),
            text(case, "pathAndQuery"),
            text(case, "body").as_bytes(),
            t,
        );
        assert_eq!(accepted, Ok(()), "{}", text(case, "name"));
    }
}

#[test]
fn refuses_every_rejection_vector_for_its_reason() {
    let v = vectors();
    let secrets = [text(&v, "secret").as_bytes().to_vec()];
    for case in v["rejects"].as_array().expect("rejects") {
        let expected = match text(case, "reason") {
            "stale" => ServiceAuthError::Stale,
            "mismatch" => ServiceAuthError::Mismatch,
            "malformed" => ServiceAuthError::Malformed,
            other => panic!("unknown reason {other}"),
        };
        let result = verify(
            &secrets,
            text(case, "header"),
            text(case, "method"),
            text(case, "pathAndQuery"),
            text(case, "body").as_bytes(),
            case["now"].as_i64().unwrap(),
        );
        assert_eq!(result, Err(expected), "{}", text(case, "name"));
    }
}

#[test]
fn accepts_the_previous_secret_only_while_it_is_configured() {
    let v = vectors();
    let rotation = &v["rotation"];
    let current = text(&v, "secret").as_bytes().to_vec();
    let previous = text(&v, "previousSecret").as_bytes().to_vec();
    let args =
        (text(rotation, "header"), text(rotation, "method"), text(rotation, "pathAndQuery"), text(rotation, "body"));
    let now = rotation["now"].as_i64().unwrap();
    assert_eq!(verify(&[current.clone(), previous], args.0, args.1, args.2, args.3.as_bytes(), now), Ok(()));
    assert_eq!(verify(&[current], args.0, args.1, args.2, args.3.as_bytes(), now), Err(ServiceAuthError::Mismatch));
}
