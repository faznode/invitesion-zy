//! B-018's number rule (`parseWhatsAppNumber` in `lib/invitation/whatsapp.ts`), ported for the roster: the duplicate
//! key and the refusal of a number that cannot be a WhatsApp number. `08…`, `62…`, `+62…`, `0062…`, a bare `8…` and
//! `+62 (0)8…` give the same digits; a number written with another country code is kept as written when it has 8–15
//! digits. The "phones" cases of `contracts/vectors/roster-rules.json` run both implementations.

use super::rules::is_js_space;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WhatsAppNumber {
    /// E.164 digits without the plus.
    Digits(String),
    Missing,
    Invalid,
}

const INDONESIA: &str = "62";

pub fn parse_whatsapp_number(phone: Option<&str>) -> WhatsAppNumber {
    let compact: String =
        phone.unwrap_or_default().chars().filter(|&c| !is_js_space(c) && !matches!(c, '.' | '-' | '(' | ')')).collect();
    if compact.is_empty() {
        return WhatsAppNumber::Missing;
    }
    let unsigned = compact.strip_prefix('+').unwrap_or(&compact);
    if unsigned.is_empty() || !unsigned.bytes().all(|b| b.is_ascii_digit()) {
        return WhatsAppNumber::Invalid;
    }
    let international = compact.starts_with('+') || compact.starts_with("00");
    let digits = compact.strip_prefix('+').or_else(|| compact.strip_prefix("00")).unwrap_or(&compact);
    if international && !digits.starts_with(INDONESIA) {
        let usable = (8..=15).contains(&digits.len()) && !digits.starts_with('0');
        return if usable { WhatsAppNumber::Digits(digits.to_string()) } else { WhatsAppNumber::Invalid };
    }
    let national = match digits.strip_prefix(INDONESIA) {
        Some(rest) => rest.strip_prefix('0').unwrap_or(rest),
        None => digits.strip_prefix('0').unwrap_or(digits),
    };
    if national.starts_with('8') && (9..=12).contains(&national.len()) {
        WhatsAppNumber::Digits(format!("{INDONESIA}{national}"))
    } else {
        WhatsAppNumber::Invalid
    }
}
