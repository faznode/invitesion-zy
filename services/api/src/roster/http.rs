//! B-033 endpoints: every writer of the guest roster (`guests`' roster columns and rows, `guest_registrations`,
//! `guest_registration_links`, and the CHECKIN `analytics_events` row) when Next.js sets `BACKEND_ROSTER=rust`; exactly
//! one writer is live. The TypeScript writer (`lib/invitation/roster-next.ts`) holds the same rules, the same order of
//! refusals and the same statements, and both take the same advisory lock per invitation, so the stored rows are the
//! same whichever writer handled a request. The RSVP columns stay with R-03's writer; nothing here touches them.

use std::collections::HashSet;

use axum::Json;
use axum::extract::rejection::{JsonRejection, PathRejection};
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use time::PrimitiveDateTime;
use utoipa::ToSchema;

use super::pass;
use super::rules::{
    self, DuplicateOf, Existing, ImportRefusal, ImportVerdict, Known, MAX_CATEGORY, MAX_GUESTS, MAX_REGISTRATION_SEATS,
    MAX_SEATS, RegistrationVerdict, RowInput, RowReason, check_row, claim_slug, decide_registration, duplicate_key,
    js_trim, plan_import, roster_keys,
};
use crate::app::AppState;
use crate::idempotency::{self, replay};
use crate::identity::{Owner, resolve_owner};
use crate::limits;
use crate::members::{self, Capability};
use crate::problem::{ApiError, Problem, Subject};
use crate::rsvp::content::{is_event_id, read_rsvp_config};
use crate::views::utc_now;

/// The ASCII bytes of "ROST" as an int4: the advisory-lock namespace both roster writers take, keyed by invitation.
pub const ROSTER_LOCK_NAMESPACE: i32 = 0x524F_5354;

const NOT_FOUND: &str = "roster.not_found";
const LINK_NOT_FOUND: &str = "registration.link_not_found";

/// Read in Next.js and sent with each write, as the RSVP writer sends its flags.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RosterFlags {
    /// `FLAG_OPAQUE_GUEST_LINKS`: a new guest gets a 22-character link token (B-011).
    pub opaque_links: bool,
    /// `FLAG_INVITE_ONLY_EVENTS` (D-037).
    pub invite_only_events: bool,
}

/// One guest's values as typed in the add form or held by a file's cells; the rules judge them (`roster-rules.json`).
#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuestFields {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// Seats as typed; empty = 1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guest_count: Option<String>,
}

impl GuestFields {
    fn input(&self) -> RowInput<'_> {
        RowInput {
            name: self.name.as_deref(),
            phone: self.phone.as_deref(),
            category: self.category.as_deref(),
            guest_count: self.guest_count.as_deref(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuestAddRequest {
    pub guest: GuestFields,
    /// Invite-only events ticked in the form; only this invitation's current invite-only events are kept.
    #[serde(default)]
    pub invited_event_ids: Vec<String>,
    pub flags: RosterFlags,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GuestAdded {
    pub id: i32,
    pub slug: String,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuestImportRequest {
    /// At most 1,000 rows (more answers `refusal: too_many_rows`).
    pub rows: Vec<GuestFields>,
    /// A preview: every verdict, nothing written.
    #[serde(default)]
    pub dry_run: bool,
    pub flags: RosterFlags,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum VerdictStatus {
    Ok,
    Invalid,
    Duplicate,
}

/// One row's verdict, in file order: `ok` with its slug, `invalid` with the first rule it broke, or `duplicate` of a
/// guest on the list or of a row above it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowVerdict {
    pub status: VerdictStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<RowReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub of: Option<DuplicateOf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GuestImportResult {
    pub verdicts: Vec<ImportRowVerdict>,
    pub ok: i32,
    pub invalid: i32,
    pub duplicate: i32,
    /// Set when the import cannot be written as a whole; nothing was written.
    pub refusal: Option<ImportRefusal>,
    /// The new guests' batch, for undoing this import; null for a preview or a refusal.
    pub batch_id: Option<String>,
    pub imported: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportUndone {
    pub deleted: i32,
    /// Guests of the batch with an open, a send, an answer, a check-in, a wish or a WhatsApp log row.
    pub kept: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GuestOperation {
    Sent,
    Checkin,
    UndoCheckin,
}

impl GuestOperation {
    /// G-044 (D-057): checking a guest in is the desk's capability; marking sent and undoing a check-in are the list's
    /// (`operationCapability` in `members.ts`, pinned by `contracts/vectors/member-roles.json`).
    pub const fn capability(self) -> Capability {
        match self {
            GuestOperation::Checkin => Capability::Checkin,
            GuestOperation::Sent | GuestOperation::UndoCheckin => Capability::Guests,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuestOperationRequest {
    pub operation: GuestOperation,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GuestUpdated {
    pub id: i32,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvitedEventsRequest {
    /// The invite-only events ticked in the guest's row; stored ids the form could not show are kept.
    pub ticked: Vec<String>,
    pub flags: RosterFlags,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InvitedEventsSaved {
    pub id: i32,
    pub invited_event_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CategoryMode {
    Add,
    Remove,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CategoryInvitationRequest {
    pub event_id: String,
    /// Matched exactly after trimming; empty = guests without a category.
    pub category: String,
    pub mode: CategoryMode,
    pub flags: RosterFlags,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CategoryInvitationSaved {
    pub changed: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LinkAction {
    /// Keeps an open link, or opens one.
    Open,
    /// A new token; the old link stops at once.
    Rotate,
    Close,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistrationLinkRequest {
    pub action: LinkAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationLinkSaved {
    /// The open link's token (`/daftar/<token>`), or null once closed.
    pub token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistrationRequest {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guest_count: Option<String>,
    /// The registrant's public address as Next.js's trusted proxies reported it, for the per-address limit only:
    /// reduced to a keyed hash, never stored or logged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_ip: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RegistrationStatus {
    /// Waiting for the host, or already known (a duplicate is answered the same way and stores nothing).
    Received,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationReceived {
    pub status: RegistrationStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Decision {
    Approve,
    Reject,
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistrationDecisionRequest {
    pub decision: Decision,
    pub flags: RosterFlags,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DecisionStatus {
    Approved,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationDecided {
    pub status: DecisionStatus,
    /// The new guest when approved.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub guest_id: Option<i32>,
}

fn db(context: &'static str) -> impl FnOnce(sqlx::Error) -> ApiError {
    move |error| ApiError::internal(context, error)
}

fn to_json(value: &impl Serialize) -> Result<Value, ApiError> {
    serde_json::to_value(value).map_err(|error| ApiError::internal("roster_json", error))
}

fn bad_body(rejection: JsonRejection) -> ApiError {
    ApiError::BadRequest("request.invalid_body", rejection.body_text())
}

fn row_invalid(reason: RowReason) -> ApiError {
    ApiError::Unprocessable("roster.row_invalid", Subject::Reason(reason.as_str()))
}

fn positive(id: i32) -> Result<i32, ApiError> {
    if id > 0 { Ok(id) } else { Err(ApiError::BadRequest("request.invalid_id", "ids are positive integers".into())) }
}

fn invitation_path(path: Result<Path<i32>, PathRejection>) -> Result<i32, ApiError> {
    let Path(id) = path.map_err(|rejection| ApiError::BadRequest("request.invalid_path", rejection.body_text()))?;
    positive(id)
}

fn pair_path(path: Result<Path<(i32, i32)>, PathRejection>) -> Result<(i32, i32), ApiError> {
    let Path((first, second)) =
        path.map_err(|rejection| ApiError::BadRequest("request.invalid_path", rejection.body_text()))?;
    Ok((positive(first)?, positive(second)?))
}

/// The signed-in customer behind the token; the dashboard refuses administrators, and so does this.
async fn host(state: &AppState, headers: &HeaderMap) -> Result<Owner, ApiError> {
    let owner = resolve_owner(state, headers).await?;
    if owner.role == "ADMIN" {
        return Err(ApiError::Forbidden("owner.role_not_allowed"));
    }
    Ok(owner)
}

/// The invitation and its stored config when the caller may use `capability` on it (G-044, D-057: its owner, or a live
/// grant whose role holds the capability, as `roster-next.ts` decides: `members::caller_may`), else `roster.not_found`.
async fn accessible_invitation(
    tx: &mut Transaction<'_, Postgres>,
    owner: &Owner,
    invitation_id: i32,
    capability: Capability,
) -> Result<Value, ApiError> {
    members::caller_may(tx, owner.user_id, invitation_id, capability)
        .await
        .map_err(db("roster_invitation"))?
        .ok_or(ApiError::NotFound(NOT_FOUND))
}

/// Locks the guest for this transaction when the caller may use `capability` on its invitation, with its stored
/// invitations and the invitation's config. Access is `accessible_invitation`, the one check: a copy of the grant
/// predicate here once missed G-052's workspace staff (s41), so this lock only adds that the guest is the invitation's.
async fn accessible_guest(
    tx: &mut Transaction<'_, Postgres>,
    owner: &Owner,
    invitation_id: i32,
    guest_id: i32,
    capability: Capability,
) -> Result<(Option<Value>, Value), ApiError> {
    let config = accessible_invitation(tx, owner, invitation_id, capability).await?;
    let invited_event_ids = sqlx::query_scalar!(
        "select g.invited_event_ids from guests g where g.id = $1 and g.invitation_id = $2 for update",
        guest_id,
        invitation_id
    )
    .fetch_optional(&mut **tx)
    .await
    .map_err(db("roster_guest"))?
    .ok_or(ApiError::NotFound(NOT_FOUND))?;
    Ok((invited_event_ids, config))
}

async fn lock_roster(tx: &mut Transaction<'_, Postgres>, invitation_id: i32) -> Result<(), ApiError> {
    sqlx::query_scalar!(
        r#"select true as "locked!" from pg_advisory_xact_lock($1::int4, $2::int4)"#,
        ROSTER_LOCK_NAMESPACE,
        invitation_id
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(db("roster_lock"))?;
    Ok(())
}

/// The invitation's current invite-only event ids, in its order (`inviteOnlyEvents`, read leniently as R-03 reads it).
fn current_invite_only(config: &Value) -> Vec<String> {
    read_rsvp_config(config)
        .events
        .unwrap_or_default()
        .into_iter()
        .filter(|event| event.invite_only == Some(true))
        .filter_map(|event| event.id)
        .collect()
}

/// `invitedIdsFromTicked`: stored ids that are not current invite-only events (first occurrence, usable ids only), then
/// the current invite-only events that were ticked, in the invitation's order.
fn invited_ids_from_ticked(ticked: &[String], current: &[String], stored: Option<&Value>) -> Vec<String> {
    let current_set: HashSet<&str> = current.iter().map(String::as_str).collect();
    let ticked_set: HashSet<&str> = ticked.iter().map(String::as_str).collect();
    let mut seen = HashSet::new();
    let kept = stored
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|id| is_event_id(id) && seen.insert(id.to_string()))
        .filter(|id| !current_set.contains(id))
        .map(str::to_string);
    kept.chain(current.iter().filter(|id| ticked_set.contains(id.as_str())).cloned()).collect()
}

fn invited_json(ids: &[String]) -> Option<Value> {
    (!ids.is_empty()).then(|| json!(ids))
}

/// 128 random bits as 22 base64url characters, the format of `newGuestLinkToken` (two v4 UUIDs supply the bits; their
/// fixed version and variant bits are skipped).
pub fn new_link_token() -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let (first, second) = (uuid::Uuid::new_v4(), uuid::Uuid::new_v4());
    let (a, b) = (first.as_bytes(), second.as_bytes());
    let mut bytes = [0u8; 16];
    bytes[..6].copy_from_slice(&a[..6]);
    bytes[6..13].copy_from_slice(&a[9..16]);
    bytes[13..].copy_from_slice(&b[..3]);
    let mut out = String::with_capacity(22);
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |acc, (i, byte)| acc | u32::from(*byte) << (16 - 8 * i));
        let symbols = chunk.len() + 1;
        for i in 0..symbols {
            out.push(ALPHABET[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

/// A registration link token: the format of a guest link token.
fn is_link_token(token: &str) -> bool {
    token.len() == 22 && token.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// The stored answer for the request's idempotency key, if any. Read in the request's transaction after its access check
/// (G-044, D-057), so it replays only to a caller who may still make this request, and only within `scope` (the caller,
/// the invitation and the resource, D-046); a different request under the same key is `idempotency.key_reused`.
async fn replay_for(
    tx: &mut Transaction<'_, Postgres>,
    headers: &HeaderMap,
    scope: &str,
    hash: &str,
) -> Result<Option<Response>, ApiError> {
    match idempotency::key_from(headers)? {
        Some(key) => replay(&mut **tx, scope, &key, hash).await,
        None => Ok(None),
    }
}

/// Records the answer and commits. When a concurrent twin committed the key first, its answer is read in this
/// transaction (after this request's access check) and this transaction's writes roll back when it is dropped.
async fn commit_with(
    headers: &HeaderMap,
    mut tx: Transaction<'_, Postgres>,
    scope: &str,
    hash: &str,
    answer: &impl Serialize,
    now: PrimitiveDateTime,
) -> Result<Option<Response>, ApiError> {
    if let Some(key) = idempotency::key_from(headers)?
        && !idempotency::record(&mut tx, scope, &key, hash, 200, &to_json(answer)?, now)
            .await
            .map_err(db("idempotency_record"))?
    {
        return Ok(Some(replay(&mut *tx, scope, &key, hash).await?.ok_or(ApiError::Internal)?));
    }
    tx.commit().await.map_err(db("roster_commit"))?;
    Ok(None)
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/guests",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "1–255 visible ASCII characters, bound to the signed-in owner and this invitation; a retry replays the stored guest for 24 hours"),
    ),
    request_body = GuestAddRequest,
    responses(
        (status = 200, description = "Added, or replayed (`Idempotent-Replayed: true`)", body = GuestAdded),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer (`owner.unknown_user`, `owner.role_not_allowed`)", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057) (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "The roster holds 3,000 guests (`roster.full`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "A value the rules refuse (`roster.row_invalid`, member `reason`: name, phone, seats or category), or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn add_guest(
    State(state): State<AppState>,
    path: Result<Path<i32>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<GuestAddRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let invitation_id = invitation_path(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) = body.map_err(bad_body)?;
    let now = utc_now();
    let scope = idempotency::host_scope("roster:add", owner.user_id, invitation_id, 0);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("roster_begin"))?;
    let config = accessible_invitation(&mut tx, &owner, invitation_id, Capability::Guests).await?;
    if let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await? {
        return Ok(response);
    }
    let row = check_row(&request.guest.input(), MAX_SEATS).map_err(row_invalid)?;
    lock_roster(&mut tx, invitation_id).await?;
    let slugs = sqlx::query_scalar!("select slug from guests where invitation_id = $1", invitation_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(db("roster_slugs"))?;
    if slugs.len() >= MAX_GUESTS {
        return Err(ApiError::Conflict("roster.full", None));
    }
    let invited = if request.flags.invite_only_events {
        invited_ids_from_ticked(&request.invited_event_ids, &current_invite_only(&config), None)
    } else {
        vec![]
    };
    let slug = claim_slug(&row.name, &mut slugs.into_iter().collect());
    let token = request.flags.opaque_links.then(new_link_token);
    let id = sqlx::query_scalar!(
        "insert into guests (invitation_id, name, phone, category, guest_count, slug, link_token, invited_event_ids) \
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id",
        invitation_id,
        row.name,
        row.phone,
        row.category,
        row.guest_count,
        slug,
        token,
        invited_json(&invited)
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(db("roster_insert"))?;
    let added = GuestAdded { id, slug };
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &added, now).await? {
        return Ok(response);
    }
    Ok(Json(added).into_response())
}

fn verdict_body(verdict: &ImportVerdict) -> ImportRowVerdict {
    match verdict {
        ImportVerdict::Ok { slug, .. } => {
            ImportRowVerdict { status: VerdictStatus::Ok, slug: Some(slug.clone()), reason: None, of: None }
        }
        ImportVerdict::Invalid(reason) => {
            ImportRowVerdict { status: VerdictStatus::Invalid, slug: None, reason: Some(*reason), of: None }
        }
        ImportVerdict::Duplicate(of) => {
            ImportRowVerdict { status: VerdictStatus::Duplicate, slug: None, reason: None, of: Some(*of) }
        }
    }
}

fn count(value: usize) -> i32 {
    i32::try_from(value).unwrap_or(i32::MAX)
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/guest-imports",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "For an import (not a preview): bound to the signed-in owner and this invitation; a retry replays the stored result instead of importing twice"),
    ),
    request_body = GuestImportRequest,
    responses(
        (status = 200, description = "A preview, an import, or a refusal of the whole import (`refusal`; nothing written)", body = GuestImportResult),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057) (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "`idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn import_guests(
    State(state): State<AppState>,
    path: Result<Path<i32>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<GuestImportRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let invitation_id = invitation_path(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) = body.map_err(bad_body)?;
    let now = utc_now();
    let scope = idempotency::host_scope("roster:import", owner.user_id, invitation_id, 0);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("import_begin"))?;
    accessible_invitation(&mut tx, &owner, invitation_id, Capability::Guests).await?;
    if !request.dry_run
        && let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await?
    {
        return Ok(response);
    }
    if !request.dry_run {
        lock_roster(&mut tx, invitation_id).await?;
    }
    let existing = sqlx::query!("select name, phone, slug from guests where invitation_id = $1", invitation_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(db("import_existing"))?;
    let existing: Vec<Existing<'_>> = existing
        .iter()
        .map(|guest| Existing { name: &guest.name, phone: guest.phone.as_deref(), slug: &guest.slug })
        .collect();
    let rows: Vec<RowInput<'_>> = request.rows.iter().map(GuestFields::input).collect();
    let plan = plan_import(&existing, &rows);
    let mut result = GuestImportResult {
        verdicts: plan.verdicts.iter().map(verdict_body).collect(),
        ok: count(plan.ok),
        invalid: count(plan.invalid),
        duplicate: count(plan.duplicate),
        refusal: plan.refusal,
        batch_id: None,
        imported: 0,
    };
    if request.dry_run || plan.refusal.is_some() {
        return Ok(Json(result).into_response());
    }

    let batch = uuid::Uuid::new_v4().to_string();
    let accepted: Vec<(&String, &rules::RosterRow)> = plan
        .verdicts
        .iter()
        .filter_map(|verdict| match verdict {
            ImportVerdict::Ok { slug, row } => Some((slug, row)),
            _ => None,
        })
        .collect();
    let names: Vec<String> = accepted.iter().map(|(_, row)| row.name.clone()).collect();
    let phones: Vec<Option<String>> = accepted.iter().map(|(_, row)| row.phone.clone()).collect();
    let categories: Vec<Option<String>> = accepted.iter().map(|(_, row)| row.category.clone()).collect();
    let seats: Vec<i32> = accepted.iter().map(|(_, row)| row.guest_count).collect();
    let slugs: Vec<String> = accepted.iter().map(|(slug, _)| (*slug).clone()).collect();
    let tokens: Vec<Option<String>> =
        accepted.iter().map(|_| request.flags.opaque_links.then(new_link_token)).collect();
    sqlx::query!(
        "insert into guests (invitation_id, name, phone, category, guest_count, slug, link_token, import_batch_id) \
         select $1, t.name, t.phone, t.category, t.guest_count, t.slug, t.link_token, $8 \
         from unnest($2::text[], $3::text[], $4::text[], $5::int4[], $6::text[], $7::text[]) \
           as t(name, phone, category, guest_count, slug, link_token)",
        invitation_id,
        &names,
        &phones as &[Option<String>],
        &categories as &[Option<String>],
        &seats,
        &slugs,
        &tokens as &[Option<String>],
        batch
    )
    .execute(&mut *tx)
    .await
    .map_err(db("import_insert"))?;
    result.batch_id = Some(batch);
    result.imported = count(accepted.len());
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &result, now).await? {
        return Ok(response);
    }
    Ok(Json(result).into_response())
}

/// `IMPORT_BATCH_PATTERN`: a lowercase v4-shaped UUID as both writers mint it.
fn is_batch_id(batch: &str) -> bool {
    let bytes = batch.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(i, &b)| match i {
            8 | 13 | 18 | 23 => b == b'-',
            _ => b.is_ascii_digit() || (b'a'..=b'f').contains(&b),
        })
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/guest-imports/{batch}/undo",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("batch" = String, Path, description = "The import's batch id"),
        ("Idempotency-Key" = Option<String>, Header, description = "Bound to the signed-in owner, this invitation and this batch: a retry replays the result instead of answering 404"),
    ),
    responses(
        (status = 200, description = "Untouched guests deleted, touched ones kept", body = ImportUndone),
        (status = 400, description = "Malformed path or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057), or no guest of this batch (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "`idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn undo_import(
    State(state): State<AppState>,
    path: Result<Path<(i32, String)>, PathRejection>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let Path((invitation_id, batch)) =
        path.map_err(|rejection| ApiError::BadRequest("request.invalid_path", rejection.body_text()))?;
    let invitation_id = positive(invitation_id)?;
    let owner = host(&state, &headers).await?;
    if !is_batch_id(&batch) {
        return Err(ApiError::NotFound(NOT_FOUND));
    }
    let now = utc_now();
    let scope = idempotency::host_scope(&format!("roster:undo:{batch}"), owner.user_id, invitation_id, 0);
    let hash = idempotency::request_hash(&batch);

    let mut tx = state.pool.begin().await.map_err(db("undo_begin"))?;
    accessible_invitation(&mut tx, &owner, invitation_id, Capability::Guests).await?;
    if let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await? {
        return Ok(response);
    }
    lock_roster(&mut tx, invitation_id).await?;
    let rows = sqlx::query!(
        r#"select g.id, (g.opened_count > 0 or g.opened_at is not null or g.rsvp_status <> 'PENDING'
             or g.attending_count is not null or g.rsvp_answers is not null or g.rsvp_event_answers is not null
             or g.sent_at is not null or g.checked_in_at is not null
             or exists (select 1 from analytics_events a where a.guest_id = g.id)
             or exists (select 1 from guest_messages m where m.guest_id = g.id)
             or exists (select 1 from wa_log w where w.guest_id = g.id)) as "touched!"
           from guests g where g.invitation_id = $1 and g.import_batch_id = $2 for update of g"#,
        invitation_id,
        batch
    )
    .fetch_all(&mut *tx)
    .await
    .map_err(db("undo_rows"))?;
    if rows.is_empty() {
        return Err(ApiError::NotFound(NOT_FOUND));
    }
    let untouched: Vec<i32> = rows.iter().filter(|row| !row.touched).map(|row| row.id).collect();
    if !untouched.is_empty() {
        sqlx::query!("delete from guests where invitation_id = $1 and id = any($2)", invitation_id, &untouched)
            .execute(&mut *tx)
            .await
            .map_err(db("undo_delete"))?;
    }
    let undone = ImportUndone { deleted: count(untouched.len()), kept: count(rows.len() - untouched.len()) };
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &undone, now).await? {
        return Ok(response);
    }
    Ok(Json(undone).into_response())
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/guests/{guest}/operation",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("guest" = i32, Path, minimum = 1, description = "A guest of that invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "Bound to the signed-in owner, this invitation and this guest"),
    ),
    request_body = GuestOperationRequest,
    responses(
        (status = 200, description = "Marked sent, checked in (with its CHECKIN row), or check-in undone", body = GuestUpdated),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057), or not its guest (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "`idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn guest_operation(
    State(state): State<AppState>,
    path: Result<Path<(i32, i32)>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<GuestOperationRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let (invitation_id, guest_id) = pair_path(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) = body.map_err(bad_body)?;
    let now = utc_now();
    let scope = idempotency::host_scope("roster:operation", owner.user_id, invitation_id, guest_id);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("operation_begin"))?;
    let capability = request.operation.capability();
    // Access to the invitation first, then the stored answer (a retry replays even when the guest has since gone), then
    // the guest itself, locked.
    accessible_invitation(&mut tx, &owner, invitation_id, capability).await?;
    if let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await? {
        return Ok(response);
    }
    accessible_guest(&mut tx, &owner, invitation_id, guest_id, capability).await?;
    match request.operation {
        GuestOperation::Sent => {
            sqlx::query!(
                "update guests set sent_at = $1 where id = $2 and invitation_id = $3",
                now,
                guest_id,
                invitation_id
            )
            .execute(&mut *tx)
            .await
            .map_err(db("operation_sent"))?;
        }
        GuestOperation::Checkin => {
            // B-024 (D-056): a guest arrives once. Another check-in (a second desk, a stale list, a pass already scanned)
            // keeps the first time and writes no second CHECKIN row; undo clears the time, so a later check-in counts.
            let first = sqlx::query!(
                "update guests set checked_in_at = $1 where id = $2 and invitation_id = $3 and checked_in_at is null",
                now,
                guest_id,
                invitation_id
            )
            .execute(&mut *tx)
            .await
            .map_err(db("operation_checkin"))?
            .rows_affected()
                == 1;
            if first {
                sqlx::query!(
                    "insert into analytics_events (invitation_id, guest_id, event_type) values ($1, $2, 'CHECKIN')",
                    invitation_id,
                    guest_id
                )
                .execute(&mut *tx)
                .await
                .map_err(db("operation_event"))?;
            }
        }
        GuestOperation::UndoCheckin => {
            sqlx::query!(
                "update guests set checked_in_at = null where id = $1 and invitation_id = $2",
                guest_id,
                invitation_id
            )
            .execute(&mut *tx)
            .await
            .map_err(db("operation_undo"))?;
        }
    }
    let updated = GuestUpdated { id: guest_id };
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &updated, now).await? {
        return Ok(response);
    }
    Ok(Json(updated).into_response())
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/guests/{guest}/invited-events",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("guest" = i32, Path, minimum = 1, description = "A guest of that invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "Bound to the signed-in owner, this invitation and this guest"),
    ),
    request_body = InvitedEventsRequest,
    responses(
        (status = 200, description = "The guest's invite-only events as stored", body = InvitedEventsSaved),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057), or not its guest (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "Invite-only events are switched off (`roster.invite_invalid`), or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn set_invited_events(
    State(state): State<AppState>,
    path: Result<Path<(i32, i32)>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<InvitedEventsRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let (invitation_id, guest_id) = pair_path(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) = body.map_err(bad_body)?;
    let now = utc_now();
    let scope = idempotency::host_scope("roster:invited", owner.user_id, invitation_id, guest_id);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("invited_begin"))?;
    accessible_invitation(&mut tx, &owner, invitation_id, Capability::Guests).await?;
    if let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await? {
        return Ok(response);
    }
    let (stored, config) = accessible_guest(&mut tx, &owner, invitation_id, guest_id, Capability::Guests).await?;
    if !request.flags.invite_only_events {
        return Err(ApiError::Unprocessable("roster.invite_invalid", Subject::None));
    }
    let invited = invited_ids_from_ticked(&request.ticked, &current_invite_only(&config), stored.as_ref());
    sqlx::query!(
        "update guests set invited_event_ids = $1 where id = $2 and invitation_id = $3",
        invited_json(&invited),
        guest_id,
        invitation_id
    )
    .execute(&mut *tx)
    .await
    .map_err(db("invited_update"))?;
    let saved = InvitedEventsSaved { id: guest_id, invited_event_ids: invited };
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &saved, now).await? {
        return Ok(response);
    }
    Ok(Json(saved).into_response())
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/category-invitations",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "Bound to the signed-in owner and this invitation"),
    ),
    request_body = CategoryInvitationRequest,
    responses(
        (status = 200, description = "Guests of the category invited to (or removed from) the event", body = CategoryInvitationSaved),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057) (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "Not a current invite-only event, a category over 50 characters, or the flag off (`roster.invite_invalid`), or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn set_category_invitation(
    State(state): State<AppState>,
    path: Result<Path<i32>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<CategoryInvitationRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let invitation_id = invitation_path(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) = body.map_err(bad_body)?;
    let now = utc_now();
    let scope = idempotency::host_scope("roster:category", owner.user_id, invitation_id, 0);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("category_begin"))?;
    let config = accessible_invitation(&mut tx, &owner, invitation_id, Capability::Guests).await?;
    if let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await? {
        return Ok(response);
    }
    let category = js_trim(&request.category).to_string();
    let current = current_invite_only(&config).contains(&request.event_id);
    if !request.flags.invite_only_events || !current || category.chars().count() > MAX_CATEGORY {
        return Err(ApiError::Unprocessable("roster.invite_invalid", Subject::None));
    }
    lock_roster(&mut tx, invitation_id).await?;
    let changed = match request.mode {
        CategoryMode::Add => sqlx::query_scalar!(
            "update guests set invited_event_ids = \
               (case when jsonb_typeof(coalesce(invited_event_ids, '[]'::jsonb)) = 'array' \
                 then coalesce(invited_event_ids, '[]'::jsonb) else '[]'::jsonb end) || jsonb_build_array($2::text) \
             where invitation_id = $1 \
               and (case when $3::text = '' then (category is null or category = '') else category = $3::text end) \
               and not (coalesce(invited_event_ids, '[]'::jsonb) ? $2::text) \
             returning id",
            invitation_id,
            request.event_id,
            category
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(db("category_add"))?,
        CategoryMode::Remove => sqlx::query_scalar!(
            "update guests set invited_event_ids = nullif(invited_event_ids - $2::text, '[]'::jsonb) \
             where invitation_id = $1 \
               and (case when $3::text = '' then (category is null or category = '') else category = $3::text end) \
               and coalesce(invited_event_ids, '[]'::jsonb) ? $2::text \
             returning id",
            invitation_id,
            request.event_id,
            category
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(db("category_remove"))?,
    };
    let saved = CategoryInvitationSaved { changed: count(changed.len()) };
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &saved, now).await? {
        return Ok(response);
    }
    Ok(Json(saved).into_response())
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/registration-link",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "Bound to the signed-in owner and this invitation; a retried rotation replays its token"),
    ),
    request_body = RegistrationLinkRequest,
    responses(
        (status = 200, description = "The link's token after the action (null once closed)", body = RegistrationLinkSaved),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057) (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "`idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn registration_link(
    State(state): State<AppState>,
    path: Result<Path<i32>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<RegistrationLinkRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let invitation_id = invitation_path(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) = body.map_err(bad_body)?;
    let now = utc_now();
    let scope = idempotency::host_scope("roster:link", owner.user_id, invitation_id, 0);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("link_begin"))?;
    accessible_invitation(&mut tx, &owner, invitation_id, Capability::Guests).await?;
    if let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await? {
        return Ok(response);
    }
    lock_roster(&mut tx, invitation_id).await?;
    let token = match request.action {
        LinkAction::Close => {
            sqlx::query!("delete from guest_registration_links where invitation_id = $1", invitation_id)
                .execute(&mut *tx)
                .await
                .map_err(db("link_close"))?;
            None
        }
        action => {
            let open = if action == LinkAction::Open {
                sqlx::query_scalar!(
                    "select token from guest_registration_links where invitation_id = $1",
                    invitation_id
                )
                .fetch_optional(&mut *tx)
                .await
                .map_err(db("link_read"))?
            } else {
                None
            };
            match open {
                Some(token) => Some(token),
                None => {
                    let token = new_link_token();
                    sqlx::query!(
                        "insert into guest_registration_links (invitation_id, token) values ($1, $2) \
                         on conflict (invitation_id) do update set token = excluded.token, created_at = now()",
                        invitation_id,
                        token
                    )
                    .execute(&mut *tx)
                    .await
                    .map_err(db("link_write"))?;
                    Some(token)
                }
            }
        }
    };
    let saved = RegistrationLinkSaved { token };
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &saved, now).await? {
        return Ok(response);
    }
    Ok(Json(saved).into_response())
}

/// What the idempotency hash covers for a registration: the values, never the address.
#[derive(Serialize)]
struct RegistrationValues<'a> {
    name: &'a str,
    phone: Option<&'a str>,
    guest_count: Option<&'a str>,
}

#[utoipa::path(
    post,
    path = "/v1/registration-links/{token}/registrations",
    tag = "roster",
    security(("serviceSignature" = [])),
    params(
        ("token" = String, Path, description = "The invitation's self-registration token (`/daftar/<token>`)"),
        ("Idempotency-Key" = Option<String>, Header, description = "1–255 visible ASCII characters; a retry with the same key and values replays the answer for 24 hours"),
    ),
    request_body = RegistrationRequest,
    responses(
        (status = 200, description = "Received (waiting for the host), or already known; the same answer either way", body = RegistrationReceived),
        (status = 400, description = "Malformed body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid service signature", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "No open link, or its invitation is a draft (`registration.link_not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "The invitation has expired (`registration.closed`), or 300 registrations wait for the host (`registration.full`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "A value the rules refuse (`roster.row_invalid`, member `reason`), or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 429, description = "Too many registrations for this link or address (`rate_limit.exceeded`); nothing was written", body = Problem, content_type = "application/problem+json",
            headers(("Retry-After" = u64, description = "Seconds until the limit's window ends"))),
    )
)]
pub async fn register(
    State(state): State<AppState>,
    Path(token): Path<String>,
    headers: HeaderMap,
    body: Result<Json<RegistrationRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(request) = body.map_err(bad_body)?;
    let key = idempotency::key_from(&headers)?;
    let now = utc_now();
    if !is_link_token(&token) {
        return Err(ApiError::NotFound(LINK_NOT_FOUND));
    }
    let link = sqlx::query!(
        "select l.invitation_id, i.status, i.expires_at from guest_registration_links l \
         join invitations i on i.id = l.invitation_id where l.token = $1 and i.deleted_at is null",
        token
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(db("registration_link"))?
    .ok_or(ApiError::NotFound(LINK_NOT_FOUND))?;
    if link.status != "PUBLISHED" {
        return Err(if link.status == "EXPIRED" {
            ApiError::Conflict("registration.closed", Some("expired".into()))
        } else {
            ApiError::NotFound(LINK_NOT_FOUND)
        });
    }
    if link.expires_at.is_some_and(|at| at < now) {
        return Err(ApiError::Conflict("registration.closed", Some("expired".into())));
    }
    let invitation_id = link.invitation_id;

    let scope = format!("registration:link:{invitation_id}");
    let hash = idempotency::request_hash(&RegistrationValues {
        name: &request.name,
        phone: request.phone.as_deref(),
        guest_count: request.guest_count.as_deref(),
    });
    if let Some(key) = &key
        && let Some(response) = replay(&state.pool, &scope, key, &hash).await?
    {
        return Ok(response);
    }
    limits::enforce(
        &state.pool,
        &format!("registration:link:{invitation_id}"),
        state.limits.registration_per_link,
        now,
    )
    .await?;
    let secret = state.service_secrets.first().map(Vec::as_slice).unwrap_or_default();
    limits::enforce_address(
        &state.pool,
        secret,
        "registration",
        request.client_ip.as_deref(),
        state.limits.registration_per_ip,
        now,
    )
    .await?;

    let mut tx = state.pool.begin().await.map_err(db("registration_begin"))?;
    lock_roster(&mut tx, invitation_id).await?;
    let guests = sqlx::query!("select name, phone from guests where invitation_id = $1", invitation_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(db("registration_guests"))?;
    let pending = sqlx::query!("select name, phone from guest_registrations where invitation_id = $1", invitation_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(db("registration_pending"))?;
    let guests: Vec<Known<'_>> =
        guests.iter().map(|guest| Known { name: &guest.name, phone: guest.phone.as_deref() }).collect();
    let pending: Vec<Known<'_>> =
        pending.iter().map(|person| Known { name: &person.name, phone: person.phone.as_deref() }).collect();
    let input = RowInput {
        name: Some(&request.name),
        phone: request.phone.as_deref(),
        category: None,
        guest_count: request.guest_count.as_deref(),
    };
    match decide_registration(&input, &guests, &pending) {
        RegistrationVerdict::Invalid(reason) => return Err(row_invalid(reason)),
        RegistrationVerdict::Full => return Err(ApiError::Conflict("registration.full", None)),
        RegistrationVerdict::Duplicate => {}
        RegistrationVerdict::Ok(row) => {
            sqlx::query!(
                "insert into guest_registrations (invitation_id, name, phone, guest_count) values ($1, $2, $3, $4)",
                invitation_id,
                row.name,
                row.phone,
                row.guest_count
            )
            .execute(&mut *tx)
            .await
            .map_err(db("registration_insert"))?;
        }
    }
    let received = RegistrationReceived { status: RegistrationStatus::Received };
    if let Some(key) = &key
        && !idempotency::record(&mut tx, &scope, key, &hash, 200, &to_json(&received)?, now)
            .await
            .map_err(db("idempotency_record"))?
    {
        drop(tx);
        return replay(&state.pool, &scope, key, &hash).await?.ok_or(ApiError::Internal);
    }
    tx.commit().await.map_err(db("registration_commit"))?;
    Ok(Json(received).into_response())
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/registrations/{registration}/decision",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("registration" = i32, Path, minimum = 1, description = "A waiting registration of that invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "Bound to the signed-in owner, this invitation and this registration: a retried approval replays instead of answering 404"),
    ),
    request_body = RegistrationDecisionRequest,
    responses(
        (status = 200, description = "Approved (a guest now) or rejected (deleted)", body = RegistrationDecided),
        (status = 400, description = "Malformed path, body or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057), or not its waiting registration (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "The roster is full (`roster.full`), or the person is already a guest (`roster.duplicate`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "The stored request breaks a rule (`roster.row_invalid`, member `reason`), or `idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "Owner tokens are not configured or the signing keys are unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn decide(
    State(state): State<AppState>,
    path: Result<Path<(i32, i32)>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<RegistrationDecisionRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let (invitation_id, registration_id) = pair_path(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) = body.map_err(bad_body)?;
    let now = utc_now();
    let scope = idempotency::host_scope("roster:decision", owner.user_id, invitation_id, registration_id);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("decision_begin"))?;
    accessible_invitation(&mut tx, &owner, invitation_id, Capability::Guests).await?;
    if let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await? {
        return Ok(response);
    }
    lock_roster(&mut tx, invitation_id).await?;
    let registration = sqlx::query!(
        "select name, phone, guest_count from guest_registrations where id = $1 and invitation_id = $2",
        registration_id,
        invitation_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(db("decision_read"))?
    .ok_or(ApiError::NotFound(NOT_FOUND))?;
    let decided = match request.decision {
        Decision::Reject => {
            sqlx::query!("delete from guest_registrations where id = $1", registration_id)
                .execute(&mut *tx)
                .await
                .map_err(db("decision_reject"))?;
            RegistrationDecided { status: DecisionStatus::Rejected, guest_id: None }
        }
        Decision::Approve => {
            let seats = registration.guest_count.to_string();
            let input = RowInput {
                name: Some(&registration.name),
                phone: registration.phone.as_deref(),
                category: None,
                guest_count: Some(&seats),
            };
            let row = check_row(&input, MAX_REGISTRATION_SEATS).map_err(row_invalid)?;
            let existing = sqlx::query!("select name, phone, slug from guests where invitation_id = $1", invitation_id)
                .fetch_all(&mut *tx)
                .await
                .map_err(db("decision_existing"))?;
            if existing.len() >= MAX_GUESTS {
                return Err(ApiError::Conflict("roster.full", None));
            }
            let taken: HashSet<String> =
                existing.iter().flat_map(|guest| roster_keys(&guest.name, guest.phone.as_deref())).collect();
            if taken.contains(&duplicate_key(&row)) {
                return Err(ApiError::Conflict("roster.duplicate", None));
            }
            let slug = claim_slug(&row.name, &mut existing.iter().map(|guest| guest.slug.clone()).collect());
            let token = request.flags.opaque_links.then(new_link_token);
            let guest_id = sqlx::query_scalar!(
                "insert into guests (invitation_id, name, phone, category, guest_count, slug, link_token) \
                 values ($1, $2, $3, null, $4, $5, $6) returning id",
                invitation_id,
                row.name,
                row.phone,
                row.guest_count,
                slug,
                token
            )
            .fetch_one(&mut *tx)
            .await
            .map_err(db("decision_insert"))?;
            sqlx::query!("delete from guest_registrations where id = $1", registration_id)
                .execute(&mut *tx)
                .await
                .map_err(db("decision_remove"))?;
            RegistrationDecided { status: DecisionStatus::Approved, guest_id: Some(guest_id) }
        }
    };
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &decided, now).await? {
        return Ok(response);
    }
    Ok(Json(decided).into_response())
}

/// B-024 (D-056): one scanned guest pass.
#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PassScan {
    /// The text of the pass's QR (`IVP1.` and 48 base64url characters); anything else is answered `invalid`.
    #[schema(max_length = 200)]
    pub token: String,
    /// When the scanner saw it (`YYYY-MM-DDTHH:MM:SS[.fff]Z`). Kept within the last day; an older time is stored a day
    /// before this request, a future, malformed or absent one as this request's time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(max_length = 40)]
    pub scanned_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PassCheckinRequest {
    /// 1–50 scans, answered in this order.
    pub scans: Vec<PassScan>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "kebab-case")]
pub enum PassOutcome {
    /// The first check-in of this guest: stored with one CHECKIN event.
    CheckedIn,
    /// A replay: the guest was already checked in; nothing written.
    Already,
    /// A genuine pass past its expiry; nothing written, no name.
    Expired,
    /// Not a pass signed with an accepted secret; nothing written, no name.
    Invalid,
    /// A genuine pass of no guest of this invitation; nothing written, no name.
    Unknown,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PassScanResult {
    pub outcome: PassOutcome,
    /// The guest's display name, for `checked-in` and `already` only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// The stored check-in time (milliseconds, UTC), for `checked-in` and `already` only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked_in_at: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct PassCheckins {
    pub results: Vec<PassScanResult>,
}

const fn unnamed(outcome: PassOutcome) -> PassScanResult {
    PassScanResult { outcome, name: None, checked_in_at: None }
}

#[utoipa::path(
    post,
    path = "/v1/invitations/{invitation}/guest-pass-checkins",
    tag = "roster",
    security(("serviceSignature" = [], "ownerToken" = [])),
    params(
        ("invitation" = i32, Path, minimum = 1, description = "The owner's invitation"),
        ("Idempotency-Key" = Option<String>, Header, description = "The scanner's key for this batch, bound to the signed-in owner and this invitation; a resent batch replays the first answer for 24 hours"),
    ),
    request_body = PassCheckinRequest,
    responses(
        (status = 200, description = "Each scan answered in order: the token read (shape, MAC with an accepted `GUEST_PASS_SECRET`, expiry), the pass's guest locked, a first check-in stored with one CHECKIN event, a replay answered `already`", body = PassCheckins),
        (status = 400, description = "Malformed path, body (1–50 scans) or idempotency key", body = Problem, content_type = "application/problem+json"),
        (status = 401, description = "Missing or invalid signature or owner token", body = Problem, content_type = "application/problem+json"),
        (status = 403, description = "A token for no live customer, or an administrator", body = Problem, content_type = "application/problem+json"),
        (status = 404, description = "Not an invitation this caller may change (its owner, or a member whose role allows it: D-057) (`roster.not_found`)", body = Problem, content_type = "application/problem+json"),
        (status = 409, description = "The invitation has not opted in (`guest_pass.not_enabled`: `checkInSettings.enabled`)", body = Problem, content_type = "application/problem+json"),
        (status = 422, description = "`idempotency.key_reused`", body = Problem, content_type = "application/problem+json"),
        (status = 503, description = "No guest-pass secret (`guest_pass.not_configured`), owner tokens not configured, or the signing keys unreachable", body = Problem, content_type = "application/problem+json"),
    )
)]
pub async fn pass_checkins(
    State(state): State<AppState>,
    path: Result<Path<i32>, PathRejection>,
    headers: HeaderMap,
    body: Result<Json<PassCheckinRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let invitation_id = invitation_path(path)?;
    let owner = host(&state, &headers).await?;
    let Json(request) = body.map_err(bad_body)?;
    let oversized = request.scans.iter().any(|scan| {
        scan.token.chars().count() > pass::MAX_TOKEN_CHARS
            || scan.scanned_at.as_ref().is_some_and(|at| at.chars().count() > pass::MAX_SCANNED_AT_CHARS)
    });
    if request.scans.is_empty() || request.scans.len() > pass::MAX_SCANS_PER_BATCH || oversized {
        return Err(ApiError::BadRequest(
            "request.invalid_body",
            "1–50 scans, each a token of at most 200 characters".into(),
        ));
    }
    if state.guest_pass_secrets.is_empty() {
        return Err(ApiError::Unavailable("guest_pass.not_configured"));
    }
    let now = utc_now();
    let scope = idempotency::host_scope("roster:pass-checkins", owner.user_id, invitation_id, 0);
    let hash = idempotency::request_hash(&request);

    let mut tx = state.pool.begin().await.map_err(db("pass_begin"))?;
    let config = accessible_invitation(&mut tx, &owner, invitation_id, Capability::Checkin).await?;
    if let Some(response) = replay_for(&mut tx, &headers, &scope, &hash).await? {
        return Ok(response);
    }
    if !pass::check_in_enabled(&config) {
        return Err(ApiError::Conflict("guest_pass.not_enabled", None));
    }
    lock_roster(&mut tx, invitation_id).await?;
    let now_seconds = now.assume_utc().unix_timestamp();
    let mut results = Vec::with_capacity(request.scans.len());
    for scan in &request.scans {
        let pass_id = match pass::read(&scan.token, &state.guest_pass_secrets, now_seconds) {
            pass::PassRead::Valid { pass_id, .. } => pass_id,
            pass::PassRead::Expired { .. } => {
                results.push(unnamed(PassOutcome::Expired));
                continue;
            }
            pass::PassRead::Invalid => {
                results.push(unnamed(PassOutcome::Invalid));
                continue;
            }
        };
        let guest = sqlx::query!(
            "select id, name, checked_in_at from guests where invitation_id = $1 and pass_id = $2 for update",
            invitation_id,
            pass_id
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(db("pass_guest"))?;
        let result = match guest {
            None => unnamed(PassOutcome::Unknown),
            Some(guest) => match guest.checked_in_at {
                Some(first) => PassScanResult {
                    outcome: PassOutcome::Already,
                    name: Some(guest.name),
                    checked_in_at: Some(pass::iso_millis(first)),
                },
                None => {
                    let at = pass::check_in_time(scan.scanned_at.as_deref(), now);
                    sqlx::query!("update guests set checked_in_at = $1 where id = $2", at, guest.id)
                        .execute(&mut *tx)
                        .await
                        .map_err(db("pass_checkin"))?;
                    sqlx::query!(
                        "insert into analytics_events (invitation_id, guest_id, event_type, meta) values ($1, $2, 'CHECKIN', $3)",
                        invitation_id,
                        guest.id,
                        json!({ "source": "pass" })
                    )
                    .execute(&mut *tx)
                    .await
                    .map_err(db("pass_event"))?;
                    PassScanResult {
                        outcome: PassOutcome::CheckedIn,
                        name: Some(guest.name),
                        checked_in_at: Some(pass::iso_millis(at)),
                    }
                }
            },
        };
        results.push(result);
    }
    let answer = PassCheckins { results };
    if let Some(response) = commit_with(&headers, tx, &scope, &hash, &answer, now).await? {
        return Ok(response);
    }
    Ok(Json(answer).into_response())
}
