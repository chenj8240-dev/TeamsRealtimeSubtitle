# Windows 10 构建与启动兼容性（T01）

最后复核：2026-10-21（America/Mexico_City）
范围：T01 构建与启动兼容性探针。未验证安装包、浮层、退出、WASAPI 采集、实时 ASR、Whisper 或本机中文翻译。

## 结论

- 当前审计机器为 Windows 10 Pro 22H2，build 19045.2965。
- 原生 debug 构建产物存在：`app/src-tauri/target/debug/live-translation.exe`，26,608,640 bytes，2026-10-21 11:18:10。
- 用户已确认（2026-10-21）手动启动成功并能看到应用；旁证是应用专用 WebView2 数据目录的 `EBWebView` 最后写入 11:20:33。
- 本次审计没有重新执行 `cargo check` 或 native build，也没有读取任何运行日志；构建结论依据现有产物、前序记录和目录时间戳。
- 不能据此宣称“完整 Win10 兼容”或“目标机兼容”。安装包、干净环境、浮层、退出、音频和翻译仍未验证。

## 当前机器与运行时

| 项目 | 核验值 |
|---|---|
| 操作系统 | Windows 10 Pro 22H2，10.0.19045.2965 |
| WebView2 Runtime | 155.0.4283.62 |
| 当前应用进程 | 未运行（未发现 `live-translation` 进程或对应窗口） |
| Vite 端口 | 1420 / 5173 均未监听（2026-10-21 11:26 左右） |

## 构建工具链

| 组件 | 版本/路径 | 说明 |
|---|---|---|
| Visual Studio | Community 2026 18.11.12315.225 | `C:\Program Files\Microsoft Visual Studio\18\Community` |
| MSVC | 14.51.36231 | `cl.exe` 存在；构建需在 VS 开发环境中运行 |
| Windows SDK | 10.0.26100.0 | `D:\Windows Kits\10`；`Windows.h` 存在 |
| Rust | 1.99.1 (MSVC) | `D:\Codex\.toolchains`；需设置 `RUSTUP_HOME`/`CARGO_HOME`，未加入全局 PATH |
| clang-cl | 22.1.3 | VS 自带 `VC\Tools\Llvm\x64\bin` |
| CMake | 4.3.1-msvc1 | VS 自带 |
| Ninja | 1.13.2 | VS 自带 |
| 前端构建 | `app/build` 存在 | 时间 2026-10-20 14:47 |

历史成功构建记录使用 Ninja、clang-cl、`CXXFLAGS=/EHsc` 以及 VS/SDK include/lib 环境；本次未重跑。

## 构建与启动证据

### 可复核的本地证据

1. `app/src-tauri/target/debug/live-translation.exe` 存在，26,608,640 bytes，2026-10-21 11:18:10。
2. 构建时 HEAD 为 `d3393a38ca8427d8457d90f132e584705727b6ce`，tracked 工作树无源码修改（本次仅更新文档）；构建产物时间与 HEAD 提交时间接近，但本次未验证二进制与源码的字节级对应关系。
3. `app/build` 前端产物存在（2026-10-20 14:47）。
4. 应用专用 WebView2 数据目录 `%LOCALAPPDATA%\io.github.fmadore.live-translation\webview2-user-data\EBWebView` 最后写入 2026-10-21 11:20:33，说明该目录被实际使用。

### 前序记录（本次未重跑）

- `cargo check --manifest-path app/src-tauri/Cargo.toml` 通过。
- native debug build 成功；曾观察到 `live-translation.exe`、窗口标题 `Live Translation & Subtitles`、`Responding=True`，Vite 本地端口返回 HTTP 200。

### 用户确认

- 用户在 2026-10-21 确认“我已手动启动，可以了”。这证明当前机器上手动启动并显示应用可行，不等同于自动启动、安装包、音频采集、实时识别或翻译已完成。
- 本次审计时应用未运行；上述确认是历史确认，不是本次重新运行的结果。

## WebView2 用户数据目录

- `f49c037` 曾在 `operator`/`overlay` 窗口配置 `dataDirectory=webview2-data`。
- `d47d395` 移除了窗口级配置，改为在 Tauri 创建窗口前设置 `WEBVIEW2_USER_DATA_FOLDER`；若用户或诊断启动器已设置该变量则保留。
- 默认目录为 `%LOCALAPPDATA%\io.github.fmadore.live-translation\webview2-user-data`；代码会先创建目录，创建失败则回退到 WebView2 默认行为。
- 审计会话的进程环境、用户级和机器级环境变量均未设置；默认目录存在并被使用。因此正常手动启动不需要再手动设置 `WEBVIEW2_USER_DATA_FOLDER`。若用自定义启动器设置该变量，仍会生效。
- 这是为规避启动时 WebView2 `HRESULT 0x800700AA`（资源正在使用）而做的最小修改。

## 已解决/已澄清的旧结论

- “LLVM/Clang 缺失”：不成立。VS 自带 clang-cl 22.1.3 可执行。
- “native build/run 未成功”：旧结论已不成立；原生 debug 构建产物存在，用户确认手动启动成功。
- “Cargo 遇到 Schannel `SEC_E_NO_CREDENTIALS`”：这是早期拉取 crates 时的历史故障；后续构建已完成。本次未重测该网络/TLS 路径，不能据此判断当前凭据或代理配置。
- “PATH 无 Rust/Clang”：全局 PATH 仍无这些工具，但工具链位于固定路径并可按需设置；不能据此断言构建不可行。
- Windows 10 build 19045：当前机器已重新核验为 19045.2965；旧文档的版本号本身未过期，但不能代表其他目标机器。

## 尚未验证（不得声称通过）

- Windows 10 19045 的干净机器/第二台目标机兼容性；当前只验证了本机。
- 安装包/MSI、最低系统版本、签名和卸载。
- 浮层显示、置顶、点击穿透、多屏位置与退出/托盘/关闭行为，以及退出时释放设备。
- WASAPI 播放设备回环采集、设备枚举/切换、静音、暂停/停止生命周期。
- 本机 Whisper 模型下载、推理、实时原文字幕。
- 本机中文翻译、双语字幕和端到端延迟。
- 模型下载完成后的断网运行。
- 本次审计时应用未运行；4 个未跟踪日志仍被未识别进程占用，未读取、未删除、未提交。

## 最小后续建议

1. 保持 `d47d395` 的环境变量方案，不回退到窗口级 `dataDirectory`。
2. 在干净 Win10 19045 环境验证安装包、浮层、退出和窗口恢复；这些仍属 T01 收尾。
3. 完成 T02 音频接口/生命周期抽象后，再由 T03 实测 WASAPI 设备回环；不要用本文件的构建/启动结果替代音频验收。
