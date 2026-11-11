//! Invitesion domain API (ADR-A2, 09 §8). Rust becomes the authoritative writer one data domain at a time; Next.js
//! selects the live writer per domain with `BACKEND_<DOMAIN>` and calls this service only from server code. One
//! router serves the standalone binary (`src/main.rs`) and the Vercel function (`api/index.rs`).
//! drizzle-kit stays the only migration owner: nothing here runs DDL.

mod app;
pub mod config;
pub mod content;
pub mod guest_link;
pub mod health;
pub mod idempotency;
pub mod identity;
pub mod jobs;
pub mod limits;
pub mod media;
pub mod members;
pub mod openapi;
pub mod owner_auth;
pub mod payment;
pub mod problem;
pub mod retention;
pub mod roster;
pub mod rsvp;
pub mod service_auth;
pub mod storage;
pub mod telemetry;
pub mod views;
pub mod wishes;

pub use app::{AppState, StartupError, router};

/// The per-request deadline (`app::REQUEST_TIMEOUT`).
pub fn app_request_timeout() -> std::time::Duration {
    app::REQUEST_TIMEOUT
}
