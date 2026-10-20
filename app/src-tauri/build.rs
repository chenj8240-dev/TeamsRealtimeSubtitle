// The command list is `include!`d rather than duplicated: `AppManifest::commands` generates an
// `allow-<command>` permission for each name, and the same list is compiled into the crate so a
// test can check it against the handler and the capability files. See `src/command_names.rs`.
include!("src/command_names.rs");

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    // Declaring an app manifest is what makes Tauri enforce the ACL on the app's own commands,
    // so a failure here would silently mean an unenforced split rather than a broken build.
    .expect("failed to generate the app ACL manifest");
}
