//! The on-device SQLite backend (offline desktop and Android).
//!
//! The application layer writes its SQL once, in the Postgres dialect. For SQLite the text is
//! translated here, just before it runs:
//!
//! * `$1` becomes `?1`;
//! * Postgres casts (`$1::bigint`, `x::float8`, `'[]'::jsonb`) are dropped (SQLite is dynamically typed);
//! * `= ANY($1)` becomes `IN (SELECT value FROM json_each(?1))` (array arguments are bound as JSON);
//! * `ILIKE` becomes `LIKE` (case-insensitive for ASCII in SQLite) and `COLLATE "C"` becomes `BINARY`.
//!
//! Row-level security does not exist here: the file belongs to one person, and every `user_id`
//! column defaults to [`LOCAL_OWNER`].

use std::path::Path;
use std::str::FromStr;
use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use serde_json::{Map, Value};
use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteRow,
    SqliteSynchronous,
};
use sqlx::{AssertSqlSafe, Column as _, Row as _, SqliteConnection, SqlSafeStr, TypeInfo as _, ValueRef as _};
use uuid::Uuid;

use crate::db::{Arg, Row, StorageError};

/// The one owner of an on-device database. Every `user_id` column defaults to this value.
pub const LOCAL_OWNER: Uuid = Uuid::from_u128(1);

/// Columns that Postgres stores as `jsonb`. SQLite keeps them as text, so they are parsed on read
/// to give the API the same shapes in both backends. (`answer` is deliberately absent: it is plain
/// text in `questions` and JSON only in `game_turns`.)
const JSON_COLUMNS: &[&str] = &[
    "key_concepts",
    "topics",
    "options",
    "keywords",
    "question_ids",
    "result",
    "state",
    "concept_ids",
    "public",
    "secret",
    "judgement",
    "kinds",
    "tree",
];

static ANY_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"=\s*ANY\(\s*\$(\d+)\s*\)").expect("valid regex"));
static CAST_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"::[A-Za-z_][A-Za-z0-9_]*(\[\])?").expect("valid regex"));
static PARAM_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\$(\d+)").expect("valid regex"));
static LIMIT_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b(LIMIT|OFFSET)\s+\$(\d+)").expect("valid regex"));
static ILIKE_RE:LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\bILIKE\b").expect("valid regex"));

/// Postgres-dialect SQL to SQLite-dialect SQL.
#[must_use]
pub fn translate(sql: &str) -> String {
    // `LIMIT NULL` means "no limit" in Postgres; SQLite wants -1 (and 0 for a missing OFFSET).
    let s = LIMIT_RE.replace_all(sql, |c: &regex::Captures| {
        let none = if &c[1] == "LIMIT" { "-1" } else { "0" };
        format!("{} COALESCE(${}, {none})", &c[1], &c[2])
    });
    let s = ANY_RE.replace_all(&s, "IN (SELECT value FROM json_each(?$1))");
    let s = CAST_RE.replace_all(&s, "");
    let s = PARAM_RE.replace_all(&s, "?$1");
    let s = ILIKE_RE.replace_all(&s, "LIKE");
    s.replace("COLLATE \"C\"", "COLLATE BINARY")
}

/// Statements the on-device database cannot run (community features need a shared server).
fn unsupported(sql: &str) -> bool {
    sql.contains("current_setting(") || sql.contains("jsonb_array_elements_text")
}

type Q<'q> = sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments>;

fn bind_all<'q>(mut q: Q<'q>, args: &'q [Arg]) -> Q<'q> {
    for a in args {
        q = match a {
            Arg::Int(v) => q.bind(*v),
            Arg::Float(v) => q.bind(*v),
            Arg::Text(v) => q.bind(v.clone()),
            Arg::Bool(v) => q.bind(*v),
            Arg::Json(v) => q.bind(v.as_ref().map(Value::to_string)),
            Arg::Ints(v) => q.bind(serde_json::to_string(v).unwrap_or_else(|_| "[]".into())),
            Arg::Texts(v) => q.bind(serde_json::to_string(v).unwrap_or_else(|_| "[]".into())),
        };
    }
    q
}

fn row_to_map(row: &SqliteRow) -> Result<Row, StorageError> {
    let mut out = Map::with_capacity(row.columns().len());
    for (i, col) in row.columns().iter().enumerate() {
        // Internal owner column: never exposed (same rule as the Postgres backend).
        if col.name() == "user_id" {
            continue;
        }
        let raw = row.try_get_raw(i)?;
        let value = if raw.is_null() {
            Value::Null
        } else {
            let kind = raw.type_info().name().to_ascii_uppercase();
            match kind.as_str() {
                "INTEGER" | "INT4" | "BOOLEAN" => {
                    Value::from(row.try_get::<i64, _>(i)?)
                }
                "REAL" | "NUMERIC" => {
                    let f = row.try_get::<f64, _>(i)?;
                    serde_json::Number::from_f64(f).map_or(Value::Null, Value::Number)
                }
                "BLOB" => Value::Null,
                _ => {
                    let text = row.try_get::<String, _>(i)?;
                    if JSON_COLUMNS.contains(&col.name()) {
                        serde_json::from_str(&text).unwrap_or(Value::String(text))
                    } else {
                        Value::String(text)
                    }
                }
            }
        };
        out.insert(col.name().to_owned(), value);
    }
    Ok(out)
}

pub(crate) async fn rows(
    conn: &mut SqliteConnection,
    sql: impl SqlSafeStr,
    args: &[Arg],
) -> Result<Vec<Row>, StorageError> {
    let sql = sql.into_sql_str();
    if unsupported(sql.as_str()) {
        return Err(needs_server());
    }
    let text = translate(sql.as_str());
    let found = bind_all(sqlx::query(AssertSqlSafe(text)), args)
        .fetch_all(conn)
        .await?;
    found.iter().map(row_to_map).collect()
}

pub(crate) async fn run(
    conn: &mut SqliteConnection,
    sql: impl SqlSafeStr,
    args: &[Arg],
) -> Result<u64, StorageError> {
    let sql = sql.into_sql_str();
    if unsupported(sql.as_str()) {
        return Err(needs_server());
    }
    let text = translate(sql.as_str());
    Ok(bind_all(sqlx::query(AssertSqlSafe(text)), args)
        .execute(conn)
        .await?
        .rows_affected())
}

fn needs_server() -> StorageError {
    StorageError::Other("Fitur ini membutuhkan server Stuby (tidak tersedia secara offline).".into())
}

/// Opens (creating if needed) the database file, applies the on-device migrations, and makes sure
/// the single owner row exists.
pub async fn open(path: &Path) -> Result<SqlitePool, StorageError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| StorageError::Other(e.to_string()))?;
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(10));
    connect(options).await
}

/// A throw-away in-memory database (tests). One connection only: every connection to
/// `:memory:` would otherwise be its own empty database.
pub async fn open_memory() -> Result<SqlitePool, StorageError> {
    let options = SqliteConnectOptions::from_str("sqlite::memory:")?.foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    prepare(&pool).await?;
    Ok(pool)
}

async fn connect(options: SqliteConnectOptions) -> Result<SqlitePool, StorageError> {
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;
    prepare(&pool).await?;
    Ok(pool)
}

async fn prepare(pool: &SqlitePool) -> Result<(), StorageError> {
    sqlx::migrate!("./migrations_sqlite").run(pool).await?;
    sqlx::query("INSERT OR IGNORE INTO app_users(id, label, role, is_admin) VALUES (?1, 'owner', 'admin', 1)")
        .bind(LOCAL_OWNER.to_string())
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translates_the_postgres_dialect() {
        assert_eq!(
            translate("SELECT * FROM cards WHERE id = ANY($1) AND x = $2::bigint"),
            "SELECT * FROM cards WHERE id IN (SELECT value FROM json_each(?1)) AND x = ?2"
        );
        assert_eq!(
            translate("SELECT COUNT(*)::bigint, 100.0::float8 * a FROM t ORDER BY n COLLATE \"C\""),
            "SELECT COUNT(*), 100.0 * a FROM t ORDER BY n COLLATE BINARY"
        );
        assert_eq!(translate("a ILIKE $1"), "a LIKE ?1");
        assert_eq!(
            translate("SELECT 1 LIMIT $2::bigint OFFSET $3"),
            "SELECT 1 LIMIT COALESCE(?2, -1) OFFSET COALESCE(?3, 0)"
        );
    }

    #[test]
    fn flags_server_only_statements() {
        assert!(unsupported("SELECT NULLIF(current_setting('app.user_id', true), '')"));
        assert!(!unsupported("SELECT * FROM cards"));
    }
}
