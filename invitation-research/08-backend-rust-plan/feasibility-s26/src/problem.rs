use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Serialize;

/// RFC 9457 problem details with a stable machine `code` (ADR-A2 error convention). Internal causes are logged,
/// never returned.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Problem {
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub status: u16,
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug)]
pub enum ApiError {
    Unauthorized(&'static str),
    BadRequest(&'static str, String),
    NotFound(&'static str),
    Internal,
}

impl ApiError {
    fn parts(&self) -> (StatusCode, &'static str, &'static str, Option<String>) {
        match self {
            ApiError::Unauthorized(code) => (StatusCode::UNAUTHORIZED, "Unauthorized", code, None),
            ApiError::BadRequest(code, detail) => (StatusCode::BAD_REQUEST, "Bad request", code, Some(detail.clone())),
            ApiError::NotFound(code) => (StatusCode::NOT_FOUND, "Not found", code, None),
            ApiError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "Internal error", "internal", None),
        }
    }

    pub fn problem(&self) -> Problem {
        let (status, title, code, detail) = self.parts();
        Problem {
            kind: format!("https://invitesion.id/problems/{code}"),
            title: title.to_string(),
            status: status.as_u16(),
            code: code.to_string(),
            detail,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.parts().0;
        let body = serde_json::to_vec(&self.problem()).unwrap_or_default();
        (status, [(header::CONTENT_TYPE, "application/problem+json")], body).into_response()
    }
}
