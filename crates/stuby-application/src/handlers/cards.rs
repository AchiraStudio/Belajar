//! Spaced-repetition flashcards (legacy `cards.py`).

use stuby_core::cards::{ExportRow, export_text};
use stuby_core::spaced_repetition::{CardState, sm2};
use stuby_storage::args;
use serde_json::{Value, json};

use super::concepts::concept_rows;
use super::documents::doc_ids;
use crate::app::App;
use crate::error::{AppError, HResult};
use crate::params::{clamp, need_int, opt_int};
use crate::rowx::{f64_of, i64_of, str_of};
use crate::util::now;
use crate::{profile, stats_queries};

/// A card is "learning" until its interval reaches this many days, then "mature".
const MATURE_INTERVAL: i64 = 21;
/// Concepts turned into cards per query (legacy `collect_cards`).
const COLLECT_BATCH: usize = 60;

/// Card totals shown next to every cards response.
pub async fn card_counts(app: &App) -> Result<Value, AppError> {
    let today = stats_queries::today(app).to_string();
    let row = app
        .db
        .row(
            "SELECT COUNT(*)::bigint AS total, \
                    (COUNT(*) FILTER (WHERE due_day <= $1))::bigint AS due, \
                    (COUNT(*) FILTER (WHERE reps = 0))::bigint AS new, \
                    (COUNT(*) FILTER (WHERE reps > 0 AND interval < $2))::bigint AS learning, \
                    (COUNT(*) FILTER (WHERE interval >= $2))::bigint AS mature \
             FROM cards",
            args![today, MATURE_INTERVAL],
        )
        .await?
        .ok_or_else(|| AppError::internal("COUNT returned no row"))?;
    Ok(Value::Object(row))
}

/// Create cards from concepts without ever duplicating one. Returns how many are new.
async fn collect_cards(app: &App, concept_ids: &[i64]) -> Result<u64, AppError> {
    let mut added = 0;
    for batch in concept_ids.chunks(COLLECT_BATCH) {
        let ids: Vec<i64> = batch.iter().copied().filter(|id| *id > 0).collect();
        if ids.is_empty() {
            continue;
        }
        let concepts = app
            .db
            .rows(
                "SELECT document_id, term, definition FROM concepts WHERE id = ANY($1) ORDER BY id",
                args![ids],
            )
            .await?;
        let today = stats_queries::today(app).to_string();
        let mut tx = app.db.begin().await?;
        for c in &concepts {
            added += tx
                .run(
                    "INSERT INTO cards(document_id, front, back, due_day, created_at) VALUES ($1, $2, $3, $4, $5) \
                     ON CONFLICT (document_id, front) DO NOTHING",
                    args![
                        i64_of(c, "document_id"),
                        str_of(c, "term").unwrap_or("").to_owned(),
                        str_of(c, "definition").unwrap_or("").to_owned(),
                        today.clone(),
                        now()
                    ],
                )
                .await?;
        }
        tx.commit().await?;
    }
    Ok(added)
}

pub async fn cards_due(app: &App, p: &Value) -> HResult {
    let limit = clamp(p.get("limit"), 1, 100, 20);
    let doc_id = opt_int(p, "document_id")?;
    let today = stats_queries::today(app).to_string();
    let cards = app
        .db
        .rows(
            "SELECT c.id, c.front, c.back, c.reps, c.interval, d.title AS doc_title FROM cards c \
             JOIN documents d ON d.id = c.document_id \
             WHERE c.due_day <= $1 AND ($2::bigint IS NULL OR c.document_id = $2::bigint) \
             ORDER BY c.due_day, c.id LIMIT $3",
            args![today, doc_id, limit],
        )
        .await?;
    Ok(json!({"cards": cards, "counts": card_counts(app).await?}))
}

pub async fn cards_review(app: &App, p: &Value) -> HResult {
    let id = need_int(p, "id", None, None)?;
    let card = app
        .db
        .row("SELECT * FROM cards WHERE id = $1", args![id])
        .await?
        .ok_or_else(|| AppError::user("Kartu tidak ditemukan."))?;
    let grade = need_int(p, "grade", Some(1), Some(5))?;

    let before = CardState {
        ease: f64_of(&card, "ease").unwrap_or(2.5),
        interval: i64_of(&card, "interval").unwrap_or(0),
        reps: i64_of(&card, "reps").unwrap_or(0),
        lapses: i64_of(&card, "lapses").unwrap_or(0),
    };
    let review = sm2(before, grade, stats_queries::today(app));
    let due_day = review.due_day.to_string();
    app.db
        .run(
            "UPDATE cards SET ease = $1, interval = $2, reps = $3, lapses = $4, due_day = $5, last_review = $6 \
             WHERE id = $7",
            args![
                review.state.ease,
                review.state.interval,
                review.state.reps,
                review.state.lapses,
                due_day.clone(),
                now(),
                id
            ],
        )
        .await?;
    stats_queries::log_event(
        app,
        "cards",
        i64_of(&card, "document_id"),
        clamp(p.get("seconds"), 1, 90, 10),
        0,
    )
    .await?;
    Ok(json!({
        "ease": review.state.ease,
        "interval": review.state.interval,
        "reps": review.state.reps,
        "lapses": review.state.lapses,
        "due_day": due_day,
        "counts": card_counts(app).await?,
    }))
}

pub async fn cards_build(app: &App, p: &Value) -> HResult {
    let ids = doc_ids(app, opt_int(p, "document_id")?, opt_int(p, "subject_id")?).await?;
    let concept_ids: Vec<i64> = concept_rows(app, &ids)
        .await?
        .iter()
        .filter_map(|c| i64_of(c, "id"))
        .collect();
    let added = collect_cards(app, &concept_ids).await?;
    // Badges must never make building cards fail.
    let achievements = match profile::unlock_achievements(app).await {
        Ok(fresh) => fresh,
        Err(e) => {
            tracing::warn!(error = %e, "could not update achievements");
            Vec::new()
        }
    };
    Ok(json!({"added": added, "counts": card_counts(app).await?, "achievements": achievements}))
}

pub async fn cards_stats(app: &App) -> HResult {
    let today = stats_queries::today(app).to_string();
    // COLLATE "C" = SQLite's default byte-wise ordering, so titles sort exactly as before.
    let documents = app
        .db
        .rows(
            "SELECT d.id, d.title, COUNT(c.id)::bigint AS n, \
                    COALESCE(SUM(CASE WHEN c.due_day <= $1 THEN 1 ELSE 0 END), 0)::bigint AS due \
             FROM documents d JOIN cards c ON c.document_id = d.id \
             GROUP BY d.id ORDER BY d.title COLLATE \"C\", d.id",
            args![today],
        )
        .await?;
    Ok(json!({"counts": card_counts(app).await?, "documents": documents}))
}

pub async fn cards_export(app: &App) -> HResult {
    let rows = app
        .db
        .rows(
            "SELECT c.front, c.back, d.title FROM cards c JOIN documents d ON d.id = c.document_id ORDER BY c.id",
            args![],
        )
        .await?;
    let export: Vec<ExportRow> = rows
        .iter()
        .map(|r| ExportRow {
            front: str_of(r, "front").unwrap_or("").to_owned(),
            back: str_of(r, "back").unwrap_or("").to_owned(),
            title: str_of(r, "title").unwrap_or("").to_owned(),
        })
        .collect();
    Ok(json!({"text": export_text(&export), "count": export.len()}))
}
