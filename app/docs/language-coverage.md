# Caption language coverage (issue #78)

Current for 1.7.0. Translation targets keep the catalog introduced in 1.5.0; Whisper adds a
separate spoken-language selector. The dated provider checks below are the latest recorded
evidence, not fresh endpoint verification.

| Engine | Caption language control |
| --- | --- |
| Gemini Live Translate | 78 searchable translation targets |
| OpenAI Realtime Translate | 13 searchable targets; endpoint code probe pending |
| Local Whisper (subtitles) | 99 spoken languages or automatic detection; same-language subtitles |
| Local Whisper (translation) | English only, translated from 99 spoken languages or automatic detection |
| Built-in demo | English/French script buttons only |
| Mistral / Gemini Transcribe | Auto-detection hint, no language selector |

Choosing a caption language never changes the English/French/German interface; see
[localization](localization.md).

An unsupported favourite stays visible and disabled with an explanation. Switching engines
does not change the chosen target: Start and Rehearse stay blocked until a supported language
is selected, and the Rust core rejects unsupported targets too. Cloud subtitle auto-detection
ignores the retained target, and Whisper uses its own spoken-language preference; switching
back to translation keeps the operator's choice.

F2 swaps the first two favourites while translation is stopped. From outside that pair it
selects the first. With fewer than two pins, or either pin unsupported, it does nothing.
Rehearsal uses French for an English translation target and English for other targets.
Demo scripts and rehearsal recordings remain restricted to English/French.

## Catalog

`src/lib/languages.json` is the source of truth: English fallback names, endonyms, provider
memberships, source URLs and verification dates. Run `npm run generate:languages` after
editing it to regenerate the TypeScript union and the Rust enum/support checks; a test runs the
equivalent of `npm run check:languages` to reject drift. Norwegian uses `no`, with `nb` as a
search alias rather than a second option. Portuguese region and Chinese script tags stay
distinct.

Names come from `Intl.DisplayNames` in the interface locale, falling back to the catalog's
English name rather than a bare code. Search strips combining accents and case and matches
codes, English/localized names, endonyms and aliases; prefixes rank before substrings. An empty
search lists favourites first, in pin order; the star next to each row pins or unpins it.
Favourites live in `language.favourites`, never in StartOptions or IPC, and survive restart
independently of session options. UI catalogs contain only the selector's copy.

Overlay captions carry the selected BCP-47 code and their own text direction. Arabic, Hebrew,
Persian, Urdu and Sindhi are RTL; unknown auto-detected subtitles use `dir="auto"`, and Stable
reading aligns to the start edge. Font stacks keep the system fallback after bundled Archivo
for scripts the bundled font does not cover.

## Keyboard and accessibility

- Focus/click opens the combobox and selects its displayed text for replacement.
- Type to filter; Up/Down navigate, Home/End jump, Enter selects a supported row.
- Escape discards the query and restores the selected value. Clicking outside or moving
  focus out closes the list. Tab does not trap focus.
- Tab from the input reaches the active row's pin button; Enter/Space toggles it. Other pin
  buttons remain clickable without adding 78 stops to the keyboard sequence.
- The input exposes expanded/controlled/active-descendant state. Options expose selected
  and disabled state; unsupported reasons are part of the option name. Pin buttons are
  siblings of the listbox, never nested inside its options.

Follow the [Windows accessibility checklist](accessibility.md) for Narrator and packaged
contrast/theme checks. Automated DOM assertions cannot establish what Narrator speaks.

## Verification status

- 2026-09-22: Gemini's table rechecked (78 languages, `no`/`nb` on one row; see
  [Gemini API notes](gemini-live-api.md#target-language-catalog)). OpenAI's cookbook still
  lists 13; the configuration probe found no saved key and a rerun with user-assisted
  credentials is pending (see [OpenAI API notes](openai-realtime-api.md#target-language-catalog)).
- 2026-10-04: local ARM64 Whisper fixture inference passed in English with detection and in
  French with an explicit language. That does not establish accuracy in all 99 languages;
  see the [Whisper acceptance plan](local-whisper.md#validation).
- Tests cover generated catalog parity, persistence/defaults, search ranking, favourites,
  F2, keyboard controls, unsupported options, history and caption direction. Rust tests
  verify provider memberships and every demo script's packaged WAV.
- Browser checks at 980×660 in English, French and German: the open selector fits the rail,
  pinned Swahili survives the Gemini → OpenAI switch with a disabled reason, and the selected
  value is preserved. Japanese/Arabic preview glyphs render, and Arabic stable reading aligns
  at the right edge with `dir="rtl"`. Reproduce with `/overlay?language=ja` or
  `/overlay?language=ar`; `he`, `fa` and `ur` previews are also available.
- **Pending:** real speech into a non-EN/FR target on both engines, native Narrator
  announcements and final MSIX checks. Keep #78 open and complete the live code probe and
  real-speech checks before Store submission.

## Live acceptance procedure

1. Save OpenAI and Gemini keys in the app; never put keys in screenshots or test reports.
2. Run the [OpenAI code probe](openai-realtime-api.md#target-language-catalog). Record every
   accepted/rejected code, including all Portuguese/Chinese variants, and regenerate the
   catalog if its memberships change.
3. In a native development build, choose Live translation → German → Gemini → microphone.
   Start, speak a new English or French sentence, confirm German in the overlay and transcript,
   then Stop. Repeat with OpenAI. Record the input sentence, output and provider/date; a
   fixture or synthetic speech run does not satisfy this check.
4. Choose Japanese, then Arabic on Gemini. Check actual glyph fallback, wrapping and stable
   reading's right-hand start edge for Arabic. Repeat in Fit window and Compact layouts.
   Verify Hebrew/Persian/Urdu direction. The system font fallback must render readable glyphs.
5. At 980×660, check the open selector in English/French/German. Navigate and pin with only
   the keyboard, switch providers with an unsupported target, and confirm Start is blocked.
6. Run Narrator through the combobox; verify active option, selected/disabled state and
   the unsupported reason. Complete the existing packaged accessibility checklist.
