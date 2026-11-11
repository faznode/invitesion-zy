//! The guestbook section of the lenient config read (`lib/invitation/content-read.ts` `normalizeStoredConfig`), judged on
//! its own by the zod rules in `lib/invitation/detail-config.ts`: a section that fails is dropped and reads as the
//! defaults (open, unmoderated, public), so a broken heading also loses the host's switch, exactly as on the page.
//! Unknown keys are stripped, not refused. `read` in `contracts/vectors/wish-decisions.json` pins this.

use serde_json::{Map, Value};

use crate::rsvp::js::{js_trim, utf16_len};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Visibility {
    Public,
    Host,
}

impl Visibility {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Host => "host",
        }
    }
}

/// `guestbookRules` in `lib/invitation/wish-decision.ts`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GuestbookRules {
    pub enabled: bool,
    pub moderation: bool,
    pub visibility: Visibility,
}

impl Default for GuestbookRules {
    fn default() -> Self {
        Self { enabled: true, moderation: false, visibility: Visibility::Public }
    }
}

/// `z.boolean().default(d)`: the default applies to an absent key only; `null` fails.
fn bool_or(object: &Map<String, Value>, key: &str, default: bool) -> Option<bool> {
    match object.get(key) {
        None => Some(default),
        Some(Value::Bool(flag)) => Some(*flag),
        Some(_) => None,
    }
}

/// `optionalText(max)`: a string of at most `max` UTF-16 units after JavaScript's trim, or absent.
fn optional_text_ok(object: &Map<String, Value>, key: &str, max: usize) -> bool {
    match object.get(key) {
        None => true,
        Some(Value::String(text)) => utf16_len(js_trim(text)) <= max,
        Some(_) => false,
    }
}

fn read_section(value: &Value) -> Option<GuestbookRules> {
    let object = value.as_object()?;
    let enabled = bool_or(object, "enabled", true)?;
    if !optional_text_ok(object, "heading", 160) || !optional_text_ok(object, "prompt", 500) {
        return None;
    }
    let moderation = bool_or(object, "moderation", false)?;
    let visibility = match object.get("visibility") {
        None => Visibility::Public,
        Some(Value::String(value)) if value == "public" => Visibility::Public,
        Some(Value::String(value)) if value == "host" => Visibility::Host,
        Some(_) => return None,
    };
    Some(GuestbookRules { enabled, moderation, visibility })
}

/// The guestbook rules of a stored config; anything that is not a JSON object reads as an empty config.
pub fn read_guestbook(raw: &Value) -> GuestbookRules {
    raw.as_object().and_then(|record| record.get("guestbook")).and_then(read_section).unwrap_or_default()
}
