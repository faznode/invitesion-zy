//! `decideGuestRsvp` and `decideHostRsvp` (`lib/invitation/rsvp-decision.ts`): the whole RSVP write decision over plain
//! data. The HTTP handlers add the lookups, limits and the one transaction around it.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;

use super::content::RsvpConfig;
use super::rules::{
    Audience, ClosedReason, Column, EventAnswer, EventAnswers, EventFieldsRef, HostStatus, HostUpdate, RsvpAnswers,
    RsvpStatus, host_rsvp_update, merge_event_answers, parse_event_answers, parse_rsvp_answers, parse_rsvp_status,
    per_event_rsvp_events, read_event_answers, read_invited_event_ids, requested_headcount, rsvp_attendance,
    section_closed_reason, single_answer_event_answers, visible_events,
};

/// The switches the guest page was rendered with (`lib/flags.ts`); Next.js sends the values it renders with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RsvpFlags {
    /// `RSVP_MAYBE`: guests may answer "mungkin".
    pub maybe: bool,
    /// `RSVP_PER_EVENT`: an answer per event once the host switches it on for two or more events.
    pub per_event: bool,
    /// `INVITE_ONLY_EVENTS`: invite-only events are shown and asked only to the guests invited to them.
    pub invite_only_events: bool,
    /// `RSVP_QUESTIONS`: the host's custom questions.
    pub questions: bool,
}

/// One event's fields: `ev:<id>` and `evn:<id>`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventFields {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub guest_count: Option<String>,
}

/// What the guest's form submitted, independent of HTML field names (`RsvpSubmission`).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RsvpSubmission {
    /// The single answer as typed: `CONFIRMED`, `DECLINED`, `MAYBE` or anything else (refused).
    #[serde(default)]
    pub status: String,
    /// The headcount field as typed; absent and empty both mean one person.
    #[serde(default)]
    pub guest_count: Option<String>,
    /// Per-event answers by event id.
    #[serde(default)]
    pub events: BTreeMap<String, EventFields>,
    /// Every submitted value of each question, by question id.
    #[serde(default)]
    pub answers: BTreeMap<String, Vec<String>>,
}

/// The guest row's fields the decision reads.
#[derive(Debug, Clone, Copy)]
pub struct GuestState<'a> {
    pub guest_count: i64,
    pub invited_event_ids: Option<&'a Value>,
    pub rsvp_event_answers: Option<&'a Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuestWrite {
    pub status: RsvpStatus,
    pub attending_count: Option<i64>,
    pub rsvp_answers: Column<RsvpAnswers>,
    pub rsvp_event_answers: Column<EventAnswers>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuestDecision {
    Closed(ClosedReason),
    Invalid,
    /// The first listed event without a valid answer.
    Events(String),
    /// The first question (host order) the guest has to fix.
    Answers(String),
    Write(GuestWrite),
}

/// `decideGuestRsvp`: closed (B-027), then the per-event answers or the single status (D-036, D-037, B-007), then the
/// questions (D-034, D-035).
pub fn decide_guest_rsvp(
    config: &RsvpConfig,
    guest: GuestState<'_>,
    submission: &RsvpSubmission,
    flags: RsvpFlags,
    now_ms: i64,
) -> GuestDecision {
    let rsvp = config.rsvp.as_ref();
    if let Some(reason) = section_closed_reason(rsvp, now_ms) {
        return GuestDecision::Closed(reason);
    }

    let listed = per_event_rsvp_events(rsvp.and_then(|r| r.per_event), config.events.as_deref(), flags.per_event);
    let audience = Audience::Guest(read_invited_event_ids(guest.invited_event_ids));
    let events = visible_events(&listed, &audience, flags.invite_only_events);
    let stored = read_event_answers(guest.rsvp_event_answers);

    let (status, attending_count, rsvp_event_answers) = if events.len() >= 2 {
        let fields = |id: &str| {
            submission
                .events
                .get(id)
                .map(|f| EventFieldsRef { status: f.status.as_str(), guest_count: f.guest_count.as_deref() })
                .unwrap_or_default()
        };
        match parse_event_answers(fields, &events, guest.guest_count, flags.maybe) {
            Ok((answers, status, attending)) => (status, attending, Column::Set(merge_event_answers(&stored, answers))),
            Err(event_id) => return GuestDecision::Events(event_id),
        }
    } else {
        let Some(status) = parse_rsvp_status(&submission.status, flags.maybe) else { return GuestDecision::Invalid };
        let attending =
            rsvp_attendance(status, requested_headcount(submission.guest_count.as_deref()), guest.guest_count);
        let answer = EventAnswer { status, attending };
        (status, attending, single_answer_event_answers(flags.per_event, &listed, &events, &stored, answer))
    };

    let questions = match &config.form {
        Some(form) if flags.questions && form.enabled => form.questions.as_slice(),
        _ => &[],
    };
    let rsvp_answers = if questions.is_empty() {
        Column::Keep
    } else {
        match parse_rsvp_answers(&submission.answers, questions, status) {
            Ok(Some(answers)) => Column::Set(answers),
            Ok(None) => Column::Clear,
            Err(question_id) => return GuestDecision::Answers(question_id),
        }
    };

    GuestDecision::Write(GuestWrite { status, attending_count, rsvp_answers, rsvp_event_answers })
}

/// The guest row's fields a host override reads.
#[derive(Debug, Clone, Copy)]
pub struct HostGuestState<'a> {
    pub invited_event_ids: Option<&'a Value>,
    pub rsvp_event_answers: Option<&'a Value>,
    pub rsvp_status: &'a str,
    pub attending_count: Option<i64>,
}

/// `decideHostRsvp`: None = refused (an unknown status, or an event that is not asked of this guest).
pub fn decide_host_rsvp(
    config: &RsvpConfig,
    guest: HostGuestState<'_>,
    status: &str,
    event_id: Option<&str>,
    per_event: bool,
    invite_only_events: bool,
) -> Option<HostUpdate> {
    let status = HostStatus::parse(status)?;
    let rsvp = config.rsvp.as_ref();
    let listed = per_event_rsvp_events(rsvp.and_then(|r| r.per_event), config.events.as_deref(), per_event);
    let audience = Audience::Guest(read_invited_event_ids(guest.invited_event_ids));
    let asked = visible_events(&listed, &audience, invite_only_events);
    host_rsvp_update(
        status,
        event_id,
        per_event,
        &listed,
        &asked,
        &read_event_answers(guest.rsvp_event_answers),
        (guest.rsvp_status, guest.attending_count),
    )
}
