use stuby_storage::StorageError;

/// Errors a handler can return.
///
/// * [`AppError::User`] carries an Indonesian message that is safe to show to the user (the legacy
///   `UserError`); the API maps it to HTTP 400 `{"error": message}`.
/// * everything else is logged and shown as a generic server error.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    User(String),
    #[error("action '{0}' tidak dikenal")]
    UnknownAction(String),
    #[error(transparent)]
    Storage(#[from] StorageError),
    #[error("{0}")]
    Internal(String),
}

impl AppError {
    pub fn user(message: impl Into<String>) -> Self {
        Self::User(message.into())
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }
}

pub type HResult = Result<serde_json::Value, AppError>;
