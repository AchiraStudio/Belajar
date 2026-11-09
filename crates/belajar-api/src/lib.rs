//! HTTP surface of Belajar.
//!
//! * the **legacy-compatible API** (`/api/login`, `/api/rpc/:action`, ...) that the unchanged
//!   frontend uses, plus static file serving: see [`legacy`];
//! * the versioned `/api/v1` namespace for new clients (error model ADR-7): see [`routes`].

pub mod auth;
pub mod error;
pub mod legacy;
pub mod routes;
pub mod state;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::middleware;
use axum::routing::{any, get, post};
use tower_http::services::ServeDir;
use tower_http::trace::TraceLayer;

pub use state::ApiState;

/// The `/api/v1` router alone (stateless): health and the structured error model.
pub fn v1_router() -> Router {
    Router::new()
        .nest("/api/v1", routes::v1_stateless())
        .fallback(error::not_found)
}

/// The complete application router.
pub fn router(state: ApiState) -> Router {
    // Everything under /api that needs a login.
    let protected = Router::new()
        .route("/api/status", get(legacy::status))
        .route("/api/rpc/{action}", post(legacy::rpc))
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            legacy::require_auth,
        ));

    let public = Router::new()
        .route(
            "/api/login",
            post(legacy::login).layer(DefaultBodyLimit::max(4096)),
        )
        .route("/api/logout", post(legacy::logout))
        .route("/api/session", get(legacy::session));

    let static_files = ServeDir::new(&state.static_dir)
        .fallback(get(legacy::spa_fallback).with_state(state.clone()));

    Router::new()
        .merge(public)
        .merge(protected)
        .nest("/api/v1", routes::v1())
        .route("/api/{*rest}", any(legacy::api_not_found))
        .fallback_service(static_files)
        .layer(middleware::from_fn(legacy::security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode, header};
    use http_body_util::BodyExt;
    use serde_json::Value;
    use tower::ServiceExt;

    use super::v1_router;

    async fn get(uri: &str) -> (StatusCode, Option<String>, Value) {
        let response = v1_router()
            .oneshot(Request::get(uri).body(Body::empty()).expect("request"))
            .await
            .expect("response");
        let status = response.status();
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v.to_str().unwrap_or_default().to_owned());
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body")
            .to_bytes();
        (
            status,
            content_type,
            serde_json::from_slice(&bytes).expect("json body"),
        )
    }

    #[tokio::test]
    async fn health_reports_ok_and_version() {
        let (status, content_type, body) = get("/api/v1/health").await;
        assert_eq!(status, StatusCode::OK);
        assert!(content_type.is_some_and(|c| c.starts_with("application/json")));
        assert_eq!(body["status"], "ok");
        assert_eq!(body["service"], "belajar");
        assert_eq!(body["version"], env!("CARGO_PKG_VERSION"));
    }

    #[tokio::test]
    async fn unknown_v1_route_uses_the_error_model() {
        let (status, _, body) = get("/api/v1/does-not-exist").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "not_found");
        assert_eq!(body["error"]["retryable"], false);
        assert!(
            body["error"]["message"]
                .as_str()
                .is_some_and(|m| !m.is_empty())
        );
    }
}
