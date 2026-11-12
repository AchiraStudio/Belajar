//! Authentication and role extraction for /api/v1 routes.

use axum::extract::FromRequestParts;
use axum::http::header;
use axum::http::request::Parts;
use axum::http::StatusCode;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::ApiError;
use crate::state::ApiState;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub user_id_str: String,
    pub role: String,
    pub is_admin: bool,
}

pub fn parse_or_deterministic_uuid(s: &str) -> Uuid {
    if let Ok(uid) = Uuid::parse_str(s) {
        return uid;
    }
    let mut hash = Sha256::digest(s.as_bytes());
    // Set version 4 and RFC 4122 variant bits
    hash[6] = (hash[6] & 0x0f) | 0x40; // Version 4
    hash[8] = (hash[8] & 0x3f) | 0x80; // Variant 10xx
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hash[..16]);
    Uuid::from_bytes(bytes)
}

impl FromRequestParts<ApiState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &ApiState,
    ) -> Result<Self, Self::Rejection> {
        let role_hdr = parts
            .headers
            .get("x-user-role")
            .and_then(|v| v.to_str().ok())
            .map(|r| r.trim().to_lowercase());

        let is_role_admin = role_hdr.as_deref() == Some("admin");
        let default_role = if is_role_admin { "admin" } else { "student" };
        let role = role_hdr.unwrap_or_else(|| default_role.to_string());

        // 1. Authorization: Bearer <token_or_uuid>
        if let Some(token) = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
        {
            let token_clean = token.trim();
            let uid = parse_or_deterministic_uuid(token_clean);
            let is_admin = role == "admin" || uid == state.app.db.user_id();

            let _ = state
                .app
                .db
                .run(
                    "INSERT INTO app_users (id, label, role, is_admin) \
                     VALUES ($1::uuid, $2, $3, $4) \
                     ON CONFLICT (id) DO UPDATE SET \
                        role = EXCLUDED.role, \
                        is_admin = EXCLUDED.is_admin, \
                        label = COALESCE(app_users.label, EXCLUDED.label)",
                    stuby_storage::args![
                        uid.to_string(),
                        token_clean,
                        &role,
                        if is_admin { 1 } else { 0 }
                    ],
                )
                .await;

            return Ok(AuthUser {
                user_id: uid,
                user_id_str: token_clean.to_string(),
                role,
                is_admin,
            });
        }

        // 2. Cookie sid lookup
        if let Some(token) = parts
            .headers
            .get(header::COOKIE)
            .and_then(|v| v.to_str().ok())
            .and_then(|cookie_hdr| {
                cookie_hdr.split(';').find_map(|p| {
                    let (k, v) = p.trim().split_once('=')?;
                    (k == "sid").then(|| v.to_owned())
                })
            })
        {
            let now = stuby_application::util::now();
            let token_hash = crate::auth::hash_token(&token);
            if let Ok(Some(uid)) = state.sessions.lookup(&token_hash, now).await {
                let is_admin = role == "admin" || uid == state.app.db.user_id();
                return Ok(AuthUser {
                    user_id: uid,
                    user_id_str: uid.to_string(),
                    role,
                    is_admin,
                });
            }
        }

        // 3. Fallback X-User-Id header for test harness
        if let Some(uid_hdr) = parts.headers.get("x-user-id").and_then(|v| v.to_str().ok()) {
            let token_clean = uid_hdr.trim();
            let uid = parse_or_deterministic_uuid(token_clean);
            let is_admin = role == "admin" || uid == state.app.db.user_id();

            let _ = state
                .app
                .db
                .run(
                    "INSERT INTO app_users (id, label, role, is_admin) \
                     VALUES ($1::uuid, $2, $3, $4) \
                     ON CONFLICT (id) DO UPDATE SET \
                        role = EXCLUDED.role, \
                        is_admin = EXCLUDED.is_admin, \
                        label = COALESCE(app_users.label, EXCLUDED.label)",
                    stuby_storage::args![
                        uid.to_string(),
                        token_clean,
                        &role,
                        if is_admin { 1 } else { 0 }
                    ],
                )
                .await;

            return Ok(AuthUser {
                user_id: uid,
                user_id_str: token_clean.to_string(),
                role,
                is_admin,
            });
        }

        // 4. Fallback if role header is present without token (e.g. testing)
        if parts.headers.contains_key("x-user-role") {
            let uid = if is_role_admin {
                state.app.db.user_id()
            } else {
                parse_or_deterministic_uuid("student-default")
            };
            return Ok(AuthUser {
                user_id: uid,
                user_id_str: if is_role_admin { "admin-user".to_string() } else { "student-default".to_string() },
                role,
                is_admin: is_role_admin,
            });
        }

        Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "Belum login",
        ))
    }
}

#[derive(Debug, Clone)]
pub struct OptionalAuthUser(pub Option<AuthUser>);

impl FromRequestParts<ApiState> for OptionalAuthUser {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &ApiState,
    ) -> Result<Self, Self::Rejection> {
        match AuthUser::from_request_parts(parts, state).await {
            Ok(user) => Ok(OptionalAuthUser(Some(user))),
            Err(_) => Ok(OptionalAuthUser(None)),
        }
    }
}
