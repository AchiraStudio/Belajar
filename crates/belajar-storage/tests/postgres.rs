//! Integration tests against a real PostgreSQL. They are `#[ignore]`d so a plain `cargo test`
//! stays green without a database; run them with
//!
//!   cargo run -p belajar-devdb                     # in one terminal; prints TEST_DATABASE_ADMIN_URL
//!   TEST_DATABASE_ADMIN_URL=... cargo test -p belajar-storage -- --include-ignored

use belajar_storage::testing::{TestDb, fresh_db};
use belajar_storage::{
    Arg, CreateOpportunityInput, Db, OpportunityFilter, ProfileFilter, SessionStore,
    UpdateOpportunityInput, UpsertProfileInput, Uuid, args, ensure_owner, migrate,
};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;

const IGNORE: &str = "needs Postgres: cargo run -p belajar-devdb";

async fn owner(t: &TestDb) -> Uuid {
    ensure_owner(t.app.clone()).await.expect("owner")
}

async fn second_owner(t: &TestDb) -> Uuid {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.app.clone())
        .await
        .expect("pool");
    let id: Uuid =
        sqlx::query_scalar("INSERT INTO app_users(label) VALUES ('second') RETURNING id")
            .fetch_one(&pool)
            .await
            .expect("insert owner");
    pool.close().await;
    id
}

/// Helper: create an explicit non-admin student user.
async fn student_user(t: &TestDb, label: &str) -> Uuid {
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

/// Helper: create an explicit admin user.
#[allow(dead_code)]
async fn admin_user(t: &TestDb, label: &str) -> Uuid {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.app.clone())
        .await
        .expect("pool");
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO app_users(label, role, is_admin) VALUES ($1, 'admin', 1) RETURNING id",
    )
    .bind(label)
    .fetch_one(&pool)
    .await
    .expect("insert admin user");
    pool.close().await;
    id
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn every_public_table_has_forced_row_level_security() {
    let t = fresh_db().await;
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.admin.clone())
        .await
        .unwrap();
    let rows: Vec<(String, bool, bool)> = sqlx::query_as(
        "SELECT c.relname::text, c.relrowsecurity, c.relforcerowsecurity \
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_sqlx_migrations' ORDER BY 1",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(
        rows.len() >= 29,
        "expected at least 29 tables in full schema, got {} tables",
        rows.len()
    );
    // R-D6: a table without RLS would be readable through Supabase's public API.
    for (name, rls, _) in &rows {
        assert!(rls, "table {name} has row-level security disabled");
    }
    // Owner-scoped tables are FORCEd; the two auth tables are server-role-only by policy instead.
    for (name, _, forced) in &rows {
        if name != "app_users" && name != "sessions" {
            assert!(forced, "table {name} does not FORCE row-level security");
        }
    }
    pool.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn owners_cannot_see_or_touch_each_others_rows() {
    let _ = IGNORE;
    let t = fresh_db().await;
    let a = owner(&t).await;
    let b = second_owner(&t).await;
    let da = Db::connect(t.app.clone(), a, 2).await.unwrap();
    let db = Db::connect(t.app.clone(), b, 2).await.unwrap();

    let id_a = da
        .insert_id(
            "INSERT INTO subjects(name, created_at) VALUES ($1, $2) RETURNING id",
            args!["Biologi", 1.0],
        )
        .await
        .unwrap();
    // user_id was filled from the session variable, not supplied by the caller.
    let stored = da
        .row(
            "SELECT user_id::text AS owner FROM subjects WHERE id=$1",
            args![id_a],
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(stored["owner"], json!(a.to_string()));

    // B sees nothing, can neither update nor delete A's row, and may reuse the same name.
    assert!(
        db.rows("SELECT * FROM subjects", args![])
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        db.run("UPDATE subjects SET name='x' WHERE id=$1", args![id_a])
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        db.run("DELETE FROM subjects WHERE id=$1", args![id_a])
            .await
            .unwrap(),
        0
    );
    let id_b = db
        .insert_id(
            "INSERT INTO subjects(name, created_at) VALUES ($1, $2) RETURNING id",
            args!["Biologi", 2.0],
        )
        .await
        .unwrap();
    assert_ne!(id_a, id_b);

    // A still has exactly its own row, unchanged.
    let mine = da.rows("SELECT name FROM subjects", args![]).await.unwrap();
    assert_eq!(mine.len(), 1);
    assert_eq!(mine[0]["name"], "Biologi");

    // B cannot smuggle a row in under A's id (WITH CHECK).
    let forged = db
        .run(
            "INSERT INTO subjects(name, created_at, user_id) VALUES ('Hack', 3.0, $1::uuid)",
            args![a.to_string()],
        )
        .await;
    assert!(
        forged.is_err(),
        "inserting a row owned by someone else must be rejected"
    );

    da.close().await;
    db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn without_an_owner_everything_fails_closed() {
    let t = fresh_db().await;
    let a = owner(&t).await;
    let da = Db::connect(t.app.clone(), a, 1).await.unwrap();
    da.run(
        "INSERT INTO subjects(name, created_at) VALUES ('X', 1.0)",
        args![],
    )
    .await
    .unwrap();

    // Same restricted role, but no app.user_id: no rows visible, no inserts possible.
    let raw = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.app.clone())
        .await
        .unwrap();
    let visible: i64 = sqlx::query_scalar("SELECT count(*) FROM subjects")
        .fetch_one(&raw)
        .await
        .unwrap();
    assert_eq!(visible, 0);
    let insert = sqlx::query("INSERT INTO subjects(name, created_at) VALUES ('Y', 1.0)")
        .execute(&raw)
        .await;
    assert!(insert.is_err());
    raw.close().await;
    da.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn values_round_trip_with_the_shapes_the_frontend_expects() {
    let t = fresh_db().await;
    let a = owner(&t).await;
    let db = Db::connect(t.app.clone(), a, 2).await.unwrap();

    let subject = db
        .insert_id(
            "INSERT INTO subjects(name, created_at) VALUES ($1, $2) RETURNING id",
            args!["Kimia", 1_700_000_000.25],
        )
        .await
        .unwrap();
    let doc = db
        .insert_id(
            "INSERT INTO documents(subject_id, title, filename, status, key_concepts, topics, created_at, updated_at) \
             VALUES ($1,$2,$3,'ready',$4,$5,$6,$6) RETURNING id",
            args![subject, "Bab 1", "bab1.pdf", json!(["ion", "atom"]), Arg::Json(None), 5.5],
        )
        .await
        .unwrap();
    let row = db
        .row("SELECT * FROM documents WHERE id=$1", args![doc])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row["title"], "Bab 1");
    assert_eq!(row["key_concepts"], json!(["ion", "atom"])); // jsonb comes back as a JSON array, not text
    assert!(row["topics"].is_null()); // typed NULL
    assert_eq!(row["title_locked"], json!(0)); // integer flags keep their legacy shape
    assert_eq!(row["created_at"], json!(5.5));
    assert!(row["size"].is_number());

    // Typed Option arguments and scalar helpers.
    let none: Option<i64> = None;
    db.run(
        "UPDATE documents SET subject_id=$1 WHERE id=$2",
        args![none, doc],
    )
    .await
    .unwrap();
    assert!(
        db.scalar("SELECT subject_id FROM documents WHERE id=$1", args![doc])
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(
        db.scalar_i64("SELECT count(*) FROM documents", args![], -1)
            .await
            .unwrap(),
        1
    );
    assert_eq!(
        db.scalar_i64("SELECT id FROM documents WHERE id=-1", args![], 42)
            .await
            .unwrap(),
        42
    );
    assert_eq!(
        db.scalar_f64("SELECT 2.5::float8", args![], 0.0)
            .await
            .unwrap(),
        2.5
    );

    // NUMERIC is refused with an actionable message instead of silently mis-decoding.
    // (avg() of integers is numeric; sum() of integers is already bigint.)
    let err = db
        .rows("SELECT avg(seconds) AS s FROM study_events", args![])
        .await
        .expect_err("numeric");
    assert!(err.to_string().contains("cast"), "{err}");
    let ok = db
        .rows(
            "SELECT COALESCE(sum(seconds),0)::bigint AS s FROM study_events",
            args![],
        )
        .await
        .unwrap();
    assert_eq!(ok[0]["s"], json!(0));

    db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn transactions_commit_and_roll_back() {
    let t = fresh_db().await;
    let a = owner(&t).await;
    let db = Db::connect(t.app.clone(), a, 2).await.unwrap();

    let mut tx = db.begin().await.unwrap();
    tx.run(
        "INSERT INTO subjects(name, created_at) VALUES ('A', 1.0)",
        args![],
    )
    .await
    .unwrap();
    drop(tx); // dropped without commit -> rolled back
    assert_eq!(
        db.scalar_i64("SELECT count(*) FROM subjects", args![], 0)
            .await
            .unwrap(),
        0
    );

    let mut tx = db.begin().await.unwrap();
    tx.run(
        "INSERT INTO subjects(name, created_at) VALUES ('B', 1.0)",
        args![],
    )
    .await
    .unwrap();
    assert_eq!(
        tx.scalar_i64("SELECT count(*) FROM subjects", args![], 0)
            .await
            .unwrap(),
        1
    );
    tx.commit().await.unwrap();
    assert_eq!(
        db.scalar_i64("SELECT count(*) FROM subjects", args![], 0)
            .await
            .unwrap(),
        1
    );

    db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn chunk_search_uses_the_indonesian_text_search_configuration() {
    let t = fresh_db().await;
    let a = owner(&t).await;
    let db = Db::connect(t.app.clone(), a, 2).await.unwrap();
    let doc = db
        .insert_id(
            "INSERT INTO documents(title, filename, created_at, updated_at) VALUES ('d','d.txt',1,1) RETURNING id",
            args![],
        )
        .await
        .unwrap();
    for (i, text) in [
        "Fotosintesis mengubah cahaya matahari menjadi energi kimia.",
        "Respirasi menghasilkan ATP dari glukosa.",
    ]
    .iter()
    .enumerate()
    {
        db.run(
            "INSERT INTO chunks(document_id, idx, label, text) VALUES ($1,$2,$3,$4)",
            args![doc, i, format!("Halaman {}", i + 1), *text],
        )
        .await
        .unwrap();
    }
    let hits = db
        .rows(
            "SELECT label, ts_rank(tsv, q) AS rank FROM chunks, websearch_to_tsquery('indonesian', $1) q \
             WHERE tsv @@ q ORDER BY rank DESC",
            args!["fotosintesis cahaya"],
        )
        .await
        .unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0]["label"], "Halaman 1");
    db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn sessions_are_revocable_and_expire() {
    let t = fresh_db().await;
    let a = owner(&t).await;
    let store = SessionStore::connect(t.app.clone()).await.unwrap();

    store
        .create(a, "hash-1", 1000.0, 60.0, Some("test-agent"))
        .await
        .unwrap();
    store
        .create(a, "hash-2", 1000.0, 600.0, None)
        .await
        .unwrap();
    assert_eq!(store.lookup("hash-1", 1010.0).await.unwrap(), Some(a));
    assert_eq!(
        store.lookup("hash-1", 1061.0).await.unwrap(),
        None,
        "expired"
    );
    assert_eq!(store.lookup("nope", 1010.0).await.unwrap(), None);

    assert!(store.revoke("hash-2").await.unwrap());
    assert_eq!(
        store.lookup("hash-2", 1010.0).await.unwrap(),
        None,
        "revoked"
    );

    store
        .create(a, "hash-3", 1000.0, 600.0, None)
        .await
        .unwrap();
    store
        .create(a, "hash-4", 1000.0, 600.0, None)
        .await
        .unwrap();
    assert_eq!(store.revoke_all(a).await.unwrap(), 3); // hash-1 (expired but present), hash-3, hash-4
    assert_eq!(store.purge_expired(5000.0).await.unwrap(), 0);
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn migration_0002_applies_cleanly_and_is_idempotent() {
    let t = fresh_db().await;

    // Verify re-running migrate() on the already-migrated database is idempotent.
    migrate(t.admin.clone())
        .await
        .expect("second migrate() call must succeed idempotently");

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(t.admin.clone())
        .await
        .unwrap();

    // Verify migration tracking table contains versions 1 and 2.
    let versions: Vec<i64> =
        sqlx::query_scalar("SELECT version FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert!(
        versions.contains(&1) && versions.contains(&2),
        "expected migrations 1 and 2, got: {versions:?}"
    );

    // Verify new columns added to app_users.
    let user_cols: Vec<String> = sqlx::query_scalar(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'app_users'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(user_cols.contains(&"role".to_string()));
    assert!(user_cols.contains(&"is_admin".to_string()));

    // Verify opportunity_id column added to documents.
    let doc_cols: Vec<String> = sqlx::query_scalar(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'documents'",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert!(doc_cols.contains(&"opportunity_id".to_string()));

    pool.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn opportunities_rls_enforces_admin_write_and_public_read() {
    let t = fresh_db().await;
    let admin_id = owner(&t).await; // owner is auto-assigned admin role by trigger
    let student_id = student_user(&t, "student_tester").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.unwrap();
    let student_db = Db::connect(t.app.clone(), student_id, 2).await.unwrap();

    // 1. Admin can insert published opportunity.
    let pub_opp_id = admin_db
        .insert_id(
            "INSERT INTO opportunities (title, description, category, organizer, deadline, target_majors, is_published) \
             VALUES ($1, $2, $3, $4, $5, $6, 1) RETURNING id",
            args![
                "Gemastik 2026",
                "Kompetisi TIK Mahasiswa Nasional",
                "competition",
                "Puspresnas",
                1_800_000_000.0,
                json!(["Informatika", "Sistem Informasi"])
            ],
        )
        .await
        .unwrap();
    assert!(pub_opp_id > 0);

    // 2. Admin can insert draft/unpublished opportunity.
    let draft_opp_id = admin_db
        .insert_id(
            "INSERT INTO opportunities (title, description, category, organizer, deadline, target_majors, is_published) \
             VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING id",
            args![
                "Beasiswa Unggulan 2026",
                "Program beasiswa degree",
                "scholarship",
                "Kemendikbud",
                1_810_000_000.0,
                json!(["Semua Jurusan"])
            ],
        )
        .await
        .unwrap();

    // 3. Admin can update opportunity.
    let updated = admin_db
        .run(
            "UPDATE opportunities SET reward = $1 WHERE id = $2",
            args!["Dana Pembinaan Rp 100jt", pub_opp_id],
        )
        .await
        .unwrap();
    assert_eq!(updated, 1);

    // 4. Non-admin student cannot insert opportunity (RLS violation).
    let student_insert = student_db
        .insert_id(
            "INSERT INTO opportunities (title, description, category, organizer, deadline, is_published) \
             VALUES ('Illegal Opp', 'Hacked', 'competition', 'Hacker', 1_800_000_000.0, 1) RETURNING id",
            args![],
        )
        .await;
    assert!(
        student_insert.is_err(),
        "student must not be allowed to insert opportunities"
    );

    // 5. Non-admin student cannot update opportunity.
    let student_update = student_db
        .run(
            "UPDATE opportunities SET title = 'Defaced' WHERE id = $1",
            args![pub_opp_id],
        )
        .await
        .unwrap();
    assert_eq!(
        student_update, 0,
        "student must affect 0 rows when attempting to update opportunity"
    );

    // 6. Non-admin student cannot delete opportunity.
    let student_delete = student_db
        .run("DELETE FROM opportunities WHERE id = $1", args![pub_opp_id])
        .await
        .unwrap();
    assert_eq!(
        student_delete, 0,
        "student must affect 0 rows when attempting to delete opportunity"
    );

    // 7. Student can view published opportunities.
    let pub_row = student_db
        .row(
            "SELECT id, title, reward FROM opportunities WHERE id = $1",
            args![pub_opp_id],
        )
        .await
        .unwrap();
    assert!(pub_row.is_some());
    let pub_row = pub_row.unwrap();
    assert_eq!(pub_row["title"], "Gemastik 2026");
    assert_eq!(pub_row["reward"], "Dana Pembinaan Rp 100jt");

    // 8. Student CANNOT view draft/unpublished opportunities.
    let draft_row = student_db
        .row(
            "SELECT id, title FROM opportunities WHERE id = $1",
            args![draft_opp_id],
        )
        .await
        .unwrap();
    assert!(
        draft_row.is_none(),
        "draft opportunities must be invisible to students"
    );

    // 9. Admin CAN view draft opportunities.
    let admin_draft = admin_db
        .row(
            "SELECT id, title FROM opportunities WHERE id = $1",
            args![draft_opp_id],
        )
        .await
        .unwrap();
    assert!(admin_draft.is_some());

    // 10. Check constraints.
    let invalid_category = admin_db
        .run(
            "INSERT INTO opportunities (title, description, category, organizer, deadline) \
             VALUES ('Bad Cat', 'Desc', 'hackathon', 'Org', 1.0)",
            args![],
        )
        .await;
    assert!(invalid_category.is_err(), "must reject category outside competition/scholarship");

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn tracked_opportunities_enforces_tenant_isolation_and_lifecycle() {
    let t = fresh_db().await;
    let admin_id = owner(&t).await;
    let student_a = student_user(&t, "student_a").await;
    let student_b = student_user(&t, "student_b").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 1).await.unwrap();
    let da = Db::connect(t.app.clone(), student_a, 2).await.unwrap();
    let db = Db::connect(t.app.clone(), student_b, 2).await.unwrap();

    // Create test opportunity.
    let opp_id = admin_db
        .insert_id(
            "INSERT INTO opportunities (title, description, category, organizer, deadline, is_published) \
             VALUES ('Olimpiade', 'Kompetisi', 'competition', 'Puspresnas', 1_800_000_000.0, 1) RETURNING id",
            args![],
        )
        .await
        .unwrap();

    // Student A tracks opportunity with initial status 'Saved'.
    let track_a = da
        .insert_id(
            "INSERT INTO tracked_opportunities (opportunity_id, status, notes) VALUES ($1, 'Saved', $2) RETURNING id",
            args![opp_id, "Catatan persiapan A"],
        )
        .await
        .unwrap();

    // Student B sees 0 tracked rows.
    let b_rows = db
        .rows("SELECT * FROM tracked_opportunities", args![])
        .await
        .unwrap();
    assert!(b_rows.is_empty(), "Student B must not see Student A's tracked opportunities");

    // Student B cannot update Student A's tracking row.
    let b_update = db
        .run(
            "UPDATE tracked_opportunities SET status = 'Done' WHERE id = $1",
            args![track_a],
        )
        .await
        .unwrap();
    assert_eq!(b_update, 0, "Student B must affect 0 rows on Student A's tracker");

    // Student B cannot delete Student A's tracking row.
    let b_delete = db
        .run("DELETE FROM tracked_opportunities WHERE id = $1", args![track_a])
        .await
        .unwrap();
    assert_eq!(b_delete, 0, "Student B must affect 0 rows when deleting Student A's tracker");

    // Student B can track the SAME opportunity independently.
    let track_b = db
        .insert_id(
            "INSERT INTO tracked_opportunities (opportunity_id, status, notes) VALUES ($1, 'Saved', $2) RETURNING id",
            args![opp_id, "Catatan B"],
        )
        .await
        .unwrap();
    assert_ne!(track_a, track_b);

    // Student B cannot smuggle an insert with Student A's user_id (WITH CHECK).
    let forged = db
        .run(
            "INSERT INTO tracked_opportunities (opportunity_id, status, user_id) VALUES ($1, 'Saved', $2::uuid)",
            args![opp_id, student_a.to_string()],
        )
        .await;
    assert!(
        forged.is_err(),
        "inserting tracked_opportunities owned by someone else must be rejected by RLS"
    );

    // Lifecycle transitions for Student A:
    // 1. Saved -> Applied: sets applied_at
    let applied_time = 1_700_000_100.0;
    let up_applied = da
        .run(
            "UPDATE tracked_opportunities SET status = 'Applied', applied_at = $1 WHERE id = $2",
            args![applied_time, track_a],
        )
        .await
        .unwrap();
    assert_eq!(up_applied, 1);

    let row_applied = da
        .row("SELECT status, applied_at, completed_at FROM tracked_opportunities WHERE id = $1", args![track_a])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row_applied["status"], "Applied");
    assert_eq!(row_applied["applied_at"], json!(applied_time));
    assert!(row_applied["completed_at"].is_null());

    // 2. Applied -> Done: sets completed_at
    let done_time = 1_700_000_200.0;
    let up_done = da
        .run(
            "UPDATE tracked_opportunities SET status = 'Done', completed_at = $1 WHERE id = $2",
            args![done_time, track_a],
        )
        .await
        .unwrap();
    assert_eq!(up_done, 1);

    let row_done = da
        .row("SELECT status, applied_at, completed_at FROM tracked_opportunities WHERE id = $1", args![track_a])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row_done["status"], "Done");
    assert_eq!(row_done["completed_at"], json!(done_time));

    // 3. Status check constraint rejects invalid state.
    let bad_status = da
        .run(
            "UPDATE tracked_opportunities SET status = 'Abandoned' WHERE id = $1",
            args![track_a],
        )
        .await;
    assert!(bad_status.is_err(), "must reject status not in Saved, Applied, Done");

    // Duplicate tracking of same opportunity by same user fails unique constraint.
    let dup = da
        .run(
            "INSERT INTO tracked_opportunities (opportunity_id, status) VALUES ($1, 'Saved')",
            args![opp_id],
        )
        .await;
    assert!(dup.is_err(), "duplicate tracking must be rejected by unique constraint");

    admin_db.close().await;
    da.close().await;
    db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn peer_profiles_enforces_public_read_and_owner_only_mutation() {
    let t = fresh_db().await;
    let student_a = student_user(&t, "student_ayu").await;
    let student_b = student_user(&t, "student_budi").await;

    let da = Db::connect(t.app.clone(), student_a, 2).await.unwrap();
    let db = Db::connect(t.app.clone(), student_b, 2).await.unwrap();

    // 1. Student A creates profile via upsert.
    da.run(
        "INSERT INTO peer_profiles (full_name, major, batch_year, bio, academic_interests, skills, contact_info, is_looking_for_team) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
         ON CONFLICT (user_id) DO UPDATE SET \
            full_name = EXCLUDED.full_name, \
            major = EXCLUDED.major, \
            bio = EXCLUDED.bio, \
            academic_interests = EXCLUDED.academic_interests, \
            skills = EXCLUDED.skills, \
            contact_info = EXCLUDED.contact_info, \
            is_looking_for_team = EXCLUDED.is_looking_for_team, \
            updated_at = EXTRACT(EPOCH FROM clock_timestamp())",
        args![
            "Ayu Permata",
            "Teknik Informatika",
            2024_i64,
            Some("Tertarik di bidang AI dan web"),
            json!(["Machine Learning", "NLP"]),
            json!(["Python", "Rust", "React"]),
            json!({"email": "ayu@kampus.ac.id", "telegram": "@ayup"}),
            1_i64
        ],
    )
    .await
    .unwrap();

    // 2. Student B can view Student A's profile in the peer directory.
    let directory = db
        .rows(
            "SELECT id, user_id::text AS user_uuid, full_name, major, skills, is_looking_for_team \
             FROM peer_profiles WHERE is_looking_for_team = 1",
            args![],
        )
        .await
        .unwrap();
    assert_eq!(directory.len(), 1);
    assert_eq!(directory[0]["full_name"], "Ayu Permata");
    assert_eq!(directory[0]["major"], "Teknik Informatika");
    assert_eq!(directory[0]["user_uuid"], student_a.to_string());
    assert_eq!(directory[0]["skills"], json!(["Python", "Rust", "React"]));

    // 3. Student B searches directory by skill using JSONB containment (@>).
    let match_skill = db
        .rows(
            "SELECT full_name FROM peer_profiles WHERE skills @> $1::jsonb",
            args![json!(["Rust"])],
        )
        .await
        .unwrap();
    assert_eq!(match_skill.len(), 1);

    let no_match_skill = db
        .rows(
            "SELECT full_name FROM peer_profiles WHERE skills @> $1::jsonb",
            args![json!(["Flutter"])],
        )
        .await
        .unwrap();
    assert_eq!(no_match_skill.len(), 0);

    // 4. Student B cannot update Student A's profile.
    let b_update = db
        .run(
            "UPDATE peer_profiles SET full_name = 'Imposter' WHERE major = 'Teknik Informatika'",
            args![],
        )
        .await
        .unwrap();
    assert_eq!(b_update, 0, "Student B must affect 0 rows when attempting to update Student A profile");

    // 5. Student B cannot delete Student A's profile.
    let b_delete = db
        .run(
            "DELETE FROM peer_profiles WHERE major = 'Teknik Informatika'",
            args![],
        )
        .await
        .unwrap();
    assert_eq!(b_delete, 0, "Student B must affect 0 rows when attempting to delete Student A profile");

    // 6. Student B cannot forge a profile under Student A's user_id.
    let forged = db
        .run(
            "INSERT INTO peer_profiles (user_id, full_name, major) VALUES ($1::uuid, 'Fake', 'SI')",
            args![student_a.to_string()],
        )
        .await;
    assert!(forged.is_err(), "must reject inserting profile with another user's UUID");

    // 7. Student A can update their own profile (e.g. toggle is_looking_for_team = 0).
    let a_update = da
        .run(
            "UPDATE peer_profiles SET is_looking_for_team = 0 WHERE major = 'Teknik Informatika'",
            args![],
        )
        .await
        .unwrap();
    assert_eq!(a_update, 1);

    let a_row = da
        .row("SELECT is_looking_for_team FROM peer_profiles", args![])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(a_row["is_looking_for_team"], json!(0));

    da.close().await;
    db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn opportunities_and_profiles_values_round_trip_with_row() {
    let t = fresh_db().await;
    let admin_id = owner(&t).await;
    let student_id = student_user(&t, "student_tester").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.unwrap();
    let student_db = Db::connect(t.app.clone(), student_id, 2).await.unwrap();

    // 1. Verify JSONB array and double precision deadline round-trip.
    let opp_id = admin_db
        .insert_id(
            "INSERT INTO opportunities (title, description, category, organizer, deadline, reward, \
             target_majors, eligibility, website_url, guideline_url, guideline_text, is_published) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id",
            args![
                "Lomba Karya Tulis Ilmiah 2026",
                "Kompetisi riset ilmiah mahasiswa",
                "competition",
                "Ditjen Diktiristek",
                1_795_000_000.75,
                Some("Uang tunai Rp 25.000.000"),
                json!(["Biologi", "Kimia", "Farmasi"]),
                Some("Mahasiswa aktif semester 3-7"),
                Some("https://dikti.kemdikbud.go.id"),
                Some("https://dikti.kemdikbud.go.id/pedoman.pdf"),
                Some("Format naskah: Times New Roman 12, spasi 1.5..."),
                1_i64
            ],
        )
        .await
        .unwrap();

    let opp_row = admin_db
        .row("SELECT * FROM opportunities WHERE id = $1", args![opp_id])
        .await
        .unwrap()
        .unwrap();

    assert_eq!(opp_row["title"], "Lomba Karya Tulis Ilmiah 2026");
    assert_eq!(opp_row["category"], "competition");
    assert_eq!(opp_row["target_majors"], json!(["Biologi", "Kimia", "Farmasi"]));
    assert_eq!(opp_row["deadline"], json!(1_795_000_000.75));
    assert_eq!(opp_row["is_published"], json!(1));
    assert_eq!(opp_row["reward"], "Uang tunai Rp 25.000.000");

    // 2. Verify Document Linkage (R4 guideline study pipeline integration).
    let doc_id = admin_db
        .insert_id(
            "INSERT INTO documents (title, filename, status, style, opportunity_id, created_at, updated_at) \
             VALUES ($1, $2, 'ready', 'competition_guidelines', $3, 1.0, 1.0) RETURNING id",
            args![
                "Panduan: Lomba Karya Tulis Ilmiah 2026",
                "pedoman.pdf",
                opp_id
            ],
        )
        .await
        .unwrap();

    let doc_row = admin_db
        .row("SELECT id, title, opportunity_id FROM documents WHERE id = $1", args![doc_id])
        .await
        .unwrap()
        .unwrap();
    assert_eq!(doc_row["opportunity_id"], json!(opp_id));

    // When opportunity is deleted, documents.opportunity_id becomes NULL (ON DELETE SET NULL).
    admin_db
        .run("DELETE FROM opportunities WHERE id = $1", args![opp_id])
        .await
        .unwrap();

    let doc_after = admin_db
        .row("SELECT opportunity_id FROM documents WHERE id = $1", args![doc_id])
        .await
        .unwrap()
        .unwrap();
    assert!(doc_after["opportunity_id"].is_null(), "opportunity_id must be SET NULL on delete");

    // 3. Verify Peer Profile JSONB Object (contact_info) and Nullable fields.
    student_db
        .run(
            "INSERT INTO peer_profiles (full_name, major, batch_year, bio, academic_interests, skills, contact_info, is_looking_for_team) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            args![
                "Rian Hidayat",
                "Teknik Elektro",
                Arg::Int(None), // nullable batch_year
                Arg::Text(None), // nullable bio
                json!([]),
                json!(["Embedded Systems", "IoT"]),
                json!({"email": "rian@kampus.ac.id"}),
                1_i64
            ],
        )
        .await
        .unwrap();

    let prof_row = student_db
        .row("SELECT * FROM peer_profiles WHERE full_name = 'Rian Hidayat'", args![])
        .await
        .unwrap()
        .unwrap();
    assert!(prof_row["batch_year"].is_null());
    assert!(prof_row["bio"].is_null());
    assert_eq!(prof_row["academic_interests"], json!([]));
    assert_eq!(prof_row["skills"], json!(["Embedded Systems", "IoT"]));
    assert_eq!(prof_row["contact_info"], json!({"email": "rian@kampus.ac.id"}));
    assert_eq!(prof_row["is_looking_for_team"], json!(1));

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn storage_models_and_queries_exercise_all_methods() {
    let t = fresh_db().await;
    let admin_id = owner(&t).await;
    let student_id = student_user(&t, "student_tester").await;

    let admin_db = Db::connect(t.app.clone(), admin_id, 2).await.unwrap();
    let student_db = Db::connect(t.app.clone(), student_id, 2).await.unwrap();

    // Verify is_admin method
    assert!(admin_db.is_admin().await.unwrap());
    assert!(!student_db.is_admin().await.unwrap());

    // 1. Create opportunity via admin_db
    let now = 1_700_000_000.0;
    let create_input = CreateOpportunityInput {
        title: "Hackathon Nasional 2026".to_string(),
        description: "Lomba hackathon 48 jam".to_string(),
        category: "competition".to_string(),
        organizer: "Belajar Academy".to_string(),
        deadline: now + 86400.0 * 14.0,
        reward: Some("Rp 50.000.000".to_string()),
        target_majors: vec!["Informatika".to_string(), "Sistem Informasi".to_string()],
        eligibility: Some("Mahasiswa aktif D3/D4/S1".to_string()),
        website_url: Some("https://hackathon.example.com".to_string()),
        guideline_url: Some("https://hackathon.example.com/guide.pdf".to_string()),
        guideline_text: Some("# Hackathon Guide\n\nBuild awesome AI apps.".to_string()),
        is_published: Some(1),
    };

    let opp_id = admin_db
        .create_opportunity(&create_input, Some(admin_id), now)
        .await
        .unwrap();
    assert!(opp_id > 0);

    // 2. Get opportunity
    let fetched = student_db.get_opportunity(opp_id).await.unwrap().unwrap();
    assert_eq!(fetched.title, "Hackathon Nasional 2026");
    assert_eq!(fetched.target_majors, vec!["Informatika", "Sistem Informasi"]);
    assert_eq!(fetched.is_published, 1);

    // 3. List opportunities with filter
    let list = student_db
        .list_opportunities(&OpportunityFilter {
            major: Some("Informatika".to_string()),
            status: Some("open".to_string()),
            now,
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, opp_id);

    // 4. Update opportunity
    let update_input = UpdateOpportunityInput {
        reward: Some("Rp 75.000.000".to_string()),
        ..Default::default()
    };
    let updated = admin_db
        .update_opportunity(opp_id, &update_input, now + 10.0)
        .await
        .unwrap();
    assert!(updated);
    let re_fetched = student_db.get_opportunity(opp_id).await.unwrap().unwrap();
    assert_eq!(re_fetched.reward.as_deref(), Some("Rp 75.000.000"));

    // 5. Track opportunity (student)
    let track_id = student_db
        .track_opportunity(opp_id, Some("Catatan tim"), now + 20.0)
        .await
        .unwrap();
    assert!(track_id > 0);

    // 6. List tracked opportunities
    let tracked_list = student_db
        .list_tracked_opportunities(None, now + 20.0)
        .await
        .unwrap();
    assert_eq!(tracked_list.len(), 1);
    assert_eq!(tracked_list[0].status, "Saved");
    assert!(tracked_list[0].remind); // Saved and not overdue -> remind = true

    // 7. Update tracked status to Applied
    let up_stat = student_db
        .update_tracked_status(track_id, "Applied", Some("Sudah submit"), now + 30.0)
        .await
        .unwrap();
    assert!(up_stat);

    let tracked_item = student_db
        .get_tracked_opportunity(track_id, now + 30.0)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(tracked_item.status, "Applied");
    assert!(!tracked_item.remind); // Applied -> reminder suppressed!
    assert!(tracked_item.applied_at.is_some());

    // 8. Peer profile upsert & retrieval
    let prof_input = UpsertProfileInput {
        full_name: "Budi Pratama".to_string(),
        major: "Informatika".to_string(),
        batch_year: Some(2023),
        bio: Some("Backend developer with Rust experience".to_string()),
        academic_interests: vec!["Distributed Systems".to_string()],
        skills: vec!["Rust".to_string(), "PostgreSQL".to_string()],
        contact_info: Some(json!({"github": "budip"})),
        is_looking_for_team: Some(1),
    };
    let prof_id = student_db
        .upsert_my_profile(&prof_input, now + 40.0)
        .await
        .unwrap();
    assert!(prof_id > 0);

    let my_prof = student_db.get_my_profile().await.unwrap().unwrap();
    assert_eq!(my_prof.full_name, "Budi Pratama");
    assert_eq!(my_prof.skills, vec!["Rust", "PostgreSQL"]);

    let prof_by_id = admin_db.get_profile_by_id(prof_id).await.unwrap().unwrap();
    assert_eq!(prof_by_id.full_name, "Budi Pratama");

    let prof_search = admin_db
        .search_profiles(&ProfileFilter {
            skill: Some("Rust".to_string()),
            ..Default::default()
        })
        .await
        .unwrap();
    assert_eq!(prof_search.len(), 1);
    assert_eq!(prof_search[0].full_name, "Budi Pratama");

    // 9. Guideline study document creation (R4)
    let (doc_id, doc_title) = student_db
        .create_guideline_study_document(opp_id, now + 50.0)
        .await
        .unwrap();
    assert!(doc_id > 0);
    assert!(doc_title.contains("Hackathon Nasional 2026"));

    // 10. Delete tracked opportunity
    let del_track = student_db
        .delete_tracked_opportunity(track_id)
        .await
        .unwrap();
    assert!(del_track);

    // 11. Delete opportunity (admin)
    let del_opp = admin_db.delete_opportunity(opp_id).await.unwrap();
    assert!(del_opp);

    admin_db.close().await;
    student_db.close().await;
    t.drop_db().await;
}
