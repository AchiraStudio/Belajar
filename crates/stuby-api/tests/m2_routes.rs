//! Comprehensive integration tests for Milestone 2 REST routes:
//! - Opportunities API & Admin Auth (/api/v1/opportunities)
//! - Save-to-Track Lifecycle (/api/v1/tracked-opportunities)
//! - Peer Profiles & Matching (/api/v1/profiles)
//! - Guidelines Study Pipeline Hook (/api/v1/opportunities/{id}/study)

use std::path::PathBuf;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

use stuby_api::auth::{Auth, LoginLimiter};
use stuby_api::routes::auth_extract::parse_or_deterministic_uuid;
use stuby_api::{ApiState, router};
use stuby_application::{App, AppConfig};
use stuby_storage::testing::fresh_db;
use stuby_storage::{Db, SessionStore, ensure_owner};

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
    role: &str,
    token: &str,
    body: Option<Value>,
) -> Request<Body> {
    let builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json")
        .header("X-User-Role", role)
        .header(header::AUTHORIZATION, format!("Bearer {token}"));
    if let Some(b) = body {
        builder
            .body(Body::from(serde_json::to_vec(&b).unwrap()))
            .unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    }
}

// =========================================================================
// R1: Opportunities API & Admin Auth Tests
// =========================================================================

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn test_opportunities_admin_guard_and_crud() {
    let t = fresh_db().await;
    let owner = ensure_owner(t.app.clone()).await.expect("owner");
    let db = Db::connect(t.app.clone(), owner, 3).await.expect("db");
    let sessions = SessionStore::connect(t.admin.clone()).await.expect("sessions");
    let auth = Auth::from_password("test-pass", false, 7, false).expect("auth");
    let state = ApiState {
        app: App::new(db, AppConfig::default()),
        sessions,
        auth: Arc::new(auth),
        limiter: Arc::new(LoginLimiter::default()),
        local_login: None,
        assets: None,
        static_dir: PathBuf::from("."),
        max_upload_bytes: 10 * 1024 * 1024,
    };
    let app = router(state);

    // 1. Student attempting POST /opportunities -> 403 Forbidden
    let (s_status, s_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            "student",
            "student-alice",
            Some(json!({
                "title": "Unauthorized Competition",
                "category": "competition",
                "deadline": 1800000000.0
            })),
        ),
    )
    .await;
    assert_eq!(s_status, StatusCode::FORBIDDEN);
    assert_eq!(s_body["error"]["code"], "forbidden");

    // 2. Admin attempting POST /opportunities with invalid input -> 400 Bad Request
    let (b_status, b_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            "admin",
            "admin-user",
            Some(json!({
                "title": "",
                "category": "invalid_category",
                "deadline": -10.0
            })),
        ),
    )
    .await;
    assert_eq!(b_status, StatusCode::BAD_REQUEST);
    assert_eq!(b_body["error"]["code"], "bad_request");

    // 3. Admin successfully creates opportunity -> 201 Created
    let (c_status, c_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            "admin",
            "admin-user",
            Some(json!({
                "title": "Gemastik 2026",
                "description": "Pagelaran Mahasiswa Nasional",
                "category": "competition",
                "organizer": "Puspresnas",
                "deadline": 1800000000.0,
                "target_majors": ["Informatika", "Sistem Informasi"],
                "guideline_text": "Buku panduan teknis Gemastik 2026.",
                "is_published": 1
            })),
        ),
    )
    .await;
    assert_eq!(c_status, StatusCode::CREATED);
    assert_eq!(c_body["opportunity"]["title"], "Gemastik 2026");
    let opp_id = c_body["opportunity"]["id"].as_i64().expect("opp id");

    // 4. Student can retrieve public opportunity -> 200 OK
    let (g_status, g_body) = send_req(
        &app,
        build_req(
            "GET",
            &format!("/api/v1/opportunities/{opp_id}"),
            "student",
            "student-alice",
            None,
        ),
    )
    .await;
    assert_eq!(g_status, StatusCode::OK);
    assert_eq!(g_body["opportunity"]["id"], opp_id);

    // 5. Admin updates opportunity -> 200 OK
    let (u_status, u_body) = send_req(
        &app,
        build_req(
            "PUT",
            &format!("/api/v1/opportunities/{opp_id}"),
            "admin",
            "admin-user",
            Some(json!({
                "title": "Gemastik 2026 Edisi Revisi"
            })),
        ),
    )
    .await;
    assert_eq!(u_status, StatusCode::OK);
    assert_eq!(u_body["opportunity"]["title"], "Gemastik 2026 Edisi Revisi");

    // 6. Admin deletes opportunity -> 200 OK
    let (d_status, d_body) = send_req(
        &app,
        build_req(
            "DELETE",
            &format!("/api/v1/opportunities/{opp_id}"),
            "admin",
            "admin-user",
            None,
        ),
    )
    .await;
    assert_eq!(d_status, StatusCode::OK);
    assert_eq!(d_body["ok"], true);
}

// =========================================================================
// R2: Save-to-Track Lifecycle & Conflict Tests
// =========================================================================

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn test_tracking_lifecycle_transitions_and_reminders() {
    let t = fresh_db().await;
    let owner = ensure_owner(t.app.clone()).await.expect("owner");
    let db = Db::connect(t.app.clone(), owner, 3).await.expect("db");
    let sessions = SessionStore::connect(t.admin.clone()).await.expect("sessions");
    let auth = Auth::from_password("test-pass", false, 7, false).expect("auth");
    let state = ApiState {
        app: App::new(db, AppConfig::default()),
        sessions,
        auth: Arc::new(auth),
        limiter: Arc::new(LoginLimiter::default()),
        local_login: None,
        assets: None,
        static_dir: PathBuf::from("."),
        max_upload_bytes: 10 * 1024 * 1024,
    };
    let app = router(state);

    // Create an opportunity
    let (_, opp_res) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            "admin",
            "admin-user",
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

    // 1. Student saves to track -> 201 Created with status 'Saved' and remind: true
    let (tr_status, tr_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/tracked-opportunities",
            "student",
            "student-alice",
            Some(json!({ "opportunity_id": opp_id })),
        ),
    )
    .await;
    assert_eq!(tr_status, StatusCode::CREATED);
    assert_eq!(tr_body["tracked"]["status"], "Saved");
    assert_eq!(tr_body["tracked"]["remind"], true);
    let track_id = tr_body["tracked"]["id"].as_i64().expect("track id");

    // 2. Duplicate tracking attempt -> 409 Conflict
    let (dup_status, dup_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/tracked-opportunities",
            "student",
            "student-alice",
            Some(json!({ "opportunity_id": opp_id })),
        ),
    )
    .await;
    assert_eq!(dup_status, StatusCode::CONFLICT);
    assert_eq!(dup_body["error"]["code"], "already_tracked");

    // 3. Transition to 'Applied' -> 200 OK, applied_at set, remind suppressed (false)
    let (app_status, app_body) = send_req(
        &app,
        build_req(
            "PATCH",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            "student",
            "student-alice",
            Some(json!({ "status": "Applied" })),
        ),
    )
    .await;
    assert_eq!(app_status, StatusCode::OK);
    assert_eq!(app_body["tracked"]["status"], "Applied");
    assert_eq!(app_body["tracked"]["remind"], false);
    assert!(app_body["tracked"]["applied_at"].as_f64().unwrap() > 0.0);

    // 4. Transition to 'Done' -> 200 OK, completed_at set, remind suppressed (false)
    let (done_status, done_body) = send_req(
        &app,
        build_req(
            "PATCH",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            "student",
            "student-alice",
            Some(json!({ "status": "Done" })),
        ),
    )
    .await;
    assert_eq!(done_status, StatusCode::OK);
    assert_eq!(done_body["tracked"]["status"], "Done");
    assert_eq!(done_body["tracked"]["remind"], false);
    assert!(done_body["tracked"]["completed_at"].as_f64().unwrap() > 0.0);

    // 5. Disallow backward transition 'Done' -> 'Saved' -> 400 Bad Request
    let (back_status, back_body) = send_req(
        &app,
        build_req(
            "PATCH",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            "student",
            "student-alice",
            Some(json!({ "status": "Saved" })),
        ),
    )
    .await;
    assert_eq!(back_status, StatusCode::BAD_REQUEST);
    assert_eq!(back_body["error"]["code"], "invalid_transition");

    // 6. Cross-tenant isolation: Bob cannot patch Alice's tracking item -> 403 Forbidden
    let (cross_status, cross_body) = send_req(
        &app,
        build_req(
            "PATCH",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            "student",
            "student-bob",
            Some(json!({ "status": "Applied" })),
        ),
    )
    .await;
    assert_eq!(cross_status, StatusCode::FORBIDDEN);
    assert_eq!(cross_body["error"]["code"], "forbidden");

    // 7. Delete tracked item -> 200 OK
    let (del_status, del_body) = send_req(
        &app,
        build_req(
            "DELETE",
            &format!("/api/v1/tracked-opportunities/{track_id}"),
            "student",
            "student-alice",
            None,
        ),
    )
    .await;
    assert_eq!(del_status, StatusCode::OK);
    assert_eq!(del_body["ok"], true);
}

// =========================================================================
// R3: Peer Profiles & Matching Tests
// =========================================================================

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn test_profiles_auto_init_and_boundaries() {
    let t = fresh_db().await;
    let owner = ensure_owner(t.app.clone()).await.expect("owner");
    let db = Db::connect(t.app.clone(), owner, 3).await.expect("db");
    let sessions = SessionStore::connect(t.admin.clone()).await.expect("sessions");
    let auth = Auth::from_password("test-pass", false, 7, false).expect("auth");
    let state = ApiState {
        app: App::new(db, AppConfig::default()),
        sessions,
        auth: Arc::new(auth),
        limiter: Arc::new(LoginLimiter::default()),
        local_login: None,
        assets: None,
        static_dir: PathBuf::from("."),
        max_upload_bytes: 10 * 1024 * 1024,
    };
    let app = router(state);

    // 1. GET /profiles/me auto-initializes profile if absent
    let (me_status, me_body) = send_req(
        &app,
        build_req("GET", "/api/v1/profiles/me", "student", "student-alice", None),
    )
    .await;
    assert_eq!(me_status, StatusCode::OK);
    assert_eq!(me_body["profile"]["user_id"], "student-alice");
    assert_eq!(me_body["profile"]["major"], "Informatika");

    // 2. PUT /profiles/me validates max 20 skills
    let twenty_one_skills: Vec<String> = (0..21).map(|i| format!("Skill-{i}")).collect();
    let (sk_status, sk_body) = send_req(
        &app,
        build_req(
            "PUT",
            "/api/v1/profiles/me",
            "student",
            "student-alice",
            Some(json!({ "skills": twenty_one_skills })),
        ),
    )
    .await;
    assert_eq!(sk_status, StatusCode::BAD_REQUEST);
    assert_eq!(sk_body["error"]["code"], "skill_limit_exceeded");

    // 3. PUT /profiles/me validates max 2000 bio chars
    let too_long_bio = "x".repeat(2001);
    let (bio_status, bio_body) = send_req(
        &app,
        build_req(
            "PUT",
            "/api/v1/profiles/me",
            "student",
            "student-alice",
            Some(json!({ "bio": too_long_bio })),
        ),
    )
    .await;
    assert_eq!(bio_status, StatusCode::BAD_REQUEST);
    assert_eq!(bio_body["error"]["code"], "bio_too_long");

    // 4. PUT /profiles/me validates batch year 1950..=2100
    let (yr_status, yr_body) = send_req(
        &app,
        build_req(
            "PUT",
            "/api/v1/profiles/me",
            "student",
            "student-alice",
            Some(json!({ "batch_year": 1940 })),
        ),
    )
    .await;
    assert_eq!(yr_status, StatusCode::BAD_REQUEST);
    assert_eq!(yr_body["error"]["code"], "invalid_batch_year");

    // 5. Valid PUT /profiles/me succeeds
    let (u_status, u_body) = send_req(
        &app,
        build_req(
            "PUT",
            "/api/v1/profiles/me",
            "student",
            "student-alice",
            Some(json!({
                "full_name": "Alice Wonderland",
                "major": "Informatika",
                "skills": ["Rust", "Axum", "TypeScript"],
                "batch_year": 2024
            })),
        ),
    )
    .await;
    assert_eq!(u_status, StatusCode::OK);
    assert_eq!(u_body["profile"]["full_name"], "Alice Wonderland");
    assert_eq!(u_body["profile"]["skills"], json!(["Rust", "Axum", "TypeScript"]));

    // 6. GET /profiles with skill filter
    let (list_status, list_body) = send_req(
        &app,
        build_req("GET", "/api/v1/profiles?skill=Rust", "student", "student-alice", None),
    )
    .await;
    assert_eq!(list_status, StatusCode::OK);
    let profiles = list_body["profiles"].as_array().expect("profiles array");
    assert!(!profiles.is_empty());
    assert_eq!(profiles[0]["full_name"], "Alice Wonderland");
}

// =========================================================================
// R4: Study Pipeline Integration Tests
// =========================================================================

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn test_study_pipeline_guideline_hook_and_document() {
    let t = fresh_db().await;
    let owner = ensure_owner(t.app.clone()).await.expect("owner");
    let db = Db::connect(t.app.clone(), owner, 3).await.expect("db");
    let sessions = SessionStore::connect(t.admin.clone()).await.expect("sessions");
    let auth = Auth::from_password("test-pass", false, 7, false).expect("auth");
    let state = ApiState {
        app: App::new(db, AppConfig::default()),
        sessions,
        auth: Arc::new(auth),
        limiter: Arc::new(LoginLimiter::default()),
        local_login: None,
        assets: None,
        static_dir: PathBuf::from("."),
        max_upload_bytes: 10 * 1024 * 1024,
    };
    let app = router(state);

    // 1. Non-existent opportunity returns 404 Not Found
    let (nf_status, nf_body) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities/999999/study",
            "student",
            "student-alice",
            None,
        ),
    )
    .await;
    assert_eq!(nf_status, StatusCode::NOT_FOUND);
    assert_eq!(nf_body["error"]["code"], "not_found");

    // 2. Opportunity without guidelines returns 400 missing_guidelines
    let (_, no_guide_res) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            "admin",
            "admin-user",
            Some(json!({
                "title": "Kompetisi Tanpa Guideline",
                "category": "competition",
                "deadline": 1800000000.0,
                "guideline_text": null,
                "guideline_url": null,
                "is_published": 1
            })),
        ),
    )
    .await;
    let no_guide_id = no_guide_res["opportunity"]["id"].as_i64().expect("opp id");

    let (mg_status, mg_body) = send_req(
        &app,
        build_req(
            "POST",
            &format!("/api/v1/opportunities/{no_guide_id}/study"),
            "student",
            "student-alice",
            None,
        ),
    )
    .await;
    assert_eq!(mg_status, StatusCode::BAD_REQUEST);
    assert_eq!(mg_body["error"]["code"], "missing_guidelines");

    // 3. Opportunity with guidelines successfully creates study document
    let (_, guide_res) = send_req(
        &app,
        build_req(
            "POST",
            "/api/v1/opportunities",
            "admin",
            "admin-user",
            Some(json!({
                "title": "Lomba Karya Tulis Ilmiah",
                "category": "competition",
                "deadline": 1800000000.0,
                "guideline_text": "# Format Proposal LKTI\n\n1. Pendahuluan\n2. Tinjauan Pustaka\n3. Metodologi",
                "is_published": 1
            })),
        ),
    )
    .await;
    let guide_id = guide_res["opportunity"]["id"].as_i64().expect("opp id");

    let (study_status, study_body) = send_req(
        &app,
        build_req(
            "POST",
            &format!("/api/v1/opportunities/{guide_id}/study"),
            "student",
            "student-alice",
            None,
        ),
    )
    .await;
    assert_eq!(study_status, StatusCode::OK);
    assert_eq!(study_body["status"], "ready");
    let doc_id = study_body["document_id"].as_i64().expect("doc id");
    assert!(doc_id > 0);
    assert_eq!(study_body["generated_items"]["notes_count"], 1);

    // 4. Retrieve study document
    let (doc_status, doc_body) = send_req(
        &app,
        build_req(
            "GET",
            &format!("/api/v1/study/documents/{doc_id}"),
            "student",
            "student-alice",
            None,
        ),
    )
    .await;
    assert_eq!(doc_status, StatusCode::OK);
    assert_eq!(doc_body["document"]["id"], doc_id);
    assert!(doc_body["document"]["content"].as_str().unwrap().contains("Format Proposal LKTI"));
}

// =========================================================================
// Pure In-Memory / Deterministic Unit Tests
// =========================================================================

#[test]
fn test_parse_or_deterministic_uuid() {
    let raw = "student-uuid-alice";
    let u1 = parse_or_deterministic_uuid(raw);
    let u2 = parse_or_deterministic_uuid(raw);
    assert_eq!(u1, u2);

    let standard_uuid = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";
    let u_std = parse_or_deterministic_uuid(standard_uuid);
    assert_eq!(u_std.to_string(), standard_uuid);
}

#[test]
fn test_deterministic_uuid_uniqueness_and_rfc_invariants() {
    let u_alice = parse_or_deterministic_uuid("student-alice");
    let u_bob = parse_or_deterministic_uuid("student-bob");
    assert_ne!(u_alice, u_bob);

    // Verify version 4 bit
    let bytes = u_alice.into_bytes();
    assert_eq!(bytes[6] >> 4, 4);
    // Verify variant bit (10xx xxxx)
    assert_eq!(bytes[8] >> 6, 2);
}

#[test]
fn test_tracking_status_parser_invariants() {
    use stuby_storage::TrackingStatus;

    assert_eq!(TrackingStatus::parse("Saved"), Some(TrackingStatus::Saved));
    assert_eq!(TrackingStatus::parse("Applied"), Some(TrackingStatus::Applied));
    assert_eq!(TrackingStatus::parse("Done"), Some(TrackingStatus::Done));
    assert_eq!(TrackingStatus::parse("invalid"), None);
    assert_eq!(TrackingStatus::parse(""), None);

    assert_eq!(TrackingStatus::Saved.as_str(), "Saved");
    assert_eq!(TrackingStatus::Applied.as_str(), "Applied");
    assert_eq!(TrackingStatus::Done.as_str(), "Done");
}

#[tokio::test]
async fn test_stateless_v1_router_health_and_error() {
    use stuby_api::v1_router;

    let app = v1_router();

    let (h_status, h_body) = send_req(
        &app,
        Request::builder()
            .method("GET")
            .uri("/api/v1/health")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(h_status, StatusCode::OK);
    assert_eq!(h_body["status"], "ok");
    assert_eq!(h_body["service"], "stuby");

    let (nf_status, nf_body) = send_req(
        &app,
        Request::builder()
            .method("GET")
            .uri("/api/v1/nonexistent")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(nf_status, StatusCode::NOT_FOUND);
    assert_eq!(nf_body["error"]["code"], "not_found");
    assert_eq!(nf_body["error"]["retryable"], false);
}
