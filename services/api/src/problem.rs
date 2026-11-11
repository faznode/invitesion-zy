//! RFC 9457 problem details with a stable machine `code` (`domain.reason`, 09 §8.2). Internal causes are logged by the
//! caller and never returned.

use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub const PROBLEM_CONTENT_TYPE: &str = "application/problem+json";
const PROBLEM_TYPE_BASE: &str = "https://invitesion.id/problems/";

/// An error response. `code` is stable and machine-readable; `title` and `detail` are for people and may change.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, ToSchema)]
pub struct Problem {
    /// `https://invitesion.id/problems/<code>`.
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub status: u16,
    /// Stable machine code, `domain.reason`.
    pub code: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// The event a `rsvp.event_answer_missing` problem is about.
    #[serde(rename = "eventId", default, skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    /// The question a `rsvp.answer_invalid` problem is about.
    #[serde(rename = "questionId", default, skip_serializing_if = "Option::is_none")]
    pub question_id: Option<String>,
    /// The rule a `roster.row_invalid` problem broke: `name`, `phone`, `seats` or `category` (B-033).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// The version a `content.version_conflict` problem found stored (B-035).
    #[serde(rename = "currentVersion", default, skip_serializing_if = "Option::is_none")]
    pub current_version: Option<i32>,
    /// The fields a `content.media_refused` or `content.theme_not_entitled` problem refused (B-035): paths and rules,
    /// never values.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub issues: Option<Vec<ProblemIssue>>,
}

/// A refused field by path (`couple.bride.photoUrl`) and rule (`protected-outside-child-photo`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, ToSchema)]
pub struct ProblemIssue {
    pub path: String,
    pub reason: String,
}

/// What a 422 is about, carried as an extension member.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Subject {
    None,
    Event(String),
    Question(String),
    /// The roster rule a row broke.
    Reason(&'static str),
    /// The fields a content write refused (B-035).
    Issues(Vec<ProblemIssue>),
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("unauthorized ({0})")]
    Unauthorized(&'static str),
    #[error("forbidden ({0})")]
    Forbidden(&'static str),
    #[error("bad request ({0}): {1}")]
    BadRequest(&'static str, String),
    #[error("not found ({0})")]
    NotFound(&'static str),
    /// The resource's state refuses the request (`detail` names why, e.g. `deadline`).
    #[error("conflict ({0})")]
    Conflict(&'static str, Option<String>),
    /// The write was prepared from another version than the stored one, carried as `currentVersion` (B-035).
    #[error("stale version ({0})")]
    StaleVersion(&'static str, i32),
    /// A well-formed request the domain rules refuse.
    #[error("unprocessable ({0})")]
    Unprocessable(&'static str, Subject),
    #[error("payload too large")]
    PayloadTooLarge,
    /// A write limit (B-013); answered with `Retry-After`.
    #[error("too many requests")]
    TooManyRequests { retry_after: u64 },
    #[error("unavailable ({0})")]
    Unavailable(&'static str),
    #[error("request timed out")]
    Timeout,
    #[error("internal error")]
    Internal,
}

impl ApiError {
    fn parts(&self) -> (StatusCode, &'static str, &'static str, Option<String>) {
        match self {
            ApiError::Unauthorized(code) => (StatusCode::UNAUTHORIZED, "Unauthorized", code, None),
            ApiError::Forbidden(code) => (StatusCode::FORBIDDEN, "Forbidden", code, None),
            ApiError::BadRequest(code, detail) => (StatusCode::BAD_REQUEST, "Bad request", code, Some(detail.clone())),
            ApiError::NotFound(code) => (StatusCode::NOT_FOUND, "Not found", code, None),
            ApiError::Conflict(code, detail) => (StatusCode::CONFLICT, "Conflict", code, detail.clone()),
            ApiError::StaleVersion(code, _) => (StatusCode::CONFLICT, "Conflict", code, None),
            ApiError::Unprocessable(code, _) => (StatusCode::UNPROCESSABLE_ENTITY, "Unprocessable", code, None),
            ApiError::PayloadTooLarge => {
                (StatusCode::PAYLOAD_TOO_LARGE, "Payload too large", "request.too_large", None)
            }
            ApiError::TooManyRequests { retry_after } => (
                StatusCode::TOO_MANY_REQUESTS,
                "Too many requests",
                "rate_limit.exceeded",
                Some(format!("retry after {retry_after} s")),
            ),
            ApiError::Unavailable(code) => (StatusCode::SERVICE_UNAVAILABLE, "Unavailable", code, None),
            ApiError::Timeout => (StatusCode::GATEWAY_TIMEOUT, "Timeout", "request.timeout", None),
            ApiError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "Internal error", "internal", None),
        }
    }

    pub fn status(&self) -> StatusCode {
        self.parts().0
    }

    pub fn problem(&self) -> Problem {
        let (status, title, code, detail) = self.parts();
        let (event_id, question_id, reason) = match self {
            ApiError::Unprocessable(_, Subject::Event(id)) => (Some(id.clone()), None, None),
            ApiError::Unprocessable(_, Subject::Question(id)) => (None, Some(id.clone()), None),
            ApiError::Unprocessable(_, Subject::Reason(reason)) => (None, None, Some((*reason).to_string())),
            _ => (None, None, None),
        };
        let issues = match self {
            ApiError::Unprocessable(_, Subject::Issues(issues)) => Some(issues.clone()),
            _ => None,
        };
        let current_version = match self {
            ApiError::StaleVersion(_, version) => Some(*version),
            _ => None,
        };
        Problem {
            kind: format!("{PROBLEM_TYPE_BASE}{code}"),
            title: title.to_string(),
            status: status.as_u16(),
            code: code.to_string(),
            detail,
            event_id,
            question_id,
            reason,
            current_version,
            issues,
        }
    }

    /// Logs a database or upstream failure with its cause and returns the opaque 500.
    pub fn internal(context: &'static str, error: impl std::fmt::Display) -> Self {
        tracing::error!(%error, context, "request failed");
        ApiError::Internal
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = serde_json::to_vec(&self.problem()).unwrap_or_default();
        let mut response = (self.status(), [(header::CONTENT_TYPE, PROBLEM_CONTENT_TYPE)], body).into_response();
        if let ApiError::TooManyRequests { retry_after } = self {
            response.headers_mut().insert(header::RETRY_AFTER, header::HeaderValue::from(retry_after));
        }
        response
    }
}
