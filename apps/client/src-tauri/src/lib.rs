//! Native part of the PAM Analyzer app. The evaluation, the local history and the upload queue
//! are written in TypeScript (`apps/client/src`); this part reads files and handles what differs
//! between the platforms:
//! - Windows (desktop): device token in the Credential Manager, files from Explorer, one instance,
//!   updates through `tauri-plugin-updater` (see `desktop.rs`).
//! - Android: the plugin `PamPlugin.kt` (files shared with or opened in the app, Keystore, printing,
//!   fold posture, APK installation) and signed APK updates (see `mobile.rs`).

use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::ipc::Response;
use tauri::Manager;

mod crash;

#[cfg(desktop)]
mod desktop;
// Used for the APK updates; compiled everywhere so that it is tested on every platform.
#[cfg_attr(desktop, allow(dead_code))]
mod signature;
#[cfg(mobile)]
mod mobile;

/// Base address of the update channels (`stable.json`, `beta.json`), see `.github/workflows/app.yml`.
pub(crate) const UPDATE_BASE: &str = "https://github.com/CallMeTechie/new-pam-analyzer/releases/download/app-updates";

#[derive(Serialize)]
struct FileMeta {
    name: String,
    /// Modification date in milliseconds since 1970.
    modified: Option<u64>,
}

#[tauri::command]
fn file_meta(path: String) -> Result<FileMeta, String> {
    let p = Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("not a file".into());
    }
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64);
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    Ok(FileMeta { name, modified })
}

/// Raw bytes of a file the user opened, dropped, shared or double-clicked.
#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    const MAX: u64 = 200 * 1024 * 1024;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX {
        return Err("file too large".into());
    }
    std::fs::read(&path).map(Response::new).map_err(|e| e.to_string())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            if let Ok(dir) = app.path().app_data_dir() {
                crash::install(dir.join("crashes"), app.package_info().version.to_string());
            }
            Ok(())
        });

    #[cfg(desktop)]
    let builder = desktop::setup(builder).invoke_handler(tauri::generate_handler![
        file_meta,
        read_file,
        path_exists,
        crash::crash_reports,
        crash::crash_reports_delete,
        desktop::take_start_files,
        desktop::device_name,
        desktop::secret_get,
        desktop::secret_set,
        desktop::secret_clear,
        desktop::update_check,
        desktop::update_install
    ]);

    #[cfg(mobile)]
    let builder = mobile::setup(builder).invoke_handler(tauri::generate_handler![
        file_meta,
        read_file,
        path_exists,
        crash::crash_reports,
        crash::crash_reports_delete,
        mobile::update_check,
        mobile::update_download
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running the PAM Analyzer app");
}
