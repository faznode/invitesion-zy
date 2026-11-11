//! B-024 (I-01, D-056): the guest pass, the port of `lib/invitation/guest-pass.ts`. Token: `IVP1.` + base64url(pass
//! id (16 bytes) ‖ expiry (u32 big-endian, unix seconds) ‖ the first 16 bytes of HMAC-SHA256(secret,
//! "invitesion.guest-pass.v1" ‖ 0x00 ‖ pass id ‖ expiry)). Reading checks the shape, then the MAC against every accepted
//! secret, then the expiry, so a forged token never learns whether it would have expired. Both languages run the
//! vectors in `contracts/vectors/guest-pass.json`.

use hmac::{Hmac, KeyInit, Mac};
use serde_json::Value;
use sha2::Sha256;
use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime, PrimitiveDateTime};

pub const PREFIX: &str = "IVP1.";
pub const TOKEN_LEN: usize = PREFIX.len() + 48;
/// Secrets shorter than this are refused at startup.
pub const MIN_SECRET_BYTES: usize = 32;
/// A scan queued offline keeps its own time for up to a day; anything older or in the future is stored as "now".
pub const SCAN_MAX_AGE_SECONDS: i64 = 86_400;
pub const MAX_SCANS_PER_BATCH: usize = 50;
pub const MAX_TOKEN_CHARS: usize = 200;
pub const MAX_SCANNED_AT_CHARS: usize = 40;

const MAC_LABEL: &[u8] = b"invitesion.guest-pass.v1";
const MAC_BYTES: usize = 16;
const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PassRead {
    Valid { pass_id: String, expires_at: u32 },
    Expired { pass_id: String, expires_at: u32 },
    Invalid,
}

fn mac_of(secret: &[u8], id: &[u8], expiry: &[u8]) -> [u8; MAC_BYTES] {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts any key length");
    mac.update(MAC_LABEL);
    mac.update(&[0]);
    mac.update(id);
    mac.update(expiry);
    let full = mac.finalize().into_bytes();
    let mut out = [0u8; MAC_BYTES];
    out.copy_from_slice(&full[..MAC_BYTES]);
    out
}

fn sextet(byte: u8) -> Option<u32> {
    match byte {
        b'A'..=b'Z' => Some(u32::from(byte - b'A')),
        b'a'..=b'z' => Some(u32::from(byte - b'a') + 26),
        b'0'..=b'9' => Some(u32::from(byte - b'0') + 52),
        b'-' => Some(62),
        b'_' => Some(63),
        _ => None,
    }
}

/// Exactly 48 base64url characters to 36 bytes (no padding: 36 is a multiple of 3); anything else is None.
fn decode_body(body: &str) -> Option<[u8; 36]> {
    let bytes = body.as_bytes();
    if bytes.len() != 48 {
        return None;
    }
    let mut out = [0u8; 36];
    for (i, chunk) in bytes.chunks(4).enumerate() {
        let mut n = 0u32;
        for &byte in chunk {
            n = n << 6 | sextet(byte)?;
        }
        out[i * 3] = (n >> 16) as u8;
        out[i * 3 + 1] = (n >> 8) as u8;
        out[i * 3 + 2] = n as u8;
    }
    Some(out)
}

fn encode_body(bytes: &[u8; 36]) -> String {
    let mut out = String::with_capacity(48);
    for chunk in bytes.chunks(3) {
        let n = u32::from(chunk[0]) << 16 | u32::from(chunk[1]) << 8 | u32::from(chunk[2]);
        for shift in [18, 12, 6, 0] {
            out.push(ALPHABET[(n >> shift & 63) as usize] as char);
        }
    }
    out
}

pub fn is_pass_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// The token for a pass id and expiry; signing happens in Next.js (the pass page), so only tests call this.
pub fn sign(secret: &[u8], pass_id: &str, expires_at: u32) -> Option<String> {
    if !is_pass_id(pass_id) {
        return None;
    }
    let id = hex::decode(pass_id).ok()?;
    let expiry = expires_at.to_be_bytes();
    let mut body = [0u8; 36];
    body[..16].copy_from_slice(&id);
    body[16..20].copy_from_slice(&expiry);
    body[20..].copy_from_slice(&mac_of(secret, &id, &expiry));
    Some(format!("{PREFIX}{}", encode_body(&body)))
}

pub fn read(token: &str, secrets: &[Vec<u8>], now_seconds: i64) -> PassRead {
    if token.len() != TOKEN_LEN || !token.starts_with(PREFIX) {
        return PassRead::Invalid;
    }
    let Some(body) = decode_body(&token[PREFIX.len()..]) else { return PassRead::Invalid };
    let (id, rest) = body.split_at(16);
    let (expiry, mac) = rest.split_at(4);
    let genuine = secrets.iter().any(|secret| {
        let expected = mac_of(secret, id, expiry);
        expected.iter().zip(mac).fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
    });
    if !genuine {
        return PassRead::Invalid;
    }
    let pass_id = hex::encode(id);
    let expires_at = u32::from_be_bytes([expiry[0], expiry[1], expiry[2], expiry[3]]);
    if now_seconds > i64::from(expires_at) {
        PassRead::Expired { pass_id, expires_at }
    } else {
        PassRead::Valid { pass_id, expires_at }
    }
}

/// `YYYY-MM-DDTHH:MM:SS[.f{1,3}]Z` with seconds 00–59, the only form `checkInTime` accepts.
fn is_strict_utc(raw: &str) -> bool {
    let b = raw.as_bytes();
    let digits = |from: usize, to: usize| b[from..to].iter().all(u8::is_ascii_digit);
    if b.len() < 20 || b[b.len() - 1] != b'Z' {
        return false;
    }
    let head = digits(0, 4)
        && b[4] == b'-'
        && digits(5, 7)
        && b[7] == b'-'
        && digits(8, 10)
        && b[10] == b'T'
        && digits(11, 13)
        && b[13] == b':'
        && digits(14, 16)
        && b[16] == b':'
        && digits(17, 19)
        && b[17] <= b'5';
    head && match b.len() {
        20 => true,
        22..=24 => b[19] == b'.' && digits(20, b.len() - 1),
        _ => false,
    }
}

/// `checkInTime`: a strict UTC timestamp keeps its own time within the last day; an older one is stored a day before
/// now (the oldest kept time), a future one as now. Absent, malformed or impossible values are stored as now.
pub fn check_in_time(scanned_at: Option<&str>, now: PrimitiveDateTime) -> PrimitiveDateTime {
    let Some(raw) = scanned_at.filter(|raw| is_strict_utc(raw)) else { return now };
    let Ok(parsed) = OffsetDateTime::parse(raw, &Rfc3339) else { return now };
    let at = PrimitiveDateTime::new(parsed.date(), parsed.time());
    at.clamp(now - Duration::seconds(SCAN_MAX_AGE_SECONDS), now)
}

/// `passCheckInEnabled`: the invitation's opt-in, `checkInSettings.enabled === true` in the stored config.
pub fn check_in_enabled(config: &Value) -> bool {
    config.get("checkInSettings").and_then(|settings| settings.get("enabled")) == Some(&Value::Bool(true))
}

/// A stored time as JavaScript's `toISOString()` writes it (milliseconds, truncated; `Z`).
pub fn iso_millis(at: PrimitiveDateTime) -> String {
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        at.year(),
        u8::from(at.month()),
        at.day(),
        at.hour(),
        at.minute(),
        at.second(),
        at.millisecond()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"test-guest-pass-secret-of-32-bytes-at-least";

    #[test]
    fn a_signed_pass_reads_back_and_a_flipped_character_does_not() {
        let token = sign(SECRET, "0123456789abcdef0123456789abcdef", 2_000_000_000).expect("signs");
        assert_eq!(token.len(), TOKEN_LEN);
        assert_eq!(
            read(&token, &[SECRET.to_vec()], 1_900_000_000),
            PassRead::Valid { pass_id: "0123456789abcdef0123456789abcdef".into(), expires_at: 2_000_000_000 }
        );
        let mut flipped = token.clone().into_bytes();
        flipped[10] = if flipped[10] == b'A' { b'B' } else { b'A' };
        assert_eq!(read(std::str::from_utf8(&flipped).unwrap(), &[SECRET.to_vec()], 1_900_000_000), PassRead::Invalid);
        assert_eq!(read(&token, &[b"another-secret-of-thirty-two-bytes!!".to_vec()], 1_900_000_000), PassRead::Invalid);
    }

    #[test]
    fn scan_times_outside_the_day_or_the_strict_form_become_now() {
        let now = PrimitiveDateTime::new(
            time::Date::from_calendar_date(2026, time::Month::November, 7).unwrap(),
            time::Time::from_hms_milli(12, 0, 0, 0).unwrap(),
        );
        assert_eq!(iso_millis(check_in_time(Some("2026-11-07T11:30:00.250Z"), now)), "2026-11-07T11:30:00.250Z");
        assert_eq!(iso_millis(check_in_time(Some("2026-11-05T11:30:00Z"), now)), "2026-11-06T12:00:00.000Z");
        assert_eq!(iso_millis(check_in_time(Some("2026-11-07T13:00:00Z"), now)), "2026-11-07T12:00:00.000Z");
        assert_eq!(iso_millis(check_in_time(Some("2026-11-07T11:30:60Z"), now)), "2026-11-07T12:00:00.000Z");
        assert_eq!(iso_millis(check_in_time(Some("2026-11-07 11:30:00Z"), now)), "2026-11-07T12:00:00.000Z");
    }
}
