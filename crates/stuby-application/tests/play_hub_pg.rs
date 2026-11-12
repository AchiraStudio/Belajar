//! `play_hub`, the batched concept seeding and the concurrent dashboard against a real PostgreSQL
//! (`#[ignore]`d so a plain `cargo test` needs no database):
//!
//!   cargo run -p stuby-devdb
//!   TEST_DATABASE_ADMIN_URL=... cargo test -p stuby-application -- --include-ignored

use stuby_application::{App, AppConfig, dispatch};
use stuby_storage::testing::{TestDb, fresh_db};
use stuby_storage::{Db, args, ensure_owner};
use serde_json::{Value, json};

async fn app_for(t: &TestDb) -> App {
    let owner = ensure_owner(t.app.clone()).await.expect("owner");
    let db = Db::connect(t.app.clone(), owner, 6).await.expect("connect");
    App::new(db, AppConfig::default())
}

async fn call(app: &App, action: &str, params: Value) -> Value {
    dispatch(app, action, &params, None)
        .await
        .unwrap_or_else(|e| panic!("{action} failed: {e}"))
}

async fn seed_document(app: &App, title: &str, status: &str, concepts: Value) -> i64 {
    app.db
        .insert_id(
            "INSERT INTO documents(title, filename, status, key_concepts, topics, created_at, updated_at) \
             VALUES ($1, 'f.pdf', $2, $3, '[]'::jsonb, 1.0, 1.0) RETURNING id",
            args![title.to_owned(), status.to_owned(), concepts],
        )
        .await
        .expect("insert document")
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn empty_hub_has_modes_quests_and_locked_badges() {
    let t = fresh_db().await;
    let app = app_for(&t).await;

    let hub = call(&app, "play_hub", json!({})).await;
    assert_eq!(hub["modes"].as_array().unwrap().len(), 6);
    assert_eq!(
        hub["profile"],
        json!({"level": 1, "xp": 0, "level_start": 0, "next": 100})
    );
    assert_eq!(hub["quests"].as_array().unwrap().len(), 3);
    assert!(
        hub["quests"]
            .as_array()
            .unwrap()
            .iter()
            .all(|q| q["done"] == json!(false))
    );
    assert_eq!(hub["documents"], json!([]));
    assert_eq!(hub["weak"], json!([]));
    assert_eq!(hub["active"], Value::Null);
    assert_eq!(hub["cards"]["total"], json!(0));
    let badges = hub["achievements"].as_array().unwrap();
    assert_eq!(badges.len(), 9);
    assert!(
        badges
            .iter()
            .all(|b| b["unlocked"] == json!(false) && b["at"].is_null())
    );
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn hub_reports_documents_levels_weak_concepts_and_the_active_run() {
    let t = fresh_db().await;
    let app = app_for(&t).await;

    // A repeated term in `key_concepts` must not break the batched insert or duplicate a row.
    let doc = seed_document(
        &app,
        "Biologi",
        "ready",
        json!([
            {"term": "Mitokondria", "definition": "Pembangkit energi sel."},
            {"term": "Ribosom", "definition": "Tempat sintesis protein."},
            {"term": "Nukleus", "definition": "Pusat kendali sel."},
            {"term": "Ribosom", "definition": "Duplikat yang harus diabaikan."},
            {"term": "x", "definition": "terlalu pendek istilahnya"}
        ]),
    )
    .await;
    // Not ready: excluded from the hub.
    seed_document(&app, "Antre", "queued", json!([])).await;

    let hub = call(&app, "play_hub", json!({})).await;
    let docs = hub["documents"].as_array().unwrap();
    assert_eq!(docs.len(), 1);
    assert_eq!(docs[0]["title"], "Biologi");
    assert_eq!(
        docs[0]["concepts"],
        json!(3),
        "seeded once; duplicate and too-short terms skipped"
    );
    assert_eq!(
        hub["levels"],
        json!({"baru": 3, "dikenal": 0, "paham": 0, "kuasai": 0})
    );

    // Seeding is idempotent: another hub call changes nothing.
    let again = call(&app, "play_hub", json!({})).await;
    assert_eq!(again["documents"][0]["concepts"], json!(3));

    // Practise two concepts: one weak (30), one fine (80). Build cards so one more becomes "due".
    let ids: Vec<(i64, String)> = app
        .db
        .rows(
            "SELECT id, term FROM concepts WHERE document_id = $1 ORDER BY id",
            args![doc],
        )
        .await
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["id"].as_i64().unwrap(),
                r["term"].as_str().unwrap().to_owned(),
            )
        })
        .collect();
    let by_term = |term: &str| ids.iter().find(|(_, t)| t == term).unwrap().0;
    for (term, score, evidence) in [("Mitokondria", 30.0, 2), ("Ribosom", 80.0, 3)] {
        app.db
            .run(
                "INSERT INTO mastery(concept_id, score, evidence_n, kinds) VALUES ($1, $2, $3, '[\"explain\"]'::jsonb)",
                args![by_term(term), score, evidence],
            )
            .await
            .unwrap();
    }
    call(&app, "cards_build", json!({"document_id": doc})).await;
    // Every new card is due today, so all three concepts are "weak by due"; the practised weak
    // one has the lowest score, the unpractised ones score 0 and keep their id order.
    let hub = call(&app, "play_hub", json!({})).await;
    assert_eq!(
        hub["levels"],
        json!({"baru": 1, "dikenal": 1, "paham": 1, "kuasai": 0})
    );
    let weak: Vec<&str> = hub["weak"]
        .as_array()
        .unwrap()
        .iter()
        .map(|w| w["term"].as_str().unwrap())
        .collect();
    assert_eq!(weak, ["Nukleus", "Mitokondria", "Ribosom"]);
    assert_eq!(hub["weak"][1]["score"], json!(30));
    assert_eq!(hub["cards"]["due"], json!(3));

    // XP and an unfinished run.
    app.db
        .run("INSERT INTO player(xp) VALUES (120)", args![])
        .await
        .unwrap();
    app.db
        .run(
            "INSERT INTO game_runs(game, scope_kind, scope_id, options, state, turn_count, max_turns, started_at, updated_at) \
             VALUES ('kilat', 'document', $1, '{\"tingkat\":\"sedang\"}'::jsonb, '{\"combo\":2}'::jsonb, 3, 10, 5.0, 6.0)",
            args![doc],
        )
        .await
        .unwrap();
    let hub = call(&app, "play_hub", json!({})).await;
    assert_eq!(hub["profile"]["level"], json!(2));
    assert_eq!(hub["profile"]["xp"], json!(120));
    let run = &hub["active"];
    assert_eq!(run["game"], "kilat");
    assert_eq!(run["title"], "Kilat");
    assert_eq!(run["scope_title"], "Biologi");
    assert_eq!(run["turn_count"], json!(3));
    assert_eq!(run["state"], json!({"combo": 2}));
    assert_eq!(run["options"], json!({"tingkat": "sedang"}));
}

#[tokio::test]
#[ignore = "needs Postgres: cargo run -p stuby-devdb"]
async fn dashboard_and_progress_agree_and_streak_only_is_light() {
    let t = fresh_db().await;
    let app = app_for(&t).await;
    seed_document(&app, "Satu", "ready", json!([])).await;
    call(
        &app,
        "log_study",
        json!({"document_id": null, "seconds": 100}),
    )
    .await;

    let dash = call(&app, "dashboard", json!({})).await;
    let prog = call(&app, "progress", json!({})).await;
    assert_eq!(dash["streak"], prog["streak"]);
    assert_eq!(dash["overall"], prog["overall"]);
    assert_eq!(dash["weekly"], prog["weekly"]);
    assert_eq!(dash["overall"]["documents"], json!(1));
    assert_eq!(dash["overall"]["study_seconds"], json!(100));
    assert_eq!(dash["heatmap"].as_array().unwrap().len(), 140);
    assert_eq!(prog["study_days"].as_array().unwrap().len(), 14);

    let light = call(&app, "dashboard", json!({"streak_only": true})).await;
    assert_eq!(light["streak"], dash["streak"]);
    assert_eq!(light.as_object().unwrap().len(), 1);
}
