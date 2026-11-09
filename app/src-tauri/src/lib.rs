//! Belajar native shell.
//!
//! This crate is deliberately thin (docs/MIGRATION_PLAN.md §8): it hosts the shared React app in a
//! webview and, later, exposes a handful of native capabilities (file picker, OS credential store,
//! notifications, save-file, lifecycle). It contains no business logic, no database and no AI
//! credentials. No Tauri commands are registered yet; each one is added only with a verified feature.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the Belajar application");
}
