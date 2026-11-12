//! API error model (ADR-7).
//!
//! Every `/api/v1` error has the same shape so clients can branch on `code` and `retryable`
//! instead of guessing from the HTTP status:
//!
//! ```json
//! { "error": { "code": "not_found", "message": "...", "retryable": false } }
//! ```
//!
//! `message` is Indonesian and safe to show to the user, like the legacy `UserError` messages.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

/// An error that can be returned from any handler.
#[derive(Debug, Clone)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
    retryable: bool,
}

#[derive(Serialize)]
struct Envelope<'a> {
    error: Body<'a>,
}

#[derive(Serialize)]
struct Body<'a> {
    code: &'a str,
    message: &'a str,
    retryable: bool,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
            retryable: false,
        }
    }

    /// Mark the error as safe for the client to retry (timeouts, upstream hiccups).
    #[must_use]
    pub fn retryable(mut self) -> Self {
        self.retryable = true;
        self
    }

    pub fn not_found() -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "not_found",
            "Endpoint tidak ditemukan.",
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = Envelope {
            error: Body {
                code: self.code,
                message: &self.message,
                retryable: self.retryable,
            },
        };
        (self.status, Json(body)).into_response()
    }
}

/// Router fallback: unknown paths get the standard error shape instead of an empty 404.
pub async fn not_found() -> ApiError {
    ApiError::not_found()
}
