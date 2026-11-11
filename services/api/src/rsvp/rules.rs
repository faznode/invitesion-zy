//! The RSVP rules, ported one function at a time from `lib/invitation/rsvp-rules.ts` (B-007, B-027),
//! `event-eligibility.ts` (D-037), `rsvp-events.ts` (D-036, D-037) and `rsvp-questions.ts` (D-034, D-035). Names follow
//! the TypeScript so a reviewer can read them side by side; the shared vectors decide whether they agree.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde::ser::SerializeMap;
use serde::{Serialize, Serializer};
use serde_json::Value;

use super::content::{Conditional, EventItem, Question, QuestionType, RsvpSection, is_event_id};
use super::js::{date_parse_ms, js_number, js_trim, json_integer, utf16_len};

/// A guest's answer. `MAYBE` only while its flag is on; stored `MAYBE` rows stay valid either way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RsvpStatus {
    Confirmed,
    Declined,
    Maybe,
}

impl RsvpStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Confirmed => "CONFIRMED",
            Self::Declined => "DECLINED",
            Self::Maybe => "MAYBE",
        }
    }

    /// Any stored status, whatever the flag says (`RSVP_STATUSES`).
    fn stored(value: &str) -> Option<Self> {
        match value {
            "CONFIRMED" => Some(Self::Confirmed),
            "DECLINED" => Some(Self::Declined),
            "MAYBE" => Some(Self::Maybe),
            _ => None,
        }
    }
}

impl Serialize for RsvpStatus {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

/// `isRsvpStatus`: what a guest may send now.
pub fn parse_rsvp_status(value: &str, maybe: bool) -> Option<RsvpStatus> {
    match RsvpStatus::stored(value)? {
        RsvpStatus::Maybe if !maybe => None,
        status => Some(status),
    }
}

/// `requestedHeadcount`: `Number(field || 1)`, so a missing and an empty field both mean one person.
pub fn requested_headcount(field: Option<&str>) -> f64 {
    match field {
        None | Some("") => 1.0,
        Some(text) => js_number(text),
    }
}

/// `rsvpAttendance` (B-007): 0 on a decline, unknown for "maybe", otherwise the request clamped to 1…allowance.
pub fn rsvp_attendance(status: RsvpStatus, requested: f64, allowance: i64) -> Option<i64> {
    match status {
        RsvpStatus::Declined => Some(0),
        RsvpStatus::Maybe => None,
        RsvpStatus::Confirmed => {
            let cap = if allowance > 0 { allowance } else { 1 };
            let wanted = if requested.is_finite() { requested.trunc() } else { 1.0 };
            Some(wanted.max(1.0).min(cap as f64) as i64)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClosedReason {
    Disabled,
    Deadline,
}

impl ClosedReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Deadline => "deadline",
        }
    }
}

/// `rsvpDeadlinePassed`: closed from the deadline instant on; a missing or unparseable deadline never closes.
pub fn rsvp_deadline_passed(deadline: Option<&str>, now_ms: i64) -> bool {
    deadline.filter(|text| !text.is_empty()).and_then(date_parse_ms).is_some_and(|at| now_ms >= at)
}

/// `rsvpClosedReason` on the switch and deadline as stored (`enabled` is only `Some(false)` when switched off).
pub fn rsvp_closed_reason(enabled: Option<bool>, deadline: Option<&str>, now_ms: i64) -> Option<ClosedReason> {
    if enabled == Some(false) {
        return Some(ClosedReason::Disabled);
    }
    rsvp_deadline_passed(deadline, now_ms).then_some(ClosedReason::Deadline)
}

pub fn section_closed_reason(rsvp: Option<&RsvpSection>, now_ms: i64) -> Option<ClosedReason> {
    rsvp_closed_reason(
        rsvp.map(|section| section.enabled),
        rsvp.and_then(|section| section.deadline.as_deref()),
        now_ms,
    )
}

/// `EventAudience`: a guest through their own link, anyone without one, or the host's preview.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Audience {
    Guest(HashSet<String>),
    Public,
    Owner,
}

/// `readInvitedEventIds`: the stored ids that are usable event ids; anything else costs only itself.
pub fn read_invited_event_ids(raw: Option<&Value>) -> HashSet<String> {
    raw.and_then(Value::as_array)
        .map(|ids| ids.iter().filter_map(Value::as_str).filter(|id| is_event_id(id)).map(str::to_string).collect())
        .unwrap_or_default()
}

/// `eventVisibleTo`: only an event marked `inviteOnly: true` is gated, and only while the flag is on.
pub fn event_visible_to(id: Option<&str>, invite_only: bool, audience: &Audience, enabled: bool) -> bool {
    if !enabled || !invite_only || *audience == Audience::Owner {
        return true;
    }
    matches!(audience, Audience::Guest(invited) if id.is_some_and(|id| invited.contains(id)))
}

pub fn visible_events<'a>(events: &[&'a EventItem], audience: &Audience, enabled: bool) -> Vec<&'a EventItem> {
    events
        .iter()
        .copied()
        .filter(|event| event_visible_to(event.id.as_deref(), event.invite_only == Some(true), audience, enabled))
        .collect()
}

/// `perEventRsvpEvents`: the host switched per-event RSVP on and at least two events are listed.
pub fn per_event_rsvp_events(per_event: Option<bool>, events: Option<&[EventItem]>, flag_on: bool) -> Vec<&EventItem> {
    if !flag_on || per_event != Some(true) {
        return Vec::new();
    }
    let events: Vec<&EventItem> = events.unwrap_or_default().iter().filter(|event| event.id.is_some()).collect();
    if events.len() >= 2 { events } else { Vec::new() }
}

/// One stored per-event answer (`guests.rsvp_event_answers[id]`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct EventAnswer {
    pub status: RsvpStatus,
    pub attending: Option<i64>,
}

pub type EventAnswers = BTreeMap<String, EventAnswer>;

/// `readEventAnswers`: each entry on its own (`{ status, attending }`, strict; attending an integer 0…100000 or null).
pub fn read_event_answers(raw: Option<&Value>) -> EventAnswers {
    let Some(entries) = raw.and_then(Value::as_object) else { return EventAnswers::new() };
    entries
        .iter()
        .filter(|(id, _)| is_event_id(id))
        .filter_map(|(id, value)| {
            let entry = value.as_object()?;
            if entry.len() != 2 {
                return None;
            }
            let status = RsvpStatus::stored(entry.get("status")?.as_str()?)?;
            let attending = match entry.get("attending")? {
                Value::Null => None,
                number => Some(json_integer(number).filter(|n| (0.0..=100_000.0).contains(n))? as i64),
            };
            Some((id.clone(), EventAnswer { status, attending }))
        })
        .collect()
}

/// `overallFromEvents`: "hadir" if any event is, else "mungkin" if any is, else a decline. People: the largest
/// per-event "hadir" count.
pub fn overall_from_events<'a>(answers: impl Iterator<Item = &'a EventAnswer> + Clone) -> (RsvpStatus, Option<i64>) {
    let confirmed: Vec<i64> =
        answers.clone().filter(|a| a.status == RsvpStatus::Confirmed).map(|a| a.attending.unwrap_or(1)).collect();
    if let Some(most) = confirmed.iter().max() {
        return (RsvpStatus::Confirmed, Some(*most));
    }
    if answers.into_iter().any(|a| a.status == RsvpStatus::Maybe) {
        return (RsvpStatus::Maybe, None);
    }
    (RsvpStatus::Declined, Some(0))
}

/// What one event's form fields said (`ev:<id>`, `evn:<id>`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EventFieldsRef<'a> {
    pub status: &'a str,
    pub guest_count: Option<&'a str>,
}

/// `parseEventAnswers`: every asked event must carry a valid status; the error names the first that does not.
pub fn parse_event_answers<'a>(
    fields: impl Fn(&str) -> EventFieldsRef<'a>,
    events: &[&EventItem],
    allowance: i64,
    maybe: bool,
) -> Result<(EventAnswers, RsvpStatus, Option<i64>), String> {
    let mut answers = EventAnswers::new();
    for event in events {
        let Some(id) = event.id.as_deref() else { continue };
        let field = fields(id);
        let status = parse_rsvp_status(field.status, maybe).ok_or_else(|| id.to_string())?;
        let attending = rsvp_attendance(status, requested_headcount(field.guest_count), allowance);
        answers.insert(id.to_string(), EventAnswer { status, attending });
    }
    let (status, attending) = overall_from_events(answers.values());
    Ok((answers, status, attending))
}

/// `mergeEventAnswers`: fresh answers over stored ones; answers to events no longer listed stay.
pub fn merge_event_answers(stored: &EventAnswers, fresh: EventAnswers) -> EventAnswers {
    let mut merged = stored.clone();
    merged.extend(fresh);
    merged
}

/// A column a write may leave alone, clear, or set (TypeScript `undefined`, `null`, a value).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Column<T> {
    Keep,
    Clear,
    Set(T),
}

impl<T: Serialize> Column<T> {
    /// None leaves the column as it is; `Some(None)` writes SQL NULL (as drizzle does for `null`, never a jsonb `null`
    /// scalar); `Some(Some(json))` writes the value.
    pub fn to_json(&self) -> Option<Option<Value>> {
        match self {
            Column::Keep => None,
            Column::Clear => Some(None),
            Column::Set(value) => Some(Some(serde_json::to_value(value).expect("answers serialise"))),
        }
    }
}

/// `singleAnswerEventAnswers` (D-036, D-037).
pub fn single_answer_event_answers(
    flag_on: bool,
    listed: &[&EventItem],
    asked: &[&EventItem],
    stored: &EventAnswers,
    answer: EventAnswer,
) -> Column<EventAnswers> {
    if !flag_on {
        return Column::Keep;
    }
    if listed.is_empty() {
        return Column::Clear;
    }
    match asked {
        [only] => match only.id.as_deref() {
            Some(id) => Column::Set(merge_event_answers(stored, EventAnswers::from([(id.to_string(), answer)]))),
            None => Column::Keep,
        },
        _ => Column::Keep,
    }
}

/// An answer to a host question as stored: text, several choices, or a number.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AnswerValue {
    Text(String),
    Choices(Vec<String>),
    Number(i64),
}

impl Serialize for AnswerValue {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Text(text) => serializer.serialize_str(text),
            Self::Choices(choices) => choices.serialize(serializer),
            Self::Number(number) => serializer.serialize_i64(*number),
        }
    }
}

/// Stored answers keyed by question id.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RsvpAnswers(pub BTreeMap<String, AnswerValue>);

impl Serialize for RsvpAnswers {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(self.0.len()))?;
        for (id, value) in &self.0 {
            map.serialize_entry(id, value)?;
        }
        map.end()
    }
}

/// `ANSWER_LIMITS`.
const TEXT_MAX: usize = 500;
const TEXTAREA_MAX: usize = 2000;
const NUMBER_MAX: i64 = 100_000;

enum Parsed {
    Empty,
    Value(AnswerValue),
    Invalid,
}

/// `parseOne`: CRLF and lone CR read as LF (S18-Q1), values are trimmed and blanks dropped; a multiple choice is
/// de-duplicated in order and every value must be an option; a single answer takes at most one value.
fn parse_one(question: &Question, raw: &[String]) -> Parsed {
    let values: Vec<String> = raw
        .iter()
        .map(|value| js_trim(&value.replace("\r\n", "\n").replace('\r', "\n")).to_string())
        .filter(|value| !value.is_empty())
        .collect();
    let options = question.options.as_deref().unwrap_or_default();
    if question.kind.is_multi() {
        let mut unique: Vec<String> = Vec::new();
        for value in values {
            if !unique.contains(&value) {
                unique.push(value);
            }
        }
        if unique.is_empty() {
            return Parsed::Empty;
        }
        return if unique.iter().all(|value| options.contains(value)) {
            Parsed::Value(AnswerValue::Choices(unique))
        } else {
            Parsed::Invalid
        };
    }
    let value = match values.as_slice() {
        [] => return Parsed::Empty,
        [value] => value.clone(),
        _ => return Parsed::Invalid,
    };
    let fits = |max: usize| {
        if utf16_len(&value) <= max { Parsed::Value(AnswerValue::Text(value.clone())) } else { Parsed::Invalid }
    };
    match question.kind {
        QuestionType::Select | QuestionType::Radio => {
            if options.contains(&value) {
                Parsed::Value(AnswerValue::Text(value))
            } else {
                Parsed::Invalid
            }
        }
        QuestionType::Number => {
            let digits = (1..=6).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_digit());
            match value.parse::<i64>() {
                Ok(number) if digits && number <= NUMBER_MAX => Parsed::Value(AnswerValue::Number(number)),
                _ => Parsed::Invalid,
            }
        }
        QuestionType::Textarea => fits(TEXTAREA_MAX),
        _ => fits(TEXT_MAX),
    }
}

fn condition_values(condition: &Conditional) -> Vec<&str> {
    condition.equals.iter().chain(condition.one_of.iter().flatten()).map(String::as_str).collect()
}

/// `questionApplies`: no condition, or the source applies and its answer matches; a missing source or a cycle never
/// holds. `seen` is shared down the chain, as in the TypeScript.
pub fn question_applies(
    question: &Question,
    answers: &BTreeMap<String, AnswerValue>,
    by_id: &HashMap<&str, &Question>,
    seen: &mut HashSet<String>,
) -> bool {
    let Some(condition) = &question.conditional else { return true };
    let Some(source) = by_id.get(condition.question_id.as_str()) else { return false };
    if seen.contains(&question.id) {
        return false;
    }
    seen.insert(question.id.clone());
    if !question_applies(source, answers, by_id, seen) {
        return false;
    }
    let Some(answer) = answers.get(&source.id) else { return false };
    let given: Vec<String> = match answer {
        AnswerValue::Choices(choices) => choices.clone(),
        AnswerValue::Text(text) => vec![text.clone()],
        AnswerValue::Number(number) => vec![number.to_string()],
    };
    let wanted = condition_values(condition);
    given.iter().any(|value| wanted.contains(&value.as_str()))
}

/// `parseRsvpAnswers`: a decline stores none (null clears); "required" holds for "hadir" only; an answer whose condition
/// does not hold is dropped, valid or not. Err names the first question (host order) the guest must fix.
pub fn parse_rsvp_answers(
    answers: &BTreeMap<String, Vec<String>>,
    questions: &[Question],
    status: RsvpStatus,
) -> Result<Option<RsvpAnswers>, String> {
    if status == RsvpStatus::Declined {
        return Ok(None);
    }
    let parsed: HashMap<&str, Parsed> = questions
        .iter()
        .map(|question| {
            (question.id.as_str(), parse_one(question, answers.get(&question.id).map_or(&[], Vec::as_slice)))
        })
        .collect();
    let given: BTreeMap<String, AnswerValue> = parsed
        .iter()
        .filter_map(|(id, result)| match result {
            Parsed::Value(value) => Some(((*id).to_string(), value.clone())),
            _ => None,
        })
        .collect();
    let by_id: HashMap<&str, &Question> = questions.iter().map(|question| (question.id.as_str(), question)).collect();
    let mut stored = BTreeMap::new();
    for question in questions {
        if !question_applies(question, &given, &by_id, &mut HashSet::new()) {
            continue;
        }
        match parsed.get(question.id.as_str()) {
            Some(Parsed::Invalid) => return Err(question.id.clone()),
            Some(Parsed::Value(value)) => {
                stored.insert(question.id.clone(), value.clone());
            }
            Some(Parsed::Empty) | None => {
                if question.required && status == RsvpStatus::Confirmed {
                    return Err(question.id.clone());
                }
            }
        }
    }
    Ok((!stored.is_empty()).then_some(RsvpAnswers(stored)))
}

/// A status the host may set, including "belum menjawab".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostStatus {
    Pending,
    Answer(RsvpStatus),
}

impl HostStatus {
    pub fn parse(value: &str) -> Option<Self> {
        if value == "PENDING" { Some(Self::Pending) } else { RsvpStatus::stored(value).map(Self::Answer) }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "PENDING",
            Self::Answer(status) => status.as_str(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HostUpdate {
    pub rsvp_status: HostStatus,
    pub attending_count: Option<i64>,
    pub event_answers: Column<EventAnswers>,
}

/// `overallFromAskedAnswers`: like a guest's, but some events may be unset: "tidak hadir" only once every asked event is
/// declined, else still "belum menjawab"; people unknown while any "hadir" has no count (E-033).
fn overall_from_asked(asked: &[&EventItem], answers: &EventAnswers) -> (HostStatus, Option<i64>) {
    let given: Vec<&EventAnswer> = asked.iter().filter_map(|event| answers.get(event.id.as_deref()?)).collect();
    let confirmed: Vec<&&EventAnswer> = given.iter().filter(|answer| answer.status == RsvpStatus::Confirmed).collect();
    if !confirmed.is_empty() {
        let known: Vec<i64> = confirmed.iter().filter_map(|answer| answer.attending).collect();
        let count = (known.len() == confirmed.len()).then(|| known.iter().copied().max()).flatten();
        return (HostStatus::Answer(RsvpStatus::Confirmed), count);
    }
    if given.iter().any(|answer| answer.status == RsvpStatus::Maybe) {
        return (HostStatus::Answer(RsvpStatus::Maybe), None);
    }
    if !asked.is_empty() && given.len() == asked.len() {
        return (HostStatus::Answer(RsvpStatus::Declined), Some(0));
    }
    (HostStatus::Pending, None)
}

/// `hostRsvpUpdate` (D-037). None = refused (an event id that is not asked, or one without per-event RSVP).
pub fn host_rsvp_update(
    status: HostStatus,
    event_id: Option<&str>,
    flag_on: bool,
    listed: &[&EventItem],
    asked: &[&EventItem],
    stored: &EventAnswers,
    previous: (&str, Option<i64>),
) -> Option<HostUpdate> {
    if let Some(id) = event_id
        && !asked.iter().any(|event| event.id.as_deref() == Some(id))
    {
        return None;
    }
    if !flag_on || asked.is_empty() {
        if event_id.is_some() {
            return None;
        }
        let confirmed = HostStatus::Answer(RsvpStatus::Confirmed);
        let keep_count = status == confirmed && previous.0 == "CONFIRMED" && previous.1.unwrap_or(0) > 0;
        let attending_count = match status {
            HostStatus::Answer(RsvpStatus::Declined) => Some(0),
            _ if keep_count => previous.1,
            _ => None,
        };
        let event_answers = if flag_on && listed.is_empty() { Column::Clear } else { Column::Keep };
        return Some(HostUpdate { rsvp_status: status, attending_count, event_answers });
    }
    let mut next = stored.clone();
    for event in asked {
        let Some(id) = event.id.as_deref() else { continue };
        if event_id.is_some_and(|wanted| wanted != id) {
            continue;
        }
        match status {
            HostStatus::Pending => {
                next.remove(id);
            }
            HostStatus::Answer(RsvpStatus::Confirmed) => {
                let kept =
                    stored.get(id).filter(|answer| answer.status == RsvpStatus::Confirmed).and_then(|a| a.attending);
                next.insert(id.to_string(), EventAnswer { status: RsvpStatus::Confirmed, attending: kept });
            }
            HostStatus::Answer(answer) => {
                let attending = if answer == RsvpStatus::Declined { Some(0) } else { None };
                next.insert(id.to_string(), EventAnswer { status: answer, attending });
            }
        }
    }
    let (rsvp_status, attending_count) = overall_from_asked(asked, &next);
    Some(HostUpdate { rsvp_status, attending_count, event_answers: Column::Set(next) })
}
