//! B-031 (D-063; ADR-A2 §8.6): the purge of a deleted invitation, its dry run, and the retention sweep after expiry.
//!
//! Next.js writes the owner's deletion (`lib/invitation/deletion-db.ts`): `deleted_at`, `purge_after` and this job, in
//! one transaction. From `purge_after` the job takes the invitation's row lock (the lock the owner's restore takes) and,
//! in one transaction, removes every row in `PURGED_TABLES`, the replay records of its guests and host writes, its
//! queued variant jobs and its content, marks the tombstone `purged_at`, and records the storage keys to remove in its
//! own payload. Then it deletes those objects. A failure before the commit changes nothing; a failure after it retries
//! the object deletions alone (deleting is idempotent). The tombstone keeps the slug reserved and the orders, payments
//! and conversations that point at it (`RETAINED_TABLES`).
//!
//! No duration is decided here: `INVITATION_DELETION_WINDOW_DAYS` and `INVITATION_RETENTION_DAYS_AFTER_EXPIRY` are the
//! owner's and counsel's (UU PDP review, EXT). Unset, the sweep does nothing; the purge runs only for deletions that
//! exist. The rules mirror `lib/invitation/retention.ts`, held together by `contracts/vectors/invitation-purge.json`.

use std::collections::BTreeSet;

use serde::Serialize;
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Transaction};
use time::{Date, Duration, Month, PrimitiveDateTime, Time};

use crate::jobs::{Job, Outcome};
use crate::media::IMAGE_VARIANTS_JOB;
use crate::storage::{Storage, StorageError, assert_safe_key};

pub const PURGE_JOB_KIND: &str = "invitation_purge";

/// Purge jobs retry for about fifteen hours (backoff doubles to an hourly cap), so a storage outage of an afternoon
/// does not leave objects behind; past that the job keeps its error for the operator (runbook in `docs/systems`).
pub const PURGE_MAX_ATTEMPTS: i32 = 20;

const MAX_DAYS: i64 = 3650;

/// Every table the purge empties for the invitation, children first (each has `invitation_id`; `agent_tasks` and
/// `wa_log` reference `invitation_versions` and `guests` without cascade, so they go before them). The same list as
/// `PURGED_TABLES` in `lib/invitation/retention.ts`; the dry run counts exactly these.
macro_rules! purged_tables {
    ($($table:literal),+ $(,)?) => {
        pub const PURGED_TABLES: &[&str] = &[$($table),+];
        const PURGE_STATEMENTS: &[(&str, &str, &str)] = &[$((
            $table,
            concat!("select count(*) from ", $table, " where invitation_id = $1"),
            concat!("delete from ", $table, " where invitation_id = $1"),
        )),+];
    };
}

purged_tables!(
    "analytics_events",
    "guest_messages",
    "gift_logs",
    "guest_logs",
    "seating_tables",
    "guest_registrations",
    "guest_registration_links",
    "invitation_members",
    "wa_log",
    "agent_tasks",
    "intake_session",
    "media_variants",
    "media_assets",
    "invitation_versions",
    "guests",
);

/// Kept on purpose and only counted: accounting records (their retention is the owner's and counsel's decision), the
/// customer's own conversations and a workspace's append-only credit ledger (G-052, D-067). All keep pointing at the
/// tombstone.
pub const RETAINED_TABLES: &[(&str, &str)] = &[
    ("orders", "select count(*) from orders where invitation_id = $1"),
    ("payments", "select count(*) from payments p join orders o on o.id = p.order_id where o.invitation_id = $1"),
    (
        "payment_events",
        "select count(*) from payment_events e join orders o on o.id = e.order_id where o.invitation_id = $1",
    ),
    ("conversations", "select count(*) from conversations where invitation_id = $1"),
    (
        "messages",
        "select count(*) from messages m join conversations c on c.id = m.conversation_id where c.invitation_id = $1",
    ),
    ("customer_session_summary", "select count(*) from customer_session_summary where invitation_id = $1"),
    ("workspace_credit_entries", "select count(*) from workspace_credit_entries where invitation_id = $1"),
];

/// Replay records of the invitation: its guests' RSVP and wish scopes (`rsvp:guest:<id>`, `wish:guest:<id>`) and every
/// host scope `{operation}:{owner}:{invitation}:{resource}` (`idempotency::host_scope`) naming it. The operation may
/// itself hold colons, so the invitation is the second segment from the end.
macro_rules! idempotency_scope {
    () => {
        "(scope in (select 'rsvp:guest:' || g.id from guests g where g.invitation_id = $1 \
         union all select 'wish:guest:' || g.id from guests g where g.invitation_id = $1) \
         or (scope ~ '^[a-z][a-z:-]*:[0-9]+:[0-9]+:[0-9]+$' \
         and reverse(split_part(reverse(scope), ':', 2)) = $1::int4::text))"
    };
}
const COUNT_IDEMPOTENCY: &str = concat!("select count(*) from api_idempotency_keys where ", idempotency_scope!());
const DELETE_IDEMPOTENCY: &str = concat!("delete from api_idempotency_keys where ", idempotency_scope!());

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct RetentionConfig {
    /// Days between a deletion and its purge; `None` = deletion unavailable (and no sweep).
    pub window_days: Option<i64>,
    /// Days after `expires_at` before the sweep deletes an invitation; `None` = no automatic retention deletion.
    pub retention_days_after_expiry: Option<i64>,
}

/// `parseDays` in `lib/invitation/retention.ts`: one to four digits, between `min` and ten years.
pub fn parse_days(raw: Option<&str>, min: i64) -> Option<i64> {
    let value = raw?.trim();
    if value.is_empty() || value.len() > 4 || !value.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let days: i64 = value.parse().ok()?;
    (min..=MAX_DAYS).contains(&days).then_some(days)
}

impl RetentionConfig {
    pub fn from_env() -> Self {
        Self::from_lookup(&|name| std::env::var(name).ok())
    }

    pub fn from_lookup(env: &dyn Fn(&str) -> Option<String>) -> Self {
        Self {
            window_days: parse_days(env("INVITATION_DELETION_WINDOW_DAYS").as_deref(), 1),
            retention_days_after_expiry: parse_days(env("INVITATION_RETENTION_DAYS_AFTER_EXPIRY").as_deref(), 0),
        }
    }
}

/// `Date.prototype.toISOString()`'s shape (`YYYY-MM-DDTHH:MM:SS.mmmZ`), the form Next.js writes into the payload.
pub fn js_instant(at: PrimitiveDateTime) -> String {
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        at.year(),
        u8::from(at.month()),
        at.day(),
        at.hour(),
        at.minute(),
        at.second(),
        at.millisecond()
    )
}

/// The inverse of `js_instant`, strictly: anything else is `None` (a malformed payload is given up, not guessed at).
pub fn parse_js_instant(value: &str) -> Option<PrimitiveDateTime> {
    let bytes = value.as_bytes();
    let separators = [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':'), (19, b'.'), (23, b'Z')];
    if bytes.len() != 24 || separators.iter().any(|&(at, byte)| bytes[at] != byte) {
        return None;
    }
    let number = |range: std::ops::Range<usize>| -> Option<u32> {
        let part = value.get(range)?;
        part.bytes().all(|b| b.is_ascii_digit()).then(|| part.parse().ok())?
    };
    let date = Date::from_calendar_date(
        i32::try_from(number(0..4)?).ok()?,
        Month::try_from(u8::try_from(number(5..7)?).ok()?).ok()?,
        u8::try_from(number(8..10)?).ok()?,
    )
    .ok()?;
    let time = Time::from_hms_milli(
        u8::try_from(number(11..13)?).ok()?,
        u8::try_from(number(14..16)?).ok()?,
        u8::try_from(number(17..19)?).ok()?,
        u16::try_from(number(20..23)?).ok()?,
    )
    .ok()?;
    Some(PrimitiveDateTime::new(date, time))
}

pub fn unix_ms(at: PrimitiveDateTime) -> i64 {
    i64::try_from(at.assume_utc().unix_timestamp_nanos() / 1_000_000).unwrap_or(i64::MAX)
}

/// JavaScript's clock resolution: a deletion instant the sweep writes must compare equal with its payload's.
pub fn to_millis(at: PrimitiveDateTime) -> PrimitiveDateTime {
    at.replace_nanosecond(at.nanosecond() / 1_000_000 * 1_000_000).unwrap_or(at)
}

/// The job row for one deletion (`purgeJobFor` in `lib/invitation/retention.ts`). The payload names the deletion
/// instant, so a job left behind by a deletion the owner restored finds a different `deleted_at` and does nothing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PurgeJob {
    pub payload: Value,
    pub dedupe_key: String,
    pub run_at: PrimitiveDateTime,
}

pub fn purge_job_for(invitation_id: i32, deleted_at: PrimitiveDateTime, purge_after: PrimitiveDateTime) -> PurgeJob {
    PurgeJob {
        payload: json!({ "invitationId": invitation_id, "deletedAt": js_instant(deleted_at) }),
        dedupe_key: format!("invitation:{invitation_id}:{}", unix_ms(deleted_at)),
        run_at: purge_after,
    }
}

/// The storage prefixes an invitation owns outright (`invitationMediaKey`, the variant job's `variants/<id>/`,
/// `protectedInvitationMediaKey`). The purge never deletes a key outside them, whatever a config refers to.
pub fn own_prefixes(invitation_id: i32) -> [String; 3] {
    [format!("{invitation_id}/"), format!("variants/{invitation_id}/"), format!("protected/{invitation_id}/")]
}

pub fn owns_key(invitation_id: i32, key: &str) -> bool {
    assert_safe_key(key).is_ok() && own_prefixes(invitation_id).iter().any(|prefix| key.starts_with(prefix.as_str()))
}

/// A PostgreSQL regular expression capturing every `/media/<key>` reference to this invitation's own prefixes, in a
/// config's JSON text or a stored URL (relative or absolute).
pub fn reference_pattern(invitation_id: i32) -> String {
    format!("/media/((?:variants/|protected/)?{invitation_id}/[A-Za-z0-9._/-]+)")
}

#[derive(Debug, thiserror::Error)]
pub enum PurgeError {
    #[error("database: {0}")]
    Database(#[from] sqlx::Error),
    #[error("{0}")]
    Storage(#[from] StorageError),
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TableCount {
    pub table: &'static str,
    pub rows: i64,
}

/// What the purge would do now, for the dry run (`invitesion-jobs --plan-purge <id>`). Nothing is changed to produce it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PurgePlan {
    pub invitation_id: i32,
    /// `live`, `scheduled` (in its window), `due` (window over, waiting for the job) or `purged`.
    pub state: &'static str,
    pub purge_after: Option<String>,
    pub rows: Vec<TableCount>,
    pub idempotency_records: i64,
    pub variant_jobs: i64,
    /// Keys the purge deletes: everything under the invitation's prefixes, listed in storage or referenced by its rows.
    pub objects: Vec<String>,
    /// Keys under its prefixes that another invitation (not purged), its versions or a template still refers to: kept.
    pub kept_shared: Vec<String>,
    pub retained: Vec<TableCount>,
}

fn state_of(
    deleted_at: Option<PrimitiveDateTime>,
    purge_after: Option<PrimitiveDateTime>,
    purged_at: Option<PrimitiveDateTime>,
    now: PrimitiveDateTime,
) -> &'static str {
    match (deleted_at, purge_after, purged_at) {
        (_, _, Some(_)) => "purged",
        (Some(_), Some(after), None) if after <= now => "due",
        (Some(_), _, None) => "scheduled",
        _ => "live",
    }
}

async fn count_rows(tx: &mut Transaction<'_, Postgres>, invitation_id: i32) -> Result<Vec<TableCount>, sqlx::Error> {
    let mut counts = Vec::with_capacity(PURGE_STATEMENTS.len());
    for &(table, count, _) in PURGE_STATEMENTS {
        let rows: i64 = sqlx::query_scalar(count).bind(invitation_id).fetch_one(&mut **tx).await?;
        counts.push(TableCount { table, rows });
    }
    Ok(counts)
}

async fn count_retained(
    tx: &mut Transaction<'_, Postgres>,
    invitation_id: i32,
) -> Result<Vec<TableCount>, sqlx::Error> {
    let mut counts = Vec::with_capacity(RETAINED_TABLES.len());
    for &(table, count) in RETAINED_TABLES {
        let rows: i64 = sqlx::query_scalar(count).bind(invitation_id).fetch_one(&mut **tx).await?;
        counts.push(TableCount { table, rows });
    }
    Ok(counts)
}

/// Every key the invitation owns: listed under its prefixes (so an upload no row refers to any more is found) and
/// referenced by its config, versions, media rows and variant rows; restricted to its own prefixes.
async fn candidate_objects(
    tx: &mut Transaction<'_, Postgres>,
    storage: &Storage,
    invitation_id: i32,
) -> Result<BTreeSet<String>, PurgeError> {
    let mut keys = BTreeSet::new();
    for prefix in own_prefixes(invitation_id) {
        keys.extend(storage.list(&prefix).await?);
    }
    let pattern = reference_pattern(invitation_id);
    let referenced = sqlx::query_scalar!(
        r#"select key as "key!" from (
             select (regexp_matches(coalesce(config::text, ''), $2, 'g'))[1] as key from invitations where id = $1
             union all
             select (regexp_matches(config::text, $2, 'g'))[1] from invitation_versions where invitation_id = $1
             union all
             select (regexp_matches(url, $2, 'g'))[1] from media_assets where invitation_id = $1
             union all
             select source_key from media_variants where invitation_id = $1
             union all
             select variant_key from media_variants where invitation_id = $1
           ) refs where key is not null"#,
        invitation_id,
        pattern
    )
    .fetch_all(&mut **tx)
    .await?;
    keys.extend(referenced);
    keys.retain(|key| owns_key(invitation_id, key));
    Ok(keys)
}

/// The candidates something outside this invitation still refers to: another invitation that is not purged (its
/// config or any of its versions), another invitation's media rows, or a template's default config.
async fn shared_objects(
    tx: &mut Transaction<'_, Postgres>,
    invitation_id: i32,
    candidates: &BTreeSet<String>,
) -> Result<BTreeSet<String>, sqlx::Error> {
    if candidates.is_empty() {
        return Ok(BTreeSet::new());
    }
    let pattern = reference_pattern(invitation_id);
    let referenced = sqlx::query_scalar!(
        r#"select key as "key!" from (
             select (regexp_matches(i.config::text, $2, 'g'))[1] as key from invitations i
              where i.id <> $1 and i.purged_at is null and i.config::text ~ $2
             union all
             select (regexp_matches(v.config::text, $2, 'g'))[1] from invitation_versions v
              join invitations i on i.id = v.invitation_id
              where v.invitation_id <> $1 and i.purged_at is null and v.config::text ~ $2
             union all
             select (regexp_matches(m.url, $2, 'g'))[1] from media_assets m where m.invitation_id <> $1 and m.url ~ $2
             union all
             select (regexp_matches(t.default_config::text, $2, 'g'))[1] from templates t
              where t.default_config::text ~ $2
           ) refs where key is not null"#,
        invitation_id,
        pattern
    )
    .fetch_all(&mut **tx)
    .await?;
    Ok(referenced.into_iter().filter(|key| candidates.contains(key)).collect())
}

async fn count_idempotency(tx: &mut Transaction<'_, Postgres>, invitation_id: i32) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(COUNT_IDEMPOTENCY).bind(invitation_id).fetch_one(&mut **tx).await
}

async fn count_variant_jobs(tx: &mut Transaction<'_, Postgres>, invitation_id: i32) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"select count(*) as "n!" from jobs where kind = $1 and dedupe_key like $2"#,
        IMAGE_VARIANTS_JOB,
        format!("{invitation_id}/%")
    )
    .fetch_one(&mut **tx)
    .await
}

/// The dry run: a read-only transaction that counts and lists exactly what `run_invitation_purge` would remove now, for
/// any state (for a purged invitation it shows what is left under its prefixes). `None` for an unknown invitation.
pub async fn plan_purge(
    pool: &PgPool,
    storage: &Storage,
    invitation_id: i32,
    now: PrimitiveDateTime,
) -> Result<Option<PurgePlan>, PurgeError> {
    let mut tx = pool.begin().await?;
    sqlx::query("set transaction read only").execute(&mut *tx).await?;
    let Some(row) =
        sqlx::query!("select deleted_at, purge_after, purged_at from invitations where id = $1", invitation_id)
            .fetch_optional(&mut *tx)
            .await?
    else {
        return Ok(None);
    };
    let rows = count_rows(&mut tx, invitation_id).await?;
    let idempotency_records = count_idempotency(&mut tx, invitation_id).await?;
    let variant_jobs = count_variant_jobs(&mut tx, invitation_id).await?;
    let retained = count_retained(&mut tx, invitation_id).await?;
    let candidates = candidate_objects(&mut tx, storage, invitation_id).await?;
    let shared = shared_objects(&mut tx, invitation_id, &candidates).await?;
    tx.rollback().await?;
    Ok(Some(PurgePlan {
        invitation_id,
        state: state_of(row.deleted_at, row.purge_after, row.purged_at, now),
        purge_after: row.purge_after.map(js_instant),
        rows,
        idempotency_records,
        variant_jobs,
        objects: candidates.difference(&shared).cloned().collect(),
        kept_shared: shared.into_iter().collect(),
        retained,
    }))
}

enum Step {
    /// Restored, deleted again later, already purged, or gone: this job has nothing to do.
    Superseded,
    NotDue,
    Purged(Vec<String>),
}

async fn purge_rows(
    pool: &PgPool,
    storage: &Storage,
    job_id: i64,
    invitation_id: i32,
    deleted_at: PrimitiveDateTime,
    now: PrimitiveDateTime,
) -> Result<Step, PurgeError> {
    let mut tx = pool.begin().await?;
    let Some(row) = sqlx::query!(
        "select deleted_at, purge_after, purged_at from invitations where id = $1 for update",
        invitation_id
    )
    .fetch_optional(&mut *tx)
    .await?
    else {
        return Ok(Step::Superseded);
    };
    if row.deleted_at != Some(deleted_at) || row.purged_at.is_some() {
        return Ok(Step::Superseded);
    }
    if row.purge_after.is_none_or(|after| after > now) {
        return Ok(Step::NotDue);
    }

    let candidates = candidate_objects(&mut tx, storage, invitation_id).await?;
    let shared = shared_objects(&mut tx, invitation_id, &candidates).await?;
    let doomed: Vec<String> = candidates.difference(&shared).cloned().collect();

    // Replay records first: their guest scopes are found through the guests about to go.
    sqlx::query(DELETE_IDEMPOTENCY).bind(invitation_id).execute(&mut *tx).await?;
    for &(_, _, delete) in PURGE_STATEMENTS {
        sqlx::query(delete).bind(invitation_id).execute(&mut *tx).await?;
    }
    sqlx::query!(
        "delete from jobs where kind = $1 and dedupe_key like $2",
        IMAGE_VARIANTS_JOB,
        format!("{invitation_id}/%")
    )
    .execute(&mut *tx)
    .await?;
    // The tombstone keeps the slug (never reused) and the money; the content and everything that identified or protected
    // it goes, including G-047's passcode hash and its time (D-069, R-X10).
    sqlx::query!(
        "update invitations set config = null, creation_key = null, client_label = null, guest_passcode_hash = null, guest_passcode_set_at = null, purged_at = $2 where id = $1",
        invitation_id,
        now
    )
    .execute(&mut *tx)
    .await?;
    let kept: Vec<&String> = shared.iter().collect();
    sqlx::query!(
        "update jobs set payload = payload || $2 where id = $1",
        job_id,
        json!({ "objects": doomed, "keptShared": kept })
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    if !shared.is_empty() {
        tracing::info!(invitation = invitation_id, kept = shared.len(), "purge kept objects another invitation uses");
    }
    Ok(Step::Purged(doomed))
}

async fn delete_objects(storage: &Storage, objects: &[String]) -> Outcome {
    let mut failed = 0usize;
    let mut first_error = None;
    for key in objects {
        if let Err(error) = storage.delete(key).await {
            failed += 1;
            first_error.get_or_insert_with(|| format!("{key}: {error}"));
        }
    }
    match first_error {
        None => Outcome::Done,
        Some(error) => Outcome::Retry(format!("{failed} of {} objects not deleted; first: {error}", objects.len())),
    }
}

fn payload_target(payload: &Value) -> Option<(i32, PrimitiveDateTime)> {
    let invitation_id = i32::try_from(payload.get("invitationId")?.as_i64()?).ok().filter(|id| *id > 0)?;
    let deleted_at = parse_js_instant(payload.get("deletedAt")?.as_str()?)?;
    Some((invitation_id, deleted_at))
}

/// The `invitation_purge` job. Payload `{ invitationId, deletedAt }` from Next.js or the sweep; after its database step
/// commits it also carries `objects` (and `keptShared`), and a retry goes straight to the object deletions.
pub async fn run_invitation_purge(pool: &PgPool, storage: &Storage, job: &Job, now: PrimitiveDateTime) -> Outcome {
    let Some((invitation_id, deleted_at)) = payload_target(&job.payload) else {
        return Outcome::GiveUp("malformed purge payload".into());
    };
    if let Some(recorded) = job.payload.get("objects").and_then(Value::as_array) {
        let objects: Vec<String> = recorded
            .iter()
            .filter_map(Value::as_str)
            .filter(|key| owns_key(invitation_id, key))
            .map(str::to_string)
            .collect();
        return delete_objects(storage, &objects).await;
    }
    match purge_rows(pool, storage, job.id, invitation_id, deleted_at, now).await {
        Ok(Step::Superseded) => {
            tracing::info!(invitation = invitation_id, "purge superseded (restored, deleted again or already purged)");
            Outcome::Done
        }
        Ok(Step::NotDue) => Outcome::Retry("purge not due yet".into()),
        Ok(Step::Purged(objects)) => delete_objects(storage, &objects).await,
        Err(error) => Outcome::Retry(format!("purge of invitation {invitation_id} failed: {error}")),
    }
}

/// Expired invitations past the retention period are deleted as their owner would delete them: the window opens (the
/// owner may still restore) and the purge job is queued, with the payload and dedupe key Next.js writes. Bounded per
/// pass and `skip locked`, so concurrent runners share the work. Does nothing until both durations are set.
pub async fn sweep_retention(
    pool: &PgPool,
    now: PrimitiveDateTime,
    config: &RetentionConfig,
    limit: i64,
) -> Result<usize, sqlx::Error> {
    let (Some(window), Some(retention)) = (config.window_days, config.retention_days_after_expiry) else {
        return Ok(0);
    };
    let deleted_at = to_millis(now);
    let cutoff = deleted_at - Duration::days(retention);
    let purge_after = deleted_at + Duration::days(window);
    let mut tx = pool.begin().await?;
    let due = sqlx::query_scalar!(
        "select id from invitations where deleted_at is null and expires_at is not null and expires_at <= $1 \
         order by expires_at, id limit $2 for update skip locked",
        cutoff,
        limit
    )
    .fetch_all(&mut *tx)
    .await?;
    for &invitation_id in &due {
        sqlx::query!(
            "update invitations set deleted_at = $2, purge_after = $3 where id = $1 and deleted_at is null",
            invitation_id,
            deleted_at,
            purge_after
        )
        .execute(&mut *tx)
        .await?;
        let job = purge_job_for(invitation_id, deleted_at, purge_after);
        sqlx::query!(
            "insert into jobs (kind, payload, dedupe_key, run_at, max_attempts) values ($1, $2, $3, $4, $5) \
             on conflict (kind, dedupe_key) do nothing",
            PURGE_JOB_KIND,
            job.payload,
            job.dedupe_key,
            job.run_at,
            PURGE_MAX_ATTEMPTS
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(due.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(value: &str) -> PrimitiveDateTime {
        parse_js_instant(value).unwrap()
    }

    #[test]
    fn instants_round_trip_in_javascripts_shape() {
        for value in ["2026-11-10T01:02:03.004Z", "2000-02-29T23:59:59.999Z", "2026-01-01T00:00:00.000Z"] {
            assert_eq!(js_instant(at(value)), value);
        }
        for bad in [
            "2026-11-10T01:02:03Z",
            "2026-11-10T01:02:03.004",
            "2026-11-10 01:02:03.004Z",
            "2026-13-10T01:02:03.004Z",
            "2026-02-30T01:02:03.004Z",
            "+026-11-10T01:02:03.004Z",
            "2026-11-10T01:02:03.+04Z",
            "",
        ] {
            assert_eq!(parse_js_instant(bad), None, "{bad}");
        }
        assert_eq!(unix_ms(at("1970-01-01T00:00:01.250Z")), 1250);
    }

    #[test]
    fn truncation_matches_javascripts_resolution() {
        let precise = at("2026-11-10T01:02:03.004Z").replace_nanosecond(4_567_891).unwrap();
        assert_eq!(js_instant(to_millis(precise)), "2026-11-10T01:02:03.004Z");
        assert_eq!(to_millis(precise).nanosecond(), 4_000_000);
    }

    #[test]
    fn keys_outside_the_invitations_prefixes_are_never_its_own() {
        for key in ["12/0123456789abcdef01234567.jpg", "variants/12/abc/standard-640.webp", "protected/12/a.png"] {
            assert!(owns_key(12, key), "{key}");
        }
        for key in [
            "1/0123456789abcdef01234567.jpg",
            "123/a.jpg",
            "variants/123/a.webp",
            "protected/1/a.png",
            "avatars/12/a.jpg",
            "12/../13/a.jpg",
            "12",
        ] {
            assert!(!owns_key(12, key), "{key}");
        }
    }

    #[test]
    fn the_idempotency_statements_share_one_condition() {
        let condition = |statement: &'static str| statement.split_once(" where ").map(|(_, rest)| rest);
        assert_eq!(condition(COUNT_IDEMPOTENCY), condition(DELETE_IDEMPOTENCY));
        assert!(COUNT_IDEMPOTENCY.starts_with("select count(*) from api_idempotency_keys"));
        assert!(DELETE_IDEMPOTENCY.starts_with("delete from api_idempotency_keys"));
    }

    #[test]
    fn statuses_follow_the_columns() {
        let now = at("2026-11-10T00:00:00.000Z");
        let (before, after) = (Some(now - Duration::days(1)), Some(now + Duration::days(1)));
        assert_eq!(state_of(None, None, None, now), "live");
        assert_eq!(state_of(before, after, None, now), "scheduled");
        assert_eq!(state_of(before, Some(now), None, now), "due");
        assert_eq!(state_of(before, before, before, now), "purged");
    }
}
