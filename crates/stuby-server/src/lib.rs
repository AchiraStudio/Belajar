//! Stuby server as a library.
//!
//! Two programs run exactly this code:
//!
//! * `stuby-server` (the binary in this crate): a service on a Linux box or VPS;
//! * the desktop app (`app/src-tauri`): starts it in-process on a loopback port, so the app is
//!   standalone and never shows "127.0.0.1 refused to connect".
//!
//! Serves the web UI from `Config::static_dir` and the API from the same origin, which is what the
//! `SameSite=Strict` session cookie needs.

pub mod config;

use std::future::Future;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;

use anyhow::Context;
use stuby_api::auth::{Auth, LocalLogin, LoginLimiter};
use stuby_api::{ApiState, router};
use stuby_application::{App, AppConfig, jobs};
use stuby_storage::{Db, PgConnectOptions, SessionStore, ensure_owner, migrate};
pub use config::{Config, ConfigError, PasswordSource};
pub use stuby_api::Assets;
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

/// Installs the log subscriber. Safe to call more than once (the second call is a no-op).
pub fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info,tower_http=info")),
        )
        .try_init();
}

/// A fully wired server that has already bound its port but is not serving yet.
pub struct Server {
    listener: TcpListener,
    router: axum::Router,
}

impl Server {
    /// Connects to the database, applies migrations (when an admin URL is configured), builds the
    /// application and binds the listening socket. Errors are in Indonesian, ready to show a user.
    pub async fn prepare(config: &Config) -> anyhow::Result<Self> {
        let (db, sessions) = if let Some(path) = &config.local_db {
            // Offline: one SQLite file in the app's data folder, nothing to configure.
            let db = Db::open_local(path)
                .await
                .context("tidak bisa membuka database di perangkat")?;
            let sessions = SessionStore::local(&db).context("sesi login")?;
            (db, sessions)
        } else {
            // Migrate with the admin login when one is configured, then run as the restricted role.
            if let Some(admin_url) = &config.database_admin_url {
                let admin =
                    PgConnectOptions::from_str(admin_url).context("DATABASE_ADMIN_URL")?;
                migrate(admin).await.context("migrasi database gagal")?;
                tracing::info!("database migrations are up to date");
            }
            let options =
                PgConnectOptions::from_str(&config.database_url).context("DATABASE_URL")?;
            let owner = ensure_owner(options.clone())
                .await
                .context("tidak bisa menyiapkan pemilik data")?;
            let db = Db::connect(options.clone(), owner, 10)
                .await
                .context("tidak bisa terhubung ke database")?;
            let sessions = SessionStore::connect(options).await.context("sesi login")?;
            (db, sessions)
        };

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
            local_login: config
                .local_login_token
                .clone()
                .map(|t| Arc::new(LocalLogin::new(t))),
            assets: config.assets.clone(),
            static_dir: config.static_dir.clone(),
            max_upload_bytes: usize::try_from(config.max_upload_mb * 1024 * 1024)
                .unwrap_or(usize::MAX),
        };

        let listener = TcpListener::bind(config.bind)
            .await
            .with_context(|| format!("tidak bisa membuka {}", config.bind))?;
        Ok(Self {
            listener,
            router: router(state),
        })
    }

    /// The address actually bound (useful when the configured port was `0`).
    pub fn local_addr(&self) -> std::io::Result<SocketAddr> {
        self.listener.local_addr()
    }

    /// Serves until `shutdown` completes.
    pub async fn run(
        self,
        shutdown: impl Future<Output = ()> + Send + 'static,
    ) -> anyhow::Result<()> {
        tracing::info!(addr = %self.listener.local_addr()?, "stuby-server listening");
        axum::serve(
            self.listener,
            self.router
                .into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(shutdown)
        .await
        .context("server berhenti dengan error")
    }
}

/// Completes on Ctrl+C or (on Unix) SIGTERM, which is what systemd sends.
pub async fn shutdown_signal() {
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
