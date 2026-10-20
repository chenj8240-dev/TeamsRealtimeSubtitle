# MSIX packaging

How to build the Microsoft Store package on your own machine, sign it so Windows will
install it, and check what CI cannot: microphone capture, WASAPI loopback, Credential Manager,
the overlay and the export path, all running under package identity.

[`microsoft-store.md`](microsoft-store.md) has the certification approach, the assigned identity
values and the acceptance checklist; the [handoff](store-updates.md#release-171-handoff)
records the **1.7.1** release's Store status.

## What is committed

Tauri has no MSIX bundle target, so packaging goes through
[`@choochmeque/tauri-windows-bundle`](https://github.com/Choochmeque/tauri-windows-bundle),
a devDependency. It drives `tauri build --no-bundle`, assembles the package payload, and
hands it to the Windows SDK's `MakeAppx`.

| Path | What it is |
| --- | --- |
| `src-tauri/gen/windows/bundle.config.json` | Publisher, capabilities, signing, resource index. Read at build time. |
| `src-tauri/gen/windows/AppxManifest.xml.template` | The manifest, with `{{PLACEHOLDER}}`s the bundler fills in per architecture. |
| `src-tauri/gen/windows/Assets/*.png` | Store logo and tiles, plus the [taskbar icon sizes](#icon-variants-and-resourcespri), copied into the package verbatim. |
| `src-tauri/icons/{StoreLogo,Square44x44Logo,Square150x150Logo}.png` | `tauri icon` output for the MSIX sizes; the source the bundler regenerates `Assets/` from. |
| `package.json` → `bundle:msix:{x64,arm64}` | Architecture-specific Store package commands. |
| `.github/workflows/release.yml` → `msix` job | Native x64 on `windows-latest`, ARM64 on `windows-11-arm`; unsigned release packages. |

`src-tauri/gen/` is otherwise generated and ignored; `.gitignore` carries an exception for
`gen/windows/`.

Three things in there are not what they look like:

- **`"displayName": "live-translation"` in `bundle.config.json` is a filename, not a label.**
  The bundler derives the packaged executable's name from it (whitespace stripped, plus
  `.exe`) and copies that file out of the Rust target directory. Tauri leaves the cargo
  binary name alone, so the file to find is `live-translation.exe`. Every string a user
  actually sees is a literal in the manifest template.
- **`Identity/Name` and both display names are literals, not placeholders.** The bundler
  derives the identity name from `tauri.conf.json`'s `identifier` (`io.github.fmadore.live-translation`)
  and the display name from `productName`, and neither is what Partner Center assigned. The
  reserved name also carries an ampersand, which has to be `&amp;` in XML. Ingestion fails if
  any of these differ by a character, so they are written out in the template and checked
  against *Store identity (assigned)* in `microsoft-store.md`.
- **`"publisher"` in `tauri.conf.json` is load-bearing.** Tauri defaults the Windows publisher
  to the second element of `identifier` — *github* in `io.github.fmadore.live-translation` —
  and writes it into the packaged executable's `CompanyName` and the NSIS/MSI installers.
  `"publisher": "Frédérick Madore"` sets it explicitly. The Store identity is unaffected: it is
  a literal in `bundle.config.json`, which is what made the 1.2.0 rename of the identifier safe.

The manifest the bundler produces carries the matching `x64` or `arm64` architecture:

```xml
<Identity
  Name="49346FMadore.LiveTranslationSubtitles"
  Publisher="CN=5D0ECC96-3998-452E-B7E9-29BE9B576F86"
  Version="1.7.1.0"
  ProcessorArchitecture="x64" />
```

with `runFullTrust` and `microphone`. The built-in demonstration uses neither capability nor
network access. The package carries no speech model, Windows AI runtime, WinRT recognizer, or
`systemAIModels` declaration. Live capture uses microphone/WASAPI through the full-trust
desktop process. Whisper CPU inference is statically linked; model weights download only
at the user's request.

`Version` is the field that moves: the bundler stamps it from `tauri.conf.json`, with a fourth
component appended.

## Icon variants and `resources.pri`

The manifest names one image per slot (`Square44x44Logo.png`, `Square150x150Logo.png`,
`Wide310x150Logo.png` and `StoreLogo.png`), and those base files are unchanged. Beside them,
`Assets/` holds 42 target-size icons that Windows picks by name:
`Square44x44Logo.targetsize-N.png`, `Square44x44Logo.targetsize-N_altform-unplated.png` and
`Square44x44Logo.targetsize-N_altform-lightunplated.png` for N = 16, 20, 24, 30, 32, 36, 40, 48,
60, 64, 72, 80, 96 and 256. These are the sizes the taskbar, Start's app list, Alt+Tab and jump
lists draw; the `unplated` forms are drawn as they are, with no plate behind them. No logo has
scale variants.

Windows resolves qualified file names only through the package resource index,
`resources.pri`. Without it the variants are ignored and Windows falls back to the base
`Square44x44Logo.png` on a square plate in the accent colour: up to 1.7.0 the package shipped
only that image, and the taskbar showed the wave-to-words tile's rounded corners in blue.
`"resourceIndex": { "enabled": true }` in `bundle.config.json` makes the bundler run MakePri,
so each package carries a single `resources.pri`.

**Do not add scale-qualified assets** (`*.scale-100.png` and so on) without also changing the
PRI configuration. MakePri's default configuration splits scale-qualified resources into
`resources.scale-N.pri` files meant for separate resource packages. Inside a single MSIX those
files are never loaded, so scale variants would be dead weight; with target-size icons only,
the package carries the one `resources.pri`.

To list the resource index and the icons in a built package, where a `resources.scale-N.pri`
would also show up:

```powershell
$version = (Get-Content .\src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).version
$package = (Resolve-Path ".\src-tauri\target\msix\Live Translation & Subtitles_$version.0_arm64.msix").Path
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($package)
$zip.Entries.FullName | Where-Object { $_ -match '\.pri$|Logo' }
$zip.Dispose()
```

The icons are rendered, not drawn by hand, and must be regenerated whenever
`src-tauri/icons/source.svg` changes, or the taskbar keeps the old icon while the tiles show
the new one. Render `source.svg` with headless Edge at 1024 px on a transparent background
(`--default-background-color=00000000`), then downscale that render with Lanczos to each size.

## Side-by-side test builds

Two test installations sit beside the Store app, each with its own identifier and WebView
preferences:

- **Live Translation Local Test**, an unpackaged ARM64 executable under
  `%LOCALAPPDATA%\Programs\Live Translation Local Test`, identifier
  `io.github.fmadore.live-translation.local-test`. Provider keys use the existing Credential
  Manager service.
- **Live Translation Whisper Test**, a native ARM64 build of PR #99 (version label 1.5.1).

They are for local feedback, not proof of MSIX compatibility, and neither identity belongs in
a Store package. The ignored `src-tauri/target/local-test.conf.json` override must not be used
for release packages: build with the normal committed configuration and complete the
[release verification](caption-layout.md#release-verification).

## Prerequisites

- **Rust stable (1.90 or newer)** with both Store targets: `rustup target add x86_64-pc-windows-msvc aarch64-pc-windows-msvc`.
- **Windows SDK**, for `MakeAppx.exe` (packing) and `SignTool.exe` (signing). Installed by
  the Visual Studio "Desktop development with C++" workload or the standalone SDK. Nothing
  needs to be on `PATH`: the packer resolves the SDK through
  `HKLM\SOFTWARE\Microsoft\Windows Kits\Installed Roots` → `KitsRoot10`.
- **Node 22.13+ or 24**, then `npm ci`.
- **LLVM/Clang with libclang, CMake and Ninja** for the statically linked Whisper CPU backend.
  Configure the matching Visual Studio target environment as in [local Whisper](local-whisper.md#building).
  Prefer native builds for each architecture, as CI does; cross-compilation also needs the
  target C++ libraries and Windows SDK.

## Build the package

```powershell
npm ci
npm run bundle:msix:arm64
```

That builds the front end, compiles the app for `aarch64-pc-windows-msvc` with `--no-bundle`
(so no NSIS or MSI installer — use `npm run tauri build` for those), stages the payload in
`src-tauri/target/appx/arm64/`, and writes:

```text
src-tauri/target/msix/Live Translation & Subtitles_1.7.1.0_arm64.msix
src-tauri/target/msix/Live Translation & Subtitles_1.7.1.0.msixbundle
```

The local names come from the manifest's `DisplayName`; CI renames them (see
[What CI does](#what-ci-does)). For local verification, use the per-architecture `.msix`, not
the bundle.

Substitute the current `tauri.conf.json` version for `1.7.1` throughout this file. Every
release built on this machine stays in `target/msix/`, which is why the commands below derive
the name instead of spelling it out.

Check the staged payload:

```powershell
Get-ChildItem src-tauri/target/appx/arm64 -Recurse -Name
```

`live-translation.exe`, `AppxManifest.xml`, `Assets\*.png`, and the two neutral rehearsal
fixtures should be there. There should be no `windows-ai` directory or self-contained ML DLL.

Do **not** pass `--regenerate-assets`. It rebuilds `gen/windows/Assets/` from
`src-tauri/icons/`, and its wide-tile generator writes an all-black 310×150 image; the
committed `Wide310x150Logo.png` is the corrected one.

## Sign it, so Windows will install it

Windows installs no unsigned MSIX. The Store re-signs the submitted package with its own
certificate, which is why this route removes the SmartScreen warning; the certificate here only
gets the package onto your own machine and is thrown away afterwards.

The shortest safe path is the checked-in helper. Run it in Windows PowerShell **as
Administrator** from the repository root (`-File` resolves relative to the current directory):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-local-msix.ps1 -Architecture arm64
```

It checks for the two install conflicts below before asking for anything, prompts securely for
the PFX password, trusts the matching public certificate in Local Machine → Trusted People,
signs, verifies, installs and confirms the installed version. It reads the version from
`tauri.conf.json`, so it signs the package you just built; pass `-Version 1.1.0` to pick an
older one on purpose. Use `-Architecture x64` on an x64 test machine. The manual equivalent
follows.

The certificate's **subject must equal the manifest's `Publisher` exactly**, or the install
fails with a publisher mismatch.

1. Create it (normal, non-elevated PowerShell — this writes to your own store):

   ```powershell
   $cert = New-SelfSignedCertificate -Type Custom `
     -Subject "CN=5D0ECC96-3998-452E-B7E9-29BE9B576F86" `
     -KeyUsage DigitalSignature `
     -FriendlyName "Live Translation dev signing" `
     -CertStoreLocation Cert:\CurrentUser\My `
     -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3","2.5.29.19={text}")
   ```

   The two extensions are what make it usable here: extended key usage *code signing*
   (`1.3.6.1.5.5.7.3.3`) and an empty basic-constraints extension (not a CA).

2. Export it:

   ```powershell
   $password = Read-Host -AsSecureString "Password for the dev PFX"
   Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" `
     -FilePath .\live-translation-dev.pfx -Password $password
   ```

   `*.pfx` is git-ignored, so a checkout is a safe place to keep it while you work.

3. Trust it, in an **elevated** PowerShell:

   ```powershell
   Import-PfxCertificate -FilePath .\live-translation-dev.pfx `
     -CertStoreLocation Cert:\LocalMachine\TrustedPeople `
     -Password (Read-Host -AsSecureString "Password for the dev PFX")
   ```

   `LocalMachine\TrustedPeople`, not `Root`. Both satisfy the MSIX installer, but Trusted
   People is trusted *for installing signed app packages* only, whereas Trusted Root
   Certification Authorities is trusted for everything on the machine, including TLS. A
   throwaway key does not belong there.

4. Sign the package. `signtool.exe` lives under the SDK; take the newest:

   ```powershell
   $signtool = (Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
     Sort-Object FullName -Descending | Select-Object -First 1).FullName
   $password = Read-Host -AsSecureString "Password for the dev PFX"
   $cert = Import-PfxCertificate -FilePath .\live-translation-dev.pfx `
     -CertStoreLocation Cert:\CurrentUser\My -Password $password
   $version = (Get-Content .\src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).version
   $package = ".\src-tauri\target\msix\Live Translation & Subtitles_$version.0_arm64.msix"
   & $signtool sign /fd SHA256 /sha1 $cert.Thumbprint $package
   ```

   No timestamp URL: the certificate is valid for a year and the package is disposable.

5. Install it:

   ```powershell
   Add-AppxPackage -Path $package
   ```

   Installing a *rebuilt* package with the same version fails with `0x80073CFB` ("same
   identity, different contents") — Windows only swaps packages in place when the version
   increases. Remove the old one first; Credential Manager keys survive, WebView-stored
   preferences reset:

   ```powershell
   Get-AppxPackage 49346FMadore.LiveTranslationSubtitles | Remove-AppxPackage
   ```

   A **Store-signed copy installed from the listing** also blocks it, with `0x80073CF3`
   ("package updates, dependency or conflict validation failed"): Windows will not let a
   developer-signed package replace a Store-signed one of the same identity, whatever the
   versions. `Get-AppxPackage` shows a `SignatureKind` of `Store` rather than `Developer`:

   ```powershell
   Get-AppxPackage 49346FMadore.LiveTranslationSubtitles |
     Select-Object Version, SignatureKind, PackageFullName
   ```

   Remove it with the same command as above, install the local package, and reinstall from the
   Store when the verification round is done. Expect this on any machine that has the app from
   the Store.

6. Confirm the identity is the one Partner Center assigned — the family name's hash suffix is
   derived from `Name` plus `Publisher`, so this is a byte-for-byte check of both:

   ```powershell
   Get-AppxPackage 49346FMadore.LiveTranslationSubtitles |
     Select-Object Name, PackageFamilyName, Version, InstallLocation
   ```

   `PackageFamilyName` must read `49346FMadore.LiveTranslationSubtitles_6yxybgjxsxtpc`. If the
   suffix differs, the manifest does not match the reservation and the Store will reject the
   upload.

## Verify under package identity

Launch from the Start menu, not the staged `.exe`, which runs without identity and proves
nothing. Then work through the list; the
[acceptance checklist](microsoft-store.md#acceptance-checklist) has the rest.

| Check | What "pass" looks like |
| --- | --- |
| **Whisper (first-launch default)** | A clean install selects Whisper, Base and automatic detection. No download or capture starts automatically. Download a model, select/test the audio source and start; verify offline captions after download and complete Stop draining. On a processor without AVX2 (x64) or dot-product (ARM64) the built-in demo is selected instead and Whisper is listed as unavailable with its reason; see [processor requirements](local-whisper.md#processor-requirements). |
| **Whisper translation into English** | Under Translation, Local Whisper with Small and English as the caption language translates real non-English speech offline; any other caption language is refused and Start waits for English. |
| **Built-in demo (optional)** | Select Built-in demo, then click *Start demo subtitles*, without audio hardware or network. Demo status, elapsed time, level movement, partial/final captions, overlay, Stop and export work. Repeat in English and French. |
| **Microphone (optional live mode)** | With Mistral/Gemini/OpenAI configured, the app appears under Settings → Privacy & security → Microphone and captures with access on. With access blocked, it reports the exact Settings path. |
| **WASAPI loopback** | Join a real Teams or Zoom call from the same machine, run *System audio* or *Both*, and confirm the far end is captioned. This is the highest-risk item in the whole plan: it cannot be tested in CI and it invalidates the route if it fails. |
| **Credential Manager** | Save a provider key in an *unpackaged* build first (`npm run tauri build`, or dev), then start the MSIX build and confirm the key is already there. `Control Panel → Credential Manager → Windows Credentials` should show one generic credential `io.github.fmadore.live-translation`, not two — and no `org.stias.live-translation`, which 1.2.0 migrates across and deletes on first read. |
| **Overlay** | Transparent background, click-through to the window behind, always on top over a full-screen slide deck, and move mode still drags it. Placed and confirmed with Done, it reopens in the same place at the next launch, including on a second display at another scaling. |
| **Export** | Use native Save As to choose a folder and filename for text, Markdown, SRT and VTT. Verify remembered folder, overwrite confirmation and cancellation (including the quit prompt); check the file exists at the exact selected path. See [transcript export](transcript-export.md#verification). Older packages may use the previous Documents export path. |

Anything that fails here is a bug to fix before submission, not a packaging setting to tweak:
the same binary runs in both shapes.

## Remove the dev certificate afterwards

```powershell
Get-AppxPackage 49346FMadore.LiveTranslationSubtitles | Remove-AppxPackage
Remove-Item .\live-translation-dev.pfx

# Elevated:
Get-ChildItem Cert:\LocalMachine\TrustedPeople |
  Where-Object Subject -eq "CN=5D0ECC96-3998-452E-B7E9-29BE9B576F86" | Remove-Item

# Your own store:
Get-ChildItem Cert:\CurrentUser\My |
  Where-Object FriendlyName -eq "Live Translation dev signing" | Remove-Item
```

Leaving the certificate in Trusted People means the machine keeps installing anything signed
with that key. Remove it when the verification round is done.

## Debugging without repacking

Microsoft's [`winapp` CLI](https://github.com/microsoft/winappCli) grants package identity to
an unpackaged build through loose-layout registration, so packaged-only behaviour can be
reproduced without signing and reinstalling an MSIX for every change:

```powershell
winget install Microsoft.winappcli --source winget
winapp run
```

The CLI's `winapp init` / `winapp cert` / `winapp pack` flow is a first-party alternative to the
packaging above — single-architecture, and not what the release workflow uses.

## What CI does

After the installer job has created the release, the `msix` job in
`.github/workflows/release.yml` runs the same build command natively per architecture and
uploads `Live.Translation_<version>_<arch>.msix`. The `bundle` job then combines both into
`Live.Translation_<version>.msixbundle` with MakeAppx and uploads that single Store bundle.
Nothing is signed: Partner Center expects an unsigned package and the Store applies its own
signature.
