//! Android (iOS later): registers the app's own plugin and installs signed APK updates.
//!
//! The APK version updates itself from the same channels as Windows (`stable.json`, `beta.json`,
//! entry `android`). The download is checked with the same signing key as the Windows updates
//! (`plugins.updater.pubkey` in `tauri.conf.json`) before Android is asked to install it.
//! The version from Google Play is updated by Play and never calls these commands.

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_http::reqwest;

use crate::UPDATE_BASE;

/// Public key of the update signatures (same as for Windows).
const PUBKEY: &str = include_str!("../updater.pub");

fn pam_plugin<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("pam")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("com.callmetechie.pamanalyzer", "PamPlugin")?;
            Ok(())
        })
        .build()
}

pub fn setup<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(pam_plugin())
        .plugin(tauri_plugin_barcode_scanner::init())
}

#[derive(Deserialize)]
struct Manifest {
    version: String,
    #[serde(default)]
    notes: String,
    pub_date: Option<String>,
    platforms: std::collections::HashMap<String, Asset>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct Asset {
    url: String,
    signature: String,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    version: String,
    notes: String,
    date: Option<String>,
    asset: Asset,
}

/// Newer version in the channel (`stable` or `beta`), or `None`.
#[tauri::command]
pub async fn update_check<R: Runtime>(app: AppHandle<R>, channel: String) -> Result<Option<UpdateInfo>, String> {
    let file = if channel == "beta" { "beta.json" } else { "stable.json" };
    let body = reqwest::get(format!("{UPDATE_BASE}/{file}"))
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    let manifest: Manifest = serde_json::from_slice(&body).map_err(|e| e.to_string())?;
    let current = semver::Version::parse(&app.package_info().version.to_string()).map_err(|e| e.to_string())?;
    let offered = semver::Version::parse(&manifest.version).map_err(|e| e.to_string())?;
    let Some(asset) = manifest.platforms.get("android").cloned() else {
        return Ok(None);
    };
    if offered <= current {
        return Ok(None);
    }
    Ok(Some(UpdateInfo {
        version: manifest.version,
        notes: manifest.notes,
        date: manifest.pub_date,
        asset,
    }))
}

#[derive(Clone, Serialize)]
pub struct Progress {
    downloaded: u64,
    total: Option<u64>,
}

/// Downloads the APK, checks its signature and returns its path for `plugin:pam|installApk`.
#[tauri::command]
pub async fn update_download<R: Runtime>(
    app: AppHandle<R>,
    asset: Asset,
    progress: Channel<Progress>,
) -> Result<String, String> {
    let mut res = reqwest::get(&asset.url)
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let total = res.content_length();
    let mut data = Vec::with_capacity(total.unwrap_or(0) as usize);
    while let Some(chunk) = res.chunk().await.map_err(|e| e.to_string())? {
        data.extend_from_slice(&chunk);
        let _ = progress.send(Progress { downloaded: data.len() as u64, total });
    }
    crate::signature::verify(&data, &asset.signature, PUBKEY)?;
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("pam-analyzer.apk");
    std::fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
