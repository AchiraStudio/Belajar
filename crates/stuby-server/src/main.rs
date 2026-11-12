//! Stuby server binary: loads `.env`, validates the configuration, then serves until Ctrl+C /
//! SIGTERM. All the wiring lives in the library so the desktop app can embed the same server.

use anyhow::Context;
use stuby_server::{Config, Server, init_tracing, shutdown_signal};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load .env automatically if present (no batch file or manual env exports needed).
    let _ = dotenvy::dotenv();
    init_tracing();

    let config = Config::from_env().context("konfigurasi server tidak valid")?;
    tracing::info!(?config, "starting");

    let server = Server::prepare(&config).await?;
    server.run(shutdown_signal()).await?;

    tracing::info!("stuby-server stopped");
    Ok(())
}
