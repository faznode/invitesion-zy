//! B-037 parity (D-055): the creation vectors the TypeScript suite runs (`tests/b037-creation-rules.test.ts`), run here
//! against the Rust port: the core event types and the catalog's category table, the slug-base, slug-suffix, catalog-id
//! and creation-key contracts, and every decision, compared as the same JSON shapes.

use invitesion_api::content::creation::{
    self, CreationDecision, CreationInput, catalog_id_of_defaults, creation_decision, first_free_slug, is_creation_key,
    is_slug_base,
};
use invitesion_api::content::rules::Tier;
use serde_json::{Value, json};

fn vectors() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/creation-rules.json"))
        .expect("creation-rules.json parses")
}

fn strings(value: &Value) -> Vec<String> {
    value.as_array().expect("array").iter().map(|item| item.as_str().expect("string").to_string()).collect()
}

#[test]
fn the_event_types_and_the_category_table_are_the_typescript_ones() {
    let vectors = vectors();
    let core: Vec<String> = creation::CORE_EVENT_TYPES.iter().map(|value| value.to_string()).collect();
    assert_eq!(core, strings(&vectors["coreEventTypes"]));
    let expected: Vec<(String, String)> = vectors["categoryEventTypes"]
        .as_array()
        .expect("categoryEventTypes")
        .iter()
        .map(|pair| (pair[0].as_str().unwrap().to_string(), pair[1].as_str().unwrap().to_string()))
        .collect();
    let actual: Vec<(String, String)> = creation::CATEGORY_EVENT_TYPES
        .iter()
        .map(|(category, kind)| (category.to_string(), kind.to_string()))
        .collect();
    assert_eq!(actual, expected);
    assert_eq!(creation::resolve_event_type("aqiqah"), Some("aqiqah"), "a core type seeded as a category");
    assert_eq!(creation::resolve_event_type("mystery"), None);
}

#[test]
fn the_slug_and_key_contracts_are_the_typescript_ones() {
    let vectors = vectors();
    assert_eq!(vectors["slugBaseMax"].as_u64(), Some(creation::SLUG_BASE_MAX as u64));
    assert_eq!(vectors["slugSuffixLimit"].as_u64(), Some(u64::from(creation::SLUG_SUFFIX_LIMIT)));
    for entry in vectors["slugBases"].as_array().expect("slugBases") {
        let value = entry["value"].as_str().unwrap();
        assert_eq!(is_slug_base(value), entry["valid"].as_bool().unwrap(), "slug base {value:?}");
    }
    for entry in vectors["slugs"].as_array().expect("slugs") {
        let taken = strings(&entry["taken"]);
        let limit = u32::try_from(entry["limit"].as_u64().unwrap()).unwrap();
        let actual = first_free_slug(entry["base"].as_str().unwrap(), &taken, limit);
        assert_eq!(actual.as_deref(), entry["expect"].as_str(), "{}", entry["name"]);
    }
    for entry in vectors["keys"].as_array().expect("keys") {
        let value = entry["value"].as_str().unwrap();
        assert_eq!(is_creation_key(value), entry["valid"].as_bool().unwrap(), "key {value:?}");
    }
    for entry in vectors["catalogIds"].as_array().expect("catalogIds") {
        let defaults = (!entry["defaults"].is_null()).then_some(&entry["defaults"]);
        assert_eq!(catalog_id_of_defaults(defaults), entry["expect"].as_i64(), "{}", entry["name"]);
    }
}

fn decision_json(decision: &CreationDecision) -> Value {
    match decision {
        CreationDecision::Write => json!({ "kind": "write" }),
        CreationDecision::Creation(issues) => json!({ "kind": "creation", "issues": issues }),
        CreationDecision::Media(issues) => json!({ "kind": "media", "issues": issues }),
        CreationDecision::Theme(issues) => json!({ "kind": "theme", "issues": issues }),
    }
}

#[test]
fn every_decision_matches_the_typescript_rules() {
    let vectors = vectors();
    let decisions = vectors["decisions"].as_array().expect("decisions");
    assert!(decisions.len() >= 20, "the vectors cover the rules");
    for case in decisions {
        let input = &case["input"];
        let tier = match input["templateTier"].as_str().unwrap() {
            "premium" => Tier::Premium,
            _ => Tier::Standard,
        };
        let decision = creation_decision(&CreationInput {
            event_type: input["eventType"].as_str().unwrap(),
            template_category: input["templateCategory"].as_str(),
            template_catalog_id: input["templateCatalogId"].as_i64(),
            template_tier: tier,
            config: &input["config"],
        });
        assert_eq!(decision_json(&decision), case["expect"], "{}", case["name"]);
    }
}
