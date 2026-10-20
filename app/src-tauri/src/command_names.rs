// The canonical list of commands the front end may invoke.
//
// `build.rs` `include!`s this file to generate an `allow-<command>` permission for each name
// (`AppManifest::commands`), which is what turns the capability files in `capabilities/` from
// documentation into enforcement: once the app has an ACL manifest, Tauri rejects any command
// a window's capability does not grant.
//
// Adding a command therefore means three edits — the handler, this list, and the capability of
// whichever window is allowed to call it. The tests below fail if any of the three is missed,
// rather than leaving it to be discovered as a rejected IPC call during an event.
//
// Plain `//` comments on purpose: `build.rs` includes this file inline, and an inner doc
// comment cannot appear in the middle of a file.

/// Every command registered in `generate_handler!`, in the same order.
pub const COMMANDS: &[&str] = &[
    "list_microphones",
    "list_outputs",
    "list_applications",
    "has_api_key",
    "set_api_key",
    "clear_api_key",
    "ondevice_readiness",
    "whisper_cpu_support",
    "whisper_models",
    "download_whisper_model",
    "cancel_whisper_download",
    "remove_whisper_model",
    "discard_whisper_pending",
    "start_session",
    "stop_session",
    "pause_session",
    "start_audio_test",
    "stop_audio_test",
    "set_overlay_click_through",
    "show_overlay",
    "get_overlay_placement",
    "set_overlay_placement",
    "display_layout",
    "recover_overlay_placement",
    "save_transcript",
    "text_scale_factor",
    "write_recovery",
    "read_recovery",
    "clear_recovery",
    "write_history",
    "append_history",
    "list_history",
    "delete_history",
    "rename_history",
    "ack_close",
    "set_close_guard",
    "set_close_to_tray",
    "hide_to_tray",
    "show_operator",
    "confirm_close",
    "set_tray_state",
];

#[cfg(test)]
mod tests {
    use super::COMMANDS;
    use serde_json::Value;

    const OPERATOR: &str = include_str!("../capabilities/operator.json");
    const OVERLAY: &str = include_str!("../capabilities/overlay.json");
    const LIB: &str = include_str!("lib.rs");

    /// The `allow-…` entries of a capability that name an app command — anything with a
    /// `prefix:` belongs to core or a plugin and is not this module's business.
    fn granted_commands(capability: &str) -> Vec<String> {
        let json: Value = serde_json::from_str(capability).expect("capability is not valid JSON");
        json["permissions"]
            .as_array()
            .expect("capability has no permissions array")
            .iter()
            .filter_map(|p| p.as_str())
            .filter(|p| !p.contains(':'))
            .map(|p| {
                p.strip_prefix("allow-")
                    .unwrap_or_else(|| panic!("{p} is neither prefixed nor an allow- permission"))
                    .replace('-', "_")
            })
            .collect()
    }

    fn windows(capability: &str) -> Vec<String> {
        let json: Value = serde_json::from_str(capability).unwrap();
        json["windows"]
            .as_array()
            .expect("capability has no windows array")
            .iter()
            .map(|w| w.as_str().unwrap().to_string())
            .collect()
    }

    #[test]
    fn each_capability_covers_exactly_one_window() {
        assert_eq!(windows(OPERATOR), ["operator"]);
        assert_eq!(windows(OVERLAY), ["overlay"]);
    }

    /// The point of the split (issue #31). The overlay is a caption surface: it repositions
    /// itself and turns its own click-through back on, and that is the whole list. Credentials,
    /// sessions, capture, the transcript and the close/quit path are the operator's alone.
    #[test]
    fn the_overlay_may_only_place_itself() {
        assert_eq!(granted_commands(OVERLAY), ["set_overlay_click_through"]);
    }

    #[test]
    fn every_command_is_granted_to_some_window() {
        let granted: Vec<String> = granted_commands(OPERATOR)
            .into_iter()
            .chain(granted_commands(OVERLAY))
            .collect();

        for command in COMMANDS {
            assert!(
                granted.iter().any(|g| g == command),
                "`{command}` is registered but no capability grants it, so every call to it \
                 would be rejected by the ACL at runtime"
            );
        }
    }

    #[test]
    fn no_capability_grants_a_command_that_does_not_exist() {
        for granted in granted_commands(OPERATOR)
            .into_iter()
            .chain(granted_commands(OVERLAY))
        {
            assert!(
                COMMANDS.contains(&granted.as_str()),
                "a capability grants `{granted}`, which is not a registered command"
            );
        }
    }

    /// `generate_handler!` is a macro, so nothing at runtime can compare its list with this
    /// one. Reading the source is crude but it is the only thing that catches a command added
    /// to the handler and forgotten here — which would build cleanly and fail on first use.
    #[test]
    fn the_list_matches_the_handler() {
        let handler = LIB
            .split_once("generate_handler![")
            .expect("lib.rs no longer registers commands with generate_handler!")
            .1
            .split_once(']')
            .unwrap()
            .0;

        let registered: Vec<&str> = handler
            .lines()
            .filter_map(|line| line.trim().strip_suffix(','))
            .filter_map(|entry| entry.rsplit("::").next())
            .collect();

        assert_eq!(
            registered, COMMANDS,
            "the handler and COMMANDS have drifted apart"
        );
    }
}
