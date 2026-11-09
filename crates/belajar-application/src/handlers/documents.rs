//! Documents (library), notes and study time. Upload and (re)processing live in `pipeline`.

use belajar_core::numeric::py_round;
use belajar_storage::{Row, args};
use serde_json::{Value, json};

use super::system::subject_exists;
use crate::app::App;
use crate::error::{AppError, HResult};
use crate::params::{clip, need_int, opt_int};
use crate::rowx::{json_of, str_of};
use crate::stats_queries;
use crate::util::now;

pub async fn doc_row(app: &App, id: i64) -> Result<Row, AppError> {
    app.db
        .row("SELECT * FROM documents WHERE id = $1", args![id])
        .await?
        .ok_or_else(|| AppError::user("Dokumen tidak ditemukan."))
}

/// Ids of the documents a request covers (`common.doc_ids`): the one document asked for (not
/// checked), else the `ready` documents of a subject, else every `ready` document.
pub async fn doc_ids(
    app: &App,
    document_id: Option<i64>,
    subject_id: Option<i64>,
) -> Result<Vec<i64>, AppError> {
    if let Some(id) = document_id {
        return Ok(vec![id]);
    }
    let rows = app
        .db
        .rows(
            "SELECT id FROM documents WHERE status = 'ready' AND ($1::bigint IS NULL OR subject_id = $1::bigint) \
             ORDER BY id",
            args![subject_id],
        )
        .await?;
    Ok(rows
        .iter()
        .filter_map(|r| crate::rowx::i64_of(r, "id"))
        .collect())
}

/// A document row for the browser: no storage path, JSON columns as arrays.
pub fn public_doc(mut row: Row) -> Value {
    row.remove("file_path");
    for key in ["key_concepts", "topics"] {
        let value = json_of(&row, key, json!([]));
        row.insert(key.to_owned(), value);
    }
    Value::Object(row)
}

pub async fn list_documents(app: &App, p: &Value) -> HResult {
    let subject_id = opt_int(p, "subject_id")?;
    let rows = app
        .db
        .rows(
            "SELECT d.id, d.subject_id, d.title, d.filename, d.size, d.status, d.error, d.warning, \
                    d.page_count, d.style, d.created_at, d.updated_at, \
                    s.name AS subject_name, s.color AS subject_color, \
                    (SELECT COUNT(*) FROM quizzes z WHERE z.document_id = d.id) AS quiz_count, \
                    (SELECT id FROM jobs j WHERE j.kind = 'process_document' AND j.ref_id = d.id ORDER BY j.id DESC LIMIT 1) AS job_id, \
                    (SELECT progress FROM jobs j WHERE j.kind = 'process_document' AND j.ref_id = d.id ORDER BY j.id DESC LIMIT 1) AS job_progress, \
                    (SELECT message FROM jobs j WHERE j.kind = 'process_document' AND j.ref_id = d.id ORDER BY j.id DESC LIMIT 1) AS job_message \
             FROM documents d LEFT JOIN subjects s ON s.id = d.subject_id \
             WHERE ($1::bigint IS NULL OR d.subject_id = $1::bigint) \
             ORDER BY d.created_at DESC",
            args![subject_id],
        )
        .await?;
    Ok(json!({"documents": rows}))
}

pub async fn get_document(app: &App, p: &Value) -> HResult {
    let id = need_int(p, "id", None, None)?;
    let doc = doc_row(app, id).await?;
    let subject = match doc.get("subject_id").and_then(Value::as_i64) {
        Some(sid) => {
            app.db
                .row(
                    "SELECT id, name, color FROM subjects WHERE id = $1",
                    args![sid],
                )
                .await?
        }
        None => None,
    };
    let note = app
        .db
        .row(
            "SELECT content_md, edited, version, updated_at FROM notes WHERE document_id = $1",
            args![id],
        )
        .await?;
    let mut quizzes = app
        .db
        .rows(
            "SELECT z.id, z.title, z.difficulty, z.created_at, \
                    (SELECT COUNT(*) FROM questions q WHERE q.quiz_id = z.id) AS question_count, \
                    (SELECT COUNT(*) FROM attempts t WHERE t.quiz_id = z.id AND t.finished_at IS NOT NULL) AS attempt_count, \
                    (SELECT MAX(100.0::float8 * t.score / t.total) FROM attempts t \
                      WHERE t.quiz_id = z.id AND t.finished_at IS NOT NULL AND t.total > 0) AS best_pct, \
                    (SELECT 100.0::float8 * t.score / t.total FROM attempts t \
                      WHERE t.quiz_id = z.id AND t.finished_at IS NOT NULL AND t.total > 0 \
                      ORDER BY t.finished_at DESC LIMIT 1) AS last_pct \
             FROM quizzes z WHERE z.document_id = $1 ORDER BY z.created_at DESC",
            args![id],
        )
        .await?;
    for quiz in &mut quizzes {
        for key in ["best_pct", "last_pct"] {
            if let Some(v) = quiz.get(key).and_then(Value::as_f64) {
                quiz.insert(key.to_owned(), json!(py_round(v)));
            }
        }
    }
    let job = app
        .db
        .row(
            "SELECT id, status, progress, message, error FROM jobs WHERE kind = 'process_document' AND ref_id = $1 \
             ORDER BY id DESC LIMIT 1",
            args![id],
        )
        .await?;
    Ok(
        json!({"document": public_doc(doc), "subject": subject, "note": note, "quizzes": quizzes, "job": job}),
    )
}

pub async fn update_document(app: &App, p: &Value) -> HResult {
    let id = need_int(p, "id", None, None)?;
    doc_row(app, id).await?;
    if p.get("title").is_some() {
        let title = clip(p.get("title"), 120);
        if title.is_empty() {
            return Err(AppError::user("Judul tidak boleh kosong."));
        }
        app.db
            .run(
                "UPDATE documents SET title = $1, title_locked = 1, updated_at = $2 WHERE id = $3",
                args![title, now(), id],
            )
            .await?;
    }
    if p.get("subject_id").is_some() {
        let sid = opt_int(p, "subject_id")?;
        if let Some(sid) = sid
            && !subject_exists(app, sid).await?
        {
            return Err(AppError::user("Mata pelajaran tidak ditemukan."));
        }
        app.db
            .run(
                "UPDATE documents SET subject_id = $1, updated_at = $2 WHERE id = $3",
                args![sid, now(), id],
            )
            .await?;
    }
    Ok(json!({}))
}

pub async fn delete_document(app: &App, p: &Value) -> HResult {
    let id = need_int(p, "id", None, None)?;
    let doc = doc_row(app, id).await?;
    app.db
        .run("DELETE FROM documents WHERE id = $1", args![id])
        .await?;
    if let Some(path) = str_of(&doc, "file_path").filter(|s| !s.is_empty()) {
        // Best effort, like the legacy `unlink` in a try/except.
        let _ = tokio::fs::remove_file(app.cfg.files_dir.join(path)).await;
    }
    Ok(json!({}))
}

pub async fn save_note(app: &App, p: &Value) -> HResult {
    let id = need_int(p, "document_id", None, None)?;
    doc_row(app, id).await?;
    let content = match p.get("content_md") {
        Some(Value::String(s)) => s.clone(),
        Some(v) if crate::params::truthy(Some(v)) => crate::params::py_str(v),
        _ => String::new(),
    };
    if content.chars().count() > 600_000 {
        return Err(AppError::user("Catatan terlalu panjang."));
    }
    app.db
        .run(
            "INSERT INTO notes(document_id, content_md, edited, version, updated_at) VALUES ($1, $2, 1, 1, $3) \
             ON CONFLICT (document_id) DO UPDATE SET content_md = EXCLUDED.content_md, edited = 1, updated_at = EXCLUDED.updated_at",
            args![id, content, now()],
        )
        .await?;
    Ok(json!({}))
}

pub async fn log_study(app: &App, p: &Value) -> HResult {
    let seconds = need_int(p, "seconds", None, None)?.clamp(1, 120);
    let mut doc_id = opt_int(p, "document_id")?;
    if let Some(id) = doc_id
        && app
            .db
            .row("SELECT id FROM documents WHERE id = $1", args![id])
            .await?
            .is_none()
    {
        doc_id = None;
    }
    stats_queries::log_event(app, "read", doc_id, seconds, 0).await?;
    Ok(json!({"streak": stats_queries::streak_info(app).await?}))
}
