use std::time::Duration;

use serde_json::{Map, Number, Value};
use sqlx::postgres::{PgArguments, PgConnectOptions, PgPoolOptions, PgRow};
use sqlx::sqlite::SqlitePool;
use sqlx::query::Query;
use sqlx::{
    Column, Connection as _, PgConnection, PgPool, Postgres, Row as _, SqlSafeStr, TypeInfo,
};
use uuid::Uuid;

/// One result row as a JSON object (column name -> value), like `dict(sqlite3.Row)` in the legacy code.
pub type Row = Map<String, Value>;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("database error: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("migration error: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),
    #[error("{0}")]
    Other(String),
}

/// A bound query parameter.
///
/// SQL text must be a `&'static str` (sqlx 0.9 rejects other strings to prevent injection); the one
/// legitimate exception, DDL built from a vetted identifier, must be wrapped in `sqlx::AssertSqlSafe`. Nulls are typed because Postgres needs the parameter type up front.
#[derive(Debug, Clone)]
pub enum Arg {
    Int(Option<i64>),
    Float(Option<f64>),
    Text(Option<String>),
    Bool(Option<bool>),
    Json(Option<Value>),
    /// `bigint[]`, used as `col = ANY($1)` instead of building `IN (...)` lists.
    Ints(Vec<i64>),
    /// `text[]`.
    Texts(Vec<String>),
}

macro_rules! arg_from {
    ($t:ty, $variant:ident, |$v:ident| $conv:expr) => {
        impl From<$t> for Arg {
            fn from($v: $t) -> Self {
                Arg::$variant(Some($conv))
            }
        }
        impl From<Option<$t>> for Arg {
            fn from(v: Option<$t>) -> Self {
                Arg::$variant(v.map(|$v| $conv))
            }
        }
    };
}
arg_from!(i64, Int, |v| v);
arg_from!(i32, Int, |v| i64::from(v));
arg_from!(u32, Int, |v| i64::from(v));
arg_from!(usize, Int, |v| v as i64);
arg_from!(f64, Float, |v| v);
arg_from!(String, Text, |v| v);
arg_from!(bool, Bool, |v| v);
arg_from!(Value, Json, |v| v);
arg_from!(Uuid, Text, |v| v.to_string());

impl From<Vec<i64>> for Arg {
    fn from(v: Vec<i64>) -> Self {
        Arg::Ints(v)
    }
}
impl From<&[i64]> for Arg {
    fn from(v: &[i64]) -> Self {
        Arg::Ints(v.to_vec())
    }
}
impl From<Vec<String>> for Arg {
    fn from(v: Vec<String>) -> Self {
        Arg::Texts(v)
    }
}

impl From<&str> for Arg {
    fn from(v: &str) -> Self {
        Arg::Text(Some(v.to_owned()))
    }
}
impl From<&String> for Arg {
    fn from(v: &String) -> Self {
        Arg::Text(Some(v.clone()))
    }
}
impl From<&Value> for Arg {
    fn from(v: &Value) -> Self {
        Arg::Json(Some(v.clone()))
    }
}

type Q<'q> = Query<'q, Postgres, PgArguments>;

fn bind_all<'q>(mut q: Q<'q>, args: &'q [Arg]) -> Q<'q> {
    for a in args {
        q = match a {
            Arg::Int(v) => q.bind(*v),
            Arg::Float(v) => q.bind(*v),
            Arg::Text(v) => q.bind(v.as_deref()),
            Arg::Bool(v) => q.bind(*v),
            Arg::Json(v) => q.bind(v.clone().map(sqlx::types::Json)),
            Arg::Ints(v) => q.bind(v.as_slice()),
            Arg::Texts(v) => q.bind(v.as_slice()),
        };
    }
    q
}

fn float_value(f: f64) -> Value {
    Number::from_f64(f).map_or(Value::Null, Value::Number)
}

fn row_to_map(row: &PgRow) -> Result<Row, StorageError> {
    let mut out = Map::with_capacity(row.columns().len());
    for (i, col) in row.columns().iter().enumerate() {
        // The owner column is internal row-level-security plumbing; legacy rows never had it and
        // the API must not start exposing it (select `user_id::text AS owner` to read it in tests).
        if col.name() == "user_id" {
            continue;
        }
        let ty = col.type_info().name();
        let value = match ty {
            "INT2" => row.try_get::<Option<i16>, _>(i)?.map(Value::from),
            "INT4" => row.try_get::<Option<i32>, _>(i)?.map(Value::from),
            "INT8" => row.try_get::<Option<i64>, _>(i)?.map(Value::from),
            "FLOAT4" => row
                .try_get::<Option<f32>, _>(i)?
                .map(|f| float_value(f64::from(f))),
            "FLOAT8" => row.try_get::<Option<f64>, _>(i)?.map(float_value),
            "BOOL" => row.try_get::<Option<bool>, _>(i)?.map(Value::from),
            "TEXT" | "VARCHAR" | "BPCHAR" | "NAME" => {
                row.try_get::<Option<String>, _>(i)?.map(Value::from)
            }
            "UUID" => row
                .try_get::<Option<Uuid>, _>(i)?
                .map(|u| Value::from(u.to_string())),
            "JSON" | "JSONB" => row
                .try_get::<Option<sqlx::types::Json<Value>>, _>(i)?
                .map(|j| j.0),
            other => {
                return Err(StorageError::Other(format!(
                    "column {:?} has unsupported type {other}; cast it in SQL (e.g. SUM(..)::bigint)",
                    col.name()
                )));
            }
        };
        out.insert(col.name().to_owned(), value.unwrap_or(Value::Null));
    }
    Ok(out)
}

async fn q_rows(
    conn: &mut PgConnection,
    sql: impl SqlSafeStr,
    args: &[Arg],
) -> Result<Vec<Row>, StorageError> {
    let rows = bind_all(sqlx::query(sql), args).fetch_all(conn).await?;
    rows.iter().map(row_to_map).collect()
}

async fn q_run(
    conn: &mut PgConnection,
    sql: impl SqlSafeStr,
    args: &[Arg],
) -> Result<u64, StorageError> {
    Ok(bind_all(sqlx::query(sql), args)
        .execute(conn)
        .await?
        .rows_affected())
}

fn first_value(row: Option<Row>) -> Option<Value> {
    row.and_then(|r| r.into_iter().next().map(|(_, v)| v))
}

fn id_of(row: Option<Row>) -> Result<i64, StorageError> {
    match first_value(row) {
        Some(Value::Number(n)) if n.is_i64() => Ok(n.as_i64().unwrap_or_default()),
        other => Err(StorageError::Other(format!(
            "insert_id: statement must `RETURNING id` (an integer); got {other:?}"
        ))),
    }
}

/// A pooled connection idle for longer than this is pinged before it is handed out.
const RECHECK_IDLE_AFTER: Duration = Duration::from_secs(20);

/// Handle to the database for one owner. Cheap to clone; each call runs in its own implicit
/// transaction. Use [`Db::begin`] when several statements must be atomic.
///
/// Method semantics mirror the legacy `db.py`: `rows`/`row` (SELECT), `run` (DML, affected rows),
/// `insert_id` (`INSERT .. RETURNING id`, replaces `lastrowid`), `scalar*` (first column).
#[derive(Clone)]
pub struct Db {
    pool: Pool,
    user_id: Uuid,
}

/// Which engine a [`Db`] talks to.
#[derive(Clone)]
enum Pool {
    /// Postgres / Supabase (a server, or the optional cloud mode).
    Pg(PgPool),
    /// The on-device SQLite file (offline desktop and Android).
    Sqlite(SqlitePool),
}

impl std::fmt::Debug for Db {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Db")
            .field("user_id", &self.user_id)
            .finish_non_exhaustive()
    }
}

impl Db {
    /// Connect as the server role and bind every connection to `user_id` (the row-level-security owner).
    pub async fn connect(
        options: PgConnectOptions,
        user_id: Uuid,
        max_connections: u32,
    ) -> Result<Self, StorageError> {
        let owner = user_id.to_string();
        // Latency tuning for a remote database (Supabase): every network round trip costs
        // 100-300 ms, and a *new* connection costs several (TCP, TLS, auth, `set_config`).
        //  * sqlx pings an idle connection before every checkout by default, which doubles the
        //    cost of each query. Ping only connections that sat idle long enough to have been
        //    dropped by the pooler or a NAT; recently used ones are trusted.
        //  * keep a few connections open so a page that fires several queries concurrently never
        //    pays the connect cost, and let them live long when idle.
        let min_connections = max_connections.min(4);
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .min_connections(min_connections)
            .idle_timeout(Some(Duration::from_secs(30 * 60)))
            .test_before_acquire(false)
            .before_acquire(|conn, meta| {
                Box::pin(async move {
                    if meta.idle_for > RECHECK_IDLE_AFTER {
                        Ok(conn.ping().await.is_ok())
                    } else {
                        Ok(true)
                    }
                })
            })
            .after_connect(move |conn, _meta| {
                let owner = owner.clone();
                Box::pin(async move {
                    sqlx::query("SELECT set_config('app.user_id', $1, false)")
                        .bind(owner)
                        .execute(conn)
                        .await?;
                    Ok(())
                })
            })
            .connect_with(options)
            .await?;
        // `connect_with` opens one connection; open the rest of the minimum in the background so
        // the first page load does not wait for them.
        for _ in 1..min_connections {
            let pool = pool.clone();
            tokio::spawn(async move {
                let _ = pool.acquire().await;
            });
        }
        Ok(Self {
            pool: Pool::Pg(pool),
            user_id,
        })
    }

    /// Open the on-device SQLite database at `path` (created and migrated when missing). Used by
    /// the offline apps: no server, no account, no network.
    pub async fn open_local(path: &std::path::Path) -> Result<Self, StorageError> {
        let pool = crate::local::open(path).await?;
        Ok(Self {
            pool: Pool::Sqlite(pool),
            user_id: crate::local::LOCAL_OWNER,
        })
    }

    /// A fresh in-memory on-device database (tests).
    pub async fn open_local_memory() -> Result<Self, StorageError> {
        let pool = crate::local::open_memory().await?;
        Ok(Self {
            pool: Pool::Sqlite(pool),
            user_id: crate::local::LOCAL_OWNER,
        })
    }

    /// Is this the on-device database (no shared/community features, no row-level security)?
    #[must_use]
    pub fn is_local(&self) -> bool {
        matches!(self.pool, Pool::Sqlite(_))
    }

    #[must_use]
    pub fn user_id(&self) -> Uuid {
        self.user_id
    }

    /// The SQLite pool behind an on-device database (shared with the session store).
    pub(crate) fn sqlite_pool(&self) -> Option<&SqlitePool> {
        match &self.pool {
            Pool::Sqlite(p) => Some(p),
            Pool::Pg(_) => None,
        }
    }

    /// All rows of a query.
    pub async fn rows(&self, sql: impl SqlSafeStr, args: &[Arg]) -> Result<Vec<Row>, StorageError> {
        match &self.pool {
            Pool::Pg(p) => {
                let mut c = p.acquire().await?;
                q_rows(&mut c, sql, args).await
            }
            Pool::Sqlite(p) => {
                let mut c = p.acquire().await?;
                crate::local::rows(&mut c, sql, args).await
            }
        }
    }

    /// First row, if any.
    pub async fn row(
        &self,
        sql: impl SqlSafeStr,
        args: &[Arg],
    ) -> Result<Option<Row>, StorageError> {
        Ok(self.rows(sql, args).await?.into_iter().next())
    }

    /// Execute a statement; returns the number of affected rows.
    pub async fn run(&self, sql: impl SqlSafeStr, args: &[Arg]) -> Result<u64, StorageError> {
        match &self.pool {
            Pool::Pg(p) => {
                let mut c = p.acquire().await?;
                q_run(&mut c, sql, args).await
            }
            Pool::Sqlite(p) => {
                let mut c = p.acquire().await?;
                crate::local::run(&mut c, sql, args).await
            }
        }
    }

    /// `INSERT ... RETURNING id` -> the new id.
    pub async fn insert_id(&self, sql: impl SqlSafeStr, args: &[Arg]) -> Result<i64, StorageError> {
        id_of(self.row(sql, args).await?)
    }

    /// First column of the first row; `None` for no row or NULL.
    pub async fn scalar(
        &self,
        sql: impl SqlSafeStr,
        args: &[Arg],
    ) -> Result<Option<Value>, StorageError> {
        Ok(first_value(self.row(sql, args).await?).filter(|v| !v.is_null()))
    }

    /// Integer scalar with a default for "no row" / NULL.
    pub async fn scalar_i64(
        &self,
        sql: impl SqlSafeStr,
        args: &[Arg],
        default: i64,
    ) -> Result<i64, StorageError> {
        Ok(self
            .scalar(sql, args)
            .await?
            .and_then(|v| v.as_i64())
            .unwrap_or(default))
    }

    /// Float scalar with a default for "no row" / NULL.
    pub async fn scalar_f64(
        &self,
        sql: impl SqlSafeStr,
        args: &[Arg],
        default: f64,
    ) -> Result<f64, StorageError> {
        Ok(self
            .scalar(sql, args)
            .await?
            .and_then(|v| v.as_f64())
            .unwrap_or(default))
    }

    /// Start a transaction (rolled back automatically if dropped without [`Tx::commit`]).
    pub async fn begin(&self) -> Result<Tx, StorageError> {
        Ok(match &self.pool {
            Pool::Pg(p) => Tx::Pg(p.begin().await?),
            Pool::Sqlite(p) => Tx::Sqlite(p.begin().await?),
        })
    }

    pub async fn close(&self) {
        match &self.pool {
            Pool::Pg(p) => p.close().await,
            Pool::Sqlite(p) => p.close().await,
        }
    }
}

/// One database transaction. Dropping it without `commit` rolls back.
pub enum Tx {
    Pg(sqlx::Transaction<'static, Postgres>),
    Sqlite(sqlx::Transaction<'static, sqlx::Sqlite>),
}

impl Tx {
    pub async fn rows(
        &mut self,
        sql: impl SqlSafeStr,
        args: &[Arg],
    ) -> Result<Vec<Row>, StorageError> {
        match self {
            Tx::Pg(t) => q_rows(t, sql, args).await,
            Tx::Sqlite(t) => crate::local::rows(t, sql, args).await,
        }
    }

    pub async fn row(
        &mut self,
        sql: impl SqlSafeStr,
        args: &[Arg],
    ) -> Result<Option<Row>, StorageError> {
        Ok(self.rows(sql, args).await?.into_iter().next())
    }

    pub async fn run(&mut self, sql: impl SqlSafeStr, args: &[Arg]) -> Result<u64, StorageError> {
        match self {
            Tx::Pg(t) => q_run(t, sql, args).await,
            Tx::Sqlite(t) => crate::local::run(t, sql, args).await,
        }
    }

    pub async fn insert_id(
        &mut self,
        sql: impl SqlSafeStr,
        args: &[Arg],
    ) -> Result<i64, StorageError> {
        id_of(self.row(sql, args).await?)
    }

    pub async fn scalar(
        &mut self,
        sql: impl SqlSafeStr,
        args: &[Arg],
    ) -> Result<Option<Value>, StorageError> {
        Ok(first_value(self.row(sql, args).await?).filter(|v| !v.is_null()))
    }

    pub async fn scalar_i64(
        &mut self,
        sql: impl SqlSafeStr,
        args: &[Arg],
        default: i64,
    ) -> Result<i64, StorageError> {
        Ok(self
            .scalar(sql, args)
            .await?
            .and_then(|v| v.as_i64())
            .unwrap_or(default))
    }

    pub async fn commit(self) -> Result<(), StorageError> {
        match self {
            Tx::Pg(t) => t.commit().await?,
            Tx::Sqlite(t) => t.commit().await?,
        }
        Ok(())
    }

    pub async fn rollback(self) -> Result<(), StorageError> {
        match self {
            Tx::Pg(t) => t.rollback().await?,
            Tx::Sqlite(t) => t.rollback().await?,
        }
        Ok(())
    }
}
