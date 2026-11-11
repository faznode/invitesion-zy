//! The JavaScript and zod 3.24.4 semantics the RSVP rules depend on, ported exactly because the TypeScript writer is the
//! specification: `String.prototype.trim`, UTF-16 string lengths, `Number(string)`, `Number.isInteger` on JSON numbers,
//! zod's `datetime({ offset: true })` pattern and V8's `Date.parse` on the strings that pattern accepts. Every behaviour
//! here is pinned by `contracts/vectors/rsvp-*.json`.

use serde_json::Value;

/// ECMAScript WhiteSpace and LineTerminator, the set `trim()` removes. Unlike `char::is_whitespace` it includes U+FEFF
/// and excludes U+0085.
pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{9}' | '\u{A}' | '\u{B}' | '\u{C}' | '\u{D}' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}'
    )
}

pub fn js_trim(value: &str) -> &str {
    value.trim_matches(is_js_whitespace)
}

/// `string.length`: UTF-16 code units, which is what zod's `.max(n)` counts.
pub fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}

fn count_digits(bytes: &[u8]) -> usize {
    bytes.iter().take_while(|b| b.is_ascii_digit()).count()
}

/// StrDecimalLiteral without its sign and without `Infinity`: digits with an optional fraction, or a fraction alone,
/// then an optional exponent.
fn is_decimal_literal(text: &str) -> bool {
    let bytes = text.as_bytes();
    let int_digits = count_digits(bytes);
    let mut at = int_digits;
    let mut fraction_digits = 0;
    if bytes.get(at) == Some(&b'.') {
        fraction_digits = count_digits(&bytes[at + 1..]);
        at += 1 + fraction_digits;
    }
    if int_digits == 0 && fraction_digits == 0 {
        return false;
    }
    if matches!(bytes.get(at), Some(b'e' | b'E')) {
        at += 1;
        if matches!(bytes.get(at), Some(b'+' | b'-')) {
            at += 1;
        }
        let exponent_digits = count_digits(&bytes[at..]);
        if exponent_digits == 0 {
            return false;
        }
        at += exponent_digits;
    }
    at == bytes.len()
}

/// `Number(string)` (ECMAScript StringToNumber): whitespace-only reads as 0, `0x` / `0o` / `0b` integers take no sign,
/// `Infinity` is case-sensitive, and anything else that is not a decimal literal is NaN.
pub fn js_number(value: &str) -> f64 {
    let text = js_trim(value);
    if text.is_empty() {
        return 0.0;
    }
    let bytes = text.as_bytes();
    if bytes.len() > 2 && bytes[0] == b'0' {
        let radix = match bytes[1] {
            b'x' | b'X' => 16,
            b'o' | b'O' => 8,
            b'b' | b'B' => 2,
            _ => 0,
        };
        if radix != 0 {
            let mut number = 0f64;
            for &byte in &bytes[2..] {
                match char::from(byte).to_digit(radix) {
                    Some(digit) => number = number * f64::from(radix) + f64::from(digit),
                    None => return f64::NAN,
                }
            }
            return number;
        }
    }
    let (sign, rest) = match bytes[0] {
        b'+' => (1.0, &text[1..]),
        b'-' => (-1.0, &text[1..]),
        _ => (1.0, text),
    };
    if rest == "Infinity" {
        return sign * f64::INFINITY;
    }
    if !is_decimal_literal(rest) {
        return f64::NAN;
    }
    rest.parse::<f64>().map_or(f64::NAN, |number| sign * number)
}

/// `Number.isInteger` for a JSON number. jsonb keeps `7.0` as written and serde reads it as a float, while JavaScript
/// reads it as 7, so integrality is judged on the value, not the representation.
pub fn json_integer(value: &Value) -> Option<f64> {
    let number = value.as_f64()?;
    (number.is_finite() && number.fract() == 0.0).then_some(number)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DateTimeParts {
    year: i64,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
    millis: u32,
    /// None for `Z`; otherwise (sign, hours, minutes) as written, which the pattern does not bound.
    offset: Option<(i64, u32, u32)>,
}

fn is_leap_year(year: i64) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

/// zod 3.24.4 `datetimeRegex({ offset: true })`: `YYYY-MM-DDTHH:MM[:SS[.f+]](Z|±HH[:]MM)` with real calendar dates
/// (29 February only in Gregorian leap years), hours 00–23, minutes and seconds 00–59, an upper-case `T` and `Z`.
fn datetime_parts(value: &str) -> Option<DateTimeParts> {
    let bytes = value.as_bytes();
    let digit = |at: usize| bytes.get(at).filter(|b| b.is_ascii_digit()).map(|b| u32::from(b - b'0'));
    let number = |at: usize, len: usize| (0..len).try_fold(0u32, |acc, k| digit(at + k).map(|d| acc * 10 + d));
    let literal = |at: usize, expected: u8| bytes.get(at) == Some(&expected);

    let year = number(0, 4)?;
    let month = (literal(4, b'-')).then(|| number(5, 2)).flatten()?;
    let day = (literal(7, b'-')).then(|| number(8, 2)).flatten()?;
    let hour = (literal(10, b'T')).then(|| number(11, 2)).flatten()?;
    let minute = (literal(13, b':')).then(|| number(14, 2)).flatten()?;
    let mut at = 16;
    let (mut second, mut millis) = (0, 0);
    if literal(at, b':') {
        second = number(at + 1, 2)?;
        at += 3;
        if literal(at, b'.') {
            let start = at + 1;
            let digits = count_digits(&bytes[start.min(bytes.len())..]);
            if digits == 0 {
                return None;
            }
            // V8 keeps milliseconds: the first three fraction digits, truncated, never rounded.
            millis = (0..3).fold(0, |acc, k| acc * 10 + if k < digits { digit(start + k).unwrap_or(0) } else { 0 });
            at = start + digits;
        }
    }
    let offset = match bytes.get(at) {
        Some(b'Z') => {
            at += 1;
            None
        }
        Some(&sign @ (b'+' | b'-')) => {
            let hours = number(at + 1, 2)?;
            at += 3;
            if literal(at, b':') {
                at += 1;
            }
            let minutes = number(at, 2)?;
            at += 2;
            Some((if sign == b'+' { 1 } else { -1 }, hours, minutes))
        }
        _ => return None,
    };
    let year = i64::from(year);
    let valid = at == bytes.len()
        && hour <= 23
        && minute <= 59
        && second <= 59
        && (1..=12).contains(&month)
        && (1..=days_in_month(year, month)).contains(&day);
    valid.then_some(DateTimeParts { year, month, day, hour, minute, second, millis, offset })
}

/// Whether zod's `z.string().datetime({ offset: true })` accepts the string.
pub fn is_zod_datetime(value: &str) -> bool {
    datetime_parts(value).is_some()
}

/// Days since 1970-01-01 in the proleptic Gregorian calendar (H. Hinnant's `days_from_civil`).
fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month = i64::from(month);
    let day_of_year = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + i64::from(day) - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

/// V8's `Date.parse` for a string zod accepts, in Unix milliseconds; None where V8 answers NaN (an offset hour above 23
/// or minute above 59, which the pattern lets through). Strings zod refuses never reach the rules and read as None.
pub fn date_parse_ms(value: &str) -> Option<i64> {
    let parts = datetime_parts(value)?;
    let (sign, offset_hours, offset_minutes) = parts.offset.unwrap_or((1, 0, 0));
    if offset_hours > 23 || offset_minutes > 59 {
        return None;
    }
    let seconds_of_day = i64::from(parts.hour * 3600 + parts.minute * 60 + parts.second);
    let local = days_from_civil(parts.year, parts.month, parts.day) * 86_400_000
        + seconds_of_day * 1000
        + i64::from(parts.millis);
    Some(local - sign * i64::from(offset_hours * 60 + offset_minutes) * 60_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trim_follows_ecmascript_not_unicode_white_space() {
        assert_eq!(js_trim("\u{FEFF} a \u{85}"), "a \u{85}");
        assert_eq!(js_trim("\u{200B} x"), "\u{200B} x");
        assert_eq!(js_trim("\u{3000}x\u{2029}"), "x");
        assert_eq!(utf16_len("\u{1F600}a"), 3);
    }

    /// Reference values printed by Node 24 (`Number(s)`), the s27 probe.
    #[test]
    fn number_matches_string_to_number() {
        let cases: [(&str, f64); 17] = [
            (" 3 ", 3.0),
            ("1e1", 10.0),
            ("0x10", 16.0),
            ("0b11", 3.0),
            ("0o7", 7.0),
            ("3.", 3.0),
            (".5", 0.5),
            ("+4", 4.0),
            ("Infinity", f64::INFINITY),
            ("-Infinity", f64::NEG_INFINITY),
            ("+Infinity", f64::INFINITY),
            ("\u{A0}3\u{A0}", 3.0),
            ("3\n", 3.0),
            ("1e400", f64::INFINITY),
            ("00012", 12.0),
            ("0X1F", 31.0),
            ("  ", 0.0),
        ];
        for (input, expected) in cases {
            assert_eq!(js_number(input), expected, "{input:?}");
        }
        for input in ["1_000", "\u{661}\u{662}", "infinity", "0x", "1e", "-0x10", "abc", "0x1g", ".", "e5", "1.2.3"] {
            assert!(js_number(input).is_nan(), "{input:?}");
        }
        assert!(js_number("-0").is_sign_negative());
    }

    /// Reference values printed by Node 24 (`z.string().datetime({ offset: true })` and `Date.parse`), the s27 probe.
    #[test]
    fn datetime_pattern_and_v8_values() {
        let cases: [(&str, bool, Option<i64>); 22] = [
            ("2026-11-06T18:00+08:00", true, Some(1_793_959_200_000)),
            ("2026-11-06T18:00:00+0800", true, Some(1_793_959_200_000)),
            ("2026-11-06T18:00+0800", true, Some(1_793_959_200_000)),
            ("2026-11-06T18:00:00.123456Z", true, Some(1_793_988_000_123)),
            ("2026-11-06T18:00:00.9999Z", true, Some(1_793_988_000_999)),
            ("2026-11-06T18:00:00.5+07:00", true, Some(1_793_962_800_500)),
            ("2026-11-06T18:00:00+99:99", true, None),
            ("2026-11-06T18:00:00+23:59", true, Some(1_793_901_660_000)),
            ("2026-11-06T18:00:00+24:00", true, None),
            ("2026-11-06T18:00:00-00:00", true, Some(1_793_988_000_000)),
            ("2026-11-06T18:00Z", true, Some(1_793_988_000_000)),
            ("0000-01-01T00:00:00Z", true, Some(-62_167_219_200_000)),
            ("9999-12-31T23:59:59.999Z", true, Some(253_402_300_799_999)),
            ("2024-02-29T00:00:00Z", true, Some(1_709_164_800_000)),
            ("1900-02-29T00:00:00Z", false, None),
            ("2026-11-06T18:00:00+08:60", true, None),
            ("2026-11-06T18:00:00.000000000001Z", true, Some(1_793_988_000_000)),
            ("2026-11-06t18:00:00Z", false, None),
            ("2026-11-06T18:00:00z", false, None),
            (" 2026-11-06T18:00:00Z", false, None),
            ("2026-11-06T18:00:00+0", false, None),
            ("2026-11-06T18:00:00.Z", false, None),
        ];
        for (input, accepted, parsed) in cases {
            assert_eq!(is_zod_datetime(input), accepted, "pattern {input:?}");
            assert_eq!(date_parse_ms(input), parsed, "value {input:?}");
        }
        for input in ["2026-11-06T24:00:00Z", "2026-13-01T00:00:00Z", "2026-04-31T00:00:00Z", "2026-11-06T18:60:00Z"] {
            assert!(!is_zod_datetime(input), "{input:?}");
        }
    }

    #[test]
    fn json_integers_are_judged_by_value() {
        assert_eq!(json_integer(&serde_json::json!(7)), Some(7.0));
        let stored: Value = serde_json::from_str("7.0").unwrap();
        assert_eq!(json_integer(&stored), Some(7.0));
        assert_eq!(json_integer(&serde_json::json!(5.5)), None);
        assert_eq!(json_integer(&serde_json::json!("7")), None);
    }
}
