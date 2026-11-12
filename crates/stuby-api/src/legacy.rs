//! The API the original frontend speaks, reproduced exactly (`server/server.js`):
//!
//! * `POST /api/login`, `POST /api/logout`, `GET /api/session`, `GET /api/status`
//! * `POST /api/rpc/:action` -> `{ "ok": true, "data": ... }` or `{ "error": "..." }`
//! * static files and the single-page-app fallback, with the same security headers.
//!
//! Error bodies are Indonesian and carry only `error` (+ `offline`), as before.

use std::net::SocketAddr;
use std::time::Duration;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{ConnectInfo, Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use stuby_application::{AppError, handlers};
use serde_json::{Value, json};

use crate::auth::{hash_token, new_token};
use crate::state::ApiState;

const COOKIE: &str = "sid";

fn error_body(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

fn cookie_value(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::COOKIE)?.to_str().ok()?;
    raw.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == COOKIE).then(|| value.to_owned())
    })
}

fn client_key(state: &ApiState, headers: &HeaderMap, peer: SocketAddr) -> String {
    if state.auth.trust_proxy
        && let Some(first) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.split(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
    {
        return first.to_owned();
    }
    peer.ip().to_string()
}

fn set_cookie(state: &ApiState, value: &str, max_age: u64) -> HeaderValue {
    let mut cookie =
        format!("{COOKIE}={value}; HttpOnly; SameSite=Strict; Path=/; Max-Age={max_age}");
    if state.auth.cookie_secure {
        cookie.push_str("; Secure");
    }
    HeaderValue::from_str(&cookie).unwrap_or_else(|_| HeaderValue::from_static(""))
}

/// Is this request logged in? (A live server-side session that belongs to the configured owner.)
pub async fn is_authenticated(state: &ApiState, headers: &HeaderMap) -> bool {
    let Some(token) = cookie_value(headers) else {
        return false;
    };
    let now = stuby_application::util::now();
    match state.sessions.lookup(&hash_token(&token), now).await {
        Ok(Some(user)) => user == state.app.db.user_id(),
        Ok(None) => false,
        Err(e) => {
            tracing::error!(error = %e, "session lookup failed");
            false
        }
    }
}

/// Middleware: 401 `{"error":"Belum login"}` unless the request carries a live session.
pub async fn require_auth(
    State(state): State<ApiState>,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    if is_authenticated(&state, request.headers()).await {
        next.run(request).await
    } else {
        error_body(StatusCode::UNAUTHORIZED, "Belum login")
    }
}

pub async fn login(
    State(state): State<ApiState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if state.limiter.limited(&client_key(&state, &headers, peer)) {
        return error_body(
            StatusCode::TOO_MANY_REQUESTS,
            "Terlalu banyak percobaan. Coba lagi sebentar.",
        );
    }
    let password = serde_json::from_slice::<Value>(&body)
        .ok()
        .and_then(|v| {
            v.get("password")
                .map(|p| p.as_str().map_or_else(|| p.to_string(), str::to_owned))
        })
        .unwrap_or_default();
    if !state.auth.verify(password).await {
        return error_body(StatusCode::UNAUTHORIZED, "Password salah");
    }
    match start_session(&state, &headers).await {
        Ok(cookie) => {
            let mut response = Json(json!({ "ok": true })).into_response();
            response.headers_mut().insert(header::SET_COOKIE, cookie);
            response
        }
        Err(response) => response,
    }
}

/// Creates a server-side session for the owner and returns the `Set-Cookie` value.
async fn start_session(state: &ApiState, headers: &HeaderMap) -> Result<HeaderValue, Response> {
    let token = new_token();
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok());
    let now = stuby_application::util::now();
    if let Err(e) = state
        .sessions
        .create(
            state.app.db.user_id(),
            &hash_token(&token),
            now,
            state.auth.session_seconds,
            user_agent,
        )
        .await
    {
        tracing::error!(error = %e, "could not create session");
        return Err(error_body(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Kesalahan server",
        ));
    }
    Ok(set_cookie(state, &token, state.auth.session_seconds as u64))
}

/// `GET /api/local-login?t=<token>`: the offline app's own window signs itself in (once per
/// launch) and lands on the home page. Any other caller gets 403.
pub async fn local_login(
    State(state): State<ApiState>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> Response {
    let allowed = match (&state.local_login, query.get("t")) {
        (Some(gate), Some(token)) => gate.consume(token),
        _ => false,
    };
    if !allowed {
        return error_body(StatusCode::FORBIDDEN, "Tidak diizinkan");
    }
    match start_session(&state, &headers).await {
        Ok(cookie) => {
            let mut response = (StatusCode::FOUND, [(header::LOCATION, "/")]).into_response();
            response.headers_mut().insert(header::SET_COOKIE, cookie);
            response
        }
        Err(response) => response,
    }
}

pub async fn logout(State(state): State<ApiState>, headers: HeaderMap) -> Response {
    if let Some(token) = cookie_value(&headers) {
        // Unlike the legacy stateless cookie, this really ends the session on the server.
        if let Err(e) = state.sessions.revoke(&hash_token(&token)).await {
            tracing::error!(error = %e, "could not revoke session");
        }
    }
    let mut response = Json(json!({ "ok": true })).into_response();
    response
        .headers_mut()
        .insert(header::SET_COOKIE, set_cookie(&state, "", 0));
    response
}

pub async fn session(State(state): State<ApiState>, headers: HeaderMap) -> Json<Value> {
    Json(json!({ "authenticated": is_authenticated(&state, &headers).await }))
}

/// The legacy UI polled "is the home PC online". The server now owns the data, so it is always "on".
pub async fn status() -> Json<Value> {
    Json(json!({ "agent": true }))
}

/// Per-action time limits, as in the legacy server.
fn timeout_for(action: &str) -> Duration {
    Duration::from_secs(match action {
        "chat_send" | "notes_ask" => 120,
        "play_turn" => 180,
        "llm_check" => 60,
        _ => 25,
    })
}

/// Map an application error to the legacy HTTP error shape.
pub fn app_error_response(error: &AppError) -> Response {
    match error {
        AppError::User(message) => error_body(StatusCode::BAD_REQUEST, message),
        AppError::UnknownAction(_) => error_body(StatusCode::NOT_FOUND, "Action tidak dikenal"),
        other => {
            tracing::error!(error = %other, "request failed");
            error_body(StatusCode::INTERNAL_SERVER_ERROR, "Kesalahan server")
        }
    }
}

pub async fn rpc(
    State(state): State<ApiState>,
    Path(action): Path<String>,
    body: Bytes,
) -> Response {
    if !handlers::is_known(&action) {
        return error_body(StatusCode::NOT_FOUND, "Action tidak dikenal");
    }
    let params: Value = if body.is_empty() {
        json!({})
    } else {
        match serde_json::from_slice(&body) {
            Ok(v) => v,
            Err(_) => return error_body(StatusCode::BAD_REQUEST, "JSON tidak valid"),
        }
    };
    let params = if params.is_object() {
        params
    } else {
        json!({})
    };
    match tokio::time::timeout(
        timeout_for(&action),
        handlers::dispatch(&state.app, &action, &params, None),
    )
    .await
    {
        Ok(Ok(data)) => Json(json!({ "ok": true, "data": data })).into_response(),
        Ok(Err(error)) => app_error_response(&error),
        Err(_) => error_body(
            StatusCode::GATEWAY_TIMEOUT,
            "Server tidak membalas tepat waktu.",
        ),
    }
}

/// Unknown `/api/*` paths.
pub async fn api_not_found() -> Response {
    error_body(StatusCode::NOT_FOUND, "Endpoint tidak ditemukan")
}

/// Security headers of the legacy server, added to every response.
pub async fn security_headers(request: axum::extract::Request, next: Next) -> Response {
    let cache = cache_policy(request.uri().path());
    let mut response = next.run(request).await;
    let ok = response.status().is_success();
    let headers = response.headers_mut();
    if ok && let Some(policy) = cache {
        headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(policy));
    }
    for (name, value) in [
        (
            "content-security-policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; \
             connect-src 'self' ipc: http://ipc.localhost https://ipc.localhost; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        ),
        ("x-content-type-options", "nosniff"),
        ("referrer-policy", "no-referrer"),
        ("x-frame-options", "DENY"),
    ] {
        headers.insert(name, HeaderValue::from_static(value));
    }
    response
}

/// Browser caching of static files. Fonts and vendored libraries never change under the same
/// name, so they are cached for a day; the app's own HTML/JS/CSS must be revalidated on every
/// load (a cheap 304) so an update is picked up immediately instead of after heuristic expiry.
/// API responses carry no policy.
fn cache_policy(path: &str) -> Option<&'static str> {
    if path.starts_with("/api/") {
        None
    } else if path.starts_with("/fonts/") || path.starts_with("/vendor/") {
        Some("public, max-age=86400")
    } else {
        Some("no-cache")
    }
}

/// Does the last path segment look like a file (`/fonts/x.woff2`) rather than an app route?
pub fn looks_like_file(path: &str) -> bool {
    path.rsplit('/')
        .next()
        .is_some_and(|name| name.contains('.'))
}

/// Single-page-app fallback: unknown *routes* get `index.html`, but a missing *file* is a real 404.
/// Serving HTML for a missing font or script is what produced "OTS parsing error: invalid
/// sfntVersion" in the browser console instead of an honest "not found".
pub async fn spa_fallback(State(state): State<ApiState>, uri: axum::http::Uri) -> Response {
    if looks_like_file(uri.path()) {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    }
    match tokio::fs::read(state.static_dir.join("index.html")).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], bytes).into_response(),
        Err(_) => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

/// Serves the UI compiled into the app (see [`crate::state::Assets`]): the file when it exists,
/// `index.html` for app routes, a real 404 for a missing file.
pub async fn embedded_assets(State(state): State<ApiState>, uri: axum::http::Uri) -> Response {
    let Some(assets) = state.assets.as_ref() else {
        return (StatusCode::NOT_FOUND, "Not found").into_response();
    };
    let path = uri.path().trim_start_matches('/');
    let wanted = if path.is_empty() || !looks_like_file(path) {
        "index.html"
    } else {
        path
    };
    match assets(wanted) {
        // A missing file must not be answered with the HTML shell.
        Some((_, mime)) if wanted != "index.html" && !wanted.ends_with(".html") && mime.starts_with("text/html") => {
            (StatusCode::NOT_FOUND, "Not found").into_response()
        }
        Some((bytes, mime)) => ([(header::CONTENT_TYPE, mime)], bytes).into_response(),
        None => (StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn files_are_told_apart_from_routes() {
        assert!(looks_like_file("/fonts/nunito-latin.woff2"));
        assert!(looks_like_file("/app.js"));
        assert!(!looks_like_file("/"));
        assert!(!looks_like_file("/materi/12"));
    }

    #[test]
    fn cache_policy_by_path() {
        assert_eq!(cache_policy("/api/rpc/dashboard"), None);
        assert_eq!(
            cache_policy("/fonts/a.woff2"),
            Some("public, max-age=86400")
        );
        assert_eq!(cache_policy("/app.js"), Some("no-cache"));
    }
}
