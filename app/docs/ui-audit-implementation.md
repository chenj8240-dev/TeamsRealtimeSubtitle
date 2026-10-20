# Operator UI audit implementation — 20 September 2026

Historical implementation record of the **Live Translation UI Audit**, shipped in
[1.4.1](https://github.com/fmadore/Live-translation/releases/tag/v1.4.1). Current release status
and the consolidated native checks are in the [1.7.1 handoff](store-updates.md#release-171-handoff).

| Finding | Implementation |
| --- | --- |
| F1 | Shared Field, Select, ToolButton, Preference and Stepper controls; rebuilt profiles, reading, history and keyboard help; removed native details disclosures. |
| F2 | Compact profile picker above setup; shortcuts and history in Settings; Gemini explanation in Engine and Reading; Start directly follows the checklist. |
| F3 | Keyboard-navigable Captions, Reading, Transcript history and App tabs. |
| F4 | Removed the primary Close footer; immediate-application note, close icon and Escape dismissal. |
| F5 | Profile summaries and Load actions, per-row management and deletion confirmation, explicit save/rename forms, desktop-only explanation. |
| F6 | Session list and detail pane, equal filter columns, Clear filters, title and export actions, narrow-window stacking. Unreadable records remain explicitly deletable. |
| F7 | Presets first, selection reflects current settings, bright/dark previews always expanded next to the appearance controls. |
| F8 | Shared 8 px control and 11 px card radius tokens across operator surfaces. Status pills and small graphic details retain their geometry. |
| F9 | Consistent Move overlay / Done wording and descriptive show/hide actions across EN/FR/DE. |
| F10 | Store product name in the app heading and document title; product-free Open window / Quit tray actions. |
| F11 | Localized tray labels cross the Tauri boundary with session state; disabled status item includes elapsed time while running. |
| F12 | System capture uses shared chevron selects; one rail action refreshes devices and applications. |
| F13 | Operator type tokens have an 11 px minimum at default Windows text size. |
| F14 | Caption size, compact width and hold controls display px, ch and s. |
| F15 | Five curated swatches for each colour role, selected-state outlines, labelled Custom controls and existing contrast feedback. |
| F16 | One keyboard-help surface under App; shortcut hint alongside Start. |
| F17 | Persistent Settings access to appearance, reading, history and app preferences; profiles remain with setup. |
| F18 | Removed duplicated elapsed figure from cost; clock remains in the status pill. Merged refresh actions. |

## Validation

Svelte/TypeScript checks, formatting, the production build, Clippy with warnings denied and
the dependency audit passed; 337 frontend and 73 native tests passed, with the billable
provider probe ignored. A catalog regression check now rejects replacement characters in
accented labels. Browser review covered all three interface languages, narrow windows and
keyboard tab navigation; native audio, overlay placement and the tray menu need a Windows
application smoke test, and Store screenshots must come from the packaged MSIX.
