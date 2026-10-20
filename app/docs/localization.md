# Localization

The rule the whole design follows: **the interface language is not the caption language.** An
operator running a French-language event may be working in English, or the other way round.
Nothing here touches `options.targetLanguage`, and the language selector is deliberately in
**Settings → App**, separate from the numbered setup sheet.

## Where the words live

| | |
| --- | --- |
| `src/lib/i18n/en.ts` | The English catalog, and the shape every other catalog has to match. `Messages` is `typeof en`. |
| `src/lib/i18n/fr.ts` | French. Typed as `Messages`, so a missing, extra or wrongly-shaped key fails `npm run check`. |
| `src/lib/i18n/de.ts` | German. Same contract as French. |
| `src/lib/i18n/index.ts` | The `locale` store, `t` (the active catalog), `localeTag`, detection and persistence. |
| `src-tauri/src/errors.rs` | The ids the core reports failures under. It never writes a sentence. |
| `src/lib/errors.ts` | Turns an id plus its technical detail into one line the operator can read. |

Components read `$t.some.key`. Anything with a parameter is a function — `lines(n)`,
`isDefault(name)` — so word order and plural rules stay the translator's decision rather than
being frozen into a `{0}` placeholder by English.

User-entered profile names and session titles are not translated. Tray labels follow the
interface through `TrayLabels` sent to the Rust core.

## What the core does and does not say

A command that fails rejects with `{ id, detail? }`, not with a sentence:

```rust
AppError::with(id::MIC_CAPTURE, format!("{error:#}"))
```

The catalog owns the wording for `error.micCapture`; the detail is the Windows or provider
text, which is never translated and is appended in parentheses. An id the catalog has never
heard of falls back to the detail alone, so a core that has learned a new failure still says
something an operator can act on.

Status events carry the same shape, and the status store keeps it structured until render
time — which is what lets a message already on screen re-word itself when the language
changes.

## Choosing the language

First run follows Windows (`navigator.languages`, matched on the primary subtag, so `fr-CA`
and `fr-FR` are both French). After that the explicit choice wins and is persisted in
`localStorage` under `ui.locale`.

The overlay is a **separate webview**, so the operator pushes the choice to it through the
existing overlay-config event rather than relying on a `storage` event crossing two windows.

## Dates

History date fields (`usability.dateFormat`, `chooseDate`, `invalidDate`) show a hint in the
interface language for the same ISO year-month-day value; changing language changes the hint,
not an entered date or its filter (see
[transcript history](transcript-history.md#titles-and-search)). The native calendar receives
the locale tag, but its popup wording can still follow browser/WebView regional settings.
German component tests cover input validation, leap days, calendar selection, inclusive
history bounds and clearing filters.

## What is checked automatically

- `npm run check` — the type system is the completeness check. Every catalog is `Messages`.
- `npm test`:
  - `i18n.test.ts` — key-for-key parity, matching parameter counts, nothing blank, each
    language named in its own language, every locale the selector offers actually named,
    detection and persistence, and that `t` follows the store. The parity checks iterate
    `TRANSLATIONS`, so a fourth language is one entry there rather than a new copy of each
    test.
  - `i18n.test.ts` also bounds how many whole English sentences a translation may keep
    (under 10% of them). A catalog copied from another and left half-translated passes the
    type system, passes parity, and renders the wrong language; shared sentences are the
    cheapest signal of it.
  - `errors.test.ts` — reads the ids out of `src-tauri/src/errors.rs` and fails if a failure
    the core can report has no sentence in either catalog.
  - `transcript.test.ts` — the saved file's headings and date follow the language it is given.

## Adding a language

1. Copy `en.ts`, rename the export, set `locale.name` (in that language) and `locale.tag`.
2. Add it to `Locale`, `LOCALES`, `CATALOGS` and `LOCALE_NAMES` in `index.ts`, and re-export
   it. `detectLocale` needs nothing: it matches the primary subtag against `LOCALES`, so
   `de-AT` and `de-CH` are German the same way `fr-CA` is French.
3. Widen `OverlayConfig.locale` in `src/lib/types.ts`. The overlay validates what it is handed
   with the exported `isLocale`, so there is no second list to update there — and the Rust
   core has no locale of its own; it reports ids, never sentences.
4. Add it to `TRANSLATIONS` in `i18n.test.ts` and to the `it.each` list in `errors.test.ts`.
5. Run `npm run check` and `npm test`; both will name anything missing.
6. Walk the operator window and the overlay at the minimum window size (980×660) — a
   translation is routinely 20–30% longer than its English source, and this UI is dense.
   Look first at labels in fixed columns: a language that builds compound words has nowhere to
   wrap. German's `Raummikrofon` painted across the level meter until its label column was
   sized to hold the longest label on one line.

## German, specifically

`de.ts` is translated and addresses the operator formally (*Sie*), which is what a tool driven
in front of a room should do.

The terminology follows the **German Windows shell**, because these are things the operator
has to find on their own screen:

| | |
| --- | --- |
| tray | **Infobereich** (not "Tray"), with **Taskleiste** for the taskbar |
| Credential Manager | **Windows-Anmeldeinformationsverwaltung** |
| settings paths | **Windows-Einstellungen > System > Sound**, **> Datenschutz und Sicherheit > Mikrofon** |

The `ms-settings:` URIs are left alone — they are identifiers, not prose.

**Overlay** and **Engine** are kept as they are; both are current in German software. Otherwise:
**Untertitel** covers captions and subtitles alike, **Transkript** the transcript,
**Vorabprüfung** the pre-flight, **Probelauf** the rehearsal, **Raummikrofon** the room mic.

German needs no typographic rule of its own, so there is no `de` equivalent of the French
punctuation tests. `de-DE`'s medium date style is numeric and dotted (`27.08.2026`) where
English and French both name the month, which is what `formatDateTime`'s test asserts.

The German Store copy (description, features, short description, release note and screenshot
descriptions) is in `docs/store-listing.md`. Still open:

- German screenshots in `docs/store-screenshots/de/`, captured from the final MSIX with the
  interface set to German.
- A native German speaker reviews the catalog and the Store copy.
- **German subtitles are unverified.** Both subtitle engines detect the spoken language and
  Gemini documents over 70, so they most likely work already, but nobody has put German speech
  in front of them, so nothing claims it. It would be the strongest line a German listing could
  carry.

## French, specifically

`fr.ts` is translated. Its wording follows the French Store copy in `docs/store-listing.md`,
which was written first and is what a French-speaking operator will have read before
installing — **surimpression**, **transcription**, **démonstration intégrée**, **zone de
notification**, **Gestionnaire d'informations d'identification Windows**. The layout controls
are **Disposition des sous-titres**, **Adapter à la fenêtre**, **Compact** and **Largeur des
lignes**, the same in the live rail and the settings panel.

Two things are not translated, on purpose:

- **The product's own name.** The Store lists it in English; a French name would give the same
  app a third one. The line under it is prose, so it is translated.
- **The two Windows settings paths** an operator has to find on their own screen, and the
  provider and model names.

`i18n.test.ts` enforces the two typographic conventions that are invisible in a diff: a
non-breaking space before `: ? ; !`, and the typographic apostrophe.

The committed French screenshots are historical; new controls and listing copy need
final-package screenshots, because earlier review does not certify newly added strings.

## Caption languages (issue #78)

Caption languages have their own catalog, `src/lib/languages.json`, independent of the
interface: choosing one never changes the interface language. UI catalogs contain only the
selector's copy; language names come from `Intl.DisplayNames` in the interface locale. The
catalog, search, favourites and text direction are described in
[language coverage](language-coverage.md#catalog).
