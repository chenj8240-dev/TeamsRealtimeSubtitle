# Accessibility

What this app owes an operator who cannot rely on colour, a mouse, or small text, what is
checked automatically, and what has to be checked by hand before a release.

The target is WCAG 2.2 AA for the operator window, plus the Windows-specific behaviour the
Microsoft Store accessibility checklist asks for: keyboard operation, Narrator, contrast
themes, and text scaling.

The overlay is treated differently on purpose. It is not a control surface but the caption
projected into a room, over slides nobody in this app controls. Its contrast is measured
against the scrim it paints, not the operator's system palette, and it opts out of contrast
themes and of Windows text scaling (see [below](#windows-text-scaling)).

## What the code guarantees

| Concern | Where it lives |
| --- | --- |
| Text contrast | `src/app.css` — four text levels (bright, body, secondary, muted), every one of which clears 4.5:1 on each of the three surfaces; the muted level also clears it on every tinted wash the stylesheet names. `--faint` carries no text; it is the idle status dot at the 3:1 non-text target. No component paints with a hex literal, so every colour on screen is one the checks have seen. |
| Text size | `src/app.css` — seven type roles (caption 11, small 12, body 13, label 14, title 17, heading 21, display 27px at 100%), each a multiple of `--text-scale`. Spacing is a six-step `rem` scale, so the space around text grows with it too. No component declares its own pixel size or spacing. |
| Windows text scaling | `src-tauri/src/textscale.rs` reads `UISettings.TextScaleFactor` and follows its change event; `src/lib/textScale.ts` writes it onto the document root. |
| Reflow | The operator's two columns are a container query in `em`, so the window stacks them and scrolls as one column once the operator's text no longer fits beside itself. |
| Caption reflow | Fit window measures rendered text against the overlay width and height, preserving newest words at the chosen font size. Compact keeps a separate width control. Both layouts refit on resizing and font changes; see [caption layout](caption-layout.md). |
| Caption colours | `src/lib/captionColour.ts` — the operator picks the ink and the scrim, and every ratio is computed on the **composite**: the scrim as it is thinned under the text, over both a white and a black slide, with the halo that rings the glyph. One function settles how dim each step is painted *and* what the readout says, so the two cannot disagree. A single control puts the whole overlay appearance back to what it ships with, because a way into an unreadable palette needs a way out of it. |
| Caption typeface | `src/lib/captionFont.ts` offers faces this machine actually has, checked with a canvas width probe rather than assumed from the Windows SKU. Every stack ends in the bundled Archivo, and every face offered has a real weight at 600 — a synthesized bold at projector size is a legibility failure, not a cosmetic one. |
| Reaching the controls | The caption appearance controls are one snippet rendered in two places — the running rail and the settings panel — and the panel is opened by the one button that is in the same place in every state, so no control is discoverable only in a state the operator has to reach first. |
| Language | `src/lib/i18n/index.ts` sets `<html lang>` from the active locale, in both windows. The overlay's captions are not in the interface language, so they carry their own `lang`, pushed as `OverlayConfig.captionLanguage`; while a subtitle engine is auto-detecting it is `lang=""`, which is how HTML says the language is unknown. |
| Focus | One `:focus-visible` ring in `src/app.css`, on every focusable element. A component may restyle it; none may remove it. |
| Section structure | The window has one `h1` (its name — visually hidden, because the Windows frame already prints it above the toolbar) and an `h2` per region, so Narrator's heading navigation walks the rail and the stage. |
| Announcements | Two `role="status"` regions in the operator window — session state and the last status message — plus one in the transcript panel for a completed save. They hold nothing that changes on a timer. The running rail's input labels are not live, because they flip with every pause in speech; a separate region beside them speaks only when a source stops with an error or has sent audio but no captions for 15 seconds, and is empty again once it recovers. |
| Toggle buttons | A button whose name changes with its state — Pause and Resume, Move and Done — is a plain button, not also `aria-pressed`: Narrator read "Resume, toggle button, pressed", which says the opposite of what is happening. While moving, Done is drawn as the primary action instead of a pressed one. `aria-pressed` stays on selections whose name does not change: the source, engine and interface-language cards, presets, swatches and pinned languages. |
| Progress | `aria-busy` on Start, Stop, the audio test, and both save buttons. |
| Level meters | `role="meter"`, with `aria-valuenow` rounded to a tenth so the attribute does not change twenty times a second. |
| Modal prompts | `role="dialog"`, `aria-modal`, a Tab trap, focus on the safe answer, Escape where a safe dismissal exists, and focus returned to the opener on close. Written once in `src/lib/ModalPrompt.svelte` and shared by the two decisions and the settings panel, so the chrome an accessible dialog is judged on cannot drift between them. When dialogs stack — a quit prompt over Settings — only the topmost handles Escape and Tab, and the one beneath gets the keyboard back when it closes. |
| Shortcuts | One table in `src/lib/shortcuts.ts`: the listener matches it, `aria-keyshortcuts` on Start and Stop announces it, and the key caps print it in the interface language's key names (`Strg+Umschalt+Leertaste`). The printed copy inside a button is `aria-hidden`, so it never becomes part of the button's name. |
| Targets and names | Every button is at least 32px tall at 100%. The colour swatches are named (Mint, Navy), not read out as hex, and a chosen swatch has its own inset ring rather than the focus ring's outline. The profile picker is named by its visible label (WCAG 2.5.3). |
| Motion | `prefers-reduced-motion` stops the sweep, the breathing status dot, the caret and the meter easing; a global safety net catches anything added later. |
| Contrast themes | `forced-colors: active` blocks next to the styles they correct — selection outlines, dropped gradients, the meter fill, the status dot. |

## What is checked automatically

- `npm test` → `src/lib/palette.test.ts` reads the tokens out of `app.css` and fails if any
  text token drops below 4.5:1 on any surface, if the muted level drops below it on any tinted
  wash, or if any non-text mark drops below 3:1. It pins the ramps (four text levels, three
  surfaces, three lines), and it reads every component stylesheet: a hex literal, or a text
  colour that is not a token, fails it, and so does an overlay toolbar that a white slide
  would lift above `--surface-2`. It exists because the contrast failures behind issue #24
  arrived one shade at a time, and nothing could see them.
- `npm test` → `src/lib/captionColour.test.ts` is the same guard for the overlay, which
  `palette.test.ts` cannot reach because its colours are no longer in the stylesheet. It fails
  if the shipped default drops below 4.5:1 at any step over either slide, if the default stops
  reproducing the overlay's original literals, or if a colour is written back into the
  overlay's stylesheet where the check cannot see it.
- `npm test` → `src/lib/typeScale.test.ts` reads the same stylesheets and fails if any
  component declares a bare `font-size` in pixels — a size Windows' text setting cannot reach,
  and a failure invisible on a machine at 100%. It also fails on a size outside the seven
  roles, on a small-capital label not tracked at `--tracking-caps`, on a line-height outside
  the three `--leading-*` steps (caption text excepted), and covers the clamp that stands
  between a settings event and every `calc()` in the stylesheet.
- `npm test` → `src/lib/spacing.test.ts` does the same for spacing, corners and control boxes:
  every padding, margin and gap is a `--space-*` step (or an optical nudge of a few pixels),
  every radius is a `--radius-*` token at Windows 11 geometry (4px in the page, 8px for
  dialogs and flyouts), and every control box is one of the three `--control-*` heights.
- `npm test` also covers the modal Tab trap, stacked dialogs and the save announcement.
- `npm run check` catches Svelte's own accessibility lints (missing labels, roles on the wrong
  element, click handlers without keyboard equivalents).

Text on a **tinted wash** that the stylesheet names (`--accent-wash`, `--warn-chip` and the
rest: every hue has the same 8% `-wash` and 14% `-chip`) is checked by `palette.test.ts` for the
muted level, which bounds every grey above it. Anything else composited — a coloured label on
its own wash (amber on amber), or text over a gradient — is measured against the rendered
window instead: run `npm run dev`, then walk the DOM in the browser preview, comparing each
element's computed colour against its composited background.

## Release checklist (manual, on Windows)

Run these against the **Store MSIX**, not a dev build — package identity changes how Windows
treats the window.

1. **Keyboard only.** Unplug the mouse. Reach every control in the rail, the checklist, the
   transcript panel and the tray menu. Start a session, place the overlay, stop it, save the
   transcript, and quit. Focus order follows the visual order and the ring is always visible.
2. **Narrator.** Same walk. Headings navigate (`H`). The session state, status messages and a
   completed save are each announced once, not repeatedly. The level meters do not chatter.
   The input status is silent while captions flow and speaks once when a source goes stale or
   stops with an error. Pause, Resume, Move and Done read as plain buttons.
3. **Contrast theme.** Settings → Accessibility → Contrast themes → Aquatic and Desert. The
   selected mode, source, language and engine stay distinguishable; the Start button is
   readable; the level meter is visible; the status pill keeps an edge. The overlay's audience
   view keeps its own colours — that is deliberate.
4. **Caption colours over real slides.** With the overlay placed, put a **bright** deck
   behind it and then a **dark** one, and read the captions from the back of the room in both.
   Include a finished line and a trailing previous line, which are the dimmest text on screen
   and the steps the check is decided by. The reading beside the control is computed against
   exactly these two extremes; this is the step that confirms the model matches the room.
5. **Text scaling.** Settings → Accessibility → Text size. Walk 100%, 150% and 225% with the
   window at its 980 × 660 minimum and again maximized. The window follows the slider without
   a restart. Nothing is clipped or overlapping; the rail's cards keep their proportions; the
   two columns stack into one scrolling column when they no longer fit, and come back when the
   window is widened. The overlay does not change — see below.
6. **Display scaling.** 150% and 200%, and a mixed-DPI two-monitor setup with the overlay on
   the second display.
7. **Reduced motion.** Settings → Accessibility → Visual effects → Animation effects off. No
   sweep, no breathing dot, no blinking caret.
8. **Accessibility Insights for Windows** on the operator window, and **Accessibility Insights
   for Web** (or `axe` DevTools) against `npm run dev` for the DOM-level rules.
9. **Minimum window size.** Resize to 980 × 660. Nothing overlaps and nothing is clipped; both
   columns scroll rather than compress.
10. **Responsive captions.** Follow the [caption layout matrix](caption-layout.md#release-verification):
    narrow/wide and short/tall windows, 20/38/96px fonts, both origins, long words, and
    Fit window / Compact switching. Verify the selector’s keyboard operation and Narrator
    label in English and French. Reset must return to Fit window; the hidden measurement
    paragraph must not be announced. If the window cannot fit a whole line at the chosen
    font size, enlarge it or reduce the font size.

## Windows text scaling

Windows' *Make text bigger* setting does not reach web content inside WebView2 — it is
[an open WebView2 request](https://github.com/MicrosoftEdge/WebView2Feedback/issues/1662),
not something this app gets for free. Display scaling works, because that scales the whole
window. So the core reads the factor and the operator window applies it:

1. `src-tauri/src/textscale.rs` reads `UISettings.TextScaleFactor`. The operator window asks
   for it once as it boots — a command rather than only an event, so someone who needs 225%
   text is not shown a frame of 9.5px type before the window could subscribe. The module then
   subscribes to `TextScaleFactorChanged` and emits every later change, so moving the slider
   moves the window without a restart.
2. `src/lib/textScale.ts` clamps the factor to the slider's own 1 … 2.25 and writes it to
   `--text-scale` on the document root. Both ends clamp: the value crosses a JSON event
   boundary, and a `NaN` there would invalidate every `calc()` in the stylesheet at once.
3. `src/app.css` multiplies the whole type ramp by it, and scales the root font size by it as
   well. The ramp is what makes the text grow; the root size is what makes the *layout* grow
   with it, because every gutter and width that has to hold text is expressed in `em`.

Honouring a text-size setting is not only a question of type: a 225% caption inside a 380px
rail is not accessible, it is clipped. So the rail, the meter labels, the transcript's gutter,
the key field and the dialog are all measured in `em`, and the two-column layout is a container
query — `@container window (min-width: 53.75em)`, the 380px rail plus the narrowest stage that
still shows a caption line. Being in `em`, that threshold rises with the text, so the columns
stack into one scrolling column where they would otherwise start clipping, and return when the
operator widens or maximizes the window. At 100% it resolves to 860px, inside the 980px minimum
window, so the normal layout is untouched.

**The overlay opts out**, for the same reason it opts out of contrast themes: its captions are
not chrome on the operator's screen, they are projected content whose size the operator sets
for the room, with its own control and its own `--fs`. An accessibility setting on the
operator's PC has no business resizing what an audience is reading.

Verified in a browser preview at 980 × 660 — the window's minimum — with the factor forced to
every step of the Windows slider: no horizontal overflow, no clipped box, and no overlapping
region at 225%. The native walk is item 5 of the release checklist.

## Feature checks

[Operator shortcuts](usability.md#keyboard-controls) apply only with the operator window
focused, outside editable inputs and dialogs. Native screen-reader, contrast-theme, 225%
Windows text scaling and mixed-DPI acceptance for the final package are tracked in the
[current release checklist](store-updates.md#release-171-handoff).

### Settings and date fields

Settings uses a roving tab stop with Left/Right, Home and End navigation. The dialog
frame and tab bar stay stationary while the selected body scrolls; the body is also
keyboard focusable. Switching tabs starts the new panel at its top. The close control
remains outside the scrolling body. Modal Tab cycling excludes negative-tabindex controls.

Date fields have explicit labels, localized format hints and `aria-invalid` with a linked
localized error for invalid input. Calendar buttons have translated accessible names;
the implementation's hidden native date input is excluded from the accessibility tree
and normal Tab order. Packaged WebView calendar and screen-reader acceptance remain pending.

### Caption language selector (#78)

The translation selector uses a combobox and filtered listbox with active-descendant,
selected and disabled states. Keyboard and pin interaction are documented in
[language coverage](language-coverage.md#keyboard-and-accessibility). Test in all three UI
locales, including an unsupported pinned language after a provider change. The list has
bounded scrolling and scrolls into the operator viewport on opening; the Start/Stop bar
remains reachable. Confirm active option and disabled reason with Narrator in the native
build before release. Automated keyboard tests are not a substitute for that check.

Caption paragraphs inherit their selected language and explicit RTL/LTR direction; unknown
subtitle languages use auto direction. Stable reading uses logical start alignment so Arabic
starts at the right edge. Verify actual Japanese and Arabic glyph fallback on Windows; the
bundled Archivo face falls back to the system for uncovered scripts.

### Whisper controls and Pause

Test keyboard access to Whisper's spoken-language and model selectors, Download/Cancel/Remove,
and the model's ready/error status. Verify that the pending-audio duration and finishing state
are readable and that the discard confirmation keeps focus inside the active dialog. Check
Pause/Resume labels and Ctrl+Shift+P without losing access to Stop. These native checks remain
part of final-package acceptance, including Narrator and enlarged Windows text.
