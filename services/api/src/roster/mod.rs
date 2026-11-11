//! B-033: the guest roster (09 §8.3 "Guest roster: Rust from U4"): every write of the roster columns and rows of
//! `guests`, self-registrations and their links, behind `BACKEND_ROSTER` in Next.js.

pub mod http;
pub mod pass;
pub mod phone;
pub mod rules;
