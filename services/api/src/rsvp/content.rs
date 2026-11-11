//! The part of the lenient config read (`lib/invitation/content-read.ts` `normalizeStoredConfig`) the RSVP rules need:
//! the `rsvp`, `events` and `registrationForm` sections, each judged on its own by the zod rules in
//! `lib/invitation/detail-config.ts`, so a section that fails is dropped without taking the others with it. Events get
//! their durable ids first (`keyStoredEvents`, D-036); the registration form falls back to the per-question read rules
//! (S18-Q4, D-035). Only what the rules read is kept. `read` in `contracts/vectors/rsvp-decisions.json` pins this.
//!
//! Not mirrored: the TypeScript re-parses the kept sections as a whole, which cannot fail for sections that already
//! parsed, and a top-level `__proto__` key, which the TypeScript read cannot handle at all; here it is an unknown key.

use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use super::js::{is_zod_datetime, js_trim, json_integer, utf16_len};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RsvpSection {
    pub enabled: bool,
    pub deadline: Option<String>,
    pub per_event: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventItem {
    /// Always set after `key_stored_events`; optional in the schema because older configs omit it.
    pub id: Option<String>,
    pub invite_only: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuestionType {
    Text,
    Textarea,
    Select,
    Multiselect,
    Radio,
    Checkbox,
    Number,
}

impl QuestionType {
    fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "text" => Self::Text,
            "textarea" => Self::Textarea,
            "select" => Self::Select,
            "multiselect" => Self::Multiselect,
            "radio" => Self::Radio,
            "checkbox" => Self::Checkbox,
            "number" => Self::Number,
            _ => return None,
        })
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Textarea => "textarea",
            Self::Select => "select",
            Self::Multiselect => "multiselect",
            Self::Radio => "radio",
            Self::Checkbox => "checkbox",
            Self::Number => "number",
        }
    }

    /// Types whose answer must be one of `options`.
    fn has_options(self) -> bool {
        matches!(self, Self::Select | Self::Multiselect | Self::Radio | Self::Checkbox)
    }

    /// Types that take several values (`isMultiChoice`).
    pub fn is_multi(self) -> bool {
        matches!(self, Self::Multiselect | Self::Checkbox)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conditional {
    pub question_id: String,
    pub equals: Option<String>,
    pub one_of: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Question {
    pub id: String,
    pub kind: QuestionType,
    pub required: bool,
    pub options: Option<Vec<String>>,
    pub conditional: Option<Conditional>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegistrationForm {
    pub enabled: bool,
    /// `customQuestions`, empty when absent (`rsvpQuestionsOf` reads both alike).
    pub questions: Vec<Question>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RsvpConfig {
    pub rsvp: Option<RsvpSection>,
    pub events: Option<Vec<EventItem>>,
    pub form: Option<RegistrationForm>,
}

type Field<T> = Result<T, ()>;

fn optional_text(object: &Map<String, Value>, key: &str, max: usize) -> Field<Option<String>> {
    match object.get(key) {
        None => Ok(None),
        Some(Value::String(text)) => {
            let trimmed = js_trim(text);
            if utf16_len(trimmed) <= max { Ok(Some(trimmed.to_string())) } else { Err(()) }
        }
        Some(_) => Err(()),
    }
}

fn required_text(object: &Map<String, Value>, key: &str, max: usize) -> Field<String> {
    optional_text(object, key, max)?.ok_or(())
}

fn optional_bool(object: &Map<String, Value>, key: &str) -> Field<Option<bool>> {
    match object.get(key) {
        None => Ok(None),
        Some(Value::Bool(flag)) => Ok(Some(*flag)),
        Some(_) => Err(()),
    }
}

/// `z.boolean().default(d)`: the default applies to an absent key only; `null` fails.
fn bool_or(object: &Map<String, Value>, key: &str, default: bool) -> Field<bool> {
    Ok(optional_bool(object, key)?.unwrap_or(default))
}

fn optional_datetime(object: &Map<String, Value>, key: &str) -> Field<Option<String>> {
    match object.get(key) {
        None => Ok(None),
        Some(Value::String(text)) if is_zod_datetime(text) => Ok(Some(text.clone())),
        Some(_) => Err(()),
    }
}

fn optional_int(object: &Map<String, Value>, key: &str, min: f64, max: f64) -> Field<()> {
    match object.get(key) {
        None => Ok(()),
        Some(value) => match json_integer(value) {
            Some(number) if (min..=max).contains(&number) => Ok(()),
            _ => Err(()),
        },
    }
}

/// `z.string().url().max(n)`: zod 3 accepts what `new URL()` accepts (WHATWG; the `url` crate implements the same
/// standard, surrounding C0 controls and spaces included) and counts the untrimmed UTF-16 length.
fn optional_url(object: &Map<String, Value>, key: &str, max: usize) -> Field<()> {
    match object.get(key) {
        None => Ok(()),
        Some(Value::String(text)) if url::Url::parse(text).is_ok() && utf16_len(text) <= max => Ok(()),
        Some(_) => Err(()),
    }
}

/// `idText`: trimmed, at most 80 UTF-16 units, letters, digits, `_` and `-` only; the parsed value is the trimmed one.
fn id_text(value: &str) -> Option<String> {
    let trimmed = js_trim(value);
    let valid = !trimmed.is_empty()
        && utf16_len(trimmed) <= 80
        && trimmed.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    valid.then(|| trimmed.to_string())
}

fn strict_keys(object: &Map<String, Value>, allowed: &[&str]) -> bool {
    object.keys().all(|key| allowed.contains(&key.as_str()))
}

/// `EVENT_ID_PATTERN` in `lib/invitation/event-ids.ts`.
pub fn is_event_id(value: &str) -> bool {
    (1..=80).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn usable_id(item: &Value) -> Option<&str> {
    item.get("id")?.as_str().filter(|id| is_event_id(id))
}

/// `keyStoredEvents`: an event keeps a usable id unless an earlier event already holds it; every other event gets
/// `ev-<position>` (1-based), or `ev-<position>-<k>` for the smallest free k ≥ 2. Anything that is not an array of
/// objects is returned unchanged for the schema to judge.
pub fn key_stored_events(raw: &Value) -> Value {
    let Some(items) = raw.as_array() else { return raw.clone() };
    if !items.iter().all(Value::is_object) {
        return raw.clone();
    }
    let mut owners: HashMap<&str, usize> = HashMap::new();
    for (index, item) in items.iter().enumerate() {
        if let Some(id) = usable_id(item) {
            owners.entry(id).or_insert(index);
        }
    }
    let mut taken: HashSet<String> = owners.keys().map(|id| (*id).to_string()).collect();
    let keyed = items
        .iter()
        .enumerate()
        .map(|(index, item)| {
            if usable_id(item).is_some_and(|id| owners.get(id) == Some(&index)) {
                return item.clone();
            }
            let base = format!("ev-{}", index + 1);
            let id = if taken.contains(&base) {
                (2..).map(|k| format!("{base}-{k}")).find(|candidate| !taken.contains(candidate)).unwrap_or(base)
            } else {
                base
            };
            taken.insert(id.clone());
            let mut object = item.as_object().cloned().unwrap_or_default();
            object.insert("id".into(), Value::String(id));
            Value::Object(object)
        })
        .collect();
    Value::Array(keyed)
}

fn read_rsvp(value: &Value) -> Option<RsvpSection> {
    let object = value.as_object()?;
    let enabled = bool_or(object, "enabled", true).ok()?;
    let deadline = optional_datetime(object, "deadline").ok()?;
    optional_int(object, "maxGuestsPerRsvp", 1.0, 50.0).ok()?;
    let per_event = optional_bool(object, "perEvent").ok()?;
    Some(RsvpSection { enabled, deadline, per_event })
}

/// `z.array(eventItemSchema).max(20)` with unique ids; `eventItemSchema` strips unknown keys.
fn read_events(value: &Value) -> Option<Vec<EventItem>> {
    let items = value.as_array()?;
    if items.len() > 20 {
        return None;
    }
    let mut seen = HashSet::new();
    items
        .iter()
        .map(|item| {
            let object = item.as_object()?;
            let id = match object.get("id") {
                None => None,
                Some(Value::String(text)) => Some(id_text(text)?),
                Some(_) => return None,
            };
            required_text(object, "title", 120).ok()?;
            optional_datetime(object, "startAt").ok()?;
            optional_datetime(object, "endAt").ok()?;
            optional_text(object, "venueName", 160).ok()?;
            optional_text(object, "address", 400).ok()?;
            optional_url(object, "mapUrl", 500).ok()?;
            optional_text(object, "note", 500).ok()?;
            let invite_only = optional_bool(object, "inviteOnly").ok()?;
            if let Some(id) = &id
                && !seen.insert(id.clone())
            {
                return None;
            }
            Some(EventItem { id, invite_only })
        })
        .collect()
}

fn trimmed_list(value: &Value, max_items: usize, max_len: usize) -> Option<Vec<String>> {
    let items = value.as_array()?;
    if items.is_empty() || items.len() > max_items {
        return None;
    }
    items
        .iter()
        .map(|item| {
            let trimmed = js_trim(item.as_str()?);
            (utf16_len(trimmed) <= max_len).then(|| trimmed.to_string())
        })
        .collect()
}

fn read_conditional(value: &Value) -> Option<Conditional> {
    let object = value.as_object()?;
    if !strict_keys(object, &["questionId", "equals", "in"]) {
        return None;
    }
    let question_id = id_text(object.get("questionId")?.as_str()?)?;
    let equals = optional_text(object, "equals", 200).ok()?;
    let one_of = match object.get("in") {
        None => None,
        Some(list) => Some(trimmed_list(list, 20, 200)?),
    };
    if equals.is_none() && one_of.is_none() {
        return None;
    }
    Some(Conditional { question_id, equals, one_of })
}

/// `customQuestionSchema` (strict): choice types need options, other types must not have any.
fn read_question(value: &Value) -> Option<Question> {
    let object = value.as_object()?;
    if !strict_keys(object, &["id", "label", "type", "required", "options", "conditional"]) {
        return None;
    }
    let id = id_text(object.get("id")?.as_str()?)?;
    required_text(object, "label", 200).ok()?;
    let kind = QuestionType::parse(object.get("type")?.as_str()?)?;
    let required = bool_or(object, "required", false).ok()?;
    let options = match object.get("options") {
        None => None,
        Some(list) => Some(trimmed_list(list, 50, 120)?),
    };
    let conditional = match object.get("conditional") {
        None => None,
        Some(condition) => Some(read_conditional(condition)?),
    };
    if kind.has_options() != options.is_some() {
        return None;
    }
    Some(Question { id, kind, required, options, conditional })
}

const FORM_KEYS: &[&str] =
    &["enabled", "deadline", "capacity", "allowPlusOne", "confirmationMessage", "customQuestions"];

/// The form's own fields (strict object); returns `enabled`.
fn form_fields(object: &Map<String, Value>) -> Option<bool> {
    if !strict_keys(object, FORM_KEYS) {
        return None;
    }
    let enabled = bool_or(object, "enabled", false).ok()?;
    optional_datetime(object, "deadline").ok()?;
    optional_int(object, "capacity", 1.0, 100_000.0).ok()?;
    bool_or(object, "allowPlusOne", false).ok()?;
    optional_text(object, "confirmationMessage", 1000).ok()?;
    Some(enabled)
}

/// `registrationFormSchema`, the write rules: unique ids, no question conditional on itself, every condition naming a
/// configured question.
fn strict_form(value: &Value) -> Option<RegistrationForm> {
    let object = value.as_object()?;
    let enabled = form_fields(object)?;
    let questions = match object.get("customQuestions") {
        None => Vec::new(),
        Some(Value::Array(items)) if items.len() <= 50 => {
            items.iter().map(read_question).collect::<Option<Vec<_>>>()?
        }
        Some(_) => return None,
    };
    let mut ids = HashSet::new();
    if !questions.iter().all(|question| ids.insert(question.id.as_str())) {
        return None;
    }
    let consistent = questions.iter().all(|question| {
        question.conditional.as_ref().is_none_or(|condition| {
            condition.question_id != question.id && ids.contains(condition.question_id.as_str())
        })
    });
    consistent.then_some(RegistrationForm { enabled, questions })
}

/// `readRegistrationForm` (S18-Q4, D-035): question by question; an unreadable question or a repeated id (the first
/// stays) is left out, a condition naming a missing question stays, and the form's own fields still follow the rules.
fn lenient_form(value: &Value) -> Option<RegistrationForm> {
    let object = value.as_object()?;
    let items = object.get("customQuestions")?.as_array()?;
    let mut ids = HashSet::new();
    let questions: Vec<Question> =
        items.iter().filter_map(read_question).filter(|question| ids.insert(question.id.clone())).collect();
    let enabled = form_fields(object)?;
    (questions.len() <= 50).then_some(RegistrationForm { enabled, questions })
}

/// The RSVP subset of the stored config, read leniently: anything that is not a JSON object reads as an empty config.
pub fn read_rsvp_config(raw: &Value) -> RsvpConfig {
    let Some(record) = raw.as_object() else { return RsvpConfig::default() };
    RsvpConfig {
        rsvp: record.get("rsvp").and_then(read_rsvp),
        events: record.get("events").and_then(|events| read_events(&key_stored_events(events))),
        form: record.get("registrationForm").and_then(|form| strict_form(form).or_else(|| lenient_form(form))),
    }
}
