//! Handler tests for concepts, cards and achievements against a real PostgreSQL (`#[ignore]`d so a
//! plain `cargo test` needs no database):
//!
//!   cargo run -p stuby-devdb
//!   TEST_DATABASE_ADMIN_URL=... cargo test -p stuby-application -- --include-ignored

use stuby_application::{App, AppConfig, dispatch, stats_queries};
use stuby_storage::testing::{TestDb, fresh_db};
use stuby_storage::{Db, Uuid, args, ensure_owner};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;

const NEEDS_PG: &str = "needs Postgres: cargo run -p stuby-devdb";

async fn app_for(t: &TestDb, owner: Uuid) -> App {
    let db = Db::connect(t.app.clone(), owner, 3).await.expect("connect");
    App::new(db, AppConfig::default())
}

async fn first_app(t: &TestDb) -> App {
    let owner = ensure_owner(t.app.clone()).await.expect("owner");
    app_for(t, owner).await
}

async fn second_app(t: &TestDb) -> App {
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
    app_for(t, id).await
}

async fn call(app: &App, action: &str, params: Value) -> Value {
    dispatch(app, action, &params, None)
        .await
        .unwrap_or_else(|e| panic!("{action} failed: {e}"))
}

async fn call_err(app: &App, action: &str, params: Value) -> String {
    match dispatch(app, action, &params, None).await {
        Ok(v) => panic!("{action} should have failed, got {v}"),
        Err(e) => e.to_string(),
    }
}

async fn seed_document(
    app: &App,
    title: &str,
    status: &str,
    concepts: Value,
    topics: Value,
) -> i64 {
    app.db
        .insert_id(
            "INSERT INTO documents(title, filename, status, key_concepts, topics, created_at, updated_at) \
             VALUES ($1, 'f.pdf', $2, $3, $4, 1.0, 1.0) RETURNING id",
            args![title.to_owned(), status.to_owned(), concepts, topics],
        )
        .await
        .expect("insert document")
}

fn many_concepts(n: usize) -> Value {
    Value::Array(
        (0..n)
            .map(|i| json!({"term": format!("istilah {i}"), "definition": format!("definisi nomor {i}")}))
            .collect(),
    )
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn concepts_and_cards_follow_the_legacy_flow() {
    let _ = NEEDS_PG;
    let t = fresh_db().await;
    let app = first_app(&t).await;

    let doc = seed_document(
        &app,
        "Biologi Sel",
        "ready",
        json!([
            {"term": "Mitokondria", "definition": "Pembangkit energi sel."},
            {"term": "Ribosom", "definition": "Tempat sintesis protein."},
            {"term": "Inti Sel", "definition": "Menyimpan DNA."},
            {"term": "A", "definition": "terlalu pendek istilahnya"},
            {"term": "Lisosom", "definition": "ab"},
            "bukan objek",
            {"term": "Ribosom", "definition": "Duplikat harus diabaikan."}
        ]),
        json!(["Sel Hidup", "Genetika"]),
    )
    .await;

    // Concepts are seeded lazily from key_concepts: bad entries and duplicates are skipped.
    let listed = call(&app, "concepts_list", json!({"document_id": doc})).await;
    assert_eq!(listed["count"], 3);
    let first = &listed["concepts"][0];
    assert_eq!(first["term"], "Mitokondria");
    assert_eq!(first["topic"], "Sel Hidup");
    assert_eq!(first["doc_title"], "Biologi Sel");
    assert_eq!(first["kinds"], json!([]));
    assert_eq!(first["score"].as_f64(), Some(0.0));
    assert_eq!(first["evidence_n"], 0);

    // Building cards is idempotent.
    let built = call(&app, "cards_build", json!({"document_id": doc})).await;
    assert_eq!(built["added"], 3);
    assert_eq!(built["achievements"], json!([]));
    let counts = &built["counts"];
    assert_eq!(
        (
            counts["total"].as_i64(),
            counts["due"].as_i64(),
            counts["new"].as_i64(),
            counts["learning"].as_i64(),
            counts["mature"].as_i64()
        ),
        (Some(3), Some(3), Some(3), Some(0), Some(0))
    );
    let again = call(&app, "cards_build", json!({"document_id": doc})).await;
    assert_eq!(again["added"], 0);

    // Due cards come in id order and honour the limit (string numbers are accepted, like Python).
    let due = call(&app, "cards_due", json!({})).await;
    let fronts: Vec<&str> = due["cards"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["front"].as_str().unwrap())
        .collect();
    assert_eq!(fronts, ["Mitokondria", "Ribosom", "Inti Sel"]);
    assert_eq!(due["cards"][0]["doc_title"], "Biologi Sel");
    let limited = call(&app, "cards_due", json!({"limit": "2"})).await;
    assert_eq!(limited["cards"].as_array().unwrap().len(), 2);

    // Reviewing: "good" on a new card -> 1 day, and it leaves the due list.
    let id = due["cards"][0]["id"].as_i64().unwrap();
    let today = stats_queries::today(&app);
    let review = call(
        &app,
        "cards_review",
        json!({"id": id, "grade": 4, "seconds": 500}),
    )
    .await;
    assert_eq!(review["interval"], 1);
    assert_eq!(review["reps"], 1);
    assert_eq!(review["lapses"], 0);
    assert_eq!(
        review["due_day"],
        json!((today + chrono::Days::new(1)).to_string())
    );
    assert_eq!(review["counts"]["due"], 2);
    assert_eq!(review["counts"]["learning"], 1);
    assert_eq!(review["counts"]["new"], 2);
    // The study event is clamped to 90 seconds and counted as cards, not quizzes.
    let event = app
        .db
        .row(
            "SELECT kind, seconds, quizzes, document_id FROM study_events ORDER BY id DESC LIMIT 1",
            args![],
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        (
            event["kind"].as_str(),
            event["seconds"].as_i64(),
            event["quizzes"].as_i64(),
            event["document_id"].as_i64()
        ),
        (Some("cards"), Some(90), Some(0), Some(doc))
    );

    // "Again" is a lapse: ease drops by 0.2 and the interval resets.
    let lapse = call(&app, "cards_review", json!({"id": id, "grade": 1})).await;
    assert_eq!(
        (
            lapse["reps"].as_i64(),
            lapse["interval"].as_i64(),
            lapse["lapses"].as_i64()
        ),
        (Some(0), Some(1), Some(1))
    );
    assert!((lapse["ease"].as_f64().unwrap() - 2.3).abs() < 1e-12);

    // Validation order and messages match the legacy handler.
    assert_eq!(
        call_err(&app, "cards_review", json!({"grade": 3})).await,
        "Parameter 'id' tidak valid."
    );
    assert_eq!(
        call_err(&app, "cards_review", json!({"id": 999_999, "grade": 3})).await,
        "Kartu tidak ditemukan."
    );
    assert_eq!(
        call_err(&app, "cards_review", json!({"id": id, "grade": 9})).await,
        "Parameter 'grade' di luar batas."
    );

    let stats = call(&app, "cards_stats", json!({})).await;
    assert_eq!(stats["documents"][0]["title"], "Biologi Sel");
    assert_eq!(stats["documents"][0]["n"], 3);
    // The reviewed card was rescheduled to tomorrow, so two of the three are still due.
    assert_eq!(stats["documents"][0]["due"], 2);

    let export = call(&app, "cards_export", json!({})).await;
    assert_eq!(export["count"], 3);
    assert_eq!(
        export["text"],
        "Mitokondria\tPembangkit energi sel.\tBiologi_Sel\nRibosom\tTempat sintesis protein.\tBiologi_Sel\nInti Sel\tMenyimpan DNA.\tBiologi_Sel"
    );

    drop(app);
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn building_for_a_subject_covers_only_its_ready_documents() {
    let t = fresh_db().await;
    let app = first_app(&t).await;
    let subject = call(&app, "create_subject", json!({"name": "IPA"})).await["subject"]["id"]
        .as_i64()
        .unwrap();

    let ready = seed_document(&app, "Siap", "ready", many_concepts(2), json!([])).await;
    let queued = seed_document(&app, "Antre", "queued", many_concepts(2), json!([])).await;
    let other = seed_document(&app, "Lain", "ready", many_concepts(2), json!([])).await;
    for id in [ready, queued] {
        app.db
            .run(
                "UPDATE documents SET subject_id = $1 WHERE id = $2",
                args![subject, id],
            )
            .await
            .unwrap();
    }

    let built = call(&app, "cards_build", json!({"subject_id": subject})).await;
    assert_eq!(built["added"], 2, "only the ready document of the subject");

    // No scope = every ready document (an explicit document is trusted as-is, even when queued).
    let all = call(&app, "cards_build", json!({})).await;
    assert_eq!(all["added"], 2, "the other ready document");
    let queued_only = call(&app, "cards_build", json!({"document_id": queued})).await;
    assert_eq!(queued_only["added"], 2);
    let _ = other;

    drop(app);
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn achievements_unlock_exactly_once_and_streak_7_is_reachable() {
    let t = fresh_db().await;
    let app = first_app(&t).await;

    // 25 cards -> "Rajin Mengulang" (cards_20).
    let doc = seed_document(&app, "Banyak", "ready", many_concepts(25), json!([])).await;
    let first = call(&app, "cards_build", json!({"document_id": doc})).await;
    assert_eq!(first["added"], 25);
    assert_eq!(
        first["achievements"],
        json!([{"key": "cards_20", "title": "Rajin Mengulang", "desc": "Punya 20 kartu belajar."}])
    );
    let second = call(&app, "cards_build", json!({"document_id": doc})).await;
    assert_eq!(
        second["achievements"],
        json!([]),
        "unlocking twice must not announce twice"
    );

    // Seven active days in a row (each above the 10 minute goal) -> "Konsisten".
    let today = stats_queries::today(&app);
    for back in 1..=7u64 {
        let day = (today - chrono::Days::new(back)).to_string();
        app.db
            .run(
                "INSERT INTO study_events(ts, day, kind, seconds, quizzes) VALUES (1.0, $1, 'read', 700, 0)",
                args![day],
            )
            .await
            .unwrap();
    }
    let third = call(&app, "cards_build", json!({"document_id": doc})).await;
    let keys: Vec<&str> = third["achievements"]
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["key"].as_str().unwrap())
        .collect();
    assert_eq!(keys, ["streak_7"]);

    drop(app);
    t.drop_db().await;
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn another_owner_sees_no_cards_through_the_handlers() {
    let t = fresh_db().await;
    let a = first_app(&t).await;
    let b = second_app(&t).await;

    let doc = seed_document(&a, "Rahasia A", "ready", many_concepts(3), json!([])).await;
    assert_eq!(
        call(&a, "cards_build", json!({"document_id": doc})).await["added"],
        3
    );

    let due = call(&b, "cards_due", json!({})).await;
    assert_eq!(due["cards"], json!([]));
    assert_eq!(due["counts"]["total"], 0);
    assert_eq!(call(&b, "cards_export", json!({})).await["count"], 0);
    assert_eq!(
        call(&b, "concepts_list", json!({"document_id": doc})).await["count"],
        0
    );
    // Building for A's document as B creates nothing: B cannot even see its concepts.
    assert_eq!(
        call(&b, "cards_build", json!({"document_id": doc})).await["added"],
        0
    );
    assert_eq!(call(&a, "cards_due", json!({})).await["counts"]["total"], 3);

    drop((a, b));
    t.drop_db().await;
}
