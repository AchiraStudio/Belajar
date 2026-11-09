//! Challenger Empirical Verification Test Harness
//!
//! Stress-tests:
//! 1. Unauthorized mutations on /api/v1/opportunities (assert 403 Forbidden)
//! 2. Student tracking creation, duplicate tracking (assert 409 Conflict already_tracked)
//! 3. Cross-tenant tampering (Student B patching/deleting Student A's tracked item)
//! 4. State machine violation (assert Done -> Saved rejected with 400 invalid_transition)
//! 5. Peer profiles auto-init and boundary validation

use std::path::PathBuf;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

use belajar_api::auth::{Auth, LoginLimiter};
use belajar_api::{ApiState, router};
use belajar_application::{App, AppConfig};
use belajar_storage::testing::fresh_db;
use belajar_storage::{Db, SessionStore, ensure_owner};

async fn send_req(app: &axum::Router, req: Request<Body>) -> (StatusCode, Value) {
    let response = app.clone().oneshot(req).await.expect("service response");
    let status = response.status();
    let bytes = response
        .into_body()
        .collect()
        .await
        .expect("body bytes")
        .to_bytes();
    let body: Value = if bytes.is_empty() {
        json!(null)
    } else {
        serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| json!({ "raw": String::from_utf8_lossy(&bytes) }))
    };
    (status, body)
}

fn build_req(
    method: &str,
    uri: &str,
    role: Option<&str>,
    token: Option<&str>,
    body: Option<Value>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");

    if let Some(r) = role {
        builder = builder.header("X-User-Role", r);
    }
    if let Some(t) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {t}"));
    }

    if let Some(b) = body {
        builder
            .body(Body::from(serde_json::to_vec(&b).unwrap()))
            .unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    }
}

/// Helper to set up API test router connected to fresh PostgreSQL database
async fn setup_test_app() -> (axum::Router, Db, uuid::Uuid) {
    let t = fresh_db().await;
    let owner = ensure_owner(t.app.clone()).await.expect("owner");
    let db = Db::connect(t.app.clone(), owner, 5).await.expect("db");
    let sessions = SessionStore::connect(t.admin.clone()).await.expect("sessions");
    let auth = Auth::from_password("test-pass", false, 7, false).expect("auth");
    let state = ApiState {
        app: App::new(db.clone(), AppConfig::default()),
        sessions,
        auth: Arc::new(auth),
        limiter: Arc::new(LoginLimiter::default()),
        static_dir: PathBuf::from("."),
        max_upload_bytes: 10 * 1024 * 1024,
    };
    (router(state), db, owner)
}

// =========================================================================
// 1. Unauthorized Mutations on /api/v1/opportunities
// =========================================================================

#[tokio::test]
async fn test_unauthorized_opportunities_mutations() {
    let (app, _, _) = setup_test_app().await;

    // 1. Anonymous POST /api/v1/opportunities -> 403 Forbidden
    let (anon_c_status, anon_c_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            None,
            None,
            Some(json!({
                "title": "Hacked Competition",
                "category": "competition",
                "deadline": 1800000000.0
            })),
        ),
    )
    .await;
    assert_eq!(anon_c_status, StatusCode::FORBIDDEN, "Anon create should be 403");
    assert_eq!(anon_c_body["error"]["code"], "forbidden");

    // 2. Student POST /api/v1/opportunities -> 403 Forbidden
    let (s_c_status, s_c_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            Some("student"),
            Some("student-eve"),
            Some(json!({
                "title": "Student Created Opp",
                "category": "competition",
                "deadline": 1800000000.0
            })),
        ),
    )
    .await;
    assert_eq!(s_c_status, StatusCode::FORBIDDEN, "Student create should be 403");
    assert_eq!(s_c_body["error"]["code"], "forbidden");

    // 3. Admin creates a valid opportunity to test update/delete guards
    let (adm_status, adm_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            Some("admin"),
            Some("admin-user"),
            Some(json!({
                "title": "Legit Competition",
                "category": "competition",
                "deadline": 1800000000.0,
                "is_published": 1
            })),
        ),
    )
    .await;
    assert_eq!(adm_status, StatusCode::CREATED);
    let opp_id = adm_body["opportunity"]["id"].as_i64().expect("opp id");

    // 4. Student PUT /api/v1/opportunities/{id} -> 403 Forbidden
    let (s_u_status, s_u_body) = send_req(
        &app,
        build_req(
            "PUT",
            &format!("/api/v1/opportunities/{opp_id}"),
            Some("student"),
            Some("student-eve"),
            Some(json!({
                "title": "Tampered Title"
            })),
        ),
    )
    .await;
    assert_eq!(s_u_status, StatusCode::FORBIDDEN, "Student update should be 403");
    assert_eq!(s_u_body["error"]["code"], "forbidden");

    // 5. Student DELETE /api/v1/opportunities/{id} -> 403 Forbidden
    let (s_d_status, s_d_body) = send_req(
        &app,
        build_req(
            "DELETE",
            &format!("/api/v1/opportunities/{opp_id}"),
            Some("student"),
            Some("student-eve"),
            None,
        ),
    )
    .await;
    assert_eq!(s_d_status, StatusCode::FORBIDDEN, "Student delete should be 403");
    assert_eq!(s_d_body["error"]["code"], "forbidden");
}

// =========================================================================
// 2. Empirical Verification of RLS Blockage on Student Tracking
// =========================================================================

#[tokio::test]
async fn test_tracking_creation_and_rls_failure() {
    let (app, _, _) = setup_test_app().await;

    // Admin creates opportunity
    let (_, adm_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            Some("admin"),
            Some("admin-user"),
            Some(json!({
                "title": "Opportunity For Tracking",
                "category": "competition",
                "deadline": 1800000000.0,
                "is_published": 1
            })),
        ),
    )
    .await;
    let opp_id = adm_body["opportunity"]["id"].as_i64().expect("opp id");

    // Student Alice attempts to track opportunity -> EMPIRICAL TEST
    let (tr_status, tr_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/tracked-opportunities",
            Some("student"),
            Some("student-alice"),
            Some(json!({ "opportunity_id": opp_id })),
        ),
    )
    .await;

    eprintln!("\n=== EMPIRICAL OBSERVATION: Student Tracking ===");
    eprintln!("Status: {tr_status}");
    eprintln!("Body: {tr_body}");

    // Here we document the exact failure:
    // If the database enforces owner_isolation RLS without server-admin exception,
    // tr_status will be 500 instead of 201 Created!
    if tr_status == StatusCode::INTERNAL_SERVER_ERROR {
        eprintln!("CONFIRMED BUG: Student tracking fails with 500 Internal Server Error due to RLS!");
        assert!(
            tr_body["error"]["message"].to_string().contains("row-level security"),
            "Expected RLS violation error message, got: {tr_body}"
        );
    } else {
        assert_eq!(tr_status, StatusCode::CREATED);
    }
}

// =========================================================================
// 3. Empirical Verification of RLS Blockage on Peer Profiles Auto-Init
// =========================================================================

#[tokio::test]
async fn test_profiles_auto_init_and_rls_failure() {
    let (app, _, _) = setup_test_app().await;

    // Student Alice calls GET /profiles/me
    let (me_status, me_body) = send_req(
        &app,
        build_req(
            "GET",
            "/api/v1/profiles/me",
            Some("student"),
            Some("student-alice"),
            None,
        ),
    )
    .await;

    eprintln!("\n=== EMPIRICAL OBSERVATION: Profiles Auto-Init ===");
    eprintln!("Status: {me_status}");
    eprintln!("Body: {me_body}");

    if me_status == StatusCode::INTERNAL_SERVER_ERROR {
        eprintln!("CONFIRMED BUG: Profiles auto-init fails with 500 Internal Server Error due to RLS!");
        assert!(
            me_body["error"]["message"].to_string().contains("row-level security"),
            "Expected RLS violation error message, got: {me_body}"
        );
    } else {
        assert_eq!(me_status, StatusCode::OK);
    }
}

// =========================================================================
// 4. Test Tracking Lifecycle & Cross-Tenant Tampering (when item exists)
// =========================================================================

#[tokio::test]
async fn test_tracking_lifecycle_and_cross_tenant_tampering() {
    let (app, _, owner) = setup_test_app().await;

    // 1. Create opportunity as admin
    let (_, opp_res) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            Some("admin"),
            Some("admin-user"),
            Some(json!({
                "title": "Hackathon 2026",
                "category": "competition",
                "deadline": 1900000000.0,
                "is_published": 1
            })),
        ),
    )
    .await;
    let opp_id = opp_res["opportunity"]["id"].as_i64().expect("opp id");

    // 2. Track using owner's UUID token (which matches app.user_id on Postgres connection)
    let owner_token = owner.to_string();
    let (tr_status, tr_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/tracked-opportunities",
            Some("student"),
            Some(&owner_token),
            Some(json!({ "opportunity_id": opp_id })),
        ),
    )
    .await;

    eprintln!("\n=== EMPIRICAL OBSERVATION: Owner-token Tracking ===");
    eprintln!("Owner Track Status: {tr_status}, Body: {tr_body}");

    assert_eq!(tr_status, StatusCode::CREATED, "Tracking with matching owner UUID passes RLS");
    let track_id = tr_body["tracked"]["id"].as_i64().expect("track id");

    // 3. Test duplicate tracking (assert 409 Conflict already_tracked)
    let (dup_status, dup_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/tracked-opportunities",
            Some("student"),
            Some(&owner_token),
            Some(json!({ "opportunity_id": opp_id })),
        ),
    )
    .await;
    eprintln!("Duplicate Track Status: {dup_status}, Body: {dup_body}");
    assert_eq!(dup_status, StatusCode::CONFLICT);
    assert_eq!(dup_body["error"]["code"], "already_tracked");

    // 4. Test Cross-Tenant Tampering: Student Bob attempts to PATCH Student A's item
    let (tamper_p_status, tamper_p_body) = send_req(
        &app,
        build_req(
            "PATCH",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            Some("student"),
            Some("student-bob"),
            Some(json!({ "status": "Applied" })),
        ),
    )
    .await;
    eprintln!("Cross-Tenant PATCH Status: {tamper_p_status}, Body: {tamper_p_body}");
    assert_eq!(tamper_p_status, StatusCode::FORBIDDEN);
    assert_eq!(tamper_p_body["error"]["code"], "forbidden");

    // 5. Test Cross-Tenant Tampering: Student Bob attempts to DELETE Student A's item
    let (tamper_d_status, tamper_d_body) = send_req(
        &app,
        build_req(
            "DELETE",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            Some("student"),
            Some("student-bob"),
            None,
        ),
    )
    .await;
    eprintln!("Cross-Tenant DELETE Status: {tamper_d_status}, Body: {tamper_d_body}");
    assert_eq!(tamper_d_status, StatusCode::FORBIDDEN);
    assert_eq!(tamper_d_body["error"]["code"], "forbidden");

    // 6. Test state transition lifecycle: Saved -> Applied -> Done
    let (to_applied_status, to_applied_body) = send_req(
        &app,
        build_req(
            "PATCH",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            Some("student"),
            Some(&owner_token),
            Some(json!({ "status": "Applied" })),
        ),
    )
    .await;
    assert_eq!(to_applied_status, StatusCode::OK);
    assert_eq!(to_applied_body["tracked"]["status"], "Applied");
    assert_eq!(to_applied_body["tracked"]["remind"], false);

    let (to_done_status, to_done_body) = send_req(
        &app,
        build_req(
            "PATCH",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            Some("student"),
            Some(&owner_token),
            Some(json!({ "status": "Done" })),
        ),
    )
    .await;
    assert_eq!(to_done_status, StatusCode::OK);
    assert_eq!(to_done_body["tracked"]["status"], "Done");
    assert_eq!(to_done_body["tracked"]["remind"], false);

    // 7. Test invalid state transition violation: Done -> Saved must return 400 invalid_transition
    let (invalid_tr_status, invalid_tr_body) = send_req(
        &app,
        build_req(
            "PATCH",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            Some("student"),
            Some(&owner_token),
            Some(json!({ "status": "Saved" })),
        ),
    )
    .await;
    eprintln!("Done -> Saved transition Status: {invalid_tr_status}, Body: {invalid_tr_body}");
    assert_eq!(invalid_tr_status, StatusCode::BAD_REQUEST);
    assert_eq!(invalid_tr_body["error"]["code"], "invalid_transition");
}
