//! B-035 parity: the content vectors the TypeScript suite runs (`tests/b035-content-rules.test.ts`), run here against the
//! Rust port: the palette registry, the catalog's theme tiers (B-036), the child-photo and QRIS fields, the upload-key
//! grammar and every decision, compared as the same JSON shapes.

use invitesion_api::content::rules::{
    self, ContentDecision, ContentWriteInput, Tier, content_decision, content_needs_tier, is_protected_media_path,
    is_uploaded_media_path, media_path_invitation_id,
};
use serde_json::{Value, json};

fn vectors() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/content-rules.json"))
        .expect("content-rules.json parses")
}

fn tier_name(tier: Tier) -> &'static str {
    match tier {
        Tier::Standard => "standard",
        Tier::Premium => "premium",
    }
}

#[test]
fn the_palette_registry_is_the_typescript_one() {
    let vectors = vectors();
    let expected: Vec<(String, String)> = vectors["palettes"]
        .as_array()
        .expect("palettes")
        .iter()
        .map(|pair| (pair[0].as_str().unwrap().to_string(), pair[1].as_str().unwrap().to_string()))
        .collect();
    let actual: Vec<(String, String)> =
        rules::PALETTES.iter().map(|(id, tier)| (id.to_string(), tier_name(*tier).to_string())).collect();
    assert_eq!(actual, expected);
    assert_eq!(vectors["fallbackPalette"], rules::FALLBACK_PALETTE_ID);
    assert_eq!(rules::palette_tier(rules::FALLBACK_PALETTE_ID), Some(Tier::Standard));
    assert_eq!(rules::palette_tier("neon"), None);
}

#[test]
fn the_catalog_theme_tiers_are_the_typescript_ones() {
    let expected: Vec<(i64, String)> = vectors()["templates"]
        .as_array()
        .expect("templates")
        .iter()
        .map(|pair| (pair[0].as_i64().unwrap(), pair[1].as_str().unwrap().to_string()))
        .collect();
    let actual: Vec<(i64, String)> =
        rules::TEMPLATES.iter().map(|(id, tier)| (i64::from(*id), tier_name(*tier).to_string())).collect();
    assert_eq!(actual, expected);
    assert_eq!(rules::catalog_theme_tier(103.0), Some(Tier::Standard));
    assert_eq!(rules::catalog_theme_tier(104.0), Some(Tier::Premium));
    assert_eq!(rules::catalog_theme_tier(103.5), None);
    assert_eq!(rules::catalog_theme_tier(5.0), None);
}

#[test]
fn the_layout_choices_are_the_typescript_ones() {
    let vectors = vectors();
    let list = |key: &str| -> Vec<String> {
        vectors[key].as_array().expect(key).iter().map(|value| value.as_str().unwrap().to_string()).collect()
    };
    assert_eq!(rules::SECTION_ORDERS.iter().map(|id| id.to_string()).collect::<Vec<_>>(), list("sectionOrders"));
    assert_eq!(rules::FONT_PAIRINGS.iter().map(|id| id.to_string()).collect::<Vec<_>>(), list("fontPairings"));
}

#[test]
fn the_child_photo_fields_and_the_qris_field_are_the_typescript_ones() {
    let vectors = vectors();
    for (event_type, field) in vectors["childPhotoFields"].as_object().expect("childPhotoFields") {
        assert_eq!(rules::child_photo_field(event_type), field.as_str(), "{event_type}");
    }
    assert_eq!(vectors["giftQrisField"], rules::GIFT_QRIS_FIELD);
}

#[test]
fn upload_keys_follow_the_typescript_patterns() {
    for sample in vectors()["mediaPaths"].as_array().expect("mediaPaths") {
        let value = sample["value"].as_str().unwrap();
        assert_eq!(is_uploaded_media_path(value), sample["uploaded"].as_bool().unwrap(), "uploaded {value:?}");
        assert_eq!(is_protected_media_path(value), sample["protected"].as_bool().unwrap(), "protected {value:?}");
        assert_eq!(media_path_invitation_id(value), sample["invitation"].as_i64(), "invitation {value:?}");
    }
}

fn decision_json(decision: ContentDecision) -> Value {
    match decision {
        ContentDecision::Conflict { current_version } => {
            json!({ "kind": "conflict", "currentVersion": current_version })
        }
        ContentDecision::Media(issues) => json!({ "kind": "media", "issues": issues }),
        ContentDecision::Theme(issues) => json!({ "kind": "theme", "issues": issues }),
        ContentDecision::Write { next_version } => json!({ "kind": "write", "nextVersion": next_version }),
    }
}

#[test]
fn every_decision_matches_the_typescript_writer() {
    let vectors = vectors();
    let decisions = vectors["decisions"].as_array().expect("decisions");
    assert!(decisions.len() >= 30, "the vectors cover the rules ({} cases)", decisions.len());
    for case in decisions {
        let name = case["name"].as_str().unwrap_or("?");
        let input = &case["input"];
        let touched: Vec<String> = input["touchedSections"]
            .as_array()
            .expect("touchedSections")
            .iter()
            .map(|section| section.as_str().unwrap().to_string())
            .collect();
        let int = |key: &str| i32::try_from(input[key].as_i64().unwrap_or_else(|| panic!("{name}: {key}"))).unwrap();
        let write = ContentWriteInput {
            invitation_id: int("invitationId"),
            event_type: input["eventType"].as_str().unwrap(),
            stored_config: &input["storedConfig"],
            config: &input["config"],
            touched_sections: &touched,
            base_version: int("baseVersion"),
            current_version: int("currentVersion"),
        };
        let tier = if case["tier"] == "premium" { Tier::Premium } else { Tier::Standard };
        assert_eq!(content_needs_tier(&write), case["needsTier"].as_bool().unwrap(), "{name}: needsTier");
        assert_eq!(decision_json(content_decision(&write, tier)), case["expect"], "{name}");
    }
}
