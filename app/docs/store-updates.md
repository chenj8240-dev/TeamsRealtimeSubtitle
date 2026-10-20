# Microsoft Store updates

Every update to this app is submitted **by hand** through Partner Center. That is not a
preference and not a stopgap — it is the only route this account has, for a reason Microsoft
enforces and we cannot work around. [Why by hand](#why-by-hand) has the detail; the short
version is that the submission API is a Company-account feature and this is an Individual
account.

The route below is what shipped every version so far. It takes about five minutes once the
packages are built.

## Release 1.7.1 handoff

**Tagged on 20 October 2026; not yet submitted.** Last confirmed live Store version:
**1.6.1.0**, confirmed by the maintainer on 20 October 2026. Target app version: **1.7.1**,
MSIX **1.7.1.0**.

**1.7.1 replaces 1.6.1 in the Store.** [1.7.0](#release-170-handoff) was published on GitHub
and will not be submitted. 1.7.1 is 1.7.0's app code unchanged plus a packaging fix:

- **The bug.** Installed as an MSIX, the app's icon was drawn on a square plate in the Windows
  accent colour on the taskbar, in Start's app list, in Alt+Tab and in jump lists, so the
  rounded corners of the wave-to-words tile showed blue. The package shipped a single
  `Square44x44Logo.png` and no `targetsize` or `altform-unplated` variants, so Windows fell back
  to the plated logo. It has been visible since the rounded icon reached the Store in 1.6.1; the
  asset files are identical in 1.6.1 and 1.7.0. The side-by-side Local Test and NSIS installs
  use `icon.ico` and were never affected.
- **The fix.** `src-tauri/gen/windows/Assets/` gains 42 target-size icons:
  `Square44x44Logo.targetsize-N.png`, `…targetsize-N_altform-unplated.png` and
  `…targetsize-N_altform-lightunplated.png` for N = 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72,
  80, 96 and 256. There are no scale variants of any logo. `bundle.config.json` sets
  `resourceIndex.enabled: true`, so the bundler runs MakePri and each package carries a single
  `resources.pri`: Windows resolves qualified assets only through it. The manifest and the base
  images it names are unchanged. How the files are made, and why there are no scale variants,
  is in [MSIX packaging](packaging-msix.md#icon-variants-and-resourcespri).

1.7.1 changes no app code, so the testing recorded for 1.7.0 carries over: the maintainer's
test of the Local Test build of `f6a2448` (ARM64) and the system-audio test on ARM64. The open
checks of the 1.7.0 handoff carry over unchanged and are run against the 1.7.1 packages: the
manual checks on the candidate, and the sideload test, screenshots, Windows App Certification
Kit and social preview under its Release and Store acceptance. What's new and the certification
notes are 1.7.0's, with the version numbers updated and one sentence on the icon added to
What's new.
[GitHub release copy](release-1.7.1.md) · [EN/FR/DE Store fields](store-listing.md) ·
[Partner Center walkthrough](partner-center-walkthrough.md).

### Preparation and validation

- [x] App manifests, root lockfile entries and citation set to 1.7.1; the citation date stays
  20 October 2026.
- [x] The local ARM64 MSIX contains a single `resources.pri` (9,296 bytes) that indexes the
  42 target-size icons, and its 46 `Assets/` files match the repository.
- [x] Installed (1.7.1.0, developer-signed, ARM64) on 20 October 2026, the running app's taskbar
  icon shows the tile's transparent corners with no plate, on the maintainer's dark taskbar.
- [ ] The same in Start's app list and Alt+Tab, and with the taskbar in the light theme.

### Release

- [ ] Tag `v1.7.1-rc.1` and confirm that both MSIX jobs produce packages containing
  `resources.pri`. A hyphenated tag builds the installers, both MSIX packages and the bundle
  into a draft prerelease; nothing is published.
- [ ] Tag `v1.7.1` on the same commit, annotated: "Live Translation & Subtitles v1.7.1". Pass
  release-commit CI and all installer/MSIX/bundle jobs.
- [ ] Publish the prepared body: `gh release edit v1.7.1 --notes-file docs/release-1.7.1.md`.
- [ ] Verify `Live.Translation_1.7.1.msixbundle`: the [1.7.0 checks](#170-artifact-verification)
  at **1.7.1.0**, plus `resources.pri` and the 42 target-size icons in each package,
  byte-identical to `src-tauri/gen/windows/Assets/`. Record sizes and SHA-256 below.
- [ ] Submit the single combined bundle in Partner Center with the 1.7.1 What's new and the
  updated descriptions, features, requirements and certification notes; if a Store logo was
  uploaded separately, check that it shows the wave-to-words icon. Use a gradual rollout
  (route step 9): 1.7.1 brings 1.7.0's capture and session-lifecycle changes to the Store.
- [ ] Record submission and certification, and confirm the Store version before marking it live.

### 1.7.1 artifact verification

Pending until the `v1.7.1` release workflow finishes.

## Release 1.7.0 handoff

**Prepared on 7 October 2026, tagged and published on GitHub on 20 October 2026; will not be
submitted.** [1.7.1](#release-171-handoff) replaces it for the Store with the same app code and
a packaging fix for the taskbar icon; the manual checks below still apply to 1.7.1. Last
confirmed live Store version: **1.6.1.0**, confirmed by the maintainer on 20 October 2026.
Target app version was **1.7.0**, MSIX **1.7.0.0**.

1.6.1 already brought the wave-to-words icon and the design refresh to the Store, so What's new
and the certification notes cover the changes since 1.6.1. Its record is under
[Release 1.6.1 handoff](#release-161-handoff).

1.7.0 is [#116](https://github.com/fmadore/Live-translation/pull/116)–[#122](https://github.com/fmadore/Live-translation/pull/122),
recorded item by item, with what each still needs, in the
[6 October app review](app-review-2026-10-06.md):

- #116, batches 1–2: a mid-stream close, a transient provider error or a stalled socket
  reconnects; drains end on the provider's own signal; Pause works during connect; a handover
  keeps up to three seconds of audio. Whisper is built with SIMD behind a runtime CPU gate (x64
  needs AVX2, with the demo as the keyless fallback): about twice as fast with Tiny on a
  Snapdragon X, unmeasured on x64. Downloads follow the Windows proxy with no total timeout and
  clean up partial files; the last words before Pause are captioned; overlap is trimmed by
  words; quit no longer waits for the backlog.
- #117, batch 3: Test audio after a device failure, the rehearsal cost estimate, history with
  two caption languages, a persisted export format that quit Save uses, storage reads kept out
  of module load, accessibility labels and an incremental History tab.
- #118 and #119, batch 4: CI gates, static analysis, coverage and the two Playwright suites
  (developer-facing).
- #120, batch 5: structure, plus 24-bit microphones, recovery, history and window errors worded
  in the interface language, and a fix for the History tab's "[object Object]" export error.
- #121, batch 6: **F1**, offline translation into English with Whisper (`whisper-translate`,
  English only, Small recommended); **F2**, the overlay reopens where it was last placed on each
  display layout; the overlay keeps its size across displays with different scaling; Done in
  move mode marks the overlay placed.
- #122: Mistral reconnects when its backend reports a gRPC `UNAVAILABLE` (code 3803, seen live
  on 1.6.0).

Runtime dependencies: reqwest 0.12 → 0.13 with `system-proxy` (the copy Tauri already compiles,
so the build has one reqwest instead of two), and `whisper-rs-sys` pinned at 0.15.0, which keeps
whisper.cpp at 1.8.3. Everything new in `package.json` is a devDependency. The operator window
gains two command permissions (`whisper_cpu_support`, `display_layout`); the package still
declares only `runFullTrust` and `microphone`. The [privacy policy](privacy.md) takes effect on
7 October 2026 and covers translation into English, downloads through a proxy, discarding
pending audio on quit, the remembered export format and the overlay placement per display
arrangement.
[GitHub release copy](release-1.7.0.md) · [EN/FR/DE Store fields](store-listing.md) ·
[Partner Center walkthrough](partner-center-walkthrough.md).

After `v1.7.0-rc.1`, `main` gained one feature and no fixes to the candidate, so the release is
tagged from `main` rather than as a second candidate:

- [#139](https://github.com/fmadore/Live-translation/pull/139) (closes #137): a display watcher
  moves the overlay onto a connected display when the one holding it goes, and back to its
  remembered placement when it returns; Move overlay, showing a hidden overlay and Escape in
  move mode check that it is on a display first. The operator window gains one command
  permission (`recover_overlay_placement`); the overlay's capability and the package's
  declared capabilities are unchanged.
- [#138](https://github.com/fmadore/Live-translation/pull/138): the interface builds on
  SvelteKit 3 and adapter-static 4 (developer-facing).
- [#135](https://github.com/fmadore/Live-translation/pull/135) and
  [#151](https://github.com/fmadore/Live-translation/pull/151), the October Dependabot batches:
  Tauri 2.12.3, tokio 1.53.3, sha2 0.11, tauri-plugin-single-instance 2.5.3 and **wasapi
  0.24 → 0.26**, which drives system-audio capture.

### Preparation and validation

- [x] #116 to #122 merged, each after all its CI jobs passed. The release branch is cut from
  `main` at `8e42436`, whose [CI run](https://github.com/fmadore/Live-translation/actions/runs/37657186989)
  passed.
- [x] App manifests, root lockfile entries and citation set to 1.7.0. The citation date,
  provisionally 7 October 2026, is corrected to the tag date, 20 October 2026.
- [x] Lockfiles: nothing changes besides the two root version lines (`git diff --text`), and
  `cargo check --locked` passes.
- [x] Frontend validation of the release branch on Windows 11 ARM64: `npm test` 643 passed in
  71 files; `check` (0 errors, 0 warnings), `lint`, `knip`, `format:check`, `check:languages`
  and `build` pass; the Store fields are within Partner Center's limits.
- [x] Rust tests, Clippy, both Playwright suites and the Whisper smoke test are recorded per
  batch in the review and passed in CI on every PR; this preparation changes no code.

### Release-candidate checks

- [x] Merge this release PR ([#123](https://github.com/fmadore/Live-translation/pull/123),
  `bffcd31`).
- [x] Tag `v1.7.0-rc.1` from `main` (8 October 2026, `bffcd31`). A hyphenated tag builds the
  installers, both MSIX packages and the bundle into a draft prerelease; nothing is published.
- [x] **Maintainer test, 20 October 2026:** the side-by-side Local Test build of `main` at
  `f6a2448` (ARM64), which adds #135, #138, #139 and #151 to the candidate, reported working
  well. The checks below were not itemised in that report, so they stay unticked; any not
  covered remain open against the Store build.

Manual checks on the candidate, on x64 and ARM64 unless a line says otherwise:

- [x] **System audio on hardware**: an output and one application (Teams, Zoom or a browser),
  alone and with the microphone. The release ships wasapi 0.26 (#151), and #120 restructured
  the loopback runner and its COM guard. Tested by the maintainer on 20 October 2026 on ARM64,
  with the Local Test build of `f6a2448`; no x64 run is recorded.
- [ ] **A short live session with each cloud provider**: Gemini Translate, Gemini Transcribe,
  OpenAI and Mistral, with Pause, Resume and Stop. On Gemini Translate, Stop mid-sentence should
  translate the last words, end well before four seconds and log no
  `provider error while closing`. On Mistral, a reconnect should resume captions: drop the
  network briefly, and note any 3803 in the log.
- [ ] **A 24-bit microphone** (a USB interface or headset set to 24-bit in Sound settings):
  levels, Test audio and captions.
- [ ] **Whisper Small translating real speech into English**: quality, whether it keeps up, and
  the setup sheet's English-only note.
- [ ] **Overlay restore with a laptop at 150% and a projector at 100%**: the "Placement across
  launches" and "Display changes while running" rows of the
  [caption layout matrix](caption-layout.md#release-verification).
- [ ] **An x64 PC without AVX2**, if one is available: Whisper listed as unavailable with its
  reason, a first launch on the built-in demo, and a cloud engine that still starts.
- [ ] **A model download behind a proxy** set in Windows Settings → Network & internet → Proxy.
- [ ] **Quitting with a large Whisper backlog**: the prompt gives the seconds pending, and the
  app exits a few seconds after closing.
- [ ] **Narrator** on Pause/Resume and Move overlay/Done, which should no longer say "pressed",
  and on the input-status announcements.
- [ ] **The new error sentences in English, French and German**: a failed recovery write, a
  failed history write and a failed export from the History tab.
- [ ] Carried from 1.6.1, never checked: the new icon in Start, the taskbar, the tray and the
  Store tile; move mode over a white and a dark slide; Settings tabs, steppers at their limits,
  keyboard focus, contrast themes and enlarged text. On 20 October 2026 the taskbar and Start
  were found to draw the icon on an accent-coloured plate; [1.7.1](#release-171-handoff) fixes
  that.
- [x] Fix what the candidate shows. A fix means a new candidate (`v1.7.0-rc.2`); never move a
  tag. Nothing was reported, so there is no `rc.2`.

### Release and Store acceptance

- [x] Tag `v1.7.0` from `main`. Pass release-commit CI and all installer/MSIX/bundle jobs, then
  publish the prepared body: `gh release edit v1.7.0 --notes-file docs/release-1.7.0.md`.
  The citation date is set to the tag date, 20 October 2026.
- [x] Verify `Live.Translation_1.7.0.msixbundle` contains native x64 and ARM64 packages at
  **1.7.0.0** with the [assigned identity](microsoft-store.md#store-identity-assigned) and the
  wave-to-words tiles. Record sizes and SHA-256 below.
- [ ] Sideload-test the final per-architecture MSIX packages and walk the
  [accessibility release checklist](accessibility.md#release-checklist-manual-on-windows).
- [ ] Recapture the EN/FR/DE Store screenshots from the signed 1.7.0 MSIX; the
  [capture plan](store-screenshots/README.md) has been pending since 1.6.0.
- [ ] Run Windows App Certification Kit, which also reports missing package images.
- [ ] Upload `.github/social-preview.png` in the GitHub repository settings if that is still
  outstanding from 1.6.1. This is manual and not part of the Store.
- [ ] Submit the single combined bundle in Partner Center with the 1.7.0 What's new and the
  updated descriptions, features, requirements and certification notes; if a Store logo was
  uploaded separately, check that it shows the wave-to-words icon. Use a gradual rollout
  (route step 9): this release changes capture and the session lifecycle.
- [ ] Record submission and certification, and confirm the Store version before marking it live.

### 1.7.0 artifact verification

Tag `v1.7.0` (annotated) points to `5ad2a0f6fc5d40a8fcc5a5abe350061f1c974905`, the
`chore(release): 1.7.0` commit, whose only changes from the tested `f6a2448` are documentation
and the citation date. The
[release-commit CI](https://github.com/fmadore/Live-translation/actions/runs/39403013613) and all
four [installer/MSIX/bundle jobs](https://github.com/fmadore/Live-translation/actions/runs/39403017461)
passed. The GitHub release body is [release-1.7.0.md](release-1.7.0.md).

Upload **[Live.Translation_1.7.0.msixbundle](https://github.com/fmadore/Live-translation/releases/download/v1.7.0/Live.Translation_1.7.0.msixbundle)**
to Partner Center. These are the published CI assets; each downloaded file's SHA-256 matches
GitHub's asset digest. Local copies and `verification.json` are in the ignored directory
`src-tauri/target/release-1.7.0/published/`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Live.Translation_1.7.0.msixbundle](https://github.com/fmadore/Live-translation/releases/download/v1.7.0/Live.Translation_1.7.0.msixbundle) | 11,424,375 | `550765859b61c447b65f040b6fec54a47f457019b27194839489312ce5fd042b` |
| [Live.Translation_1.7.0_x64.msix](https://github.com/fmadore/Live-translation/releases/download/v1.7.0/Live.Translation_1.7.0_x64.msix) | 5,830,917 | `9803668e9aa17fb5e7405af5eaabdd5180f5c6f0db2074f3950dcf5074a2c2fc` |
| [Live.Translation_1.7.0_arm64.msix](https://github.com/fmadore/Live-translation/releases/download/v1.7.0/Live.Translation_1.7.0_arm64.msix) | 5,591,455 | `6465bdc4bf7f44b41cf0f0253db02fdf7c4279c548b6889d251de699224092ce` |

All 40 checks passed. The bundle contains exactly the separately downloaded x64 and ARM64
packages, byte-for-byte, and carries no signature. Bundle and inner manifests report
**1.7.0.0**, identity `49346FMadore.LiveTranslationSubtitles` and publisher
`CN=5D0ECC96-3998-452E-B7E9-29BE9B576F86`; each package has publisher display name `FMadore`
and the matching processor architecture. Executable PE machine values are `0x8664` (x64,
12,401,664 bytes) and `0xAA64` (ARM64, 10,841,088 bytes). Each package includes both rehearsal
WAVs and all three Whisper licence notices, declares only `runFullTrust` and `microphone`,
contains no model weights or signature, and carries the wave-to-words `Square44x44Logo`,
`Square150x150Logo`, `Wide310x150Logo` and `StoreLogo`, byte-identical to
`src-tauri/gen/windows/Assets/`. This verifies packaging, not installed-app behaviour or
certification.

## The route

1. **Bump the version** in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json`, and synchronize the root app versions in `package-lock.json`
   and `src-tauri/Cargo.lock`. All three manifests must match and be **higher than the
   version already in the Store** — Partner Center rejects a package that does not increase.
   The first segment can never be `0`. Commit them together as `chore(release): X.Y.Z`.
2. **Tag and push after manual testing**: `git tag vX.Y.Z` then `git push origin vX.Y.Z`,
   with the tested version; never reuse a published tag. The
   [`Release installers`](../.github/workflows/release.yml) workflow builds the NSIS installer,
   both architectures' `.msix`, and one multi-architecture
   `Live.Translation_<version>.msixbundle`, and attaches them to the GitHub release. Download
   the bundle from there.
3. **Paste the release body.** The workflow creates the release with an empty one; the
   paste-ready text and how to apply it are in [`release-notes.md`](release-notes.md).
4. **Sideload-test before submitting.** Install the bare per-architecture `.msix` with
   [`scripts/install-local-msix.ps1`](../scripts/install-local-msix.ps1), *not* the bundle —
   signing a bundle does not sign the packages inside it. Walk the manual release checklist in
   [`accessibility.md`](accessibility.md#release-checklist-manual-on-windows) against this
   install, because package identity changes how Windows treats the window.
5. **Re-capture the screenshots** in every listing language if anything they show has
   changed — see [Screenshots](#screenshots).
6. Partner Center → **Apps and games** → *Live Translation & Subtitles* → **Create new
   submission**. In French: **Applications et jeux**, **Créer une soumission**.
7. Under **Packages**, **delete every package already listed**, then upload the single
   `.msixbundle`. One bundle in, nothing else — see
   [Why the package is one bundle](#why-the-package-is-one-bundle).
8. **Paste the listing text** for every language if it changed, from
   [`store-listing.md`](store-listing.md). **What's new in this version** has to be rewritten
   for every release, in every listing language. Editing that file changes nothing on its own;
   the Store only knows what is typed into Partner Center.
9. Set a **gradual rollout** percentage for anything touching audio capture or the session
   lifecycle. Start at 10% and raise it once the crash and review data look clean.
10. **Submit to the Store**, then watch certification: an accepted upload is not a pass.

[`partner-center-walkthrough.md`](partner-center-walkthrough.md) has the screen-by-screen
version of steps 6–10.

## Screenshots

The Store listing is per-language, so each language has its own set under
`docs/store-screenshots/<language>/`, named in upload order — the order is what a visitor
scrolls through. The [capture plan](store-screenshots/README.md) lists the current set and its
status. Each set is re-captured and overwritten in place; git history holds the previous ones.

Capture on Windows at the display scaling the app is actually used at, from a **sideloaded
MSIX** rather than a dev build: package identity changes how the window is drawn. Store rules:

- `.png`, at least 1366×768 and under 50 MB. Ten desktop screenshots at most; Microsoft
  recommends five to eight.
- Anything that matters belongs in the **top two-thirds**, because the Store draws its own text
  overlays across the bottom third.
- No logo, wordmark or marketing line burned into the image. The per-screenshot Description
  field in Partner Center carries that instead, in 200 characters, doubling as the alt text a
  screen reader announces.

Re-capture whenever the UI they show changes; the
[acceptance checklist](microsoft-store.md#acceptance-checklist) includes it.

## Why by hand

Verified 27 August 2026.

The submission API authenticates as a Microsoft Entra application, which has to live in a
tenant associated with the Partner Center account. Tenant association, user management and
Entra applications are **Company-account features**. This is an Individual account, and
Microsoft is explicit that
[Entra ID sign-up "is currently supported only for Company accounts"](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account?tabs=individual).
In the dashboard it shows up as `account-settings/organization/tenant-management` rendering a
blank page. Nothing is misconfigured; the feature is not there.

**Converting is not a way out.** Partner Center does not support changing an account from
Individual to Company — it needs a *new* account, which means a new publisher identity, which
means a new Store listing at a new URL. The current identity
(`49346FMadore.LiveTranslationSubtitles`) is baked into every package shipped so far, so
switching would abandon the published listing and its installs.

A `Microsoft Store submission` workflow driving the `msstore` CLI was removed because a
workflow that cannot run reads as an option that exists. It is in the git history;
[If the account ever becomes a Company account](#if-the-account-ever-becomes-a-company-account)
has what it needed.

## Why the package is one bundle

The Store submission is a single multi-architecture `.msixbundle` containing both the x64 and
the ARM64 package, rather than two single-architecture bundles.

Partner Center treats packages in a submission as a set to be replaced, and it is on the person
doing the replacing to remove the old ones — which is why step 7 says delete every package
already listed. One bundle in and nothing else leaves no room for an architecture to survive
from the previous submission and ship stale. 1.0.5 went up as two per-architecture packages and
had to be cleaned up by hand for exactly this reason.

## Constraints worth knowing

- **One pending submission per product.** Finish or delete the pending one before starting
  another.
- **Certification can still fail.** 1.0.3 uploaded perfectly well and then failed policy
  10.1.2.20 — the reviewer pressed **Start Subtitles** and nothing happened on their device.
  See [`microsoft-store.md`](microsoft-store.md) for what the bundled demonstration exists to
  prevent.
- **The listing is not in this repository.** `store-listing.md` is paste-ready source text, not
  a deployment. Nothing in `docs/` reaches the Store without someone typing or uploading it.

## If the account ever becomes a Company account

None of this is possible on an Individual account; it is kept because it is correct.

1. **Give the Partner Center account a Microsoft Entra tenant.** Partner Center → **Account
   settings** → **Tenants**. Either
   [associate an existing tenant](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/associate-existing-azure-ad-tenant-with-partner-center-account)
   or [create one](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/create-new-azure-ad-tenant).
   The API authenticates against the tenant, not the Microsoft account used to sign in.
2. **Register an application in the tenant.** [Entra admin center](https://entra.microsoft.com/)
   → **Identity** → **Applications** → **App registrations** → **New registration**. No
   redirect URI and no API permissions; it exists only to hold a client secret. Then
   **Certificates & secrets** → **New client secret**, copied immediately because it is shown
   once, and noted for its expiry.
3. **Give that application the Manager role.** Partner Center → **Account settings** → **User
   management** → **Microsoft Entra applications**. Without it the credentials authenticate and
   every submission call is refused.
4. **Add four repository secrets** — `AZURE_AD_TENANT_ID`,
   `AZURE_AD_APPLICATION_CLIENT_ID`, `AZURE_AD_APPLICATION_SECRET` (step 2) and `SELLER_ID`
   (Partner Center → Account settings → Identifiers).

What the removed workflow had learned: Microsoft supports Store update operations through
GitHub Actions for **free products only**, which this app is; and the `msstore` CLI is in
preview with documentation that trails it — Learn documents an `--inputFile` option for
`msstore publish` that the released CLI does not have, taking the package path as a positional
argument instead.

`msstore submission updateMetadata` could also replace the listing text from a committed JSON
file, making the Store description reviewable in a pull request. But a bad metadata push is
more disruptive than a bad package push: it goes live on the product page rather than waiting
for certification.

## Release history

Earlier handoffs, one row each. Their full checklists, CI runs, artifact sizes and SHA-256
digests are in this file's
[commit history](https://github.com/fmadore/Live-translation/commits/main/docs/store-updates.md);
each release page has the assets and the published body. Checks left unticked when a version
was submitted were not recorded as done and stay open against the Store build.

| Version | GitHub release | Store | Summary |
| --- | --- | --- | --- |
| 1.7.0 | [20 October 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.7.0) · [body](release-1.7.0.md) | Not submitted; superseded by 1.7.1 | Offline Whisper translation into English and overlay placement per display layout (#121), overlay recovery when a display goes (#139), cloud sessions that reconnect (#116, #122). |
| 1.6.1 | [6 October 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.6.1) · [body](release-1.6.1.md) | Live as 1.6.1.0, confirmed by the maintainer on 20 October 2026; submission and certification dates not recorded | The wave-to-words icon (#111) and the 5 October design review (#112); no new features. |
| 1.6.0 | [4 October 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.6.0) · [body](release-1.6.0.md) | Live as 1.6.0.0, confirmed 6 October 2026; replaced by 1.6.1 | Local Whisper (#99), two translation targets, original speech in overlay and exports, Pause/Resume, editable filler words. |
| 1.5.1 | [23 September 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.5.1) · [body](release-1.5.1.md) | Live as 1.5.1.0, confirmed 23 September 2026 | Batches 1–2 of the [22 September app review](app-review-2026-09-22.md) (#86): cleaner downsampled audio, release builds ignore `.env` and host overrides, a failing capture or provider thread ends only its source. |
| 1.5.0 | [22 September 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.5.0) · [body](release-1.5.0.md) | Not submitted | Searchable provider-scoped caption languages, favourites, F2 favourite swapping and RTL overlay direction (#78). |
| 1.4.2 | [21 September 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.4.2) | Not submitted | Start and Stop in a persistent action bar below the header. |
| 1.4.1 | [20 September 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.4.1) | Not submitted | The [18-point operator UI audit](ui-audit-implementation.md): tabbed Settings, profiles above setup, a session browser, localized tray. |
| 1.4.0 | [19 September 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.4.0) | Not submitted | Meeting profiles, 2–30 second caption persistence, appearance presets, history titles and search, operator shortcuts. |
| 1.3.0 | [19 September 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.3.0) | Not submitted | Transcript history (#81), Stable reading (#79), overlay filler cleanup (#80) and the German interface. |
| 1.2.4 | [14 September 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.2.4) | Live; acceptance date not recorded | Responsive captions: Fit window and optional Compact layout (#77). |
| 1.2.3 | [8 September 2026](https://github.com/fmadore/Live-translation/releases/tag/v1.2.3) | No submission recorded | Native Save As with timed SRT/VTT export (#26); capture of a selected application (#27). |

### Release 1.6.1 handoff

Live as 1.6.1.0, confirmed by the maintainer on 20 October 2026: a Store-signed
`49346FMadore.LiveTranslationSubtitles_1.6.1.0_arm64` (`SignatureKind` `Store`) was installed on
the maintainer's PC on 6 October 2026. The submission and certification dates were not
recorded. It replaced 1.6.0 in the Store; 1.7.0 carries its open checks. Tag `v1.6.1` points to
`d206091`. Release-commit CI and all four installer/MSIX/bundle jobs passed, and all 37 package
checks passed on the published assets: GitHub digests, a bundle holding exactly both packages
byte for byte, 1.6.1.0 manifests with the assigned identity, native PE machine types, only
`runFullTrust` and `microphone`, rehearsal WAVs and licence notices, no weights or signature,
and the four new tile images. The bundle was 11,195,249 bytes, SHA-256
`86ef814f0e53baae6ff821db8cc263efa745982a7dfea945d8fda7d69a6ccea0`. The icon check on both
architectures, the smoke test of the new styles, screenshots and Windows App Certification Kit
were not recorded as done before submission.

### Release 1.6.0 handoff

Live as 1.6.0.0, confirmed by the maintainer on 6 October 2026; the submission, certification
and go-live dates were not recorded. Tag `v1.6.0` points to `41cee07`; release-commit CI and
all installer/MSIX/bundle jobs passed, and each downloaded asset's SHA-256 matched GitHub's
digest. Native x64/ARM64 hardware tests, cloud language acceptance (#78), keyboard/Narrator,
enlarged-text and mixed-DPI checks, final screenshots and Windows App Certification Kit were
not recorded as done before submission.

### Release 1.5.1 handoff

Live as 1.5.1.0, confirmed 23 September 2026; it replaced 1.2.4 in the Store. Tag `v1.5.1`
points to `e6a4e18`. Keeping panic unwinding (review item D10) grew the executable; net of
shipping only `.woff2` fonts, the bundle went from 7.96 MB to 9.22 MB. Installed-package
checks, the OpenAI target-code probe, live non-EN/FR speech (#78), screenshots and Windows App
Certification Kit were not recorded as done before submission.

### Release 1.5.0 handoff

Not submitted; superseded by 1.5.1, which carried its open checks. Tag `v1.5.0` points to
`d1ad615`.

## Sources

- [Open a developer account](https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account?tabs=individual)
- [Publish app updates to Microsoft Store with GitHub Actions](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/github-actions)
- [Microsoft Store Developer CLI commands](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/commands)
- [Package version numbering](https://learn.microsoft.com/en-us/windows/uwp/publish/package-version-numbering)
- [App screenshots, images, and trailers](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/screenshots-and-images)
