# Store screenshots — 1.7.0 capture plan

The existing `en/` and `fr/` images are historical 1.2.2 captures and are **not ready for
1.7.0**; the `de/` set has not been captured. The 1.6.0 and 1.6.1 captures were not recorded as
done, although 1.6.1 changed the app icon and the interface, and 1.7.0 adds Whisper's
translation engine card to the setup sheet's translation mode. Retake every set from the final signed 1.7.0
MSIX, with the interface set to each listing language. Browser previews and the separate
Whisper Test installation do not establish packaged-app appearance.

The first images should demonstrate useful captioning, with the scripted demo last if included.
Capture only disposable, consented speech or the bundled rehearsal material. Do not show
private meeting transcripts, API keys, account details or personal application titles.

| Upload order / new filename | Capture |
| --- | --- |
| `1-whisper.png` | Whisper selected, a verified model installed, spoken language and source visible, actual local captions running, in Subtitles mode as its caption describes. Any frame of translation setup now shows the Local Whisper card beside Gemini and OpenAI. |
| `2-overlay.png` | Click-through captions over neutral slides or a non-private call; show readable type and placement. |
| `3-bilingual.png` | Two target languages in a real cloud session, with original speech if available. Requires a configured provider and incurs usage. |
| `4-reading.png` | Caption previews/presets, Stable reading and the editable filler-word list. Use the matching caption if multiple controls need separate images. |
| `5-history.png` | A disposable titled session, search and transcript detail/export controls. |
| `6-demo.png` (optional) | The clearly labelled scripted demo running; keep this after the live-caption examples. |

Use the localized [screenshot captions](../store-listing.md#screenshots), adjusting them if a
frame does not show everything described. Capture at least one frame of the open language
selector if needed to show the 99 Whisper language choices or translation favourites.

Use `en/`, `fr/`, `de/` for the current verified sets, with the same order in each language.
Replace obsolete filenames when the new captures exist; do not relabel or reuse old images
as evidence of the new interface. Record package version, architecture, capture date and
display scaling here when refreshed.

Before capture, check the current Microsoft [screenshot requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images)
and the [Store rules](../store-updates.md#screenshots) summarized for this listing. Each
prepared caption is under 200 characters.

## Capture status

The final package now exists. Copy `Live.Translation_1.7.0_arm64.msix` (or `_x64`) from the
[v1.7.0 release](https://github.com/fmadore/Live-translation/releases/tag/v1.7.0) to
`src-tauri/target/msix/Live Translation & Subtitles_1.7.0.0_arm64.msix`, run
[`scripts/install-local-msix.ps1`](../../scripts/install-local-msix.ps1) as Administrator, which
signs it with the development certificate, then capture each set from that install.

- English: pending final 1.7.0 MSIX capture.
- French: pending final 1.7.0 MSIX capture.
- German: pending final 1.7.0 MSIX capture and language review.
