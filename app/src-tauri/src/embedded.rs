//! The Stuby server, running inside the app (desktop and Android alike).
//!
//! There is nothing to configure and no server to find. Start-up (the window shows `splash.html`
//! meanwhile, and the splash shows what is happening):
//!
//! 1. open the on-device database in the app's data folder (created on first launch);
//! 2. start the Stuby server on a loopback port, serving the UI that is compiled into this app;
//! 3. send the window to `http://127.0.0.1:<port>/api/local-login?t=<one-time token>`, which signs
//!    the window in (no password) and lands on the home page.
//!
//! Everything works offline. Cloud database, server address and AI keys are settings the app will
//! offer later; none of them is needed to start.

use std::net::{Ipv4Addr, TcpListener};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use stuby_server::{Config, Server};
use tauri::utils::config::{FrontendDist, WindowConfig};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, RunEvent, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::{Notify, oneshot};

/// Stable on purpose: browser storage (theme, reading preferences) is keyed by origin, and the
/// origin includes the port. Falls back to a free port only when this one is taken.
const PREFERRED_PORT: u16 = 47821;

/// Held in Tauri's state so the server can be told to stop when the app exits.
struct Shutdown(Mutex<Option<oneshot::Sender<()>>>);

/// What the splash's "Try again" button needs: a bell that wakes the boot loop.
pub struct Retry {
    wake: Arc<Notify>,
}

fn data_dir(app: &tauri::App) -> tauri::Result<PathBuf> {
    // STUBY_CONFIG_DIR lets a portable install (or a test) keep everything in one folder.
    match std::env::var_os("STUBY_CONFIG_DIR") {
        Some(dir) => Ok(PathBuf::from(dir).join("data")),
        None => app.path().app_local_data_dir(),
    }
}

/// Opens the main window. In `tauri dev`, or when the app was built to load a remote server
/// (`frontendDist` is a URL), it shows the configured address unchanged and starts nothing.
pub fn open_main_window(
    app: &mut tauri::App,
    mut window: WindowConfig,
) -> Result<(), Box<dyn std::error::Error>> {
    let remote = matches!(app.config().build.frontend_dist, Some(FrontendDist::Url(_)));
    if tauri::is_dev() || remote {
        WebviewWindowBuilder::from_config(app.handle(), &window)?.build()?;
        return Ok(());
    }

    window.url = WebviewUrl::App("splash.html".into());
    // Status is pushed into the splash page with `eval`. That only works once the page has loaded:
    // before then the script runs in a blank document and is silently lost. `boot` therefore waits
    // for this signal first.
    let (loaded_tx, loaded_rx) = oneshot::channel::<()>();
    let loaded_tx = Mutex::new(Some(loaded_tx));
    let main = WebviewWindowBuilder::from_config(app.handle(), &window)?
        .on_page_load(move |_, payload| {
            if matches!(payload.event(), PageLoadEvent::Finished)
                && let Ok(mut guard) = loaded_tx.lock()
                && let Some(tx) = guard.take()
            {
                let _ = tx.send(());
            }
        })
        .build()?;

    let (stop, stopped) = oneshot::channel();
    app.manage(Shutdown(Mutex::new(Some(stop))));
    let wake = Arc::new(Notify::new());
    app.manage(Retry { wake: wake.clone() });

    // The UI is compiled into the app; the server hands it out from memory.
    let resolver = app.asset_resolver();
    let assets: stuby_server::Assets = Arc::new(move |path: &str| {
        resolver
            .get(path.to_owned())
            .map(|asset| (asset.bytes, asset.mime_type))
    });

    tauri::async_runtime::spawn(boot(main, data_dir(app)?, assets, stopped, loaded_rx, wake));
    Ok(())
}

pub fn on_run_event(app: &AppHandle, event: &RunEvent) {
    if let RunEvent::Exit = event
        && let Some(state) = app.try_state::<Shutdown>()
        && let Ok(mut guard) = state.0.lock()
        && let Some(stop) = guard.take()
    {
        let _ = stop.send(());
    }
}

// ---- Command the splash page can call (the app's own origin only; see capabilities) ---------------

/// "Try again" on an error screen.
#[tauri::command]
pub fn retry_boot(retry: State<'_, Retry>) {
    retry.wake.notify_one();
}

// ---- The boot loop --------------------------------------------------------------------------------

async fn boot(
    window: WebviewWindow,
    data_dir: PathBuf,
    assets: stuby_server::Assets,
    stopped: oneshot::Receiver<()>,
    splash_loaded: oneshot::Receiver<()>,
    wake: Arc<Notify>,
) {
    stuby_server::init_tracing();

    // Do not talk to the splash page before it exists (see `open_main_window`). If the load event
    // never comes, carry on after a while rather than hang.
    let _ = tokio::time::timeout(Duration::from_secs(15), splash_loaded).await;

    // A fresh random token per launch: only this window knows it, and it works once.
    let token = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());

    let server = loop {
        splash(&window, "step", &["\"config\"", "\"done\""]);
        splash(&window, "step", &["\"database\"", "\"active\""]);
        let config = Config::local(&data_dir, PathBuf::new(), pick_port(), token.clone())
            .with_assets(assets.clone());
        match Server::prepare(&config).await {
            Ok(server) => {
                splash(&window, "step", &["\"database\"", "\"done\""]);
                break server;
            }
            Err(e) => {
                let reason = format!("{e:#}");
                eprintln!("stuby: could not start: {reason}");
                splash(&window, "step", &["\"database\"", "\"error\""]);
                splash(
                    &window,
                    "error",
                    &[&json_string("Stuby could not start"), &json_string(&reason)],
                );
                wake.notified().await;
            }
        }
    };

    splash(&window, "step", &["\"server\"", "\"active\""]);
    let addr = match server.local_addr() {
        Ok(addr) => addr,
        Err(e) => {
            splash(
                &window,
                "error",
                &[&json_string("Could not start the server"), &json_string(&e.to_string())],
            );
            return;
        }
    };
    tauri::async_runtime::spawn(async move {
        let result = server
            .run(async move {
                let _ = stopped.await;
            })
            .await;
        if let Err(e) = result {
            eprintln!("stuby: server stopped: {e:#}");
        }
    });
    splash(&window, "step", &["\"server\"", "\"done\""]);

    let url = format!("http://127.0.0.1:{}/api/local-login?t={token}", addr.port());
    // A moment to let the last tick show, then hand over to the app (its own startup screen takes over).
    tokio::time::sleep(Duration::from_millis(250)).await;
    run_js(
        &window,
        &format!("window.location.replace({})", json_string(&url)),
    );
}

fn pick_port() -> u16 {
    if TcpListener::bind((Ipv4Addr::LOCALHOST, PREFERRED_PORT)).is_ok() {
        PREFERRED_PORT
    } else {
        0
    }
}

fn json_string(text: &str) -> String {
    serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_owned())
}

fn run_js(window: &WebviewWindow, script: &str) {
    if let Err(e) = window.eval(script) {
        eprintln!("stuby: eval failed: {e}");
    }
}

/// Calls `window.stubySplash.<name>(args)` in the splash page (public/splash.js).
fn splash(window: &WebviewWindow, name: &str, args: &[&str]) {
    run_js(
        window,
        &format!(
            "window.stubySplash && window.stubySplash.{name}({})",
            args.join(",")
        ),
    );
}
