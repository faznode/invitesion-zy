//! Feasibility experiment for ADR-A2 (session 26). One domain function ported from
//! `lib/invitation/view-tracking.ts` (B-017a) behind the target conventions: axum router, sqlx on the
//! existing schema (drizzle-kit stays the only migration owner), RFC 9457 problem responses, an internal
//! service signature, and owner-token verification against a JWKS.

pub mod http;
pub mod owner_auth;
pub mod problem;
pub mod service_auth;
pub mod views;
