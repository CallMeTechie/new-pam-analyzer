fn main() {
    // Commands of the app's own Android plugin (gen/android/.../PamPlugin.kt), callable from the
    // frontend as `plugin:pam|<command>`.
    tauri_build::try_build(
        tauri_build::Attributes::new().plugin(
            "pam",
            tauri_build::InlinedPlugin::new()
                .commands(&[
                    "registerListener",
                    "removeListener",
                    "pickFiles",
                    "takeOpenFiles",
                    "secretGet",
                    "secretSet",
                    "secretClear",
                    "deviceName",
                    "printPage",
                    "installApk",
                    "posture",
                    "distribution",
                ])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        ),
    )
    .expect("failed to run tauri-build");
}
