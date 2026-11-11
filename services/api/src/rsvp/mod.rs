//! R-03: RSVP writes (B-027, D-034…D-037) with per-link and per-address limits (B-013) and `Idempotency-Key`.
//! `js` carries the JavaScript semantics, `content` the lenient config read, `rules` and `decision` the rules, and `http`
//! the endpoints. `contracts/vectors/rsvp-rules.json` and `rsvp-decisions.json` run against both writers.

pub mod content;
pub mod decision;
pub mod http;
pub mod js;
pub mod rules;
