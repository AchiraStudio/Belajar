//! User-editable settings (`settings` table) with the legacy defaults.

use stuby_storage::{Db, args};
use serde_json::{Map, Value};

use crate::config::DEFAULT_SETTINGS;
use crate::error::AppError;

/// A setting's stored value, else `default`, else the legacy default for that key.
pub async fn get(db: &Db, key: &str, default: Option<&str>) -> Result<Option<String>, AppError> {
    let row = db
        .row("SELECT value FROM settings WHERE key = $1", args![key])
        .await?;
    if let Some(value) = row.and_then(|r| r.get("value").and_then(Value::as_str).map(str::to_owned))
    {
        return Ok(Some(value));
    }
    if let Some(d) = default {
        return Ok(Some(d.to_owned()));
    }
    Ok(DEFAULT_SETTINGS
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, v)| (*v).to_owned()))
}

pub async fn set(db: &Db, key: &str, value: &str) -> Result<(), AppError> {
    db.run(
        "INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value",
        args![key, value],
    )
    .await?;
    Ok(())
}

/// Defaults overlaid with whatever is stored.
pub async fn all(db: &Db) -> Result<Map<String, Value>, AppError> {
    let mut out: Map<String, Value> = DEFAULT_SETTINGS
        .iter()
        .map(|(k, v)| ((*k).to_owned(), Value::from(*v)))
        .collect();
    for row in db.rows("SELECT key, value FROM settings", args![]).await? {
        if let Some(key) = row.get("key").and_then(Value::as_str) {
            out.insert(
                key.to_owned(),
                row.get("value").cloned().unwrap_or(Value::Null),
            );
        }
    }
    Ok(out)
}
