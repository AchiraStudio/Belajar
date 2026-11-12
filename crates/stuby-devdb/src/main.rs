//! Starts a local PostgreSQL for development and tests, with no Docker and no system install.
//!
//! * binaries are downloaded once to `~/.theseus` and shared between projects;
//! * data lives in `.devdb/data` (git-ignored) and survives restarts;
//! * listens on 127.0.0.1:54329 only, with a development-only password;
//! * prints and saves `TEST_DATABASE_ADMIN_URL`; stops cleanly on Ctrl+C.
//!
//! Run it in its own terminal:  `cargo run -p stuby-devdb`
//! then in another:             `TEST_DATABASE_ADMIN_URL=... cargo test --workspace -- --include-ignored`

use std::time::Duration;

use anyhow::Context;
use postgresql_embedded::{PostgreSQL, Settings};
use sqlx::postgres::PgPoolOptions;

const PORT: u16 = 54329;
const PASSWORD: &str = "dev-only";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let root = std::env::current_dir()?.join(".devdb");
    std::fs::create_dir_all(&root)?;

    let settings = Settings {
        host: "127.0.0.1".into(),
        port: PORT,
        username: "postgres".into(),
        password: PASSWORD.into(),
        data_dir: root.join("data"),
        temporary: false,
        // initdb is slow on Windows; the crate's default deadline is only a few seconds.
        timeout: Some(Duration::from_secs(300)),
        ..Settings::default()
    };

    let mut pg = PostgreSQL::new(settings);
    println!("Preparing PostgreSQL (first run downloads the binaries and runs initdb) ...");
    pg.setup().await.context("setup")?;
    pg.start().await.context("start")?;

    let url = pg.settings().url("postgres");
    sweep_test_databases(&url)
        .await
        .context("cleanup of old test databases")?;

    let dev = provision_dev_database(&url, &pg.settings().url("stuby_dev"))
        .await
        .context("provisioning stuby_dev")?;
    let env = format!(
        "TEST_DATABASE_ADMIN_URL={url}\nDATABASE_URL={}\nDATABASE_ADMIN_URL={}\n",
        dev.app_url, dev.admin_url
    );
    std::fs::write(root.join("env"), &env)?;
    println!(
        "PostgreSQL is running.\n\n{env}(also saved to {})",
        display(&root.join("env"))
    );
    println!("Press Ctrl+C to stop.");

    tokio::signal::ctrl_c().await?;
    println!("Stopping PostgreSQL ...");
    pg.stop().await.context("stop")?;
    Ok(())
}

fn display(path: &std::path::Path) -> String {
    path.display().to_string()
}

struct DevDatabase {
    app_url: String,
    admin_url: String,
}

/// Create (idempotently) the `belajar_app` role and a `stuby_dev` database, apply the migrations,
/// and return the URLs a locally running `stuby-server` needs.
async fn provision_dev_database(
    admin_url: &str,
    admin_dev_url: &str,
) -> anyhow::Result<DevDatabase> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(admin_url)
        .await?;
    sqlx::query(
        "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='belajar_app') THEN          CREATE ROLE belajar_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'dev-only';          ELSE ALTER ROLE belajar_app PASSWORD 'dev-only';          END IF; END $$",
    )
    .execute(&pool)
    .await?;
    let exists: Option<i32> =
        sqlx::query_scalar("SELECT 1 FROM pg_database WHERE datname = 'stuby_dev'")
            .fetch_optional(&pool)
            .await?;
    if exists.is_none() {
        sqlx::query("CREATE DATABASE stuby_dev")
            .execute(&pool)
            .await?;
    }
    pool.close().await;

    let options = admin_dev_url.parse::<stuby_storage::PgConnectOptions>()?;
    stuby_storage::migrate(options).await?;
    Ok(DevDatabase {
        app_url: format!("postgresql://belajar_app:{PASSWORD}@127.0.0.1:{PORT}/stuby_dev"),
        admin_url: admin_dev_url.to_owned(),
    })
}

/// Drop `test_*` databases that earlier test runs left behind.
async fn sweep_test_databases(admin_url: &str) -> anyhow::Result<()> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(admin_url)
        .await?;
    let names: Vec<String> =
        sqlx::query_scalar(r"SELECT datname FROM pg_database WHERE datname LIKE 'test\_%'")
            .fetch_all(&pool)
            .await?;
    for name in names {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)"
        )))
        .execute(&pool)
        .await?;
    }
    pool.close().await;
    Ok(())
}
