//! Route groups of the versioned API, one module per domain.

use axum::Router;
use axum::routing::get;

pub mod auth_extract;
pub mod health;
pub mod opportunities;
pub mod profiles;
pub mod study;
pub mod tracking;

use crate::state::ApiState;

/// Stateless routes served under `/api/v1` (e.g. for v1_router() tests without db).
pub fn v1_stateless<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/health", get(health::health))
}

/// Stateful routes served under `/api/v1`.
pub fn v1() -> Router<ApiState> {
    Router::new()
        .route("/health", get(health::health))
        .nest("/opportunities", opportunities::router())
        .nest("/tracked-opportunities", tracking::router())
        .nest("/profiles", profiles::router())
        .nest("/study", study::router())
}
