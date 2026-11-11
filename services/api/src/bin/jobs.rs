//! B-019 (09 §8.6): runs the due jobs once, for a cron invocation, or every minute with `--watch` (the container
//! fallback, 09 §8.8). Needs `DATABASE_URL` (or `POSTGRES_URL`) and the upload store: `S3_*` as in Next.js, or
//! `UPLOAD_ROOT`. Prints one JSON summary line per pass on stdout; exits 2 on configuration, 1 on a failed pass.
//!
//! B-031 (D-063): each pass first runs the retention sweep, which does nothing until both
//! `INVITATION_DELETION_WINDOW_DAYS` and `INVITATION_RETENTION_DAYS_AFTER_EXPIRY` are set. `--plan-purge <id>` is the
//! purge's dry run: it prints what the `invitation_purge` job would remove for that invitation now, as JSON, changes
//! nothing and runs no job.

use std::time::Duration;

use invitesion_api::config::install_crypto_provider;
use invitesion_api::jobs::run_due;
use invitesion_api::retention::{RetentionConfig, plan_purge, sweep_retention};
use invitesion_api::storage::Storage;
use invitesion_api::telemetry;
use invitesion_api::views::utc_now;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};

fn setting(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn refuse(message: &str) -> ! {
    tracing::error!(message, "jobs refused to start");
    std::process::exit(2);
}

#[tokio::main]
async fn main() {
    telemetry::init();
    install_crypto_provider();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let watch = args.iter().any(|arg| arg == "--watch");
    let plan_target = args.iter().position(|arg| arg == "--plan-purge").map(|at| {
        args.get(at + 1)
            .and_then(|raw| raw.parse::<i32>().ok())
            .filter(|id| *id > 0)
            .unwrap_or_else(|| refuse("--plan-purge needs an invitation id"))
    });
    let database_url = setting("DATABASE_URL")
        .or_else(|| setting("POSTGRES_URL"))
        .unwrap_or_else(|| refuse("DATABASE_URL or POSTGRES_URL is not set"));
    let storage = Storage::from_env().unwrap_or_else(|error| refuse(&error.to_string()));
    let batch: i64 = setting("JOBS_BATCH")
        .map(|raw| raw.parse().unwrap_or_else(|_| refuse("JOBS_BATCH is not a number")))
        .unwrap_or(10);
    let statement_cache: usize = setting("DATABASE_STATEMENT_CACHE")
        .map(|raw| raw.parse().unwrap_or_else(|_| refuse("DATABASE_STATEMENT_CACHE is not a number")))
        .unwrap_or(0);
    let options: PgConnectOptions = database_url.parse().unwrap_or_else(|_| refuse("DATABASE_URL is not valid"));
    let pool = PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(Duration::from_secs(5))
        .connect_lazy_with(options.statement_cache_capacity(statement_cache).application_name("invitesion-jobs"));

    if let Some(invitation_id) = plan_target {
        match plan_purge(&pool, &storage, invitation_id, utc_now()).await {
            Ok(Some(plan)) => {
                println!("{}", serde_json::to_string(&plan).expect("plans serialise"));
                return;
            }
            Ok(None) => refuse("no invitation with that id"),
            Err(error) => {
                tracing::error!(%error, "purge plan failed");
                std::process::exit(1);
            }
        }
    }

    let retention = RetentionConfig::from_env();
    loop {
        let now = utc_now();
        let swept = match sweep_retention(&pool, now, &retention, batch).await {
            Ok(swept) => swept,
            Err(error) => {
                tracing::error!(%error, "retention sweep failed");
                if !watch {
                    std::process::exit(1);
                }
                0
            }
        };
        match run_due(&pool, &storage, now, batch).await {
            Ok(summary) => println!(
                "{{\"claimed\":{},\"done\":{},\"retried\":{},\"gaveUp\":{},\"swept\":{},\"storage\":\"{}\"}}",
                summary.claimed,
                summary.done,
                summary.retried,
                summary.gave_up,
                swept,
                storage.name()
            ),
            Err(error) => {
                tracing::error!(%error, "jobs pass failed");
                if !watch {
                    std::process::exit(1);
                }
            }
        }
        if !watch {
            break;
        }
        tokio::time::sleep(Duration::from_secs(60)).await;
    }
}
