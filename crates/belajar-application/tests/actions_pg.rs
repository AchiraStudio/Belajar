//! End-to-end smoke test of the already ported actions (settings, subjects, documents, notes,
//! quizzes, dashboard) against a real PostgreSQL. It runs the real SQL of every handler once, so a
//! type mismatch or a typo in a query shows up here instead of in production.
//!
//!   cargo run -p belajar-devdb
//!   TEST_DATABASE_ADMIN_URL=... cargo test -p belajar-application -- --include-ignored

use belajar_application::{App, AppConfig, dispatch};
use belajar_storage::testing::fresh_db;
use belajar_storage::{Db, args, ensure_owner};
use serde_json::{Value, json};

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

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p belajar-devdb"]
async fn ported_actions_run_against_postgres() {
    let t = fresh_db().await;
    let owner = ensure_owner(t.app.clone()).await.expect("owner");
    let app = App::new(
        Db::connect(t.app.clone(), owner, 3).await.unwrap(),
        AppConfig::default(),
    );

    // ---- system
    let ping = call(&app, "ping", json!({})).await;
    assert!(ping["version"].is_string() && ping["time"].is_number());
    let before = call(&app, "get_settings", json!({})).await;
    assert_eq!(before["settings"]["daily_goal_min"], "10");
    call(
        &app,
        "save_settings",
        json!({"settings": {"daily_goal_min": "15"}}),
    )
    .await;
    assert_eq!(
        call_err(
            &app,
            "save_settings",
            json!({"settings": {"language": "xx"}})
        )
        .await,
        "Nilai 'language' tidak valid."
    );
    let after = call(&app, "get_settings", json!({})).await;
    assert_eq!(after["settings"]["daily_goal_min"], "15");
    assert_eq!(
        call_err(&app, "get_job", json!({"id": 424_242})).await,
        "Job tidak ditemukan."
    );

    // ---- subjects
    let created = call(&app, "create_subject", json!({"name": "Biologi"})).await;
    let subject_id = created["subject"]["id"].as_i64().expect("subject id");
    let listed = call(&app, "list_subjects", json!({})).await;
    assert_eq!(listed["subjects"].as_array().unwrap().len(), 1);
    assert_eq!(listed["subjects"][0]["name"], "Biologi");

    // ---- documents and notes
    let doc = app
        .db
        .insert_id(
            "INSERT INTO documents(title, filename, status, key_concepts, topics, size, page_count, created_at, updated_at) \
             VALUES ('Fotosintesis', 'foto.pdf', 'ready', '[]'::jsonb, '[\"Tumbuhan\"]'::jsonb, 10, 2, 1.0, 1.0) RETURNING id",
            args![],
        )
        .await
        .unwrap();
    call(
        &app,
        "update_document",
        json!({"id": doc, "subject_id": subject_id, "title": "Fotosintesis 1"}),
    )
    .await;
    let by_subject = call(&app, "list_documents", json!({"subject_id": subject_id})).await;
    assert_eq!(by_subject["documents"].as_array().unwrap().len(), 1);
    assert_eq!(by_subject["documents"][0]["title"], "Fotosintesis 1");
    assert_eq!(by_subject["documents"][0]["subject_name"], "Biologi");
    assert_eq!(by_subject["documents"][0]["quiz_count"], 0);
    assert_eq!(
        call_err(
            &app,
            "update_document",
            json!({"id": doc, "subject_id": 999_999})
        )
        .await,
        "Mata pelajaran tidak ditemukan."
    );
    call(
        &app,
        "save_note",
        json!({"document_id": doc, "content_md": "# Catatan\nKlorofil."}),
    )
    .await;
    call(
        &app,
        "save_note",
        json!({"document_id": doc, "content_md": "# Catatan 2"}),
    )
    .await; // upsert path
    call(
        &app,
        "log_study",
        json!({"document_id": doc, "seconds": 30}),
    )
    .await;
    let got = call(&app, "get_document", json!({"id": doc})).await;
    assert_eq!(got["document"]["topics"], json!(["Tumbuhan"]));
    assert!(
        got["document"].get("file_path").is_none(),
        "storage path must never reach the browser"
    );
    assert_eq!(got["subject"]["name"], "Biologi");
    assert_eq!(got["note"]["content_md"], "# Catatan 2");
    assert_eq!(got["note"]["edited"], 1);

    // ---- quizzes (seeded directly; generation needs the AI layer)
    let quiz = app
        .db
        .insert_id(
            "INSERT INTO quizzes(document_id, subject_id, title, difficulty, created_at) VALUES ($1, $2, 'Kuis 1', 'sedang', 2.0) RETURNING id",
            args![doc, subject_id],
        )
        .await
        .unwrap();
    let mut qids = Vec::new();
    for (pos, (qtype, question, options, answer)) in [
        (
            "mcq",
            "Ibu kota Prancis?",
            Some(json!(["Paris", "Roma", "Lima", "Oslo"])),
            "0",
        ),
        ("tf", "Matahari terbit di barat.", None, "false"),
        (
            "short",
            "Proses tumbuhan membuat makanan?",
            None,
            "Fotosintesis",
        ),
    ]
    .into_iter()
    .enumerate()
    {
        qids.push(
            app.db
                .insert_id(
                    "INSERT INTO questions(quiz_id, position, qtype, question, options, answer, keywords, topic) \
                     VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, 'Umum') RETURNING id",
                    args![quiz, pos as i64, qtype.to_owned(), question.to_owned(), options, answer.to_owned()],
                )
                .await
                .unwrap(),
        );
    }
    let quizzes = call(&app, "list_quizzes", json!({})).await;
    assert_eq!(quizzes["quizzes"][0]["question_count"], 3);

    assert_eq!(
        call_err(&app, "start_attempt", json!({"quiz_id": 999_999})).await,
        "Kuis tidak ditemukan."
    );
    call(
        &app,
        "start_attempt",
        json!({"quiz_id": quiz, "mode": "practice"}),
    )
    .await;
    let attempt = app
        .db
        .scalar_i64("SELECT MAX(id) FROM attempts", args![], 0)
        .await
        .unwrap();
    assert!(attempt > 0);

    let right = call(
        &app,
        "check_answer",
        json!({"attempt_id": attempt, "question_id": qids[0], "given": "0"}),
    )
    .await;
    assert_eq!(right["correct"], true, "{right}");
    assert_eq!(right["given_text"], "Paris");
    let wrong = call(
        &app,
        "check_answer",
        json!({"attempt_id": attempt, "question_id": qids[1], "given": "true"}),
    )
    .await;
    assert_eq!(wrong["correct"], false, "{wrong}");

    let finished = call(
        &app,
        "finish_attempt",
        json!({"attempt_id": attempt, "answers": {qids[2].to_string(): "fotosintesis"}}),
    )
    .await;
    assert!(finished.is_object());
    let row = app
        .db
        .row(
            "SELECT score, total, finished_at FROM attempts WHERE id = $1",
            args![attempt],
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(row["total"], 3);
    assert_eq!(
        row["score"], 2,
        "mcq and the short answer are right, the true/false is wrong"
    );
    assert!(row["finished_at"].is_number());
    // Finishing twice is harmless.
    call(&app, "finish_attempt", json!({"attempt_id": attempt})).await;
    assert_eq!(
        call_err(
            &app,
            "check_answer",
            json!({"attempt_id": attempt, "question_id": qids[0]})
        )
        .await,
        "Percobaan kuis sudah selesai atau tidak ditemukan."
    );

    // The missed question now feeds the review mode.
    call(&app, "start_review", json!({})).await;
    let review_mode = app
        .db
        .scalar(
            "SELECT mode FROM attempts ORDER BY id DESC LIMIT 1",
            args![],
        )
        .await
        .unwrap();
    assert_eq!(review_mode, Some(json!("review")));

    // ---- dashboards
    let dash = call(&app, "dashboard", json!({})).await;
    assert!(
        dash["streak"].is_object() && dash["heatmap"].is_array() || dash["heatmap"].is_object()
    );
    assert_eq!(dash["recent_docs"][0]["title"], "Fotosintesis 1");
    assert_eq!(dash["recent_attempts"].as_array().unwrap().len(), 1);
    assert_eq!(dash["weak_count"], 1);
    let progress = call(&app, "progress", json!({})).await;
    assert_eq!(
        progress["overall"]["attempts"], 1,
        "{}",
        progress["overall"]
    );
    assert_eq!(progress["documents"].as_array().unwrap().len(), 1);
    assert_eq!(progress["settings"]["daily_goal_min"], "15");

    // ---- deletes cascade
    call(&app, "delete_quiz", json!({"id": quiz})).await;
    assert_eq!(
        call(&app, "list_quizzes", json!({})).await["quizzes"],
        json!([])
    );
    call(&app, "delete_document", json!({"id": doc})).await;
    assert_eq!(
        call_err(&app, "get_document", json!({"id": doc})).await,
        "Dokumen tidak ditemukan."
    );
    call(&app, "delete_subject", json!({"id": subject_id})).await;

    drop(app);
    t.drop_db().await;
}
