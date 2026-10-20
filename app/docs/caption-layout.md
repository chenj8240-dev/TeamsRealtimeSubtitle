# Caption layout

Follows [issue #77](https://github.com/fmadore/Live-translation/issues/77). Thanks to
**@valentinrabot for the feedback and responsive-layout suggestion** (not the implementation).

## Fit window

Settings → Reading → Caption layout → **Fit window** (French: **Paramètres → Lecture →
Disposition des sous-titres → Adapter à la fenêtre**) is the default when no layout preference
has been saved; Settings stays available during a live session. Widening the overlay allows
more words per line; increasing its height shows more recent context. The font size stays
unchanged, captions stay bottom-aligned with margins, and the newest words take priority when
space shrinks.

Use **Place the overlay** to move or resize it, then **Lock into place** to see the audience
view again; placement mode shows positioning controls instead of live captions. The locked
overlay remains click-through. **Align to bottom / Aligner en bas** also resets the height to
a shallow strip sized for roughly two lines per visible source (160 logical pixels at the
default font with one source); new overlays start at 160 pixels high. Drag the edges taller
for more reading context. Resizing does not create text: a short caption or a new session
with little history can still leave empty space.

At launch the overlay reopens where it was last placed, remembered separately for each
arrangement of displays: on the projector whenever the projector is connected, and in the
laptop's own place when it is not. The same holds while the app runs: unplugging the projector
brings an overlay that was on it back onto a connected display, resized if it no longer fits,
and plugging it back in returns the overlay to where it was last placed there. An overlay that
is still fully usable is never moved, a hidden one is recovered without being shown, and
captioning carries on throughout. **Move overlay** and showing a hidden overlay check its
position again first, so the window is never placed or shown off every display, and Escape in
move mode does not put it back on a display that has gone. Moving the overlay back onto the
laptop does not replace the placement remembered for the projector.
Finishing placement (**Done**, **Lock into place** or Enter) and loading a meeting profile both
count as placing it; Escape, which puts the window back, does not. Displays the app has not
seen yet reopen the most recent placement, kept within a connected display's work area, and
the first launch is centred. Eight arrangements are kept, the one used longest ago making way.
A change of Windows scaling counts as a new arrangement: the most recent placement keeps its
size in physical pixels, so captions there read larger or smaller, and placing the overlay
again remembers it for the new scaling.

When both sources have visible captions, system audio appears above the microphone,
with labels, and they share the available height. A single visible source uses the
available height without an origin label. If the window is too short to fit even one
complete line at the selected font size, enlarge it or reduce the font size.

## Compact

Choose **Compact** to retain a limited line width. **Line width / Largeur des lignes**
appears only in this mode. The default is 30ch, adjustable from 20ch to 60ch; the
character budget remains proportional to this width. A smaller window can further
limit the text that fits.

Switching layouts keeps the chosen font, colours and compact width. The layout preference
survives relaunch and is shared by the settings panel and live rail. **Reset appearance**
restores Fit window and the other appearance defaults; it does not move the overlay.

## Stable reading

Choose **Stable reading** for a teleprompter-style display ([issue #79](https://github.com/fmadore/Live-translation/issues/79)).
Text is left-aligned and anchored to the top of each source's allocated area. New words wrap
naturally. Once the area fills, the viewport advances one complete rendered line at a time;
there is no continuous centering, animated scrolling, or moving caret. Earlier turns retain
the same colour so finishing a turn does not visually relocate the reading point.

This mode retains the session's caption context in memory, including during pauses; Stop
clears it. Once 180 lines have scrolled out of view, the oldest are dropped at the start of a
rendered line, keeping 60 hidden lines; cutting only at a line start means no line already on
screen re-wraps. The two sources remain independent and share the window. Resizing, changing
fonts, adding a second source, or provider corrections can still reflow text. The backing is
even across the reading area so top-aligned text is readable over light content.

## Hide filler words

**Hide filler words** is off by default ([issue #80](https://github.com/fmadore/Live-translation/issues/80)).
It removes listed words from the overlay and repairs the clause punctuation around them: only
the removed word and its adjacent commas, semicolons or colons go, so other punctuation and
spacing (including French spacing before `?` and `!`) stay as the provider returned them. The
built-in list is the hesitation tokens `um`, `uh`, `erm`, `hmm`, `euh` and `heu`. Substrings,
all-capital abbreviations, quoted words (including French « spaced » guillemets) and unfinished
streamed tokens are preserved. This is a conservative text filter, not semantic speech
analysis.

Translation mode filters the translated text shown to the audience; subtitle mode filters the
same-language text. The operator transcript, saved history, recovery copy and exports keep the
original text, and no provider setting or extra request is involved. In Stable reading, each
turn is cleaned once as it joins the retained context, so a mid-session change to the option
or the list applies to the live turn and new captions without re-wrapping lines already read;
Fit window and Compact apply it to the text on screen at once.

### The word list

While the option is on, **Settings → Reading** shows the active list under it
([issue #85](https://github.com/fmadore/Live-translation/issues/85)). Operators can remove any
word, including the built-in ones, add words one at a time, and **Reset to defaults**. Each
change reaches the overlay at once, without restarting the session.

- **Whole words only.** A listed word matches only between spaces or punctuation, in any
  script and without regard to case; `eh` never matches inside `ehé`. It is removed wherever it
  stands on its own, whatever it means there, which is why the interface warns against
  ambiguous words such as “like”, “well” or “so”.
- **One word per entry.** Entries are trimmed, and blank entries and duplicates (ignoring case)
  are rejected. Letters, marks and digits may be joined by hyphens or apostrophes (`mm-hmm`,
  `y'know`); either apostrophe or hyphen form in the captions matches. Phrases, patterns and
  per-language lists are out of scope. The list holds up to 100 words of up to 40 characters.
- **Languages written without spaces.** In Chinese, Japanese and Thai captions a listed word is
  removed only when it stands alone between spaces or punctuation.
- **Storage.** Nothing is stored while the list is the built-in one. A customized list persists
  as JSON under `overlay.fillerWords`; an emptied list persists as `[]` and removes nothing.

The option and the list persist across relaunch and synchronize with the live controls. The
list is not part of the appearance: Reset appearance switches the option off but keeps the
list, and meeting profiles do not store it.

## Original speech under translations

Settings → Reading → **Show the original speech under translations** adds a smaller (0.6×),
dimmed line under each translated caption, for people following the speaker's own language.
It is the current turn's source text, fitted by the same measured tail search as the caption,
two lines when the row has room for them and one otherwise. Like the caption, it reaches that
search as at most its last 12,000 characters, cut at a word. It is left out of Stable reading —
a second, separately scrolling language under one flowing paragraph would be two things to read
at once — and subtitles have no separate original to show. Snap to bottom makes room for one
line of it per row. Off by default. The browser preview shows it on the remote row when the
setting is on.

## Two caption languages

With a second caption language (Step 03, translation only), each source gets a row per
language, the first above the second, in the order remote-first, room-second. The labels
become language codes — `FR`, `EN` — with the source name too when both sources are on
screen; a name would crowd the caption at projector distance. Each row is marked up with its
own language. The original speech, when shown, goes under the first language only: the second
heard the same speech. Snap to bottom sizes the strip for up to four rows. `?language=bilingual`
previews it in a browser.

## Fitting cost

Fit window hands the fitting search up to 12,000 characters of context, and every probe is a
synchronous layout. The search starts from the tail the region could possibly show
(`captionReach`: two rows of slack, glyphs a fifth of the line height wide) and falls back to
the whole text only if even that tail fits, so the result is unchanged. In headless Chromium at
1500 px wide and 38 px with 12,000 characters of context, this took the median fit from 4.1 ms
to 0.7 ms per caption per source. Line height is read once per font.

The same 12,000 characters (`CAPTION_TAIL_CHARS` in `captionLayout.ts`) bound everything else
that streams with a turn: the current turn in Fit window, its original speech, and the operator
window's live stage, which shows the newest part of each current turn and its original rather
than laying a turn of several minutes out again on every interim. The transcript keeps every
word.

## Recent context and the transcript

Fit window retains a bounded recent history in memory for each source. Completed text is
dimmed ahead of the current turn. Growing the window can reveal more of that history;
shrinking it removes older words from the audience view first. Very long unbroken tokens can be
shortened so their newest characters still fit.

In Fit window and Compact, captions clear after the [reading pause](#reading-pace-and-preview),
and clearing also removes that source's reading context. This is a live-caption view, not a
scrolling transcript viewer. The full operator transcript and exported files are unaffected by
overlay trimming or expiry. No additional audio capture, provider request, disk history or
telemetry is introduced.

## Release verification

Repeat this matrix against the final 1.7.1 x64 and ARM64 MSIX packages. The last recorded
browser and native pass was for 1.2.4 (14 September 2026).

| Check | Expected result |
| --- | --- |
| Clean preferences | Fit window is selected; compact width is hidden. |
| Wider, same height and font | Longer lines use the available width without horizontal clipping. |
| Taller, same width and font | More available recent context is visible; newest words remain visible. |
| Shrink and enlarge again | Oldest words disappear first; retained context returns when space permits. |
| Short turns and long continuous speech | Recent short turns accumulate; long text remains bounded and responsive. |
| Microphone, system, then Both | Each source works alone; simultaneous rows remain labelled and fit together. |
| One source expires | Its row clears; the other source gains the available space. |
| Long words, URLs, punctuation and emoji | No horizontal overflow or broken Unicode in shortened tokens. |
| Caption fonts at 20, 38 and 96px | Text refits after size/typeface changes; no partly clipped lines. |
| Windows scaling | Check 100%, 150%, 200% display scaling and moving between monitors with different DPI. |
| Compact and reset | Width is adjustable only in Compact; switching retains it; reset returns to Fit window. |
| Relaunch | Layout and appearance persist; the fresh session does not resurrect old captions. |
| Placement and locking | Move/resize, Enter, Escape and click-through still work; the move-mode preview stays readable over a white slide (1.6.1); Done in the operator window marks the overlay placed (1.7.0). |
| Placement across launches | Placed on the projector, it reopens there; launched without the projector it opens fully on the laptop, and with the projector reconnected it is back on it. With the laptop at 150% and the projector at 100%, the size is kept, not scaled. No visible jump from the centre at launch. |
| Display changes while running (#137) | With the overlay on the projector, unplug the projector without quitting: within a couple of seconds the overlay is fully on the laptop, and **Move overlay** shows it there, draggable. Plug the projector back in: the overlay returns to its projector placement. Repeat with the overlay hidden (it stays hidden, then shows on the laptop), in move mode (Escape leaves it on the laptop), with a projector to the left of or above the laptop, and by switching Windows projection mode (Win+P: PC screen only, Extend, Second screen only). A running session keeps captioning throughout. |
| Idle and export | Existing fade-out works; full transcript remains available and exports correctly. |
| Stable reading, long session | Past 180 hidden lines the context trims with no visible re-wrap; changing Hide filler words or its word list changes the live turn and new captions only. |
| English and French | Labels, keyboard access and layout choice work in both the rail and settings. |
| Light/dark content | Current text and dimmed history remain readable over slides and video calls. |

The built-in demo provides a free first check. Use live speech for continuous long-turn,
two-source and meeting tests; those use the operator's chosen provider and account.
See [accessibility](accessibility.md#release-checklist-manual-on-windows) and the
[release handoff](store-updates.md#release-171-handoff) for the remaining release gates.

## Reading pace and preview

Fit window and Compact keep finished captions for a configurable **2–30 seconds** (default
4 seconds). This is a per-source reading pause after its latest completed caption, not a
minimum display time that delays new speech. Unfinished, stalled text still expires after
3 seconds. Stable reading keeps its session-long context, bounded as described above.

**Immediate** remains the default. **Steadier** presents the most recent interim hypothesis
every 450 ms per source, without waiting indefinitely for silence. Final text and turn
transitions flush promptly; it can still revise already displayed words. This setting only
changes presentation: it does not buffer audio, delay transcription storage or add requests.

**Settings → Captions** keeps presets and the appearance preview visible, with sample text at
the selected font size over bright and dark slides. Standard, Large room and High contrast
presets change appearance. Reset also restores the default reading pace and hold time and
switches the filler filter off; the word list keeps its own reset. The real overlay may have
different dimensions, so finish placement on the presentation display.

Gemini subtitles already request
[Smart transcription](gemini-live-api.md#gemini-35-transcribe-live), so the local filler
filter is additional and cannot restore fillers the provider removed. Raw text means the
provider's returned text, not a guaranteed verbatim record of speech.
