//! Test helpers: a fresh, fully migrated, isolated database per test.
//!
//! Needs a running Postgres and `TEST_DATABASE_ADMIN_URL` pointing at it with an administrator
//! login. Locally: `cargo run -p stuby-devdb` (embedded Postgres, no Docker) prints the URL.
//! In CI: a `postgres` service container.

use std::str::FromStr;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use uuid::Uuid;

/// Password of the `belajar_app` role in the development cluster. Roles are cluster-wide, so the
/// value is shared with `stuby-devdb` (which provisions the same role for a local server).
pub const TEST_APP_PASSWORD: &str = "dev-only";

pub struct TestDb {
    /// Administrator connection to the test database (migrations, setup).
    pub admin: PgConnectOptions,
    /// Restricted `belajar_app` connection: the one the server uses, subject to row-level security.
    pub app: PgConnectOptions,
    pub name: String,
    maintenance: PgConnectOptions,
}

/// Administrator options from `TEST_DATABASE_ADMIN_URL` (panics with instructions when unset).
#[must_use]
pub fn admin_options() -> PgConnectOptions {
    let url = std::env::var("TEST_DATABASE_ADMIN_URL").unwrap_or_else(|_| {
        panic!(
            "TEST_DATABASE_ADMIN_URL is not set. Start a dev Postgres with `cargo run -p stuby-devdb`, \
             export the printed URL, then run `cargo test -- --include-ignored`."
        )
    });
    PgConnectOptions::from_str(&url).expect("TEST_DATABASE_ADMIN_URL is not a valid Postgres URL")
}

/// Create `test_<random>`, ensure the `belajar_app` role exists, and apply every migration.
pub async fn fresh_db() -> TestDb {
    let maintenance = admin_options();
    let name = format!("test_{}", Uuid::new_v4().simple());

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(maintenance.clone())
        .await
        .expect("connect to the maintenance database");
    // Roles are cluster-wide and tests run in parallel: serialise creation with an advisory lock.
    let mut conn = pool.acquire().await.expect("connection");
    sqlx::query("SELECT pg_advisory_lock(7001)")
        .execute(&mut *conn)
        .await
        .expect("lock");
    let create_role = format!(
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='belajar_app') THEN \
         CREATE ROLE belajar_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '{TEST_APP_PASSWORD}'; \
         ELSE ALTER ROLE belajar_app PASSWORD '{TEST_APP_PASSWORD}'; \
         END IF; END $$"
    );
    sqlx::query(sqlx::AssertSqlSafe(create_role))
        .execute(&mut *conn)
        .await
        .expect("create role");
    sqlx::query("SELECT pg_advisory_unlock(7001)")
        .execute(&mut *conn)
        .await
        .expect("unlock");
    sqlx::query(sqlx::AssertSqlSafe(format!("CREATE DATABASE {name}")))
        .execute(&mut *conn)
        .await
        .expect("create database");
    drop(conn);
    pool.close().await;

    let admin = maintenance.clone().database(&name);
    crate::migrate(admin.clone())
        .await
        .expect("migrations apply");
    let app = admin
        .clone()
        .username("belajar_app")
        .password(TEST_APP_PASSWORD);

    TestDb {
        admin,
        app,
        name,
        maintenance,
    }
}

impl TestDb {
    /// Drop the database. Optional: `stuby-devdb` also sweeps leftover `test_*` databases on start.
    pub async fn drop_db(self) {
        let pool = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(self.maintenance)
            .await
            .expect("connect");
        let _ = sqlx::query(sqlx::AssertSqlSafe(format!(
            "DROP DATABASE IF EXISTS {} WITH (FORCE)",
            self.name
        )))
        .execute(&pool)
        .await;
        pool.close().await;
    }
}
