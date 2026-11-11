use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use invitesion_api_feasibility::owner_auth::{OwnerAuthError, OwnerVerifier};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use rsa::RsaPrivateKey;
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::traits::PublicKeyParts;
use serde_json::{Value, json};

const ISSUER: &str = "https://clerk.example.invalid";
const PARTY: &str = "https://invitesion.example";
const KID: &str = "test-key-1";

struct Keys {
    encoding: EncodingKey,
    jwks: String,
}

fn keys() -> &'static Keys {
    static KEYS: OnceLock<Keys> = OnceLock::new();
    KEYS.get_or_init(|| {
        let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).expect("RSA key");
        let der = private.to_pkcs1_der().expect("PKCS#1 DER");
        let n = URL_SAFE_NO_PAD.encode(private.n().to_bytes_be());
        let e = URL_SAFE_NO_PAD.encode(private.e().to_bytes_be());
        Keys {
            encoding: EncodingKey::from_rsa_der(der.as_bytes()),
            jwks: json!({ "keys": [{ "kid": KID, "kty": "RSA", "alg": "RS256", "use": "sig", "n": n, "e": e }] }).to_string(),
        }
    })
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn claims() -> Value {
    json!({ "sub": "user_2feasibility", "iss": ISSUER, "exp": now() + 300, "nbf": now() - 5, "iat": now(), "azp": PARTY, "sid": "sess_1" })
}

fn sign(kid: &str, claims: &Value) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(kid.to_string());
    encode(&header, claims, &keys().encoding).expect("sign")
}

fn verifier() -> OwnerVerifier {
    OwnerVerifier::from_jwks_json(ISSUER, &[PARTY], &keys().jwks).expect("verifier")
}

#[test]
fn accepts_a_valid_owner_token() {
    let verified = verifier().verify(&sign(KID, &claims())).expect("valid token");
    assert_eq!(verified.sub, "user_2feasibility");
    assert_eq!(verified.azp.as_deref(), Some(PARTY));
}

#[test]
fn rejects_an_expired_token() {
    let mut c = claims();
    c["exp"] = json!(now() - 120);
    assert!(matches!(verifier().verify(&sign(KID, &c)), Err(OwnerAuthError::Invalid(_))));
}

#[test]
fn rejects_a_token_not_yet_valid() {
    let mut c = claims();
    c["nbf"] = json!(now() + 600);
    assert!(matches!(verifier().verify(&sign(KID, &c)), Err(OwnerAuthError::Invalid(_))));
}

#[test]
fn rejects_another_issuer() {
    let mut c = claims();
    c["iss"] = json!("https://evil.example.invalid");
    assert!(matches!(verifier().verify(&sign(KID, &c)), Err(OwnerAuthError::Invalid(_))));
}

#[test]
fn rejects_a_foreign_or_missing_authorized_party() {
    let mut c = claims();
    c["azp"] = json!("https://evil.example.invalid");
    assert_eq!(verifier().verify(&sign(KID, &c)), Err(OwnerAuthError::AuthorizedParty));
    let mut c = claims();
    c.as_object_mut().unwrap().remove("azp");
    assert_eq!(verifier().verify(&sign(KID, &c)), Err(OwnerAuthError::AuthorizedParty));
}

#[test]
fn rejects_an_unknown_key_id() {
    assert_eq!(verifier().verify(&sign("rotated-away", &claims())), Err(OwnerAuthError::UnknownKey));
}

#[test]
fn rejects_algorithm_confusion() {
    let mut header = Header::new(Algorithm::HS256);
    header.kid = Some(KID.to_string());
    let forged = encode(&header, &claims(), &EncodingKey::from_secret(keys().jwks.as_bytes())).unwrap();
    assert_eq!(verifier().verify(&forged), Err(OwnerAuthError::Algorithm));
}

#[test]
fn rejects_a_tampered_payload() {
    let token = sign(KID, &claims());
    let mut parts: Vec<&str> = token.split('.').collect();
    let mut c = claims();
    c["sub"] = json!("user_someone_else");
    let forged_payload = URL_SAFE_NO_PAD.encode(c.to_string());
    parts[1] = &forged_payload;
    assert!(matches!(verifier().verify(&parts.join(".")), Err(OwnerAuthError::Invalid(_))));
}

#[test]
fn rejects_garbage_and_empty_jwks() {
    assert_eq!(verifier().verify("not-a-token"), Err(OwnerAuthError::Malformed));
    assert!(matches!(OwnerVerifier::from_jwks_json(ISSUER, &[PARTY], r#"{"keys":[]}"#), Err(OwnerAuthError::BadJwks)));
}
