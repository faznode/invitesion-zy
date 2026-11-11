//! B-039 (09 §8.6, U6): the settlement writer of the payment domain (`orders` status, `paid_at` and the provider id a
//! settlement reports, `payments`, `payment_events`, the guarded activation of the order's invitation and the
//! entitlement outbox row), selected in Next.js by `BACKEND_PAYMENT=rust` (default `next`). Next.js keeps the public
//! webhook: the rail adapter verifies the provider's signature on the unmodified body and only a verified, normalised
//! event reaches `POST /v1/payments/settlements`, signed like every internal call. The administrator's manual
//! confirmation goes the same way after Next.js authorizes the administrator. Checkout creation (the order row and the
//! provider's handle) stays in Next.js with the provider adapters until a PJP adapter moves.
//!
//! `decision` holds the rules both writers share (`contracts/vectors/payment-settlement.json`), `http` the endpoint and
//! its one transaction, `outbox` the job that delivers the entitlement row, and `receipt` what that delivery issues
//! (G-050: one receipt per paid order, numbered without gaps).

pub mod decision;
pub mod http;
pub mod outbox;
pub mod receipt;
