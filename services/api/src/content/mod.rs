//! B-035: invitation content, the editor's writes (`invitations.config` with its `invitation_versions` row), behind
//! `BACKEND_CONTENT` in Next.js. B-037 (D-055): creation's first row and version 1 too, so that column group has one
//! writer.

pub mod create;
pub mod creation;
pub mod http;
pub mod rules;
