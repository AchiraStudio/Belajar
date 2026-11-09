//! Adversarial stress-testing suite for Milestone 1: Database Schema & Storage Migration.
//!
//! Evaluates RLS policies, multi-tenant isolation, spoofing vectors, draft leaks,
//! privilege escalation attempts, constraint invariants, and boundary conditions.

use belajar_storage::testing::{TestDb, fresh_db};
use belajar_storage::{
    CreateOpportunityInput, Db, OpportunityFilter,
    UpdateOpportunityInput, UpsertProfileInput, Uuid, args, ensure_owner,
};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;

const IGNORE: &str = "needs Postgres: cargo run -p belajar-devdb";

async fn owner_admin(t: &TestDb) -> Uuid {
    ensure_owner(t.app.clone()).await.expect("owner")
}

async fn create_student(t: &TestDb, label: &str) -> Uuid {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.app.clone())
        .await
        .expect("pool");
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO app_users(label, role, is_admin) VALUES ($1, 'student', 0) RETURNING id",
    )
    .bind(label)
    .fetch_one(&pool)
    .await
    .expect("insert student user");
    pool.close().await;
    id
}

/// Adversarial Test 1: Student attempts unauthorized write/mutation/deletion on opportunities.
#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn test_adversarial_opportunity_tampering_by_student() {
    let _ = IGNORE;
    let t = fresh_db().await;
    let admin_id = owner_admin(&t).await;
    let student_id = create_student(&t, "adversary_student_1").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.unwrap();
    let student_db = Db::connect(t.app.clone(), student_id, 2).await.unwrap();

    // Setup: Admin creates a legitimate published opportunity.
    let now = 1_700_000_000.0;
    let opp_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Lomba UI/UX Design".to_string(),
                description: "Kompetisi desain aplikasi nasional".to_string(),
                category: "competition".to_string(),
                organizer: "Himpunan Mahasiswa".to_string(),
                deadline: now + 86400.0 * 7.0,
                reward: Some("Rp 10.000.000".to_string()),
                target_majors: vec!["Sistem Informasi".to_string()],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(1),
            },
            Some(admin_id),
            now,
        )
        .await
        .unwrap();

    // Probe 1.1: Direct SQL INSERT by student must be blocked by RLS.
    let direct_insert = student_db
        .insert_id(
            "INSERT INTO opportunities (title, description, category, organizer, deadline, is_published) \
             VALUES ('Hacked Opp', 'Desc', 'competition', 'Attacker', 1_800_000_000.0, 1) RETURNING id",
            args![],
        )
        .await;
    assert!(
        direct_insert.is_err(),
        "RLS policy opportunities_insert must block direct SQL insert by student"
    );

    // Probe 1.2: Calling Db::create_opportunity as a student must fail with RLS violation.
    let api_create = student_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Malicious Listing".to_string(),
                description: "Spam content".to_string(),
                category: "competition".to_string(),
                organizer: "Attacker".to_string(),
                deadline: now + 3600.0,
                reward: None,
                target_majors: vec![],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(1),
            },
            None,
            now,
        )
        .await;
    assert!(
        api_create.is_err(),
        "Db::create_opportunity must fail when executed by a non-admin student"
    );

    // Probe 1.3: Forged creator_id pointing to admin in Db::create_opportunity must still fail.
    let forged_create = student_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Forged Creator Listing".to_string(),
                description: "Attempting to spoof admin creator_id".to_string(),
                category: "competition".to_string(),
                organizer: "Attacker".to_string(),
                deadline: now + 3600.0,
                reward: None,
                target_majors: vec![],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(1),
            },
            Some(admin_id),
            now,
        )
        .await;
    assert!(
        forged_create.is_err(),
        "Forging creator_id = admin must not bypass RLS check"
    );

    // Probe 1.4: Direct SQL UPDATE by student must affect 0 rows.
    let direct_update = student_db
        .run(
            "UPDATE opportunities SET title = 'Defaced by Hacker' WHERE id = $1",
            args![opp_id],
        )
        .await
        .unwrap();
    assert_eq!(
        direct_update, 0,
        "Student must affect 0 rows when attempting direct UPDATE on opportunities"
    );

    // Probe 1.5: Calling Db::update_opportunity as a student must return false (0 rows updated).
    let api_update = student_db
        .update_opportunity(
            opp_id,
            &UpdateOpportunityInput {
                title: Some("Defaced via Method".to_string()),
                ..Default::default()
            },
            now + 10.0,
        )
        .await
        .unwrap();
    assert!(
        !api_update,
        "Db::update_opportunity must return false when called by a student"
    );

    // Verify title remains unchanged.
    let check_opp = admin_db.get_opportunity(opp_id).await.unwrap().unwrap();
    assert_eq!(check_opp.title, "Lomba UI/UX Design");

    // Probe 1.6: Direct SQL DELETE by student must affect 0 rows.
    let direct_delete = student_db
        .run("DELETE FROM opportunities WHERE id = $1", args![opp_id])
        .await
        .unwrap();
    assert_eq!(
        direct_delete, 0,
        "Student must affect 0 rows when attempting direct DELETE on opportunities"
    );

    // Probe 1.7: Calling Db::delete_opportunity as a student must return false.
    let api_delete = student_db.delete_opportunity(opp_id).await.unwrap();
    assert!(
        !api_delete,
        "Db::delete_opportunity must return false when called by a student"
    );

    // Verify opportunity still exists in database.
    let still_exists = admin_db.get_opportunity(opp_id).await.unwrap();
    assert!(still_exists.is_some(), "Opportunity must not have been deleted");

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}

/// Adversarial Test 2: Draft opportunity leakage and side-channel extraction.
#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn test_adversarial_draft_opportunity_leakage_and_side_channels() {
    let _ = IGNORE;
    let t = fresh_db().await;
    let admin_id = owner_admin(&t).await;
    let student_id = create_student(&t, "adversary_student_2").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.unwrap();
    let student_db = Db::connect(t.app.clone(), student_id, 2).await.unwrap();

    let now = 1_700_000_000.0;

    // Admin creates 1 published opportunity and 1 draft (unpublished) opportunity.
    let pub_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Public Hackathon 2026".to_string(),
                description: "Terbuka untuk umum".to_string(),
                category: "competition".to_string(),
                organizer: "Kampus Merdeka".to_string(),
                deadline: now + 86400.0 * 10.0,
                reward: Some("Rp 20.000.000".to_string()),
                target_majors: vec!["Informatika".to_string()],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: Some("Public Guidelines".to_string()),
                is_published: Some(1),
            },
            Some(admin_id),
            now,
        )
        .await
        .unwrap();

    let draft_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Top Secret Internal Scholarship 2026".to_string(),
                description: "Draft beasiswa yang belum boleh dilihat mahasiswa".to_string(),
                category: "scholarship".to_string(),
                organizer: "Kementerian".to_string(),
                deadline: now + 86400.0 * 30.0,
                reward: Some("Full tuition + allowance".to_string()),
                target_majors: vec!["Semua Jurusan".to_string()],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: Some("Confidential Guidelines for reviewers only".to_string()),
                is_published: Some(0), // DRAFT!
            },
            Some(admin_id),
            now,
        )
        .await
        .unwrap();

    // Probe 2.1: Student list_opportunities with no published filter must NOT contain draft.
    let student_list = student_db
        .list_opportunities(&OpportunityFilter {
            now,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(student_list.len(), 1);
    assert_eq!(student_list[0].id, pub_id);
    assert!(
        student_list.iter().all(|o| o.id != draft_id),
        "Draft opportunity must not appear in student list"
    );

    // Probe 2.2: Student specifically querying is_published = 0 must receive empty list.
    let student_draft_query = student_db
        .list_opportunities(&OpportunityFilter {
            is_published: Some(0),
            now,
            ..Default::default()
        })
        .await
        .unwrap();
    assert!(
        student_draft_query.is_empty(),
        "Querying is_published = 0 must return 0 results for students due to RLS"
    );

    // Probe 2.3: Student get_opportunity for draft_id must return None.
    let get_draft = student_db.get_opportunity(draft_id).await.unwrap();
    assert!(
        get_draft.is_none(),
        "get_opportunity must return None for draft opportunities when called by student"
    );

    // Probe 2.4: Direct SQL query by student for draft opportunity returns 0 rows.
    let direct_row = student_db
        .row("SELECT title, reward FROM opportunities WHERE id = $1", args![draft_id])
        .await
        .unwrap();
    assert!(
        direct_row.is_none(),
        "Direct SQL SELECT must not reveal draft row"
    );

    // Probe 2.5: Aggregation side-channel test: COUNT(*) WHERE is_published = 0 must be 0 for student.
    let draft_count = student_db
        .scalar_i64("SELECT count(*) FROM opportunities WHERE is_published = 0", args![], -1)
        .await
        .unwrap();
    assert_eq!(
        draft_count, 0,
        "Aggregation count of draft opportunities must be 0 for student"
    );

    // Probe 2.6: Side-channel: Student attempting create_guideline_study_document on draft must fail.
    let study_doc_result = student_db.create_guideline_study_document(draft_id, now).await;
    assert!(
        study_doc_result.is_err(),
        "Creating study document from draft opportunity must fail because opportunity is not found"
    );

    // Probe 2.7: Tracking a draft opportunity by ID must NOT leak details in list_tracked_opportunities.
    let track_draft_id = student_db
        .track_opportunity(draft_id, Some("Trying to spy on draft"), now)
        .await
        .unwrap();
    assert!(track_draft_id > 0);

    // The student's tracked list uses INNER JOIN with opportunities (which is RLS filtered).
    // Therefore, the draft item must be absent from tracked opportunities list!
    let tracked_items = student_db.list_tracked_opportunities(None, now).await.unwrap();
    assert!(
        tracked_items.iter().all(|t| t.opportunity_id != draft_id),
        "Tracked list must not leak draft opportunity details via JOIN"
    );

    // And get_tracked_opportunity must return None for that tracking entry!
    let get_tracked_draft = student_db
        .get_tracked_opportunity(track_draft_id, now)
        .await
        .unwrap();
    assert!(
        get_tracked_draft.is_none(),
        "get_tracked_opportunity must return None because inner join opportunities fails RLS"
    );

    // Probe 2.8: When admin publishes the opportunity, it immediately becomes visible in tracker!
    let published = admin_db
        .update_opportunity(
            draft_id,
            &UpdateOpportunityInput {
                is_published: Some(1),
                ..Default::default()
            },
            now + 10.0,
        )
        .await
        .unwrap();
    assert!(published);

    let get_now_published = student_db
        .get_tracked_opportunity(track_draft_id, now + 10.0)
        .await
        .unwrap();
    assert!(
        get_now_published.is_some(),
        "Once published, tracked opportunity must become visible to the student"
    );
    assert_eq!(
        get_now_published.unwrap().opportunity.title,
        "Top Secret Internal Scholarship 2026"
    );

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}

/// Adversarial Test 3: Multi-tenant student isolation and spoofing in tracked_opportunities.
#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn test_adversarial_tracked_opportunities_isolation_and_spoofing() {
    let _ = IGNORE;
    let t = fresh_db().await;
    let admin_id = owner_admin(&t).await;
    let student_a = create_student(&t, "student_alice").await;
    let student_b = create_student(&t, "student_bob_adversary").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 1).await.unwrap();
    let da = Db::connect(t.app.clone(), student_a, 2).await.unwrap();
    let db = Db::connect(t.app.clone(), student_b, 2).await.unwrap();

    let now = 1_700_000_000.0;

    let opp_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Kompetisi Sains Mahasiswa".to_string(),
                description: "Kompetisi nasional sains".to_string(),
                category: "competition".to_string(),
                organizer: "Puspresnas".to_string(),
                deadline: now + 86400.0 * 5.0,
                reward: None,
                target_majors: vec![],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(1),
            },
            Some(admin_id),
            now,
        )
        .await
        .unwrap();

    // Alice tracks the opportunity.
    let alice_track_id = da
        .track_opportunity(opp_id, Some("Catatan rahasia Alice"), now)
        .await
        .unwrap();

    // Probe 3.1: Bob tries to read Alice's tracked row by ID.
    let bob_read = db.get_tracked_opportunity(alice_track_id, now).await.unwrap();
    assert!(
        bob_read.is_none(),
        "Bob must not be able to read Alice's tracked opportunity"
    );

    // Probe 3.2: Bob tries direct SQL query on tracked_opportunities.
    let bob_sql_read = db
        .row(
            "SELECT notes FROM tracked_opportunities WHERE id = $1",
            args![alice_track_id],
        )
        .await
        .unwrap();
    assert!(
        bob_sql_read.is_none(),
        "Direct SQL SELECT on Alice's row must return None for Bob"
    );

    // Probe 3.3: Bob tries to UPDATE Alice's tracked opportunity.
    let bob_update = db
        .run(
            "UPDATE tracked_opportunities SET notes = 'Hacked by Bob' WHERE id = $1",
            args![alice_track_id],
        )
        .await
        .unwrap();
    assert_eq!(
        bob_update, 0,
        "Bob's UPDATE on Alice's tracked opportunity must affect 0 rows"
    );

    // Verify Alice's notes remain untouched.
    let alice_read = da.get_tracked_opportunity(alice_track_id, now).await.unwrap().unwrap();
    assert_eq!(alice_read.notes.as_deref(), Some("Catatan rahasia Alice"));

    // Probe 3.4: Bob tries to DELETE Alice's tracked opportunity.
    let bob_delete = db
        .run("DELETE FROM tracked_opportunities WHERE id = $1", args![alice_track_id])
        .await
        .unwrap();
    assert_eq!(
        bob_delete, 0,
        "Bob's DELETE on Alice's tracked opportunity must affect 0 rows"
    );

    // Probe 3.5: Bob tries to INSERT a tracked opportunity forged under Alice's user_id.
    let bob_forged_insert = db
        .run(
            "INSERT INTO tracked_opportunities (user_id, opportunity_id, status, notes) \
             VALUES ($1::uuid, $2, 'Saved', 'Spoofed')",
            args![student_a.to_string(), opp_id],
        )
        .await;
    assert!(
        bob_forged_insert.is_err(),
        "Inserting tracked_opportunities with someone else's user_id must fail WITH CHECK"
    );

    // Probe 3.6: Bob tracks his own item, then tries to update user_id to Alice.
    let bob_track_id = db
        .track_opportunity(opp_id, Some("Bob's legit note"), now)
        .await
        .unwrap();

    let bob_tamper_user_id = db
        .run(
            "UPDATE tracked_opportunities SET user_id = $1::uuid WHERE id = $2",
            args![student_a.to_string(), bob_track_id],
        )
        .await;
    assert!(
        bob_tamper_user_id.is_err(),
        "Modifying user_id to another student must fail WITH CHECK policy"
    );

    admin_db.close().await;
    da.close().await;
    db.close().await;
    t.drop_db().await;
}

/// Adversarial Test 4: Multi-tenant student isolation and spoofing in peer_profiles.
#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn test_adversarial_peer_profiles_isolation_and_spoofing() {
    let _ = IGNORE;
    let t = fresh_db().await;
    let admin_id = owner_admin(&t).await;
    let student_a = create_student(&t, "student_charlie").await;
    let student_b = create_student(&t, "student_dave_adversary").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 1).await.unwrap();
    let da = Db::connect(t.app.clone(), student_a, 2).await.unwrap();
    let db = Db::connect(t.app.clone(), student_b, 2).await.unwrap();

    let now = 1_700_000_000.0;

    // Charlie creates his profile.
    let charlie_prof_id = da
        .upsert_my_profile(
            &UpsertProfileInput {
                full_name: "Charlie Pratama".to_string(),
                major: "Teknik Elektro".to_string(),
                batch_year: Some(2023),
                bio: Some("Charlie's genuine bio".to_string()),
                academic_interests: vec!["Robotics".to_string()],
                skills: vec!["C++".to_string(), "ROS".to_string()],
                contact_info: Some(json!({"email": "charlie@kampus.ac.id"})),
                is_looking_for_team: Some(1),
            },
            now,
        )
        .await
        .unwrap();

    // Directory readability: Dave can find Charlie in the teammate directory (public by contract).
    let dir = db.get_profile_by_id(charlie_prof_id).await.unwrap().unwrap();
    assert_eq!(dir.full_name, "Charlie Pratama");

    // Probe 4.1: Dave tries to UPDATE Charlie's profile by ID.
    let dave_update_id = db
        .run(
            "UPDATE peer_profiles SET full_name = 'Defaced by Dave', bio = 'Malicious bio' WHERE id = $1",
            args![charlie_prof_id],
        )
        .await
        .unwrap();
    assert_eq!(
        dave_update_id, 0,
        "Dave's UPDATE on Charlie's profile must affect 0 rows"
    );

    // Probe 4.2: Dave tries to UPDATE Charlie's profile by user_id.
    let dave_update_user = db
        .run(
            "UPDATE peer_profiles SET is_looking_for_team = 0 WHERE user_id = $1::uuid",
            args![student_a.to_string()],
        )
        .await
        .unwrap();
    assert_eq!(
        dave_update_user, 0,
        "Dave's UPDATE by user_id must affect 0 rows"
    );

    // Verify Charlie's profile remains untouched.
    let check_charlie = da.get_my_profile().await.unwrap().unwrap();
    assert_eq!(check_charlie.full_name, "Charlie Pratama");
    assert_eq!(check_charlie.is_looking_for_team, 1);

    // Probe 4.3: Dave tries to DELETE Charlie's profile.
    let dave_delete = db
        .run("DELETE FROM peer_profiles WHERE id = $1", args![charlie_prof_id])
        .await
        .unwrap();
    assert_eq!(
        dave_delete, 0,
        "Dave's DELETE on Charlie's profile must affect 0 rows"
    );

    // Probe 4.4: Dave tries to forge an INSERT with user_id = Charlie.
    let dave_forged_insert = db
        .run(
            "INSERT INTO peer_profiles (user_id, full_name, major) VALUES ($1::uuid, 'Imposter', 'CS')",
            args![student_a.to_string()],
        )
        .await;
    assert!(
        dave_forged_insert.is_err(),
        "Inserting peer profile with someone else's user_id must fail WITH CHECK"
    );

    // Dave creates his own profile legitimately.
    let dave_prof_id = db
        .upsert_my_profile(
            &UpsertProfileInput {
                full_name: "Dave".to_string(),
                major: "Sistem Informasi".to_string(),
                batch_year: Some(2024),
                bio: None,
                academic_interests: vec![],
                skills: vec![],
                contact_info: None,
                is_looking_for_team: Some(1),
            },
            now,
        )
        .await
        .unwrap();

    // Probe 4.5: Dave tries to change his profile's user_id to Charlie.
    let dave_hijack_user_id = db
        .run(
            "UPDATE peer_profiles SET user_id = $1::uuid WHERE id = $2",
            args![student_a.to_string(), dave_prof_id],
        )
        .await;
    assert!(
        dave_hijack_user_id.is_err(),
        "Changing peer_profiles.user_id to another user must fail WITH CHECK"
    );

    // Probe 4.6: Admin CAN moderate (update or delete) Charlie's profile.
    let admin_mod = admin_db
        .run(
            "UPDATE peer_profiles SET bio = 'Moderated by Admin' WHERE id = $1",
            args![charlie_prof_id],
        )
        .await
        .unwrap();
    assert_eq!(admin_mod, 1, "Admin must be able to moderate peer profiles");

    admin_db.close().await;
    da.close().await;
    db.close().await;
    t.drop_db().await;
}

/// Adversarial Test 5: Unauthenticated / raw connection behavior.
#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn test_adversarial_unauthenticated_connection_isolation() {
    let _ = IGNORE;
    let t = fresh_db().await;
    let admin_id = owner_admin(&t).await;
    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.unwrap();

    let now = 1_700_000_000.0;
    // Create 1 published and 1 draft opportunity.
    let pub_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Public Competition".to_string(),
                description: "Public".to_string(),
                category: "competition".to_string(),
                organizer: "Public Org".to_string(),
                deadline: now + 86400.0,
                reward: None,
                target_majors: vec![],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(1),
            },
            Some(admin_id),
            now,
        )
        .await
        .unwrap();

    let draft_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Unpublished Opportunity".to_string(),
                description: "Draft".to_string(),
                category: "scholarship".to_string(),
                organizer: "Internal".to_string(),
                deadline: now + 86400.0,
                reward: None,
                target_majors: vec![],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(0),
            },
            Some(admin_id),
            now,
        )
        .await
        .unwrap();

    // Create an unauthenticated pool (belajar_app role, but app.user_id NOT set).
    let unauth_pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.app.clone())
        .await
        .unwrap();

    // Probe 5.1: Unauthenticated read on opportunities:
    // Published opportunity is visible.
    let pub_visible: i64 = sqlx::query_scalar("SELECT count(*) FROM opportunities WHERE id = $1")
        .bind(pub_id)
        .fetch_one(&unauth_pool)
        .await
        .unwrap();
    assert_eq!(pub_visible, 1, "Published opportunities must be publicly readable");

    // Draft opportunity is INVISIBLE (count = 0).
    let draft_visible: i64 = sqlx::query_scalar("SELECT count(*) FROM opportunities WHERE id = $1")
        .bind(draft_id)
        .fetch_one(&unauth_pool)
        .await
        .unwrap();
    assert_eq!(draft_visible, 0, "Draft opportunities must be hidden from unauthenticated callers");

    // Probe 5.2: Unauthenticated INSERT into opportunities must FAIL.
    let unauth_insert = sqlx::query(
        "INSERT INTO opportunities (title, description, category, organizer, deadline, is_published) \
         VALUES ('Spam', 'Desc', 'competition', 'Spammer', 1_800_000_000.0, 1)",
    )
    .execute(&unauth_pool)
    .await;
    assert!(
        unauth_insert.is_err(),
        "Unauthenticated insert into opportunities must be rejected by RLS"
    );

    // Probe 5.3: Unauthenticated tracked_opportunities is completely blank.
    let tracked_count: i64 = sqlx::query_scalar("SELECT count(*) FROM tracked_opportunities")
        .fetch_one(&unauth_pool)
        .await
        .unwrap();
    assert_eq!(
        tracked_count, 0,
        "Unauthenticated caller must see 0 tracked opportunities"
    );

    // Probe 5.4: Unauthenticated insert into tracked_opportunities must FAIL.
    let unauth_track_insert = sqlx::query(
        "INSERT INTO tracked_opportunities (opportunity_id, status) VALUES ($1, 'Saved')",
    )
    .bind(pub_id)
    .execute(&unauth_pool)
    .await;
    assert!(
        unauth_track_insert.is_err(),
        "Unauthenticated insert into tracked_opportunities must fail"
    );

    // Probe 5.5: Unauthenticated insert into peer_profiles must FAIL.
    let unauth_prof_insert = sqlx::query(
        "INSERT INTO peer_profiles (full_name, major) VALUES ('Ghost', 'Unknown')",
    )
    .execute(&unauth_pool)
    .await;
    assert!(
        unauth_prof_insert.is_err(),
        "Unauthenticated insert into peer_profiles must fail"
    );

    unauth_pool.close().await;
    admin_db.close().await;
    t.drop_db().await;
}

/// Adversarial Test 6: Database check constraints, types, and uniqueness guarantees.
#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn test_adversarial_check_constraints_and_domain_invariants() {
    let _ = IGNORE;
    let t = fresh_db().await;
    let admin_id = owner_admin(&t).await;
    let student_id = create_student(&t, "student_tester_6").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.unwrap();
    let student_db = Db::connect(t.app.clone(), student_id, 2).await.unwrap();

    let now = 1_700_000_000.0;

    // Invariant 6.1: Category check constraint (only 'competition' and 'scholarship').
    for invalid_cat in ["hackathon", "grant", "fellowship", "", "COMPETITION"] {
        let err = admin_db
            .run(
                "INSERT INTO opportunities (title, description, category, organizer, deadline) \
                 VALUES ('Test', 'Desc', $1, 'Org', 1.0)",
                args![invalid_cat],
            )
            .await;
        assert!(
            err.is_err(),
            "Category '{invalid_cat}' must be rejected by chk_opportunities_category"
        );
    }

    // Invariant 6.2: is_published check constraint (only 0 or 1).
    for invalid_pub in [-1_i64, 2_i64, 100_i64] {
        let err = admin_db
            .run(
                "INSERT INTO opportunities (title, description, category, organizer, deadline, is_published) \
                 VALUES ('Test', 'Desc', 'competition', 'Org', 1.0, $1)",
                args![invalid_pub],
            )
            .await;
        assert!(
            err.is_err(),
            "is_published = {invalid_pub} must be rejected by chk_opportunities_published"
        );
    }

    // Invariant 6.3: Valid opportunity insert.
    let opp_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Valid Opportunity".to_string(),
                description: "Desc".to_string(),
                category: "scholarship".to_string(),
                organizer: "Kemdikbud".to_string(),
                deadline: now + 86400.0,
                reward: None,
                target_majors: vec![],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(1),
            },
            Some(admin_id),
            now,
        )
        .await
        .unwrap();

    // Invariant 6.4: Tracked status check constraint (only 'Saved', 'Applied', 'Done').
    for invalid_status in ["Pending", "In-Progress", "Rejected", "Archived", ""] {
        let err = student_db
            .run(
                "INSERT INTO tracked_opportunities (opportunity_id, status) VALUES ($1, $2)",
                args![opp_id, invalid_status],
            )
            .await;
        assert!(
            err.is_err(),
            "Status '{invalid_status}' must be rejected by chk_tracked_status"
        );
    }

    // Invariant 6.5: Tracked opportunity duplicate tracking constraint (user_id, opportunity_id).
    let track_first = student_db
        .run(
            "INSERT INTO tracked_opportunities (opportunity_id, status) VALUES ($1, 'Saved')",
            args![opp_id],
        )
        .await;
    assert!(track_first.is_ok());

    let track_dup = student_db
        .run(
            "INSERT INTO tracked_opportunities (opportunity_id, status) VALUES ($1, 'Saved')",
            args![opp_id],
        )
        .await;
    assert!(
        track_dup.is_err(),
        "Duplicate (user_id, opportunity_id) must be rejected by uq_tracked_user_opportunity"
    );

    // Invariant 6.6: Peer profile is_looking_for_team check constraint (only 0 or 1).
    for invalid_looking in [-1_i64, 2_i64, 99_i64] {
        let err = student_db
            .run(
                "INSERT INTO peer_profiles (full_name, major, is_looking_for_team) VALUES ('Name', 'Major', $1)",
                args![invalid_looking],
            )
            .await;
        assert!(
            err.is_err(),
            "is_looking_for_team = {invalid_looking} must be rejected by chk_peer_looking"
        );
    }

    // Invariant 6.7: Single peer profile per student (user_id unique constraint).
    let prof_first = student_db
        .run(
            "INSERT INTO peer_profiles (full_name, major) VALUES ('First Profile', 'CS')",
            args![],
        )
        .await;
    assert!(prof_first.is_ok());

    let prof_dup = student_db
        .run(
            "INSERT INTO peer_profiles (full_name, major) VALUES ('Second Profile', 'IS')",
            args![],
        )
        .await;
    assert!(
        prof_dup.is_err(),
        "Second peer profile row for same user must be rejected by unique user_id constraint"
    );

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}

/// Adversarial Test 7: Deadline boundary value analysis (BVA) and reminder suppression lifecycle.
#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn test_adversarial_deadline_bva_and_reminder_suppression() {
    let _ = IGNORE;
    let t = fresh_db().await;
    let admin_id = owner_admin(&t).await;
    let student_id = create_student(&t, "student_bva").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.unwrap();
    let student_db = Db::connect(t.app.clone(), student_id, 2).await.unwrap();

    let deadline = 1_700_000_100.0;
    let opp_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "BVA Target Opportunity".to_string(),
                description: "Testing deadline edges".to_string(),
                category: "competition".to_string(),
                organizer: "Tester".to_string(),
                deadline,
                reward: None,
                target_majors: vec![],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(1),
            },
            Some(admin_id),
            1_700_000_000.0,
        )
        .await
        .unwrap();

    let track_id = student_db
        .track_opportunity(opp_id, None, 1_700_000_000.0)
        .await
        .unwrap();

    // BVA Point 1: 10 seconds before deadline (now < deadline)
    // -> remind = true, is_overdue = false, countdown_seconds = 10.0
    let t1 = deadline - 10.0;
    let item1 = student_db.get_tracked_opportunity(track_id, t1).await.unwrap().unwrap();
    assert_eq!(item1.status, "Saved");
    assert!(!item1.is_overdue);
    assert!(item1.remind, "Saved and before deadline must have remind = true");
    assert!((item1.countdown_seconds - 10.0).abs() < 1e-6);

    // BVA Point 2: Exact deadline instant (now == deadline)
    // -> remind = true, is_overdue = false, countdown_seconds = 0.0
    let item2 = student_db.get_tracked_opportunity(track_id, deadline).await.unwrap().unwrap();
    assert!(!item2.is_overdue);
    assert!(item2.remind, "At exact deadline instant, remind must still be true");
    assert_eq!(item2.countdown_seconds, 0.0);

    // BVA Point 3: Just past deadline (now == deadline + 0.001s)
    // -> is_overdue = true, remind = false (overdue suppresses reminder!)
    let t3 = deadline + 0.001;
    let item3 = student_db.get_tracked_opportunity(track_id, t3).await.unwrap().unwrap();
    assert!(item3.is_overdue);
    assert!(!item3.remind, "Overdue item must strictly suppress reminders");
    assert!(item3.countdown_seconds < 0.0);

    // BVA Point 4: Lifecycle transition Saved -> Applied before deadline
    // -> remind = false (suppressed!), applied_at is set
    let applied_time = deadline - 5.0;
    student_db
        .update_tracked_status(track_id, "Applied", Some("Submitted proposal"), applied_time)
        .await
        .unwrap();

    let item4 = student_db.get_tracked_opportunity(track_id, applied_time).await.unwrap().unwrap();
    assert_eq!(item4.status, "Applied");
    assert!(!item4.remind, "Applied status must STRICTLY suppress reminders even before deadline");
    assert_eq!(item4.applied_at, Some(applied_time));
    assert!(item4.completed_at.is_none());

    // BVA Point 5: Lifecycle transition Applied -> Done
    // -> remind = false, completed_at is set
    let done_time = deadline + 10.0;
    student_db
        .update_tracked_status(track_id, "Done", Some("Finished"), done_time)
        .await
        .unwrap();

    let item5 = student_db.get_tracked_opportunity(track_id, done_time).await.unwrap().unwrap();
    assert_eq!(item5.status, "Done");
    assert!(!item5.remind, "Done status must STRICTLY suppress reminders");
    assert_eq!(item5.completed_at, Some(done_time));

    // BVA Point 6: Reverting back to Saved (e.g. user resets tracking status)
    // -> applied_at and completed_at cleared, remind restored if before deadline!
    student_db
        .update_tracked_status(track_id, "Saved", None, t1)
        .await
        .unwrap();

    let item6 = student_db.get_tracked_opportunity(track_id, t1).await.unwrap().unwrap();
    assert_eq!(item6.status, "Saved");
    assert!(item6.applied_at.is_none(), "Reverting to Saved must clear applied_at");
    assert!(item6.completed_at.is_none(), "Reverting to Saved must clear completed_at");
    assert!(item6.remind, "Reverting to Saved before deadline must restore reminder");

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}
