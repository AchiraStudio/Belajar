//! Stuby native shell.
//!
//! One app for desktop and Android, fully offline: [`embedded`] starts the Stuby server inside
//! this process on a loopback port (data in an on-device SQLite file, UI compiled into the app)
//! and points the window at it. The UI and the API share one origin, which the session cookie
//! (`SameSite=Strict`) requires. The shell contains no business logic of its own.

mod embedded;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // The splash page's "Try again" button.
    let builder = builder.invoke_handler(tauri::generate_handler![embedded::retry_boot]);
    let app = builder
        .setup(|app| {
            // The window is declared in tauri.conf.json with `create: false` so it can be opened
            // here, after we know which address it should show.
            let window = app
                .config()
                .app
                .windows
                .first()
                .cloned()
                .ok_or("tauri.conf.json declares no window")?;

            embedded::open_main_window(app, window)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Stuby application");

    app.run(|handle, event| embedded::on_run_event(handle, &event));
}
