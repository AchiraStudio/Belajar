//! Workflows that coordinate stored data with the AI: document processing, quiz generation,
//! grading, explanations. (Legacy `pipeline.py`.) AI-backed parts are filled in as the provider
//! layer lands; until then they fail with a clear message instead of silently doing nothing.

use stuby_core::grading;
use stuby_storage::args;
use serde_json::{Value, json};

use crate::app::App;
use crate::error::{AppError, HResult};
use crate::handlers::quizzes;
use crate::jobs::JobCtx;
use crate::rowx::{i64_of, str_of, string_list};

pub const AI_UNAVAILABLE: &str = "Layanan AI belum dikonfigurasi di server ini.";

/// Grade the free-text answers of a finished attempt that the local rules could not decide
/// (legacy `grade_attempt_job`). Without an AI grader it falls back to fuzzy matching, which is what
/// the legacy code does when the AI call fails.
pub async fn grade_attempt_job(app: &App, ctx: JobCtx, attempt_id: i64) -> HResult {
    ctx.update(Some(10.0), Some("Menilai jawaban isian")).await;
    let pending = app
        .db
        .rows(
            "SELECT a.id, a.question_id, a.given FROM answers a \
             WHERE a.attempt_id = $1 AND a.correct IS NULL AND a.given IS NOT NULL AND a.given <> ''",
            args![attempt_id],
        )
        .await?;
    let qids: Vec<i64> = pending
        .iter()
        .filter_map(|a| i64_of(a, "question_id"))
        .collect();
    let questions = quizzes::questions_by_ids(app, &qids).await?;

    for a in &pending {
        let (Some(answer_id), Some(qid)) = (i64_of(a, "id"), i64_of(a, "question_id")) else {
            continue;
        };
        let Some(q) = questions.iter().find(|q| i64_of(q, "id") == Some(qid)) else {
            continue;
        };
        let ok = grading::fuzzy_fallback(
            str_of(a, "given").unwrap_or(""),
            str_of(q, "answer").unwrap_or(""),
            &string_list(q, "keywords"),
        );
        app.db
            .run(
                "UPDATE answers SET correct = $1, feedback = $2, graded_by = 'fuzzy' WHERE id = $3",
                args![i64::from(ok), "Dinilai otomatis tanpa AI.", answer_id],
            )
            .await?;
    }
    app.db
        .run("UPDATE answers SET correct = 0, graded_by = 'skip' WHERE attempt_id = $1 AND correct IS NULL", args![attempt_id])
        .await?;
    quizzes::recompute_score(app, attempt_id).await?;
    app.db
        .run(
            "UPDATE attempts SET grading = 'done' WHERE id = $1",
            args![attempt_id],
        )
        .await?;
    Ok(json!({"graded": pending.len(), "source": "fuzzy"}))
}

/// Placeholder for AI-backed actions that are not wired yet.
pub fn ai_unavailable() -> AppError {
    AppError::user(AI_UNAVAILABLE)
}

#[allow(dead_code)]
fn _unused(_: Value) {}
