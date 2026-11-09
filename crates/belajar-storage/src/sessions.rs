use sqlx::PgPool;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use uuid::Uuid;

use crate::StorageError;

/// Server-side login sessions. Only a hash of the cookie token is stored, so a database leak does
/// not yield usable cookies, and deleting a row revokes a session immediately (legacy cookies were
/// stateless HMACs that could not be revoked: audit finding S-02).
#[derive(Clone)]
pub struct SessionStore {
    pool: PgPool,
}

impl SessionStore {
    pub async fn connect(options: PgConnectOptions) -> Result<Self, StorageError> {
        Ok(Self {
            pool: PgPoolOptions::new()
                .max_connections(4)
                .connect_with(options)
                .await?,
        })
    }

    pub async fn create(
        &self,
        user_id: Uuid,
        token_hash: &str,
        now: f64,
        ttl_seconds: f64,
        user_agent: Option<&str>,
    ) -> Result<(), StorageError> {
        sqlx::query(
            "INSERT INTO sessions(user_id, token_hash, created_at, expires_at, user_agent) \
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(user_id)
        .bind(token_hash)
        .bind(now)
        .bind(now + ttl_seconds)
        .bind(user_agent.map(|s| s.chars().take(200).collect::<String>()))
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// The owner of a live session, or `None` if the hash is unknown or expired.
    pub async fn lookup(&self, token_hash: &str, now: f64) -> Result<Option<Uuid>, StorageError> {
        Ok(sqlx::query_scalar(
            "SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > $2",
        )
        .bind(token_hash)
        .bind(now)
        .fetch_optional(&self.pool)
        .await?)
    }

    pub async fn revoke(&self, token_hash: &str) -> Result<bool, StorageError> {
        let done = sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(token_hash)
            .execute(&self.pool)
            .await?;
        Ok(done.rows_affected() > 0)
    }

    /// Revoke every session of an owner ("log out everywhere").
    pub async fn revoke_all(&self, user_id: Uuid) -> Result<u64, StorageError> {
        Ok(sqlx::query("DELETE FROM sessions WHERE user_id = $1")
            .bind(user_id)
            .execute(&self.pool)
            .await?
            .rows_affected())
    }

    pub async fn purge_expired(&self, now: f64) -> Result<u64, StorageError> {
        Ok(sqlx::query("DELETE FROM sessions WHERE expires_at <= $1")
            .bind(now)
            .execute(&self.pool)
            .await?
            .rows_affected())
    }
}
