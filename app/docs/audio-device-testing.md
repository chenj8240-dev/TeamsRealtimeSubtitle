# Audio devices and native acceptance

Device handling arrived in 1.2.1/1.2.2. The hardware matrix below remains **pending** for the
1.7.1 packages; automated tests and browser previews do not replace it. Repeat key cases with
local Whisper as well as a cloud engine, including Pause and Stop with pending audio.

1.7.0 makes three of these cases more pressing. System capture runs on wasapi 0.26, and its
loopback runner was split into named steps with a shared COM guard; the maintainer tested system
audio on ARM64 on 20 October 2026, and x64 is still to do. Microphones that deliver 24-bit
samples, previously refused, now go through one generic stream builder. And Stop gives up on a
capture thread after three seconds instead of waiting forever on a device that stops responding.

Output discovery runs on an isolated MTA thread with balanced COM cleanup, and CPAL
Xrun/RealtimeDenied quality notifications are ignored while fatal errors are kept. This fixes
what the first installed 1.2.1 test exposed: COM apartment conflicts during output enumeration,
and recoverable microphone xruns ending preflight. The user confirmed both fixes on the signed
1.2.2.0 ARM64 MSIX on 8 September 2026.
Regression tests exercise an STA caller and the real error-callback dispatch logic.

## How devices are handled

The source section offers Refresh devices and an output selector for system audio.
Windows add/remove/state/property/default notifications trigger a coalesced refresh.
Microphones and outputs persist endpoint IDs; an older microphone name migrates only
when it identifies one device. Missing idle selections reset to the Windows default
with a visible explanation. Refresh failures retain the last successful list and choices.

An active capture stays attached to the endpoint opened at startup, including when the
selection was Default; a new Windows default is used only on the next start. Removal or
disabling ends the affected source with a microphone/system-specific error, and the other
source can continue. Stop and retry ends and drains the whole session before restarting; its
fallback variant resets only the failed source to Default. Both actions keep the transcript
and may start billable provider capture again. Nothing reconnects or changes capture
endpoints automatically.

Notification callbacks only try-send to a bounded worker queue; enumeration and webview events
happen away from callbacks. Device-change notifications trigger availability checks on the
owning capture path, with a periodic fallback if a notification is missed. Loopback checks its
pinned endpoint on notification or at most a second later while servicing capture.

Component tests verify stop-before-retry ordering and transcript preservation; controller
tests cover device-list changes and teardown.

## Hardware matrix

Run on Windows 11 with x64 and ARM64 packages where available. Record OS, driver, device,
architecture, source selection, and result. Repeat key failures during level-only preflight
and a live session; use Both to verify that the unaffected source continues.

| Scenario | Expected result | Status |
| --- | --- | --- |
| USB microphone removal/reinsert | Removed mic reports its source; no switch to built-in mic; reinsert appears automatically and Retry uses its ID | Pending |
| Two microphones with identical names | Select either independently; saved ID reselects the same device after restart | Pending |
| USB output removal | System source reports failure; microphone continues; explicit default fallback starts a new session | Pending |
| Bluetooth headset disconnect/reconnect | Lists update through profile/device state changes; no silent switch; Refresh remains available | Pending |
| Default input/output changed while idle | Default markers refresh; explicit choices remain selected | Pending |
| Default input/output changed while capturing | Opened devices remain in use; new defaults apply after an explicit restart | Pending |
| Dock detach/reattach, mixed-DPI monitors | Device lists refresh; controls remain readable and reachable; overlay placement and scaling checked | Pending |
| Sleep/wake, with and without dock attached | Resumed streams either continue on the pinned endpoints or report source-specific errors; retry/fallback remains usable | Pending |
| Disable active input/output in Windows Sound settings | Exact source reports failure even when silent; no automatic substitute | Pending |
| 24-bit microphone (a USB interface or headset set to 24-bit in Sound settings) | Opens, meters and captions like a 16-bit one; Test audio works | Pending |
| Microphone privacy denied | Error identifies Privacy & security > Microphone; retry after permission restored | Pending |
| No microphone or render endpoint at launch | Default remains representable; missing saved ID repaired; capture failure is actionable | Pending |
| Rapid connect/disconnect/default changes during Refresh | Latest list settles; selections do not change underneath active capture | Pending |
| Quit during refresh or preflight | No late UI mutation; capture shuts down; app exits normally | Pending |

For every session failure, check that finalized transcript text survives Retry and Default
fallback, and that the original provider connection drains before the replacement starts.
