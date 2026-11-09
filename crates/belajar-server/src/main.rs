//! Belajar server: wires the database, application layer and HTTP API, then serves until
//! Ctrl+C / SIGTERM. Serves the original (unchanged) frontend from `STATIC_DIR`.

mod config;

use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;

use anyhow::Context;
use belajar_api::auth::{Auth, LoginLimiter};
use belajar_api::{ApiState, router};
use belajar_application::{App, AppConfig, jobs};
use belajar_storage::{Db, PgConnectOptions, SessionStore, ensure_owner, migrate};
use config::{Config, PasswordSource};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env automatically if present (no batch file or manual env exports needed)
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info")),
        )
        .init();

    let config = Config::from_env().context("konfigurasi server tidak valid")?;
    tracing::info!(?config, "starting");

    // Database: migrate with the admin login when one is configured, then run as the restricted role.
    if let Some(admin_url) = &config.database_admin_url {
        let admin = PgConnectOptions::from_str(admin_url).context("DATABASE_ADMIN_URL")?;
        migrate(admin).await.context("migrasi database gagal")?;
        tracing::info!("database migrations are up to date");
    }
    let options = PgConnectOptions::from_str(&config.database_url).context("DATABASE_URL")?;
    let owner = ensure_owner(options.clone())
        .await
        .context("tidak bisa menyiapkan pemilik data")?;
    let db = Db::connect(options.clone(), owner, 10)
        .await
        .context("tidak bisa terhubung ke database")?;
    let sessions = SessionStore::connect(options).await.context("sesi login")?;

    tokio::fs::create_dir_all(&config.files_dir)
        .await
        .context("FILES_DIR")?;
    let app_config = AppConfig {
        tz: config.tz,
        day_start_hour: config.day_start_hour,
        max_upload_mb: config.max_upload_mb,
        files_dir: config.files_dir.clone(),
        job_workers: config.job_workers,
        ..AppConfig::default()
    };
    jobs::recover(&db).await.context("pemulihan job")?;
    let app = App::new(db, app_config);

    let auth = match &config.password {
        PasswordSource::Plain(plain) => Auth::from_password(
            plain,
            config.cookie_secure,
            config.session_days,
            config.trust_proxy,
        ),
        PasswordSource::Hash(hash) => Auth::from_phc(
            hash,
            config.cookie_secure,
            config.session_days,
            config.trust_proxy,
        ),
    }
    .map_err(|e| anyhow::anyhow!("password login: {e}"))?;

    let state = ApiState {
        app,
        sessions,
        auth: Arc::new(auth),
        limiter: Arc::new(LoginLimiter::default()),
        static_dir: config.static_dir.clone(),
        max_upload_bytes: usize::try_from(config.max_upload_mb * 1024 * 1024).unwrap_or(usize::MAX),
    };

    let listener = TcpListener::bind(config.bind)
        .await
        .with_context(|| format!("tidak bisa membuka {}", config.bind))?;
    tracing::info!(addr = %listener.local_addr()?, "belajar-server listening");
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await
    .context("server berhenti dengan error")?;

    tracing::info!("belajar-server stopped");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        if tokio::signal::ctrl_c().await.is_err() {
            // Without a working signal handler never trigger a shutdown by accident.
            std::future::pending::<()>().await;
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }
    tracing::info!("shutdown signal received");
}
