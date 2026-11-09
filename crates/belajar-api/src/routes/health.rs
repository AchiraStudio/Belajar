//! `GET /api/v1/health`: liveness probe used by clients, Caddy and deploy scripts.
//!
//! It deliberately touches no database or provider, so it answers "is the process up".
//! A readiness check (database, Python worker, AI provider) is added in Stage 3.

use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

pub async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "belajar",
        version: env!("CARGO_PKG_VERSION"),
    })
}
