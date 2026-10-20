# Windows desktop build readiness

Checked 2026-10-20 on the current development machine. This is a toolchain probe, not proof of a packaged Windows 10 run.

## Results

- The Svelte/Vite production frontend builds successfully with the bundled Node runtime.
- Full npm dependency audit: 0 reported vulnerabilities after pinning the vulnerable transitive `follow-redirects` dependency to the patched line.
- WebView2 runtime is present under Microsoft Edge WebView on this machine.
- Rustup was fetched from the official Rust distribution host and its SHA-256 matched the published `.sha256` value. Installing the stable MSVC toolchain into `D:\Codex\.toolchains` did not finish within two 180-second attempts; rustup reported that it was downloading six components. Rust/rustc is therefore not yet confirmed usable.
- Microsoft C++ Build Tools and the Windows SDK were not found in the standard install locations or PATH.
- CMake, Ninja, LLVM/Clang and `libclang` were also not found; these are additional requirements of the Whisper native build in this repository.
- The browser preview is not a desktop runtime: Tauri-only audio and window controls remain unavailable there.

## What prevents a native run

Tauri's Windows setup requires Microsoft C++ Build Tools and WebView2; Rust with the MSVC target is also required. WebView2 is present, but the C++ toolchain/SDK are missing and Rust installation timed out. The project also needs LLVM/Clang, CMake and Ninja for its Whisper native dependency. See [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

A successful frontend build does not validate audio capture, Whisper, overlays, or Windows 10 compatibility. Do not treat the current browser preview as a successful desktop smoke test.

## Next environment step

Install Visual Studio Build Tools with the “Desktop development with C++” workload and a Windows 10/11 SDK, then resume rustup in the project-local toolchain directory. Add CMake, Ninja and LLVM/Clang with libclang, and rerun a native Tauri development launch. The Visual Studio workload installer may require administrator rights and license acceptance, so it was not launched unattended.
