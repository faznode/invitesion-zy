//! AWS Signature Version 4, ported from `lib/storage/sigv4.ts` and checked against the same published AWS case
//! (`aws-sig-v4-test-suite`, `get-vanilla`) as `tests/sigv4.test.ts`. Only `host` and `x-amz-date` (and a session token)
//! are added here; S3's `x-amz-content-sha256` is the caller's, which keeps this comparable with AWS's generic vectors.

use hmac::{Hmac, KeyInit, Mac};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use url::Url;

const ALGORITHM: &str = "AWS4-HMAC-SHA256";

pub struct SignInput<'a> {
    pub method: &'a str,
    /// Full request URL, including any query string.
    pub url: &'a str,
    pub region: &'a str,
    pub service: &'a str,
    pub access_key_id: &'a str,
    pub secret_access_key: &'a str,
    pub session_token: Option<&'a str>,
    /// Hex SHA-256 of the request body.
    pub payload_hash: &'a str,
    /// Extra headers to sign. `host` is derived from the URL.
    pub headers: &'a [(&'a str, &'a str)],
    /// Signing instant, injected so tests are deterministic.
    pub date: OffsetDateTime,
}

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

fn hmac(key: &[u8], data: &str) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(data.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

/// `20150830T123600Z` and `20150830`.
fn amz_date(date: OffsetDateTime) -> (String, String) {
    let long = format!(
        "{:04}{:02}{:02}T{:02}{:02}{:02}Z",
        date.year(),
        u8::from(date.month()),
        date.day(),
        date.hour(),
        date.minute(),
        date.second()
    );
    let short = long[..8].to_string();
    (long, short)
}

/// RFC 3986 encoding of the UTF-8 bytes: only `A–Z a–z 0–9 - _ . ~` stay literal (what `encodeURIComponent` keeps,
/// minus `!'()*`, which AWS expects escaped); `/` survives when `encode_slash` is false.
pub fn uri_encode(value: &str, encode_slash: bool) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char),
            b'/' if !encode_slash => out.push('/'),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// `decodeURIComponent` for a path: `%XX` becomes its byte, everything else (a `+` included) stays literal.
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex_pair = bytes
            .get(i + 1..i + 3)
            .filter(|pair| pair.iter().all(u8::is_ascii_hexdigit))
            .and_then(|pair| std::str::from_utf8(pair).ok());
        match (bytes[i], hex_pair.and_then(|pair| u8::from_str_radix(pair, 16).ok())) {
            (b'%', Some(byte)) => {
                out.push(byte);
                i += 3;
            }
            (byte, _) => {
                out.push(byte);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn canonical_query(url: &Url) -> String {
    let mut pairs: Vec<(String, String)> = url.query_pairs().map(|(k, v)| (k.into_owned(), v.into_owned())).collect();
    pairs.sort();
    pairs.iter().map(|(k, v)| format!("{}={}", uri_encode(k, true), uri_encode(v, true))).collect::<Vec<_>>().join("&")
}

/// Canonical headers collapse internal runs of whitespace and trim the edges.
fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Signs a request and returns the headers to send (sorted by name), `authorization` last.
pub fn sign_request(input: &SignInput) -> Result<Vec<(String, String)>, url::ParseError> {
    let url = Url::parse(input.url)?;
    let (long, short) = amz_date(input.date);
    let host = match (url.host_str(), url.port()) {
        (Some(host), Some(port)) => format!("{host}:{port}"),
        (Some(host), None) => host.to_string(),
        (None, _) => String::new(),
    };

    let mut headers: Vec<(String, String)> = vec![("host".into(), host), ("x-amz-date".into(), long.clone())];
    for (name, value) in input.headers {
        let name = name.to_ascii_lowercase();
        headers.retain(|(existing, _)| *existing != name);
        headers.push((name, (*value).to_string()));
    }
    if let Some(token) = input.session_token {
        headers.retain(|(existing, _)| existing != "x-amz-security-token");
        headers.push(("x-amz-security-token".into(), token.to_string()));
    }
    headers.sort_by(|a, b| a.0.cmp(&b.0));

    let canonical_headers: String = headers.iter().map(|(n, v)| format!("{n}:{}\n", collapse_whitespace(v))).collect();
    let signed_headers = headers.iter().map(|(n, _)| n.as_str()).collect::<Vec<_>>().join(";");
    let canonical_request = [
        input.method.to_ascii_uppercase(),
        // The path is not normalised: S3 signs the literal path it is given.
        uri_encode(&percent_decode(url.path()), false),
        canonical_query(&url),
        canonical_headers,
        signed_headers.clone(),
        input.payload_hash.to_string(),
    ]
    .join("\n");

    let scope = format!("{short}/{}/{}/aws4_request", input.region, input.service);
    let string_to_sign = [ALGORITHM, &long, &scope, &sha256_hex(canonical_request.as_bytes())].join("\n");
    let k_date = hmac(format!("AWS4{}", input.secret_access_key).as_bytes(), &short);
    let k_region = hmac(&k_date, input.region);
    let k_service = hmac(&k_region, input.service);
    let k_signing = hmac(&k_service, "aws4_request");
    let signature = hex::encode(hmac(&k_signing, &string_to_sign));

    headers.push((
        "authorization".into(),
        format!(
            "{ALGORITHM} Credential={}/{scope}, SignedHeaders={signed_headers}, Signature={signature}",
            input.access_key_id
        ),
    ));
    Ok(headers)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EMPTY_SHA256: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    fn example<'a>(
        method: &'a str,
        url: &'a str,
        payload_hash: &'a str,
        headers: &'a [(&'a str, &'a str)],
    ) -> SignInput<'a> {
        SignInput {
            method,
            url,
            region: "us-east-1",
            service: "service",
            access_key_id: "AKIDEXAMPLE",
            secret_access_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            session_token: None,
            payload_hash,
            headers,
            date: OffsetDateTime::from_unix_timestamp(1_440_938_160).unwrap(), // 2015-08-30T12:36:00Z
        }
    }

    fn header<'a>(headers: &'a [(String, String)], name: &str) -> &'a str {
        headers.iter().find(|(n, _)| n == name).map(|(_, v)| v.as_str()).unwrap_or_default()
    }

    #[test]
    fn empty_sha256_matches_the_documented_constant() {
        assert_eq!(sha256_hex(b""), EMPTY_SHA256);
    }

    #[test]
    fn get_vanilla_reproduces_the_aws_reference_signature() {
        let signed = sign_request(&example("GET", "https://example.amazonaws.com/", EMPTY_SHA256, &[])).unwrap();
        assert_eq!(
            header(&signed, "authorization"),
            "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, \
             SignedHeaders=host;x-amz-date, \
             Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"
        );
        assert_eq!(header(&signed, "x-amz-date"), "20150830T123600Z");
        assert_eq!(header(&signed, "host"), "example.amazonaws.com");
    }

    #[test]
    fn payload_and_signed_headers_change_the_signature() {
        let base = sign_request(&example("PUT", "https://example.amazonaws.com/a", EMPTY_SHA256, &[])).unwrap();
        let other_body = sha256_hex(b"x");
        let body = sign_request(&example("PUT", "https://example.amazonaws.com/a", &other_body, &[])).unwrap();
        let with_type = sign_request(&example(
            "PUT",
            "https://example.amazonaws.com/a",
            EMPTY_SHA256,
            &[("Content-Type", "image/webp")],
        ))
        .unwrap();
        assert_ne!(header(&base, "authorization"), header(&body, "authorization"));
        assert_ne!(header(&base, "authorization"), header(&with_type, "authorization"));
        assert!(header(&with_type, "authorization").contains("SignedHeaders=content-type;host;x-amz-date"));
    }

    #[test]
    fn uri_encoding_matches_rfc_3986_as_aws_expects() {
        assert_eq!(uri_encode("a b!'()*~.-_", true), "a%20b%21%27%28%29%2A~.-_");
        assert_eq!(uri_encode("variants/12/x.webp", false), "variants/12/x.webp");
        assert_eq!(uri_encode("variants/12/x.webp", true), "variants%2F12%2Fx.webp");
        assert_eq!(uri_encode("é", true), "%C3%A9");
    }
}
