//! Native part of the PAM Analyzer app. The evaluation, the local history and the upload queue
//! are written in TypeScript (`apps/client/src`); this part reads files, keeps the device token in
//! the Windows Credential Manager, forwards files from Explorer and installs updates.

use std::path::Path;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const KEYRING_SERVICE: &str = "PAM Analyzer";
const KEYRING_USER: &str = "device-token";
const UPDATE_BASE: &str = "https://github.com/CallMeTechie/new-pam-analyzer/releases/download/app-updates";

/// Files passed on the command line at start (double-click in Explorer), handed out once.
#[derive(Default)]
struct StartFiles(Mutex<Vec<String>>);

/// Update found by `update_check`, installed by `update_install`.
#[derive(Default)]
struct PendingUpdate(Mutex<Option<Update>>);

fn file_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-') && Path::new(a).is_file())
        .collect()
}

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

/// Raw bytes of a file the user opened, dropped or double-clicked.
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

#[tauri::command]
fn take_start_files(state: State<'_, StartFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
fn device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "PC".into())
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_get() -> Result<Option<String>, String> {
    match keyring_entry()?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn secret_set(value: String) -> Result<(), String> {
    keyring_entry()?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_clear() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    notes: String,
    date: Option<String>,
}

/// Looks for a newer version in the channel (`stable` or `beta`), see `.github/workflows/app.yml`.
#[tauri::command]
async fn update_check(
    app: AppHandle,
    channel: String,
    pending: State<'_, PendingUpdate>,
) -> Result<Option<UpdateInfo>, String> {
    let file = if channel == "beta" { "beta.json" } else { "stable.json" };
    let url = url::Url::parse(&format!("{UPDATE_BASE}/{file}")).map_err(|e| e.to_string())?;
    let update = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        notes: u.body.clone().unwrap_or_default(),
        date: u.date.map(|d| d.to_string()),
    });
    *pending.0.lock().unwrap() = update;
    Ok(info)
}

#[derive(Clone, Serialize)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

/// Downloads the update found before, checks its signature, installs it and restarts the app.
#[tauri::command]
async fn update_install(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    progress: Channel<Progress>,
) -> Result<(), String> {
    let update = pending.0.lock().unwrap().take().ok_or("no update")?;
    let mut downloaded: u64 = 0;
    update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress.send(Progress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    app.restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        // A double-click on a .dat file while the app runs reaches the running instance.
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = file_args(argv);
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(StartFiles(Mutex::new(file_args(std::env::args()))))
        .manage(PendingUpdate::default())
        .invoke_handler(tauri::generate_handler![
            file_meta,
            read_file,
            path_exists,
            take_start_files,
            device_name,
            secret_get,
            secret_set,
            secret_clear,
            update_check,
            update_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running the PAM Analyzer app");
}
