# Windows desktop build readiness

Checked 2026-10-20 on Windows 10 build 19045. This is a toolchain probe; a native application build and run have not yet succeeded.

## Installed and verified

- Visual Studio Community 2026 (18.11.1), with the x64 MSVC compiler at `C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\MSVC\14.51.36231\bin\Hostx64\x64\cl.exe`.
- Windows SDK 10.0.26100.0 at `D:\Windows Kits\10`; `Windows.h` is present.
- Visual Studio CMake 4.3.1 and Ninja 1.13.2.
- Rust stable 1.99.1 (MSVC target), installed locally at `D:\Codex\.toolchains\rustup` and `D:\Codex\.toolchains\cargo`. Rust is not added to the global PATH; build shells must set `RUSTUP_HOME` and `CARGO_HOME`.
- WebView2 runtime is present.
- Svelte/Vite production frontend build succeeds. Complete npm dependency audit reports 0 vulnerabilities after the `follow-redirects` fix.

## Still blocking a native build

- LLVM/Clang and `libclang.dll` are absent. The repository's Whisper native build requires them.
- Visual Studio Installer attempts to add `Microsoft.VisualStudio.Component.VC.Llvm.Clang` failed with access denied while writing `%APPDATA%\Visual Studio Setup\user.json`; the attempted installer process was not elevated.
- `cargo check --manifest-path src-tauri/Cargo.toml` reached dependency retrieval but could not fetch crates: Windows Schannel returned `SEC_E_NO_CREDENTIALS`. Retrying after granting this task network access produced the same error.
- The browser preview is not a desktop runtime: Tauri audio capture and window controls are unavailable there.

Tauri's Windows setup requires Microsoft C++ Build Tools, WebView2 and Rust. These are present; this alone does not validate the project's native build. See [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

## Next steps

1. In Visual Studio Installer, modify the Community 2026 instance and add **C++ Clang compiler for Windows** (the LLVM/Clang component). The automated modification was blocked by this machine's sandboxed installer context.
2. Resolve Cargo's TLS credential/network error, then run `cargo check` and `npm run tauri dev` from an x64 Visual Studio developer environment.
3. Only a successful native launch can confirm the audio, overlay and Windows 10 runtime paths.
