//! Owner tokens against a JWKS served over HTTP by a local endpoint: the real fetch, cache, refetch-on-unknown-kid and
//! rate-limit paths. Keys are generated per run; no Clerk credential is used (DA-01).

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use invitesion_api::config::install_crypto_provider;
use invitesion_api::owner_auth::{OwnerAuthError, OwnerTokenConfig, OwnerVerifier, parse_jwks};
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use rsa::RsaPrivateKey;
use rsa::pkcs1::EncodeRsaPrivateKey;
use rsa::traits::PublicKeyParts;
use serde_json::{Value, json};

const ISSUER: &str = "https://clerk.example.invalid";
const PARTY: &str = "https://invitesion.example";

struct Key {
    kid: &'static str,
    encoding: EncodingKey,
    jwk: Value,
}

fn make_key(kid: &'static str) -> Key {
    let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).expect("RSA key");
    let der = private.to_pkcs1_der().expect("PKCS#1 DER");
    let n = URL_SAFE_NO_PAD.encode(private.n().to_bytes_be());
    let e = URL_SAFE_NO_PAD.encode(private.e().to_bytes_be());
    Key {
        kid,
        encoding: EncodingKey::from_rsa_der(der.as_bytes()),
        jwk: json!({ "kid": kid, "kty": "RSA", "alg": "RS256", "use": "sig", "n": n, "e": e }),
    }
}

fn keys() -> &'static [Key; 2] {
    static KEYS: OnceLock<[Key; 2]> = OnceLock::new();
    KEYS.get_or_init(|| [make_key("key-a"), make_key("key-b")])
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn claims() -> Value {
    json!({ "sub": "user_owner_test", "iss": ISSUER, "exp": now() + 300, "nbf": now() - 5, "iat": now(), "azp": PARTY, "sid": "sess_1" })
}

fn sign(key: &Key, claims: &Value) -> String {
    let mut header = Header::new(Algorithm::RS256);
    header.kid = Some(key.kid.to_string());
    encode(&header, claims, &key.encoding).expect("sign")
}

#[derive(Clone)]
struct Jwks {
    published: Arc<Mutex<Value>>,
    status: Arc<Mutex<StatusCode>>,
    fetches: Arc<AtomicUsize>,
}

async fn serve_jwks(State(jwks): State<Jwks>) -> (StatusCode, String) {
    jwks.fetches.fetch_add(1, Ordering::SeqCst);
    let status = *jwks.status.lock().unwrap();
    (status, jwks.published.lock().unwrap().to_string())
}

/// A local JWKS endpoint publishing `key-a` only, and a verifier pointed at it.
async fn setup(refresh: Duration) -> (OwnerVerifier, Jwks) {
    install_crypto_provider();
    let jwks = Jwks {
        published: Arc::new(Mutex::new(json!({ "keys": [keys()[0].jwk.clone()] }))),
        status: Arc::new(Mutex::new(StatusCode::OK)),
        fetches: Arc::new(AtomicUsize::new(0)),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/.well-known/jwks.json", listener.local_addr().unwrap());
    let app = Router::new().route("/.well-known/jwks.json", get(serve_jwks)).with_state(jwks.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let config = OwnerTokenConfig { issuer: ISSUER.into(), jwks_url: url, authorized_parties: vec![PARTY.into()] };
    (OwnerVerifier::new(config).expect("verifier").with_refresh_interval(refresh), jwks)
}

#[tokio::test]
async fn accepts_a_valid_token_and_caches_the_keys() {
    let (verifier, jwks) = setup(Duration::from_secs(30)).await;
    let verified = verifier.verify(&sign(&keys()[0], &claims())).await.expect("valid token");
    assert_eq!(verified.sub, "user_owner_test");
    assert_eq!(verified.azp.as_deref(), Some(PARTY));
    verifier.verify(&sign(&keys()[0], &claims())).await.expect("valid again");
    assert_eq!(jwks.fetches.load(Ordering::SeqCst), 1, "the second verification uses the cache");
}

#[tokio::test]
async fn refuses_bad_claims() {
    let (verifier, _) = setup(Duration::from_secs(30)).await;
    let key = &keys()[0];
    let cases: Vec<(&str, Value)> = vec![
        ("expired", json!({ "exp": now() - 60 })),
        ("not yet valid", json!({ "nbf": now() + 60 })),
        ("foreign issuer", json!({ "iss": "https://evil.example.invalid" })),
        ("foreign authorized party", json!({ "azp": "https://evil.example" })),
        ("missing authorized party", json!({ "azp": null })),
    ];
    for (name, patch) in cases {
        let mut c = claims();
        for (k, v) in patch.as_object().unwrap() {
            if v.is_null() {
                c.as_object_mut().unwrap().remove(k);
            } else {
                c[k] = v.clone();
            }
        }
        assert!(verifier.verify(&sign(key, &c)).await.is_err(), "{name}");
    }
    let within_leeway = {
        let mut c = claims();
        c["exp"] = json!(now() - 2);
        c
    };
    assert!(verifier.verify(&sign(key, &within_leeway)).await.is_ok(), "5 s leeway");
}

#[tokio::test]
async fn refuses_forgeries() {
    let (verifier, _) = setup(Duration::from_secs(30)).await;
    let mut hs = Header::new(Algorithm::HS256);
    hs.kid = Some("key-a".into());
    let confused =
        encode(&hs, &claims(), &EncodingKey::from_secret(keys()[0].jwk["n"].as_str().unwrap().as_bytes())).unwrap();
    assert_eq!(verifier.verify(&confused).await, Err(OwnerAuthError::Algorithm));
    let token = sign(&keys()[0], &claims());
    let mut parts: Vec<String> = token.split('.').map(String::from).collect();
    let mut payload = claims();
    payload["sub"] = json!("user_someone_else");
    parts[1] = URL_SAFE_NO_PAD.encode(payload.to_string());
    assert!(matches!(verifier.verify(&parts.join(".")).await, Err(OwnerAuthError::Invalid(_))));
    assert_eq!(verifier.verify("garbage").await, Err(OwnerAuthError::Malformed));
    let mut no_kid = Header::new(Algorithm::RS256);
    no_kid.kid = None;
    let unkeyed = encode(&no_kid, &claims(), &keys()[0].encoding).unwrap();
    assert_eq!(verifier.verify(&unkeyed).await, Err(OwnerAuthError::UnknownKey));
}

#[tokio::test]
async fn refetches_on_an_unknown_kid_once_per_interval_and_follows_a_rotation() {
    let (verifier, jwks) = setup(Duration::from_millis(300)).await;
    verifier.verify(&sign(&keys()[0], &claims())).await.expect("key-a");
    assert_eq!(
        verifier.verify(&sign(&keys()[1], &claims())).await,
        Err(OwnerAuthError::UnknownKey),
        "key-b unpublished"
    );
    for _ in 0..5 {
        assert_eq!(verifier.verify(&sign(&keys()[1], &claims())).await, Err(OwnerAuthError::UnknownKey));
    }
    assert_eq!(jwks.fetches.load(Ordering::SeqCst), 1, "unknown kids inside the interval cause no fetch");
    *jwks.published.lock().unwrap() = json!({ "keys": [keys()[1].jwk.clone()] });
    tokio::time::sleep(Duration::from_millis(350)).await;
    verifier.verify(&sign(&keys()[1], &claims())).await.expect("rotated to key-b");
    assert_eq!(jwks.fetches.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn an_unreachable_jwks_is_unavailability_not_a_bad_token() {
    let (verifier, jwks) = setup(Duration::from_millis(1)).await;
    *jwks.status.lock().unwrap() = StatusCode::BAD_GATEWAY;
    assert_eq!(verifier.verify(&sign(&keys()[0], &claims())).await, Err(OwnerAuthError::KeysUnavailable));
    *jwks.status.lock().unwrap() = StatusCode::OK;
    tokio::time::sleep(Duration::from_millis(5)).await;
    verifier.verify(&sign(&keys()[0], &claims())).await.expect("recovers on the next attempt");
}

#[test]
fn jwks_parsing_keeps_only_rs256_rsa_keys() {
    let rsa = keys()[0].jwk.clone();
    let mut other_alg = rsa.clone();
    other_alg["kid"] = json!("ps");
    other_alg["alg"] = json!("PS256");
    let ec = json!({ "kid": "ec", "kty": "EC", "crv": "P-256", "x": "AA", "y": "AA" });
    let parsed = parse_jwks(&json!({ "keys": [rsa, other_alg, ec] }).to_string()).expect("one usable key");
    assert_eq!(parsed.keys().collect::<Vec<_>>(), vec!["key-a"]);
    assert_eq!(parse_jwks(r#"{"keys":[]}"#).err(), Some(OwnerAuthError::BadJwks));
    assert_eq!(parse_jwks("nope").err(), Some(OwnerAuthError::BadJwks));
}
