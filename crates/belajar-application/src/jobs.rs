//! Background jobs (document processing, quiz generation, grading, ...), tracked in the `jobs`
//! table so the browser can poll them (`get_job`). Port of the legacy `jobs.py`.

use std::future::Future;

use belajar_storage::{Db, args};
use serde_json::{Value, json};

use crate::app::App;
use crate::error::{AppError, HResult};
use crate::util::now;

/// Handed to a running job so it can report progress.
#[derive(Clone)]
pub struct JobCtx {
    db: Db,
    pub id: i64,
}

impl JobCtx {
    /// Update progress (clamped to 0..=100) and/or the status message (max 300 characters).
    pub async fn update(&self, progress: Option<f64>, message: Option<&str>) {
        let result = self
            .db
            .run(
                "UPDATE jobs SET updated_at = $1, \
                   progress = COALESCE($2::float8, progress), \
                   message = COALESCE($3::text, message) WHERE id = $4",
                args![
                    now(),
                    progress.map(|p| p.clamp(0.0, 100.0)),
                    message.map(|m| m.chars().take(300).collect::<String>()),
                    self.id
                ],
            )
            .await;
        if let Err(e) = result {
            tracing::warn!(job = self.id, error = %e, "could not update job progress");
        }
    }
}

/// Queue a job and run it in the background (bounded by `job_workers`). Returns the job id.
pub async fn start<F, Fut>(
    app: &App,
    kind: &str,
    ref_id: Option<i64>,
    task: F,
) -> Result<i64, AppError>
where
    F: FnOnce(JobCtx) -> Fut + Send + 'static,
    Fut: Future<Output = HResult> + Send + 'static,
{
    let ts = now();
    let id = app
        .db
        .insert_id(
            "INSERT INTO jobs(kind, status, progress, message, ref_id, created_at, updated_at) \
             VALUES ($1, 'queued', 0, 'Menunggu giliran', $2, $3, $3) RETURNING id",
            args![kind, ref_id, ts],
        )
        .await?;

    let db = app.db.clone();
    let slots = app.job_slots.clone();
    let kind = kind.to_owned();
    tokio::spawn(async move {
        let _permit = slots.acquire_owned().await;
        let ctx = JobCtx { db: db.clone(), id };
        if let Err(e) = db
            .run("UPDATE jobs SET status = 'running', message = 'Memulai', updated_at = $1 WHERE id = $2", args![now(), id])
            .await
        {
            tracing::error!(job = id, error = %e, "could not mark job running");
        }
        // A panic inside the task must still end the job instead of leaving it 'running' forever.
        let outcome = tokio::spawn(task(ctx)).await;
        let finished = match outcome {
            Ok(Ok(result)) => {
                db.run(
                    "UPDATE jobs SET status = 'done', progress = 100, message = 'Selesai', result = $1, updated_at = $2 WHERE id = $3",
                    args![result, now(), id],
                )
                .await
            }
            Ok(Err(AppError::User(message))) => fail(&db, id, &message).await,
            Ok(Err(other)) => {
                tracing::error!(job = id, %kind, error = %other, "job failed");
                fail(&db, id, &format!("Kesalahan internal: {}", short_kind(&other))).await
            }
            Err(join) => {
                tracing::error!(job = id, %kind, error = %join, "job panicked");
                fail(&db, id, "Kesalahan internal: panic").await
            }
        };
        if let Err(e) = finished {
            tracing::error!(job = id, error = %e, "could not record job outcome");
        }
    });
    Ok(id)
}

fn short_kind(e: &AppError) -> &'static str {
    match e {
        AppError::Storage(_) => "StorageError",
        AppError::Internal(_) => "InternalError",
        AppError::UnknownAction(_) => "UnknownAction",
        AppError::User(_) => "UserError",
    }
}

async fn fail(db: &Db, id: i64, message: &str) -> Result<u64, belajar_storage::StorageError> {
    let short: String = message.chars().take(300).collect();
    let error: String = message.chars().take(500).collect();
    db.run(
        "UPDATE jobs SET status = 'failed', error = $1, message = $2, updated_at = $3 WHERE id = $4",
        args![error, short, now(), id],
    )
    .await
}

/// The job row as the frontend expects it (`result` defaults to `{}`).
pub async fn get(db: &Db, id: i64) -> Result<Option<Value>, AppError> {
    let Some(mut row) = db
        .row("SELECT * FROM jobs WHERE id = $1", args![id])
        .await?
    else {
        return Ok(None);
    };
    if row.get("result").is_none_or(Value::is_null) {
        row.insert("result".to_owned(), json!({}));
    }
    Ok(Some(Value::Object(row)))
}

/// Called once at startup: jobs that were queued or running when the process stopped cannot be
/// resumed, so they are marked failed and their documents are made retryable (legacy `jobs.recover`).
pub async fn recover(db: &Db) -> Result<(), AppError> {
    db.run(
        "UPDATE jobs SET status = 'failed', error = 'Server dihentikan saat memproses', message = 'Terputus' \
         WHERE status IN ('queued', 'running')",
        args![],
    )
    .await?;
    db.run(
        "UPDATE documents SET status = 'error', error = 'Pemrosesan terputus karena server berhenti. Tekan Coba lagi.' \
         WHERE status IN ('queued', 'processing')",
        args![],
    )
    .await?;
    db.run(
        "UPDATE attempts SET grading = 'done' WHERE grading = 'pending'",
        args![],
    )
    .await?;
    db.run(
        "UPDATE chat_sessions SET status = 'error' WHERE status = 'preparing'",
        args![],
    )
    .await?;
    Ok(())
}
