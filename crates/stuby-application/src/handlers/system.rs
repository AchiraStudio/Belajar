//! ping, get_job, settings and subjects (legacy `handlers.py` sections "umum" and "mata pelajaran").

use stuby_storage::args;
use serde_json::{Value, json};

use crate::app::App;
use crate::config::STYLES;
use crate::error::{AppError, HResult};
use crate::params::{clip, need_int, py_int_of_float};
use crate::rowx::str_of;
use crate::util::{now, random_below};
use crate::{jobs, settings};

pub async fn ping(app: &App, llm_configured: bool) -> HResult {
    Ok(json!({"version": app.cfg.version, "time": now(), "llm_configured": llm_configured}))
}

pub async fn get_job(app: &App, p: &Value) -> HResult {
    let id = need_int(p, "id", None, None)?;
    jobs::get(&app.db, id)
        .await?
        .ok_or_else(|| AppError::user("Job tidak ditemukan."))
}

pub async fn get_settings(app: &App) -> HResult {
    Ok(json!({"settings": settings::all(&app.db).await?, "timezone": app.cfg.tz.name()}))
}

/// Validate one setting; `None` means "invalid" (legacy: the rule raised ValueError/TypeError).
fn validated(key: &str, value: &Value) -> Option<String> {
    match key {
        "daily_goal_min" => Some(py_int_of_float(value)?.clamp(1, 600).to_string()),
        "weekly_goal_min" => Some(py_int_of_float(value)?.clamp(10, 3000).to_string()),
        "notes_style" => value
            .as_str()
            .filter(|v| STYLES.contains(v))
            .map(str::to_owned),
        "language" => value
            .as_str()
            .filter(|v| ["auto", "id", "en"].contains(v))
            .map(str::to_owned),
        _ => None,
    }
}

pub async fn save_settings(app: &App, p: &Value) -> HResult {
    let incoming = p.get("settings").and_then(Value::as_object);
    if let Some(incoming) = incoming {
        // Legacy order; earlier valid keys stay saved if a later one is rejected.
        for key in [
            "daily_goal_min",
            "weekly_goal_min",
            "notes_style",
            "language",
        ] {
            if let Some(value) = incoming.get(key) {
                let checked = validated(key, value)
                    .ok_or_else(|| AppError::user(format!("Nilai '{key}' tidak valid.")))?;
                settings::set(&app.db, key, &checked).await?;
            }
        }
    }
    Ok(json!({"settings": settings::all(&app.db).await?}))
}

// ---------------------------------------------------------------- subjects
const SUBJECT_COLORS: [&str; 6] = [
    "#4f7cac", "#c0793f", "#5e8c61", "#8a6bb1", "#b8566b", "#3f8f8f",
];

pub async fn list_subjects(app: &App) -> HResult {
    let rows = app
        .db
        .rows(
            "SELECT s.*, (SELECT COUNT(*) FROM documents d WHERE d.subject_id = s.id) AS doc_count \
             FROM subjects s ORDER BY lower(s.name)",
            args![],
        )
        .await?;
    Ok(json!({"subjects": rows}))
}

pub async fn create_subject(app: &App, p: &Value) -> HResult {
    let name = clip(p.get("name"), 60);
    if name.is_empty() {
        return Err(AppError::user("Nama mata pelajaran wajib diisi."));
    }
    let mut color = clip(p.get("color"), 9);
    if !(color.starts_with('#') && matches!(color.chars().count(), 4 | 7)) {
        color = SUBJECT_COLORS[random_below(SUBJECT_COLORS.len())].to_owned();
    }
    if let Some(existing) = app
        .db
        .row(
            "SELECT * FROM subjects WHERE lower(name) = lower($1)",
            args![name.clone()],
        )
        .await?
    {
        return Ok(json!({"subject": existing}));
    }
    let id = app
        .db
        .insert_id(
            "INSERT INTO subjects(name, color, created_at) VALUES ($1, $2, $3) RETURNING id",
            args![name, color, now()],
        )
        .await?;
    let subject = app
        .db
        .row("SELECT * FROM subjects WHERE id = $1", args![id])
        .await?;
    Ok(json!({"subject": subject}))
}

pub async fn delete_subject(app: &App, p: &Value) -> HResult {
    app.db
        .run(
            "DELETE FROM subjects WHERE id = $1",
            args![need_int(p, "id", None, None)?],
        )
        .await?;
    Ok(json!({}))
}

/// Used by upload: find or create a subject by name, returning its id.
pub async fn ensure_subject(app: &App, name: &str) -> Result<i64, AppError> {
    let created = create_subject(app, &json!({"name": name})).await?;
    created["subject"]["id"]
        .as_i64()
        .ok_or_else(|| AppError::internal("subject without id"))
}

/// Does a subject with this id exist?
pub async fn subject_exists(app: &App, id: i64) -> Result<bool, AppError> {
    Ok(app
        .db
        .row("SELECT id FROM subjects WHERE id = $1", args![id])
        .await?
        .is_some())
}

#[allow(dead_code)]
fn _assert_row_helpers_used(r: &stuby_storage::Row) -> Option<&str> {
    str_of(r, "name")
}
