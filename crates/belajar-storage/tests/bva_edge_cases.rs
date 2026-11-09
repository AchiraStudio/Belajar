//! Empirical Challenger Boundary Value Analysis & Edge Case Test Suite (Milestone 1).
//!
//! Verifies:
//! 1. JSONB array parsing (empty arrays, large arrays, special characters, non-array fallback).
//! 2. Deadline calculations (past, overdue, exact 0s, urgent <24h, far future 2030, negative epoch).
//! 3. Reminder suppression invariant (remind == false for Applied and Done under all deadline conditions).
//! 4. Lifecycle state transitions (Saved -> Applied -> Done) and timestamp recording/preservation.

use belajar_storage::testing::{TestDb, fresh_db};
use belajar_storage::{
    CreateOpportunityInput, Db, Opportunity, OpportunityFilter, PeerProfile,
    ProfileFilter, Row, TrackedOpportunityWithDetails, TrackingStatus,
    UpsertProfileInput, Uuid, args, ensure_owner,
};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;

const IGNORE_MSG: &str = "needs Postgres: cargo run -p belajar-devdb";

// ============================================================================
// 1. Pure Unit Tests (Zero-Database)
// ============================================================================

#[test]
fn unit_test_tracking_status_enum_parser() {
    assert_eq!(TrackingStatus::parse("Saved"), Some(TrackingStatus::Saved));
    assert_eq!(TrackingStatus::parse("Applied"), Some(TrackingStatus::Applied));
    assert_eq!(TrackingStatus::parse("Done"), Some(TrackingStatus::Done));

    // Case-sensitive and invalid inputs
    assert_eq!(TrackingStatus::parse("saved"), None);
    assert_eq!(TrackingStatus::parse("APPLIED"), None);
    assert_eq!(TrackingStatus::parse("done"), None);
    assert_eq!(TrackingStatus::parse(""), None);
    assert_eq!(TrackingStatus::parse("In Progress"), None);
    assert_eq!(TrackingStatus::parse("Abandoned"), None);

    // Round-trip as_str
    assert_eq!(TrackingStatus::Saved.as_str(), "Saved");
    assert_eq!(TrackingStatus::Applied.as_str(), "Applied");
    assert_eq!(TrackingStatus::Done.as_str(), "Done");
}

#[test]
fn unit_test_opportunity_jsonb_parsing_bva() {
    // Case 1: Empty array []
    let mut row_empty = Row::new();
    row_empty.insert("id".to_string(), json!(1));
    row_empty.insert("title".to_string(), json!("Test Opp"));
    row_empty.insert("description".to_string(), json!("Desc"));
    row_empty.insert("category".to_string(), json!("competition"));
    row_empty.insert("organizer".to_string(), json!("Org"));
    row_empty.insert("deadline".to_string(), json!(1_700_000_000.0));
    row_empty.insert("target_majors".to_string(), json!([]));
    row_empty.insert("is_published".to_string(), json!(1));
    row_empty.insert("created_at".to_string(), json!(100.0));
    row_empty.insert("updated_at".to_string(), json!(100.0));

    let opp_empty = Opportunity::from_row(&row_empty).expect("from_row empty array");
    assert!(opp_empty.target_majors.is_empty(), "expected empty vec for []");

    // Case 2: Large array of 50 majors
    let majors_50: Vec<String> = (1..=50).map(|i| format!("Program Studi #{i}")).collect();
    let mut row_large = row_empty.clone();
    row_large.insert("target_majors".to_string(), json!(majors_50));

    let opp_large = Opportunity::from_row(&row_large).expect("from_row large array");
    assert_eq!(opp_large.target_majors.len(), 50);
    assert_eq!(opp_large.target_majors[0], "Program Studi #1");
    assert_eq!(opp_large.target_majors[49], "Program Studi #50");

    // Case 3: Special characters, Unicode, Emojis, Quotes, Slashes, Script tags
    let special_majors = vec![
        "Informatika & Komputer".to_string(),
        "O'Connor's \"Advanced\" Computing".to_string(),
        "Teknik \\ Keamanan \\ Siber".to_string(),
        "Kecerdasan Buatan 🚀 🤖".to_string(),
        "日本語専攻 (Japanese Studies)".to_string(),
        "<script>alert('xss')</script>".to_string(),
        "Major with\nnewline\tand\rcarriage_return".to_string(),
    ];
    let mut row_special = row_empty.clone();
    row_special.insert("target_majors".to_string(), json!(special_majors));

    let opp_special = Opportunity::from_row(&row_special).expect("from_row special characters");
    assert_eq!(opp_special.target_majors.len(), 7);
    assert_eq!(opp_special.target_majors[0], "Informatika & Komputer");
    assert_eq!(opp_special.target_majors[1], "O'Connor's \"Advanced\" Computing");
    assert_eq!(opp_special.target_majors[2], "Teknik \\ Keamanan \\ Siber");
    assert_eq!(opp_special.target_majors[3], "Kecerdasan Buatan 🚀 🤖");
    assert_eq!(opp_special.target_majors[4], "日本語専攻 (Japanese Studies)");
    assert_eq!(opp_special.target_majors[5], "<script>alert('xss')</script>");
    assert_eq!(opp_special.target_majors[6], "Major with\nnewline\tand\rcarriage_return");

    // Case 4: Dirty array with mixed non-string types (null, numbers, bools, objects)
    let dirty_json = json!([
        "Valid Major",
        null,
        12345,
        true,
        {"nested": "object"},
        "Another Valid Major"
    ]);
    let mut row_dirty = row_empty.clone();
    row_dirty.insert("target_majors".to_string(), dirty_json);

    let opp_dirty = Opportunity::from_row(&row_dirty).expect("from_row mixed types");
    assert_eq!(
        opp_dirty.target_majors,
        vec!["Valid Major".to_string(), "Another Valid Major".to_string()],
        "filter_map must cleanly preserve strings and ignore non-strings"
    );

    // Case 5: Non-array target_majors (e.g. Value::Null, String, Object)
    let mut row_non_array = row_empty.clone();
    row_non_array.insert("target_majors".to_string(), Value::Null);
    let opp_null = Opportunity::from_row(&row_non_array).expect("from_row null");
    assert!(opp_null.target_majors.is_empty());

    row_non_array.insert("target_majors".to_string(), json!("Not An Array"));
    let opp_str = Opportunity::from_row(&row_non_array).expect("from_row string");
    assert!(opp_str.target_majors.is_empty());
}

#[test]
fn unit_test_peer_profile_jsonb_parsing_bva() {
    let mut row = Row::new();
    row.insert("id".to_string(), json!(10));
    row.insert("user_uuid".to_string(), json!("00000000-0000-0000-0000-000000000001"));
    row.insert("full_name".to_string(), json!("Mahasiswa Uji"));
    row.insert("major".to_string(), json!("Sistem Informasi"));
    row.insert("batch_year".to_string(), json!(2024));
    row.insert("bio".to_string(), Value::Null);
    row.insert("academic_interests".to_string(), json!([]));
    row.insert("skills".to_string(), json!([]));
    // When contact_info key is absent:
    row.insert("is_looking_for_team".to_string(), json!(1));
    row.insert("created_at".to_string(), json!(10.0));
    row.insert("updated_at".to_string(), json!(10.0));

    let prof_missing = PeerProfile::from_row(&row).expect("from_row profile with missing contact_info");
    assert_eq!(prof_missing.user_id.as_deref(), Some("00000000-0000-0000-0000-000000000001"));
    assert!(prof_missing.academic_interests.is_empty());
    assert!(prof_missing.skills.is_empty());
    assert_eq!(prof_missing.contact_info, json!({}), "missing contact_info must default to empty object");

    // Observation: If row contains literal Value::Null, from_row retains Value::Null
    row.insert("contact_info".to_string(), Value::Null);
    let prof_null = PeerProfile::from_row(&row).expect("from_row profile with null contact_info");
    assert_eq!(prof_null.contact_info, Value::Null);

    // Special characters in skills and contact info
    row.insert("skills".to_string(), json!(["C++", "C#", "Rust (async)", "🔥 AI", "\"quoted\""]));
    row.insert("contact_info".to_string(), json!({
        "email": "test+tag@example.com",
        "phone": "+62-812-3456-7890",
        "notes": "Line 1\nLine 2"
    }));

    let prof2 = PeerProfile::from_row(&row).expect("from_row profile with special skills");
    assert_eq!(prof2.skills.len(), 5);
    assert_eq!(prof2.skills[0], "C++");
    assert_eq!(prof2.skills[3], "🔥 AI");
    assert_eq!(prof2.contact_info["email"], "test+tag@example.com");
}

#[test]
fn unit_test_deadline_and_reminder_suppression_matrix() {
    let now = 1_700_000_000.0;

    let deadline_cases = vec![
        ("Past Far (10 days)", now - 864_000.0, true, false),
        ("Past 1 day", now - 86_400.0, true, false),
        ("Past 1 second", now - 1.0, true, false),
        ("Past microsecond", now - 0.0001, true, false),
        ("Exact Now (0s)", now, false, true), // now > deadline is false, not overdue
        ("Future 1 second", now + 1.0, false, true),
        ("Urgent 1 hour (<24h)", now + 3600.0, false, true),
        ("Urgent 23h 59m (<24h)", now + 86399.0, false, true),
        ("Exact 24h", now + 86400.0, false, true),
        ("Far Future (1 year)", now + 31_536_000.0, false, true),
        ("Far Future 2030", 1_893_456_000.0, false, true),
        ("Negative Epoch (-500s)", -500.0, true, false),
    ];

    let statuses = vec![
        ("Saved", true),   // Eligible for reminder IF not overdue
        ("Applied", false), // STRICTLY SUPPRESSED
        ("Done", false),    // STRICTLY SUPPRESSED
        ("Unknown", false), // Any non-Saved is suppressed
        ("", false),
    ];

    for (stat_name, _can_remind_if_not_overdue) in statuses {
        for (case_desc, deadline, expected_overdue, expected_saved_remind) in &deadline_cases {
            let mut row = Row::new();
            row.insert("id".to_string(), json!(99));
            row.insert("opportunity_id".to_string(), json!(101));
            row.insert("status".to_string(), json!(stat_name));
            row.insert("notes".to_string(), Value::Null);
            row.insert("created_at".to_string(), json!(now - 100.0));
            row.insert("updated_at".to_string(), json!(now - 50.0));
            row.insert("applied_at".to_string(), Value::Null);
            row.insert("completed_at".to_string(), Value::Null);
            row.insert("opp_title".to_string(), json!("Comp 1"));
            row.insert("opp_category".to_string(), json!("competition"));
            row.insert("opp_organizer".to_string(), json!("Org"));
            row.insert("opp_deadline".to_string(), json!(deadline));
            row.insert("opp_reward".to_string(), Value::Null);
            row.insert("opp_target_majors".to_string(), json!([]));
            row.insert("opp_website_url".to_string(), Value::Null);
            row.insert("opp_guideline_url".to_string(), Value::Null);
            row.insert("opp_guideline_text".to_string(), Value::Null);

            let tracked = TrackedOpportunityWithDetails::from_row(&row, now)
                .expect("from_row tracked item");

            // 1. Countdown seconds must match exact difference
            let expected_countdown = deadline - now;
            assert!(
                (tracked.countdown_seconds - expected_countdown).abs() < 1e-6,
                "countdown_seconds mismatch for {stat_name} - {case_desc}"
            );

            // 2. Overdue flag must strictly reflect now > deadline
            assert_eq!(
                tracked.is_overdue, *expected_overdue,
                "is_overdue mismatch for {stat_name} - {case_desc}"
            );

            // 3. Reminder Suppression Invariant
            if stat_name == "Applied" || stat_name == "Done" {
                assert!(
                    !tracked.remind,
                    "INVARIANT VIOLATION: remind must be FALSE for status '{stat_name}' under all deadline conditions! Case: {case_desc}"
                );
            } else if stat_name == "Saved" {
                assert_eq!(
                    tracked.remind, *expected_saved_remind,
                    "remind mismatch for status 'Saved' in case {case_desc}"
                );
            } else {
                assert!(
                    !tracked.remind,
                    "remind must be false for arbitrary status '{stat_name}'"
                );
            }
        }
    }
}

// ============================================================================
// 2. Live PostgreSQL Integration Tests
// ============================================================================

async fn setup_admin_and_student(t: &TestDb) -> (Db, Db, Uuid, Uuid) {
    let admin_id = ensure_owner(t.app.clone()).await.expect("ensure_owner admin");
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.app.clone())
        .await
        .expect("pool");
    let student_id: Uuid = sqlx::query_scalar(
        "INSERT INTO app_users(label, role, is_admin) VALUES ('student_bva', 'student', 0) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("insert student_bva");
    pool.close().await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.expect("admin db");
    let student_db = Db::connect(t.app.clone(), student_id, 2).await.expect("student db");
    (admin_db, student_db, admin_id, student_id)
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn live_postgres_jsonb_bva_and_containment() {
    let _ = IGNORE_MSG;
    let t = fresh_db().await;
    let (admin_db, student_db, admin_id, _) = setup_admin_and_student(&t).await;

    let now = 1_700_000_000.0;

    // 1. Case A: Empty array target_majors [] (Open to all majors)
    let opp_empty_input = CreateOpportunityInput {
        title: "Kompetisi Terbuka Untuk Semua Jurusan".to_string(),
        description: "Lomba essay nasional terbuka".to_string(),
        category: "competition".to_string(),
        organizer: "Puspresnas".to_string(),
        deadline: now + 86400.0 * 10.0,
        reward: Some("Rp 10.000.000".to_string()),
        target_majors: vec![], // EMPTY
        eligibility: None,
        website_url: None,
        guideline_url: None,
        guideline_text: None,
        is_published: Some(1),
    };
    let opp_empty_id = admin_db
        .create_opportunity(&opp_empty_input, Some(admin_id), now)
        .await
        .expect("create empty majors opp");

    let opp_empty_get = student_db
        .get_opportunity(opp_empty_id)
        .await
        .expect("get_opportunity")
        .expect("must exist");
    assert!(opp_empty_get.target_majors.is_empty(), "must be empty vec in DB");

    // Since target_majors is [], it MUST match filtering for ANY major (open to all)
    let list_for_inf = student_db
        .list_opportunities(&OpportunityFilter {
            major: Some("Informatika".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("list with Informatika");
    assert!(
        list_for_inf.iter().any(|o| o.id == opp_empty_id),
        "empty target_majors must match any major filter"
    );

    let list_for_bio = student_db
        .list_opportunities(&OpportunityFilter {
            major: Some("Biologi".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("list with Biologi");
    assert!(
        list_for_bio.iter().any(|o| o.id == opp_empty_id),
        "empty target_majors must match Biologi filter"
    );

    // 2. Case B: Large array of 50 majors
    let majors_50: Vec<String> = (1..=50).map(|i| format!("Jurusan #{i:02}")).collect();
    let opp_large_input = CreateOpportunityInput {
        title: "Kompetisi Multidisiplin 50 Jurusan".to_string(),
        description: "Lomba 50 jurusan".to_string(),
        category: "competition".to_string(),
        organizer: "Kemendikbud".to_string(),
        deadline: now + 86400.0 * 20.0,
        reward: None,
        target_majors: majors_50.clone(),
        eligibility: None,
        website_url: None,
        guideline_url: None,
        guideline_text: None,
        is_published: Some(1),
    };
    let opp_large_id = admin_db
        .create_opportunity(&opp_large_input, Some(admin_id), now)
        .await
        .expect("create large majors opp");

    let opp_large_get = student_db
        .get_opportunity(opp_large_id)
        .await
        .expect("get large")
        .expect("exists");
    assert_eq!(opp_large_get.target_majors.len(), 50);
    assert_eq!(opp_large_get.target_majors[0], "Jurusan #01");
    assert_eq!(opp_large_get.target_majors[49], "Jurusan #50");

    // Test JSONB containment (@>) for boundaries in the 50-item list
    let list_item_1 = student_db
        .list_opportunities(&OpportunityFilter {
            major: Some("Jurusan #01".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("filter item 1");
    assert!(list_item_1.iter().any(|o| o.id == opp_large_id));

    let list_item_50 = student_db
        .list_opportunities(&OpportunityFilter {
            major: Some("Jurusan #50".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("filter item 50");
    assert!(list_item_50.iter().any(|o| o.id == opp_large_id));

    let list_item_nonexistent = student_db
        .list_opportunities(&OpportunityFilter {
            major: Some("Jurusan #99".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("filter nonexistent");
    assert!(
        !list_item_nonexistent.iter().any(|o| o.id == opp_large_id),
        "must NOT match Jurusan #99"
    );

    // 3. Case C: Special characters, Unicode, Emojis, Quotes
    let special_majors = vec![
        "Sains Data & AI".to_string(),
        "O'Connor's \"Special\" Engineering".to_string(),
        "Teknik \\ Siber".to_string(),
        "Teknologi 🚀 🔥".to_string(),
    ];
    let opp_spec_input = CreateOpportunityInput {
        title: "Kompetisi Khusus Unicode & Quotes".to_string(),
        description: "Lomba karakter khusus".to_string(),
        category: "competition".to_string(),
        organizer: "Lab AI & Cybersecurity".to_string(),
        deadline: now + 86400.0 * 15.0,
        reward: None,
        target_majors: special_majors.clone(),
        eligibility: None,
        website_url: None,
        guideline_url: None,
        guideline_text: None,
        is_published: Some(1),
    };
    let opp_spec_id = admin_db
        .create_opportunity(&opp_spec_input, Some(admin_id), now)
        .await
        .expect("create special majors opp");

    let opp_spec_get = student_db
        .get_opportunity(opp_spec_id)
        .await
        .expect("get special")
        .expect("exists");
    assert_eq!(opp_spec_get.target_majors, special_majors);

    // Filter with quotes and emojis
    let list_emoji = student_db
        .list_opportunities(&OpportunityFilter {
            major: Some("Teknologi 🚀 🔥".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("filter emoji");
    assert!(list_emoji.iter().any(|o| o.id == opp_spec_id));

    let list_quotes = student_db
        .list_opportunities(&OpportunityFilter {
            major: Some("O'Connor's \"Special\" Engineering".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("filter quotes");
    assert!(list_quotes.iter().any(|o| o.id == opp_spec_id));

    // 4. Case D: Peer Profiles with Special Skills & Contact Info Edge Cases
    let prof_input = UpsertProfileInput {
        full_name: "Challenger Tester".to_string(),
        major: "Teknik Komputer".to_string(),
        batch_year: Some(2023),
        bio: Some("Bio with emojis 🚀 and quotes 'special'".to_string()),
        academic_interests: vec!["AI/ML".to_string(), "Cybersecurity".to_string()],
        skills: vec![
            "C++ / C#".to_string(),
            "Rust (async)".to_string(),
            "PostgreSQL & JSONB".to_string(),
            "Docker / K8s 🐳".to_string(),
        ],
        contact_info: Some(json!({
            "email": "challenger@kampus.ac.id",
            "social": {"telegram": "@challenger_bot"}
        })),
        is_looking_for_team: Some(1),
    };
    let prof_id = student_db
        .upsert_my_profile(&prof_input, now)
        .await
        .expect("upsert profile");
    assert!(prof_id > 0);

    let my_profile = student_db.get_my_profile().await.expect("get_my_profile").expect("exists");
    assert_eq!(my_profile.skills.len(), 4);
    assert_eq!(my_profile.skills[3], "Docker / K8s 🐳");
    assert_eq!(my_profile.contact_info["social"]["telegram"], "@challenger_bot");

    // Search by skill containing emoji & special chars
    let search_res = student_db
        .search_profiles(&ProfileFilter {
            skill: Some("Docker / K8s 🐳".to_string()),
            ..Default::default()
        })
        .await
        .expect("search skill emoji");
    assert_eq!(search_res.len(), 1);
    assert_eq!(search_res[0].id, prof_id);

    // Profile with empty contact_info (None passed to input -> defaults to empty object)
    let prof_empty_contact = UpsertProfileInput {
        full_name: "Challenger Tester 2".to_string(),
        major: "Teknik Komputer".to_string(),
        batch_year: None,
        bio: None,
        academic_interests: vec![],
        skills: vec!["Python".to_string()],
        contact_info: None,
        is_looking_for_team: Some(0),
    };
    student_db
        .upsert_my_profile(&prof_empty_contact, now + 1.0)
        .await
        .expect("upsert profile with None contact");

    let my_profile2 = student_db.get_my_profile().await.expect("get_my_profile").expect("exists");
    assert_eq!(my_profile2.contact_info, json!({}), "contact_info None must default to {{}}");

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn live_postgres_deadline_filtering_and_reminder_suppression() {
    let _ = IGNORE_MSG;
    let t = fresh_db().await;
    let (admin_db, student_db, admin_id, _) = setup_admin_and_student(&t).await;

    let now = 1_700_000_000.0;

    // Test cases for deadlines:
    // 1. Far past: now - 100,000s
    // 2. Just passed: now - 1.0s
    // 3. Exact now: now
    // 4. Urgent 1h: now + 3,600s
    // 5. Urgent 23h: now + 82,800s
    // 6. Far future 2030: 1,893,456,000.0s
    // 7. Negative epoch: -1,000s
    let test_deadlines = vec![
        ("Past Far", now - 100_000.0),
        ("Past 1s", now - 1.0),
        ("Exact Now", now),
        ("Urgent 1h", now + 3600.0),
        ("Urgent 23h", now + 82800.0),
        ("Far Future 2030", 1_893_456_000.0),
        ("Negative Epoch", -1000.0),
    ];

    let mut created_opp_ids = Vec::new();
    for (name, dl) in &test_deadlines {
        let id = admin_db
            .create_opportunity(
                &CreateOpportunityInput {
                    title: format!("Opp {name}"),
                    description: format!("Desc {name}"),
                    category: "competition".to_string(),
                    organizer: "Org".to_string(),
                    deadline: *dl,
                    reward: None,
                    target_majors: vec!["Informatika".to_string()],
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
            .expect("create opp");
        created_opp_ids.push((*name, id, *dl));
    }

    // 1. Test OpportunityFilter status = "open" (deadline >= now)
    let open_list = student_db
        .list_opportunities(&OpportunityFilter {
            status: Some("open".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("list open");
    let open_ids: Vec<i64> = open_list.iter().map(|o| o.id).collect();

    // Exact Now, Urgent 1h, Urgent 23h, Far Future 2030 must be in OPEN
    assert!(open_ids.contains(&created_opp_ids[2].1), "Exact Now must be open");
    assert!(open_ids.contains(&created_opp_ids[3].1), "Urgent 1h must be open");
    assert!(open_ids.contains(&created_opp_ids[4].1), "Urgent 23h must be open");
    assert!(open_ids.contains(&created_opp_ids[5].1), "Far Future must be open");

    // Past items and negative epoch must NOT be in OPEN
    assert!(!open_ids.contains(&created_opp_ids[0].1), "Past Far must NOT be open");
    assert!(!open_ids.contains(&created_opp_ids[1].1), "Past 1s must NOT be open");
    assert!(!open_ids.contains(&created_opp_ids[6].1), "Negative epoch must NOT be open");

    // 2. Test OpportunityFilter status = "closed" (deadline < now)
    let closed_list = student_db
        .list_opportunities(&OpportunityFilter {
            status: Some("closed".to_string()),
            now,
            ..Default::default()
        })
        .await
        .expect("list closed");
    let closed_ids: Vec<i64> = closed_list.iter().map(|o| o.id).collect();

    assert!(closed_ids.contains(&created_opp_ids[0].1), "Past Far must be closed");
    assert!(closed_ids.contains(&created_opp_ids[1].1), "Past 1s must be closed");
    assert!(closed_ids.contains(&created_opp_ids[6].1), "Negative epoch must be closed");
    assert!(!closed_ids.contains(&created_opp_ids[2].1), "Exact Now must NOT be closed");
    assert!(!closed_ids.contains(&created_opp_ids[3].1), "Urgent 1h must NOT be closed");

    // 3. Track all 7 opportunities and verify reminders in Saved status
    let mut tracked_ids = Vec::new();
    for (name, opp_id, dl) in &created_opp_ids {
        let tr_id = student_db
            .track_opportunity(*opp_id, Some(&format!("Note for {name}")), now)
            .await
            .expect("track opp");
        tracked_ids.push((*name, tr_id, *opp_id, *dl));
    }

    let tracked_items_saved = student_db
        .list_tracked_opportunities(None, now)
        .await
        .expect("list tracked saved");

    for (name, tr_id, _, dl) in &tracked_ids {
        let item = tracked_items_saved
            .iter()
            .find(|t| t.id == *tr_id)
            .expect("must find tracked item");

        assert_eq!(item.status, "Saved");

        if *dl < now {
            // Overdue items
            assert!(item.is_overdue, "{name} must be overdue");
            assert!(item.countdown_seconds < 0.0, "{name} countdown must be negative");
            assert!(!item.remind, "{name} reminder must be suppressed because it is overdue");
        } else {
            // Exact now or future items
            assert!(!item.is_overdue, "{name} must not be overdue");
            assert!(item.countdown_seconds >= 0.0, "{name} countdown must be non-negative");
            assert!(item.remind, "{name} reminder must be active in Saved status");
        }
    }

    // 4. Update all to "Applied" -> ALL reminders must be suppressed (remind == false)
    for (_, tr_id, _, _) in &tracked_ids {
        let updated = student_db
            .update_tracked_status(*tr_id, "Applied", None, now + 10.0)
            .await
            .expect("update to Applied");
        assert!(updated);
    }

    let tracked_items_applied = student_db
        .list_tracked_opportunities(None, now + 10.0)
        .await
        .expect("list tracked applied");

    for item in &tracked_items_applied {
        assert_eq!(item.status, "Applied");
        assert!(
            !item.remind,
            "INVARIANT FAILED: tracked item {} has remind == true while status is Applied!",
            item.id
        );
    }

    // 5. Update all to "Done" -> ALL reminders must be suppressed (remind == false)
    for (_, tr_id, _, _) in &tracked_ids {
        let updated = student_db
            .update_tracked_status(*tr_id, "Done", None, now + 20.0)
            .await
            .expect("update to Done");
        assert!(updated);
    }

    let tracked_items_done = student_db
        .list_tracked_opportunities(None, now + 20.0)
        .await
        .expect("list tracked done");

    for item in &tracked_items_done {
        assert_eq!(item.status, "Done");
        assert!(
            !item.remind,
            "INVARIANT FAILED: tracked item {} has remind == true while status is Done!",
            item.id
        );
    }

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn live_postgres_lifecycle_transitions_and_timestamps() {
    let _ = IGNORE_MSG;
    let t = fresh_db().await;
    let (admin_db, student_db, admin_id, _) = setup_admin_and_student(&t).await;

    let t0 = 1_700_000_000.0;

    // Create single opportunity
    let opp_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Lomba Lifecycle Tracking".to_string(),
                description: "Verifikasi timestamp lifecycle".to_string(),
                category: "competition".to_string(),
                organizer: "Puspresnas".to_string(),
                deadline: t0 + 86400.0 * 30.0,
                reward: None,
                target_majors: vec!["Informatika".to_string()],
                eligibility: None,
                website_url: None,
                guideline_url: None,
                guideline_text: None,
                is_published: Some(1),
            },
            Some(admin_id),
            t0,
        )
        .await
        .expect("create opp");

    // Phase 1: Initial track (Saved)
    let tr_id = student_db
        .track_opportunity(opp_id, Some("Catatan awal"), t0)
        .await
        .expect("track");
    let s0 = student_db
        .get_tracked_opportunity(tr_id, t0)
        .await
        .expect("get")
        .expect("exists");

    assert_eq!(s0.status, "Saved");
    assert_eq!(s0.created_at, t0);
    assert_eq!(s0.updated_at, t0);
    assert!(s0.applied_at.is_none(), "applied_at must be None on Saved");
    assert!(s0.completed_at.is_none(), "completed_at must be None on Saved");
    assert_eq!(s0.notes.as_deref(), Some("Catatan awal"));
    assert!(s0.remind, "Saved future opp must remind");

    // Phase 2: Saved -> Applied (records applied_at = t1)
    let t1 = t0 + 100.0;
    let ok1 = student_db
        .update_tracked_status(tr_id, "Applied", Some("Catatan saat apply"), t1)
        .await
        .expect("update to Applied");
    assert!(ok1);

    let s1 = student_db
        .get_tracked_opportunity(tr_id, t1)
        .await
        .expect("get")
        .expect("exists");
    assert_eq!(s1.status, "Applied");
    assert_eq!(s1.applied_at, Some(t1), "applied_at must be recorded as t1");
    assert!(s1.completed_at.is_none(), "completed_at must still be None");
    assert_eq!(s1.updated_at, t1);
    assert_eq!(s1.notes.as_deref(), Some("Catatan saat apply"));
    assert!(!s1.remind, "Applied must suppress reminder");

    // Phase 3: Update notes while in Applied (applied_at must be preserved!)
    let t2 = t0 + 200.0;
    let ok2 = student_db
        .update_tracked_status(tr_id, "Applied", Some("Catatan revisi berkas"), t2)
        .await
        .expect("update notes in Applied");
    assert!(ok2);

    let s2 = student_db
        .get_tracked_opportunity(tr_id, t2)
        .await
        .expect("get")
        .expect("exists");
    assert_eq!(s2.status, "Applied");
    assert_eq!(
        s2.applied_at,
        Some(t1),
        "applied_at must be PRESERVED and not overwritten by subsequent updates"
    );
    assert!(s2.completed_at.is_none());
    assert_eq!(s2.updated_at, t2);
    assert_eq!(s2.notes.as_deref(), Some("Catatan revisi berkas"));

    // Phase 4: Applied -> Done (records completed_at = t3, preserves applied_at = t1)
    let t3 = t0 + 300.0;
    let ok3 = student_db
        .update_tracked_status(tr_id, "Done", Some("Juara 1!"), t3)
        .await
        .expect("update to Done");
    assert!(ok3);

    let s3 = student_db
        .get_tracked_opportunity(tr_id, t3)
        .await
        .expect("get")
        .expect("exists");
    assert_eq!(s3.status, "Done");
    assert_eq!(s3.applied_at, Some(t1), "applied_at must still be preserved");
    assert_eq!(s3.completed_at, Some(t3), "completed_at must be recorded as t3");
    assert_eq!(s3.updated_at, t3);
    assert_eq!(s3.notes.as_deref(), Some("Juara 1!"));
    assert!(!s3.remind, "Done must suppress reminder");

    // Phase 5: Update notes while in Done (completed_at and applied_at must be preserved!)
    let t4 = t0 + 400.0;
    let ok4 = student_db
        .update_tracked_status(tr_id, "Done", Some("Sertifikat diterima"), t4)
        .await
        .expect("update notes in Done");
    assert!(ok4);

    let s4 = student_db
        .get_tracked_opportunity(tr_id, t4)
        .await
        .expect("get")
        .expect("exists");
    assert_eq!(s4.status, "Done");
    assert_eq!(s4.applied_at, Some(t1));
    assert_eq!(s4.completed_at, Some(t3), "completed_at must be PRESERVED");
    assert_eq!(s4.updated_at, t4);

    // Phase 6: Demote Done -> Saved (clears applied_at and completed_at)
    let t5 = t0 + 500.0;
    let ok5 = student_db
        .update_tracked_status(tr_id, "Saved", Some("Mulai ulang"), t5)
        .await
        .expect("demote to Saved");
    assert!(ok5);

    let s5 = student_db
        .get_tracked_opportunity(tr_id, t5)
        .await
        .expect("get")
        .expect("exists");
    assert_eq!(s5.status, "Saved");
    assert!(s5.applied_at.is_none(), "demotion to Saved must clear applied_at");
    assert!(s5.completed_at.is_none(), "demotion to Saved must clear completed_at");
    assert_eq!(s5.updated_at, t5);
    assert!(s5.remind, "Saved future opp must resume reminding");

    // Phase 7: Direct Saved -> Done (records completed_at, applied_at remains None)
    let t6 = t0 + 600.0;
    let ok6 = student_db
        .update_tracked_status(tr_id, "Done", Some("Langsung selesai"), t6)
        .await
        .expect("direct Saved to Done");
    assert!(ok6);

    let s6 = student_db
        .get_tracked_opportunity(tr_id, t6)
        .await
        .expect("get")
        .expect("exists");
    assert_eq!(s6.status, "Done");
    assert!(s6.applied_at.is_none(), "direct Done has no applied_at");
    assert_eq!(s6.completed_at, Some(t6));

    // Phase 8: Database check constraint rejects invalid status strings
    let invalid_statuses = vec!["InReview", "Cancelled", "Draft", "", "saved", "DONE"];
    for bad_st in invalid_statuses {
        let res = student_db
            .run(
                "UPDATE tracked_opportunities SET status = $2 WHERE id = $1",
                args![tr_id, bad_st],
            )
            .await;
        assert!(
            res.is_err(),
            "DB check constraint chk_tracked_status must reject '{bad_st}'"
        );
    }

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}


#[test]
fn unit_test_microsecond_float_precision() {
    let now = 1_700_000_000.543_21;
    let eps = 1e-6;

    let cases = vec![
        ("Sub-microsecond past", now - eps, true, false),
        ("Exact equal", now, false, true),
        ("Sub-microsecond future", now + eps, false, true),
    ];

    for (desc, deadline, exp_overdue, exp_remind) in cases {
        let mut row = Row::new();
        row.insert("id".to_string(), json!(1));
        row.insert("opportunity_id".to_string(), json!(1));
        row.insert("status".to_string(), json!("Saved"));
        row.insert("opp_deadline".to_string(), json!(deadline));
        row.insert("opp_title".to_string(), json!("Precision Opp"));
        row.insert("opp_category".to_string(), json!("competition"));
        row.insert("opp_organizer".to_string(), json!("Org"));
        row.insert("opp_target_majors".to_string(), json!([]));

        let item = TrackedOpportunityWithDetails::from_row(&row, now).expect("from_row");
        assert_eq!(item.is_overdue, exp_overdue, "failed {desc} overdue check");
        assert_eq!(item.remind, exp_remind, "failed {desc} remind check");
    }
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn live_postgres_cascade_deletion_and_multi_student_lifecycle() {
    let _ = IGNORE_MSG;
    let t = fresh_db().await;
    let admin_id = ensure_owner(t.app.clone()).await.expect("ensure_owner admin");
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.app.clone())
        .await
        .expect("pool");

    let s1_id: Uuid = sqlx::query_scalar(
        "INSERT INTO app_users(label, role, is_admin) VALUES ('student_1', 'student', 0) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("insert student_1");

    let s2_id: Uuid = sqlx::query_scalar(
        "INSERT INTO app_users(label, role, is_admin) VALUES ('student_2', 'student', 0) RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("insert student_2");
    pool.close().await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.expect("admin db");
    let s1_db = Db::connect(t.app.clone(), s1_id, 2).await.expect("s1 db");
    let s2_db = Db::connect(t.app.clone(), s2_id, 2).await.expect("s2 db");

    let now = 1_700_000_000.0;

    // Admin creates opportunity
    let opp_id = admin_db
        .create_opportunity(
            &CreateOpportunityInput {
                title: "Lomba Bersama Multi-Student".to_string(),
                description: "Test cascade delete and multi student lifecycle".to_string(),
                category: "competition".to_string(),
                organizer: "Org".to_string(),
                deadline: now + 86400.0 * 7.0,
                reward: None,
                target_majors: vec!["Informatika".to_string()],
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
        .expect("create opp");

    // Student 1 tracks -> transitions to Applied
    let tr1 = s1_db.track_opportunity(opp_id, Some("S1 note"), now).await.expect("s1 track");
    s1_db.update_tracked_status(tr1, "Applied", None, now + 10.0).await.expect("s1 applied");

    // Student 2 tracks -> transitions to Done
    let tr2 = s2_db.track_opportunity(opp_id, Some("S2 note"), now).await.expect("s2 track");
    s2_db.update_tracked_status(tr2, "Done", None, now + 20.0).await.expect("s2 done");

    // Verify S1 status and reminder
    let item1 = s1_db.get_tracked_opportunity(tr1, now + 30.0).await.expect("get s1").expect("exists");
    assert_eq!(item1.status, "Applied");
    assert!(!item1.remind);
    assert_eq!(item1.applied_at, Some(now + 10.0));
    assert!(item1.completed_at.is_none());

    // Verify S2 status and reminder
    let item2 = s2_db.get_tracked_opportunity(tr2, now + 30.0).await.expect("get s2").expect("exists");
    assert_eq!(item2.status, "Done");
    assert!(!item2.remind);
    assert_eq!(item2.completed_at, Some(now + 20.0));

    // Admin deletes the opportunity -> must cascade delete both students' tracking rows
    let deleted = admin_db.delete_opportunity(opp_id).await.expect("delete opp");
    assert!(deleted);

    let item1_after = s1_db.get_tracked_opportunity(tr1, now + 40.0).await.expect("get s1 after");
    assert!(item1_after.is_none(), "S1 tracking entry must be cascade deleted");

    let item2_after = s2_db.get_tracked_opportunity(tr2, now + 40.0).await.expect("get s2 after");
    assert!(item2_after.is_none(), "S2 tracking entry must be cascade deleted");

    admin_db.close().await;
    s1_db.close().await;
    s2_db.close().await;
    t.drop_db().await;
}
