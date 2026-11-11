//! B-035: the decision every content write makes under the invitation's row lock, the port of
//! `lib/invitation/content-rules.ts` with D-040's reference rule (`media-ownership.ts`, `image-url.ts`) and the theme
//! rule (`theme-entitlement.ts`: B-041, with B-036's switch within the tier, D-054). Parity:
//! `contracts/vectors/content-rules.json` (`tests/content_vectors.rs`).
//!
//! Order: a stale base is refused before the content is judged, then references, then the theme. The version is
//! `max(invitation_versions.version_no)` for the invitation, 0 without a row.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::problem::ProblemIssue;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tier {
    Standard,
    Premium,
}

/// What every guest page renders when its palette is missing or unknown; never Premium.
pub const FALLBACK_PALETTE_ID: &str = "ivory";

/// Every registered palette (`palettes.ts`) and the tier it needs: Standard for the fallback and any palette a free catalog
/// theme uses (`templates.ts`), Premium otherwise. The vectors carry the TypeScript registry, so a palette added there
/// fails this crate's suite until it is added here.
pub const PALETTES: &[(&str, Tier)] = &[
    ("ivory", Tier::Standard),
    ("rose-gold", Tier::Standard),
    ("confetti", Tier::Standard),
    ("sage", Tier::Standard),
    ("sand", Tier::Standard),
    ("slate", Tier::Standard),
    ("midnight", Tier::Premium),
    ("terracotta", Tier::Standard),
    ("orchid", Tier::Premium),
    ("emerald", Tier::Standard),
    ("dusk", Tier::Standard),
    ("mocha", Tier::Standard),
    ("ocean", Tier::Standard),
    ("blossom", Tier::Premium),
    ("gold-noir", Tier::Premium),
    ("lavender", Tier::Standard),
    ("mint", Tier::Standard),
    ("sunshine", Tier::Standard),
];

pub fn palette_tier(palette_id: &str) -> Option<Tier> {
    PALETTES.iter().find(|(id, _)| *id == palette_id).map(|(_, tier)| *tier)
}

/// B-036 (D-054): every catalog theme (`templates.ts`, by catalog id, not a `templates` row id) and the tier it needs:
/// free themes are Standard, premium and signature themes Premium (`template-sync.ts`: `is_premium = tier !== 'free'`).
/// Catalog order. The vectors carry the TypeScript catalog, so a theme added there fails this crate's suite until it is
/// added here.
pub const TEMPLATES: &[(i32, Tier)] = &[
    (101, Tier::Premium),
    (102, Tier::Premium),
    (103, Tier::Standard),
    (104, Tier::Premium),
    (105, Tier::Premium),
    (106, Tier::Premium),
    (107, Tier::Standard),
    (108, Tier::Premium),
    (109, Tier::Premium),
    (110, Tier::Premium),
    (138, Tier::Standard),
    (139, Tier::Premium),
    (140, Tier::Premium),
    (141, Tier::Standard),
    (142, Tier::Premium),
    (111, Tier::Standard),
    (112, Tier::Premium),
    (143, Tier::Standard),
    (144, Tier::Premium),
    (113, Tier::Standard),
    (114, Tier::Premium),
    (115, Tier::Standard),
    (116, Tier::Standard),
    (117, Tier::Premium),
    (118, Tier::Standard),
    (119, Tier::Premium),
    (145, Tier::Standard),
    (120, Tier::Standard),
    (121, Tier::Standard),
    (122, Tier::Premium),
    (123, Tier::Standard),
    (124, Tier::Standard),
    (146, Tier::Premium),
    (125, Tier::Standard),
    (126, Tier::Premium),
    (127, Tier::Standard),
    (128, Tier::Standard),
    (129, Tier::Premium),
    (130, Tier::Standard),
    (131, Tier::Premium),
    (132, Tier::Standard),
    (133, Tier::Standard),
    (134, Tier::Premium),
    (147, Tier::Standard),
    (135, Tier::Standard),
    (136, Tier::Premium),
    (137, Tier::Premium),
    (148, Tier::Standard),
    (149, Tier::Standard),
    (150, Tier::Standard),
    (151, Tier::Premium),
    (152, Tier::Standard),
    (153, Tier::Standard),
    (154, Tier::Standard),
    (155, Tier::Premium),
    (156, Tier::Standard),
    (157, Tier::Standard),
    (158, Tier::Standard),
    (159, Tier::Premium),
    (160, Tier::Premium),
    (161, Tier::Premium),
    (162, Tier::Standard),
    (163, Tier::Premium),
    (164, Tier::Standard),
];

/// The tier a catalog theme needs, or none for an id the catalog does not know. A template id is any JSON number,
/// compared by value as JavaScript compares numbers, so `101.0` is theme 101 and `101.5` is no theme.
pub fn catalog_theme_tier(template_id: f64) -> Option<Tier> {
    TEMPLATES.iter().find(|(id, _)| f64::from(*id) == template_id).map(|(_, tier)| *tier)
}

/// G-041: the section-order options every family contract declares (`family-manifest.ts`). The vectors carry the
/// TypeScript list, so an option added there fails this crate's suite until it is added here.
pub const SECTION_ORDERS: &[&str] = &["standard", "story-first", "photos-last"];

/// G-041: the font pairings over the families' two faces (`family-manifest.ts`), checked the same way.
pub const FONT_PAIRINGS: &[&str] = &["serif-display", "sans"];

/// A config's theme fields, read leniently: a template id is any JSON number (compared by value, as JavaScript compares
/// numbers), a palette id, section order or font pairing any string; anything else is absent.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ThemeFields {
    pub template_id: Option<f64>,
    pub palette_id: Option<String>,
    pub section_order: Option<String>,
    pub font_pairing: Option<String>,
}

pub fn stored_theme_fields(config: &Value) -> ThemeFields {
    let Some(theme) = config.get("theme").filter(|theme| theme.is_object()) else { return ThemeFields::default() };
    let text = |key: &str| theme.get(key).and_then(Value::as_str).map(str::to_string);
    ThemeFields {
        template_id: theme.get("templateId").and_then(Value::as_f64),
        palette_id: text("paletteId"),
        section_order: text("sectionOrder"),
        font_pairing: text("fontPairing"),
    }
}

/// Fields a write sets to a new value; a cleared field is not a change.
pub fn changed_theme_fields(stored: &ThemeFields, next: &ThemeFields) -> ThemeFields {
    let changed = |stored: &Option<String>, next: &Option<String>| {
        next.clone().filter(|value| stored.as_deref() != Some(value.as_str()))
    };
    ThemeFields {
        template_id: next.template_id.filter(|id| stored.template_id != Some(*id)),
        palette_id: changed(&stored.palette_id, &next.palette_id),
        section_order: changed(&stored.section_order, &next.section_order),
        font_pairing: changed(&stored.font_pairing, &next.font_pairing),
    }
}

/// Whether the changed fields need the database lookup of the invitation's tier: only a Premium palette or theme does.
pub fn needs_tier_lookup(changed: &ThemeFields) -> bool {
    changed.palette_id.as_deref().and_then(palette_tier) == Some(Tier::Premium)
        || changed.template_id.and_then(catalog_theme_tier) == Some(Tier::Premium)
}

fn issue(path: &str, reason: &str) -> ProblemIssue {
    ProblemIssue { path: path.to_string(), reason: reason.to_string() }
}

/// B-036 (D-054): the catalog theme may be any the catalog knows within the entitled tier (a Premium theme needs a
/// Premium entitlement); a palette must be registered, and a Premium one needs a Premium entitlement. G-041: a section
/// order and a font pairing must be contract options (free in every tier). Issues come in that order. The purchased
/// theme (`invitations.template_id`) is not judged here: a switch never writes it.
pub fn theme_change_issues(changed: &ThemeFields, tier: Tier) -> Vec<ProblemIssue> {
    let mut issues = Vec::new();
    if let Some(id) = changed.template_id {
        match catalog_theme_tier(id) {
            None => issues.push(issue("theme.templateId", "unknown-template")),
            Some(Tier::Premium) if tier != Tier::Premium => issues.push(issue("theme.templateId", "premium-template")),
            Some(_) => {}
        }
    }
    if let Some(palette) = changed.palette_id.as_deref() {
        match palette_tier(palette) {
            None => issues.push(issue("theme.paletteId", "unknown-palette")),
            Some(Tier::Premium) if tier != Tier::Premium => issues.push(issue("theme.paletteId", "premium-palette")),
            Some(_) => {}
        }
    }
    if changed.section_order.as_deref().is_some_and(|order| !SECTION_ORDERS.contains(&order)) {
        issues.push(issue("theme.sectionOrder", "unknown-section-order"));
    }
    if changed.font_pairing.as_deref().is_some_and(|pairing| !FONT_PAIRINGS.contains(&pairing)) {
        issues.push(issue("theme.fontPairing", "unknown-font-pairing"));
    }
    issues
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MediaKey {
    /// `/media/<id>/…`: an invitation's public upload.
    Invitation(i64),
    /// `/media/avatars/<id>/…`: a user's avatar, no invitation's.
    Avatar,
    /// `/media/protected/<id>/…` (D-040).
    Protected(i64),
}

/// `0` or up to 15 digits without a leading zero (`String(id)` never writes one).
fn invitation_id(text: &str) -> Option<i64> {
    let digits = text.bytes().all(|byte| byte.is_ascii_digit());
    let canonical = text == "0" || (!text.is_empty() && !text.starts_with('0') && text.len() <= 15);
    if digits && canonical { text.parse().ok() } else { None }
}

/// `<24 lowercase hex>.<png|jpg|webp|gif>`, the keys the upload route stores, and nothing else.
fn stored_file(text: &str) -> bool {
    let Some((name, extension)) = text.split_once('.') else { return false };
    name.len() == 24
        && name.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        && matches!(extension, "png" | "jpg" | "webp" | "gif")
}

/// The whole value as an upload key (the TypeScript rules' anchored patterns), or none.
fn media_key(value: &str) -> Option<MediaKey> {
    let rest = value.strip_prefix("/media/")?;
    let (kind, rest) = if let Some(rest) = rest.strip_prefix("avatars/") {
        (0, rest)
    } else if let Some(rest) = rest.strip_prefix("protected/") {
        (2, rest)
    } else {
        (1, rest)
    };
    let (id, file) = rest.split_once('/')?;
    let id = invitation_id(id)?;
    if !stored_file(file) {
        return None;
    }
    Some(match kind {
        0 => MediaKey::Avatar,
        1 => MediaKey::Invitation(id),
        _ => MediaKey::Protected(id),
    })
}

pub fn is_uploaded_media_path(value: &str) -> bool {
    matches!(media_key(value), Some(MediaKey::Invitation(_) | MediaKey::Avatar))
}

pub fn is_protected_media_path(value: &str) -> bool {
    matches!(media_key(value), Some(MediaKey::Protected(_)))
}

/// The invitation an upload belongs to (public or protected); none for avatars, absolute URLs and anything malformed.
pub fn media_path_invitation_id(value: &str) -> Option<i64> {
    match media_key(value) {
        Some(MediaKey::Invitation(id) | MediaKey::Protected(id)) => Some(id),
        _ => None,
    }
}

/// B-026 (D-047): the host's static QRIS image, a protected upload of this invitation on every event type.
pub const GIFT_QRIS_FIELD: &str = "gift.qrisImageUrl";

/// The event type's child-photo field (D-040), where a protected upload of this invitation may stand.
pub fn child_photo_field(event_type: &str) -> Option<&'static str> {
    match event_type {
        "birthday" => Some("birthdayPerson.photoUrl"),
        "aqiqah" | "khitanan" => Some("ceremonyProfile.photoUrl"),
        _ => None,
    }
}

struct Walk<'a> {
    invitation_id: i64,
    child_field: Option<&'static str>,
    touched: &'a [String],
    issues: Vec<ProblemIssue>,
}

impl Walk<'_> {
    fn visit(&mut self, value: &Value, path: &mut Vec<String>) {
        match value {
            Value::String(text) => {
                let first = path.first().map(String::as_str).unwrap_or_default();
                if !self.touched.iter().any(|section| section == first) {
                    return;
                }
                let at = path.join(".");
                if Some(at.as_str()) == self.child_field || at == GIFT_QRIS_FIELD {
                    let upload = is_uploaded_media_path(text) || is_protected_media_path(text);
                    if upload && media_path_invitation_id(text) != Some(self.invitation_id) {
                        self.issues.push(issue(&at, "not-this-invitation"));
                    }
                    return;
                }
                if is_protected_media_path(text) {
                    self.issues.push(issue(&at, "protected-outside-child-photo"));
                }
            }
            Value::Array(items) => {
                for (index, item) in items.iter().enumerate() {
                    path.push(index.to_string());
                    self.visit(item, path);
                    path.pop();
                }
            }
            Value::Object(entries) => {
                for (key, item) in entries {
                    path.push(key.clone());
                    self.visit(item, path);
                    path.pop();
                }
            }
            _ => {}
        }
    }
}

/// D-040 at save time, for the sections the save sent: a protected path only in this type's child-photo field or the gift's
/// QRIS image, naming this invitation; those two fields refuse another invitation's upload or an avatar. Sorted by path,
/// then rule, as the TypeScript writer returns them.
pub fn media_reference_issues(
    config: &Value,
    invitation_id: i32,
    event_type: &str,
    touched: &[String],
) -> Vec<ProblemIssue> {
    let mut walk = Walk {
        invitation_id: i64::from(invitation_id),
        child_field: child_photo_field(event_type),
        touched,
        issues: Vec::new(),
    };
    walk.visit(config, &mut Vec::new());
    let mut issues = walk.issues;
    issues.sort();
    issues
}

/// One write as the decision sees it, under the lock. The purchased theme is not an input: the writer reads it only for
/// the tier lookup (D-054).
pub struct ContentWriteInput<'a> {
    pub invitation_id: i32,
    pub event_type: &'a str,
    pub stored_config: &'a Value,
    pub config: &'a Value,
    pub touched_sections: &'a [String],
    pub base_version: i32,
    pub current_version: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentDecision {
    Conflict { current_version: i32 },
    Media(Vec<ProblemIssue>),
    Theme(Vec<ProblemIssue>),
    Write { next_version: i32 },
}

/// The theme fields a write changes; empty unless the save sent its theme.
pub fn theme_change_of(input: &ContentWriteInput<'_>) -> ThemeFields {
    if !input.touched_sections.iter().any(|section| section == "theme") {
        return ThemeFields::default();
    }
    changed_theme_fields(&stored_theme_fields(input.stored_config), &stored_theme_fields(input.config))
}

/// Whether the decision needs the invitation's tier from the database: only a changed Premium palette or theme does.
pub fn content_needs_tier(input: &ContentWriteInput<'_>) -> bool {
    needs_tier_lookup(&theme_change_of(input))
}

pub fn content_decision(input: &ContentWriteInput<'_>, tier: Tier) -> ContentDecision {
    if input.base_version != input.current_version {
        return ContentDecision::Conflict { current_version: input.current_version };
    }
    let media = media_reference_issues(input.config, input.invitation_id, input.event_type, input.touched_sections);
    if !media.is_empty() {
        return ContentDecision::Media(media);
    }
    let theme = theme_change_issues(&theme_change_of(input), tier);
    if !theme.is_empty() {
        return ContentDecision::Theme(theme);
    }
    ContentDecision::Write { next_version: input.current_version.saturating_add(1) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upload_keys_follow_the_stored_grammar_exactly() {
        let hex = "0123456789abcdef01234567";
        assert_eq!(media_key(&format!("/media/7/{hex}.png")), Some(MediaKey::Invitation(7)));
        assert_eq!(media_key(&format!("/media/protected/7/{hex}.jpg")), Some(MediaKey::Protected(7)));
        assert_eq!(media_key(&format!("/media/avatars/7/{hex}.webp")), Some(MediaKey::Avatar));
        for bad in [
            format!("/media/07/{hex}.png"),
            format!("/media/7/{hex}.jpeg"),
            format!("/media/7/{hex}.png\n"),
            format!("/media/7/{}.png", hex.to_uppercase()),
            format!("/media/avatars/protected/7/{hex}.png"),
            format!("/media/1234567890123456/{hex}.png"),
            "/media/".to_string(),
        ] {
            assert_eq!(media_key(&bad), None, "{bad:?}");
        }
    }

    #[test]
    fn a_stale_base_is_refused_before_anything_else() {
        let config = serde_json::json!({ "couple": { "bride": { "photoUrl": "/media/protected/7/0123456789abcdef01234567.png" } } });
        let touched = vec!["couple".to_string()];
        let input = ContentWriteInput {
            invitation_id: 7,
            event_type: "wedding",
            stored_config: &Value::Null,
            config: &config,
            touched_sections: &touched,
            base_version: 2,
            current_version: 3,
        };
        assert_eq!(content_decision(&input, Tier::Standard), ContentDecision::Conflict { current_version: 3 });
    }
}
