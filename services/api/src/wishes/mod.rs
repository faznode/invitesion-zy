//! R-04: wishes (B-028 moderation, host replies and visibility; B-013 limits; B-017 index; D-044). `content` reads the
//! guestbook section leniently, `decision` holds the rules shared with `lib/invitation/wish-decision.ts` through
//! `contracts/vectors/wish-decisions.json`, and `http` the guest's write and the host's moderation and reply.

pub mod content;
pub mod decision;
pub mod http;
