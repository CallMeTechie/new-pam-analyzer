//! Crash reports for Rust panics. A panic is written as JSON to `<app data>/crashes/<id>.json`
//! (same shape as the Android reports of `CrashLog.kt`); the app sends the files to the server once
//! it is connected and deletes them after the server accepted them.

use std::backtrace::Backtrace;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

static DIR: OnceLock<PathBuf> = OnceLock::new();

/// Installs the panic hook; earlier hooks (printing to stderr) still run afterwards.
pub fn install(dir: PathBuf, version: String) {
    let _ = std::fs::create_dir_all(&dir);
    if DIR.set(dir).is_err() {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let payload = info.payload();
        let message = payload
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic".into());
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_default();
        let thread = std::thread::current().name().unwrap_or("unnamed").to_string();
        let report = format!(
            "panicked at {location} (thread '{thread}'):\n{message}\n\n{}",
            Backtrace::force_capture()
        );
        let _ = write(&version, &message, &report);
        previous(info);
    }));
}

fn write(version: &str, message: &str, report: &str) -> std::io::Result<()> {
    let Some(dir) = DIR.get() else { return Ok(()) };
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let id = format!("panic-{:x}-{:x}", now.as_nanos(), std::process::id());
    let value = json!({
        "id": id,
        "kind": "panic",
        "occurredAt": now.as_millis() as u64,
        "appVersion": version,
        "system": format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        "message": message.chars().take(1000).collect::<String>(),
        "report": report.chars().take(190_000).collect::<String>(),
    });
    std::fs::write(dir.join(format!("{id}.json")), value.to_string())
}

/// Stored reports, oldest first.
#[tauri::command]
pub fn crash_reports() -> Vec<Value> {
    let Some(dir) = DIR.get() else { return vec![] };
    let mut out: Vec<Value> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| std::fs::read_to_string(e.path()).ok())
        .filter_map(|s| serde_json::from_str(&s).ok())
        .collect();
    out.sort_by_key(|v| v["occurredAt"].as_u64().unwrap_or(0));
    out
}

/// Deletes the reports the server accepted.
#[tauri::command]
pub fn crash_reports_delete(ids: Vec<String>) {
    let Some(dir) = DIR.get() else { return };
    for id in ids {
        // Only plain ids, never a path.
        if id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            let _ = std::fs::remove_file(dir.join(format!("{id}.json")));
        }
    }
}
