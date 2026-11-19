//! Windows (and other desktop systems).

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::UPDATE_BASE;

const KEYRING_SERVICE: &str = "PAM Analyzer";
const KEYRING_USER: &str = "device-token";

/// Files passed on the command line at start (double-click in Explorer), handed out once.
#[derive(Default)]
pub struct StartFiles(Mutex<Vec<String>>);

/// Update found by `update_check`, installed by `update_install`.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

fn file_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.starts_with('-') && Path::new(a).is_file())
        .collect()
}

pub fn setup<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    // A double-click on a .dat file while the app runs reaches the running instance.
    builder
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = file_args(argv);
            if !files.is_empty() {
                let _ = app.emit("open-files", files);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(StartFiles(Mutex::new(file_args(std::env::args()))))
        .manage(PendingUpdate::default())
}

#[tauri::command]
pub fn take_start_files(state: State<'_, StartFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

#[tauri::command]
pub fn device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "PC".into())
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get() -> Result<Option<String>, String> {
    match keyring_entry()?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(value: String) -> Result<(), String> {
    keyring_entry()?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_clear() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    notes: String,
    date: Option<String>,
}

/// Looks for a newer version in the channel (`stable` or `beta`).
#[tauri::command]
pub async fn update_check(
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
pub struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

/// Downloads the update found before, checks its signature, installs it and restarts the app.
#[tauri::command]
pub async fn update_install(
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
