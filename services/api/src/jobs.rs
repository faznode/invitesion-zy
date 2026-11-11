//! B-019 (09 §8.6): the Postgres job queue, without Redis or BullMQ. Next.js enqueues a row (kind, payload, dedupe
//! key; `lib/media/variant-jobs.ts`); this module owns the processing columns (attempts, lease, retry time, error,
//! completion). Due rows are claimed with `for update skip locked`, so concurrent runners never take the same job, and a
//! claim leases the row: a runner that dies mid-job leaves a lease that expires, and the job is taken again. At least
//! once, so every handler is idempotent. A cron invocation or the `invitesion-jobs` binary runs `run_due`.

use serde_json::Value;
use sqlx::PgPool;
use time::{Duration, PrimitiveDateTime};

use crate::media;
use crate::payment;
use crate::retention;
use crate::storage::Storage;

/// How long a claim holds a job before another runner may take it again.
pub const LEASE: Duration = Duration::minutes(5);

/// `jobs.last_error` is a `varchar(500)`; errors name keys and causes, never personal data.
const ERROR_MAX_CHARS: usize = 500;

#[derive(Debug, Clone)]
pub struct Job {
    pub id: i64,
    pub kind: String,
    pub payload: Value,
    /// Including the current attempt.
    pub attempts: i32,
    pub max_attempts: i32,
}

/// What a handler decided about one claimed job.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    /// Finished (including "nothing to do"); never claimed again.
    Done,
    /// A transient failure: taken again after `backoff`, until `max_attempts`.
    Retry(String),
    /// A failure no retry can fix (a malformed payload, an undecodable image): never claimed again.
    GiveUp(String),
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct RunSummary {
    pub claimed: usize,
    pub done: usize,
    pub retried: usize,
    pub gave_up: usize,
}

/// 2, 4, 8, 16, 32 minutes, then hourly.
pub fn backoff(attempts: i32) -> Duration {
    let exponent = attempts.clamp(1, 6) as u32;
    Duration::minutes(2_i64.pow(exponent - 1) * 2).min(Duration::hours(1))
}

fn bounded(error: &str) -> String {
    error.chars().take(ERROR_MAX_CHARS).collect()
}

/// Claims up to `limit` due jobs (oldest first), leasing each until `now + LEASE` and counting the attempt.
pub async fn claim_due(pool: &PgPool, now: PrimitiveDateTime, limit: i64) -> Result<Vec<Job>, sqlx::Error> {
    let lease_until = now + LEASE;
    let mut jobs: Vec<Job> = sqlx::query!(
        r#"with due as (
             select id from jobs
             where done_at is null and run_at <= $1 and attempts < max_attempts
               and (locked_until is null or locked_until <= $1)
             order by run_at, id
             limit $2
             for update skip locked
           )
           update jobs set attempts = jobs.attempts + 1, locked_until = $3
           from due where jobs.id = due.id
           returning jobs.id, jobs.kind, jobs.payload, jobs.attempts, jobs.max_attempts"#,
        now,
        limit,
        lease_until
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| Job {
        id: row.id,
        kind: row.kind,
        payload: row.payload,
        attempts: row.attempts,
        max_attempts: row.max_attempts,
    })
    .collect();
    jobs.sort_by_key(|job| job.id);
    Ok(jobs)
}

pub async fn complete(pool: &PgPool, id: i64, now: PrimitiveDateTime) -> Result<(), sqlx::Error> {
    sqlx::query!("update jobs set done_at = $2, locked_until = null, last_error = null where id = $1", id, now)
        .execute(pool)
        .await?;
    Ok(())
}

/// Releases the lease and schedules the next attempt; a job at `max_attempts` stays unfinished with its last error.
pub async fn retry_later(pool: &PgPool, job: &Job, now: PrimitiveDateTime, error: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "update jobs set locked_until = null, run_at = $2, last_error = $3 where id = $1",
        job.id,
        now + backoff(job.attempts),
        bounded(error)
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn give_up(pool: &PgPool, id: i64, error: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "update jobs set locked_until = null, attempts = max_attempts, last_error = $2 where id = $1",
        id,
        bounded(error)
    )
    .execute(pool)
    .await?;
    Ok(())
}

async fn handle(pool: &PgPool, storage: &Storage, job: &Job, now: PrimitiveDateTime) -> Outcome {
    match job.kind.as_str() {
        media::IMAGE_VARIANTS_JOB => media::run_image_variants(pool, storage, &job.payload, now).await,
        retention::PURGE_JOB_KIND => retention::run_invitation_purge(pool, storage, job, now).await,
        payment::outbox::PAYMENT_SETTLED_JOB => payment::outbox::run_payment_settled(pool, job).await,
        _ => Outcome::GiveUp("unknown job kind".into()),
    }
}

/// One pass: claim up to `limit` due jobs and run them one after another (image work is CPU-bound and runs on the
/// blocking pool, so a pass never starves the runtime).
pub async fn run_due(
    pool: &PgPool,
    storage: &Storage,
    now: PrimitiveDateTime,
    limit: i64,
) -> Result<RunSummary, sqlx::Error> {
    let jobs = claim_due(pool, now, limit).await?;
    let mut summary = RunSummary { claimed: jobs.len(), ..RunSummary::default() };
    for job in &jobs {
        match handle(pool, storage, job, now).await {
            Outcome::Done => {
                complete(pool, job.id, now).await?;
                summary.done += 1;
            }
            Outcome::Retry(error) => {
                tracing::warn!(job = job.id, kind = %job.kind, attempts = job.attempts, %error, "job will be retried");
                retry_later(pool, job, now, &error).await?;
                summary.retried += 1;
            }
            Outcome::GiveUp(error) => {
                tracing::error!(job = job.id, kind = %job.kind, attempts = job.attempts, %error, "job given up");
                give_up(pool, job.id, &error).await?;
                summary.gave_up += 1;
            }
        }
    }
    Ok(summary)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_from_two_minutes_and_caps_at_an_hour() {
        let minutes: Vec<i64> = (1..=8).map(|n| backoff(n).whole_minutes()).collect();
        assert_eq!(minutes, [2, 4, 8, 16, 32, 60, 60, 60]);
        assert_eq!(backoff(0), Duration::minutes(2));
    }

    #[test]
    fn errors_fit_the_column() {
        assert_eq!(bounded(&"é".repeat(600)).chars().count(), ERROR_MAX_CHARS);
        assert_eq!(bounded("short"), "short");
    }
}
