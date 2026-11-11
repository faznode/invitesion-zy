//! B-037 (D-055): the decision every draft creation makes before its row is written, the port of
//! `lib/invitation/creation-rules.ts`. Parity: `contracts/vectors/creation-rules.json` (`tests/creation_vectors.rs`).
//!
//! Order: the creation itself (the event type is the template's; the config names the catalog theme the template's own
//! defaults name, so `config.theme.templateId` and `invitations.template_id` describe one theme at birth, D-054), then the
//! content rules of an editor save applied to the whole config as if every section were sent to an empty invitation at
//! version 0: D-040's references and the theme entitlement against the template's tier (B-041).

use serde_json::Value;

use super::rules::{ContentDecision, ContentWriteInput, Tier, content_decision, stored_theme_fields};
use crate::problem::ProblemIssue;

pub const CORE_EVENT_TYPES: &[&str] = &["wedding", "birthday", "aqiqah", "tasyakuran", "khitanan", "corporate"];

/// Catalog category → core event type (`template-event-types.ts`). The vectors carry the TypeScript table, so a category
/// added there fails this crate's suite until it is added here.
pub const CATEGORY_EVENT_TYPES: &[(&str, &str)] = &[
    ("wedding", "wedding"),
    ("anniversary", "tasyakuran"),
    ("bridal-shower", "wedding"),
    ("birthday", "birthday"),
    ("aqiqah-khitanan", "aqiqah"),
    ("syukuran", "tasyakuran"),
    ("baby-shower", "tasyakuran"),
    ("graduation", "tasyakuran"),
    ("reunion", "corporate"),
    ("holiday-gathering", "tasyakuran"),
    ("corporate", "corporate"),
    ("gender-reveal", "tasyakuran"),
    ("tahlilan", "tasyakuran"),
    ("retirement", "corporate"),
    ("product-launch", "corporate"),
    ("conference", "corporate"),
    ("tradeshow", "corporate"),
    ("sales-kickoff", "corporate"),
    ("workshop", "corporate"),
    ("networking", "corporate"),
    ("team-building", "corporate"),
    ("investor-meeting", "corporate"),
    ("gala", "corporate"),
    ("client-vip", "corporate"),
    ("employee-appreciation", "corporate"),
    ("shows", "corporate"),
    ("community-event", "tasyakuran"),
];

/// A stored category's core event type: a catalog category, or a core type itself (rows seeded before the catalog).
pub fn resolve_event_type(category: &str) -> Option<&'static str> {
    CATEGORY_EVENT_TYPES
        .iter()
        .find(|(known, _)| *known == category)
        .map(|(_, event_type)| *event_type)
        .or_else(|| CORE_EVENT_TYPES.iter().find(|core| **core == category).copied())
}

/// The catalog id a template row's stored defaults name (`default_config.theme.templateId`, a positive integer), or none.
pub fn catalog_id_of_defaults(default_config: Option<&Value>) -> Option<i64> {
    let id = default_config?.get("theme")?.get("templateId")?;
    let number = id.as_f64()?;
    (number.fract() == 0.0 && number > 0.0 && number <= 9_007_199_254_740_991.0).then_some(number as i64)
}

/// The top-level sections of a config, sorted: a creation sends every section it holds.
pub fn creation_sections(config: &Value) -> Vec<String> {
    let mut sections: Vec<String> = config.as_object().map(|map| map.keys().cloned().collect()).unwrap_or_default();
    sections.sort();
    sections
}

pub struct CreationInput<'a> {
    pub event_type: &'a str,
    /// The template row's category, or none for a creation without a template.
    pub template_category: Option<&'a str>,
    /// The catalog id the template row's defaults name.
    pub template_catalog_id: Option<i64>,
    /// The template row's tier; Standard without a template.
    pub template_tier: Tier,
    pub config: &'a Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CreationDecision {
    Creation(Vec<ProblemIssue>),
    Media(Vec<ProblemIssue>),
    Theme(Vec<ProblemIssue>),
    Write,
}

fn issue(path: &str, reason: &str) -> ProblemIssue {
    ProblemIssue { path: path.to_string(), reason: reason.to_string() }
}

pub fn creation_decision(input: &CreationInput<'_>) -> CreationDecision {
    let mut issues = Vec::new();
    let type_ok = match input.template_category {
        None => CORE_EVENT_TYPES.contains(&input.event_type),
        Some(category) => resolve_event_type(category) == Some(input.event_type),
    };
    if !type_ok {
        issues.push(issue("eventType", "event-type"));
    }
    // Compared by value, as JavaScript compares numbers: the TypeScript rule reads any JSON number.
    let named = stored_theme_fields(input.config).template_id;
    let same_theme = match (named, input.template_catalog_id) {
        (None, None) => true,
        (Some(named), Some(expected)) => named == expected as f64,
        _ => false,
    };
    if !same_theme {
        issues.push(issue("theme.templateId", "template-mismatch"));
    }
    if !issues.is_empty() {
        return CreationDecision::Creation(issues);
    }

    let sections = creation_sections(input.config);
    let empty = Value::Object(Default::default());
    let content = ContentWriteInput {
        invitation_id: 0,
        event_type: input.event_type,
        stored_config: &empty,
        config: input.config,
        touched_sections: &sections,
        base_version: 0,
        current_version: 0,
    };
    match content_decision(&content, input.template_tier) {
        ContentDecision::Media(issues) => CreationDecision::Media(issues),
        ContentDecision::Theme(issues) => CreationDecision::Theme(issues),
        ContentDecision::Write { .. } | ContentDecision::Conflict { .. } => CreationDecision::Write,
    }
}

/// Longest slug base a creation stores: room for a `-200` suffix inside `invitations.slug` (120).
pub const SLUG_BASE_MAX: usize = 60;
/// How far a creation counts before it gives up on numbered slugs (`slug.ts`'s `resolveUniqueSlug`).
pub const SLUG_SUFFIX_LIMIT: u32 = 200;

/// Lower-case letters and digits in hyphen-separated runs, at most `SLUG_BASE_MAX` characters.
pub fn is_slug_base(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= SLUG_BASE_MAX
        && value
            .split('-')
            .all(|run| !run.is_empty() && run.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))
}

/// `base`, then `base-2` … `base-200`: the slugs one indexed lookup checks.
pub fn slug_candidates(base: &str) -> Vec<String> {
    std::iter::once(base.to_string()).chain((2..=SLUG_SUFFIX_LIMIT).map(|suffix| format!("{base}-{suffix}"))).collect()
}

/// The first free slug for `base` given the taken ones among the candidates, or none when all are taken.
pub fn first_free_slug(base: &str, taken: &[String], limit: u32) -> Option<String> {
    let used = |candidate: &str| taken.iter().any(|slug| slug == candidate);
    if !used(base) {
        return Some(base.to_string());
    }
    (2..=limit).map(|suffix| format!("{base}-{suffix}")).find(|candidate| !used(candidate))
}

/// A number in base 36, as JavaScript's `toString(36)` writes it: the suffix of last resort (`base-<time>`).
pub fn base36(mut value: u128) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".into();
    }
    let mut out = Vec::new();
    while value > 0 {
        out.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    out.reverse();
    String::from_utf8(out).expect("ASCII digits")
}

/// 1–255 visible ASCII characters: the `Idempotency-Key` rule, so the same key works through either writer.
pub fn is_creation_key(value: &str) -> bool {
    (1..=255).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_graphic())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_bases_are_lowercase_runs() {
        for good in ["budi-sari", "a", "x1-2y", &"a".repeat(60)] {
            assert!(is_slug_base(good), "{good:?}");
        }
        for bad in ["", "-a", "a-", "a--b", "A", "a_b", "é", &"a".repeat(61), "a b"] {
            assert!(!is_slug_base(bad), "{bad:?}");
        }
    }

    #[test]
    fn base36_writes_like_javascript() {
        assert_eq!(base36(0), "0");
        assert_eq!(base36(35), "z");
        assert_eq!(base36(36), "10");
        assert_eq!(base36(1_794_074_494_120), "mw6pmrag", "(1794074494120).toString(36) in Node 24");
    }
}
