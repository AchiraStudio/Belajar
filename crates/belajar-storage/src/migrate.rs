use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use uuid::Uuid;

use crate::StorageError;

/// Apply all pending migrations. Run with an **administrator** connection (it creates tables and
/// policies); the server itself later connects as the restricted `belajar_app` role.
/// The role must already exist: see `scripts/db/create_app_role.sql`.
pub async fn migrate(admin: PgConnectOptions) -> Result<(), StorageError> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(admin)
        .await?;
    let result = sqlx::migrate!("./migrations").run(&pool).await;
    pool.close().await;
    Ok(result?)
}

/// Return the id of the single owner, creating the `app_users` row on first start.
///
/// Uses the server role (policy `server_only` allows it) on an unscoped connection, because the
/// owner is not known yet.
pub async fn ensure_owner(options: PgConnectOptions) -> Result<Uuid, StorageError> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    let found: Option<Uuid> =
        sqlx::query_scalar("SELECT id FROM app_users ORDER BY created_at, id LIMIT 1")
            .fetch_optional(&pool)
            .await?;
    let id = match found {
        Some(id) => id,
        None => {
            sqlx::query_scalar("INSERT INTO app_users DEFAULT VALUES RETURNING id")
                .fetch_one(&pool)
                .await?
        }
    };
    pool.close().await;
    Ok(id)
}
