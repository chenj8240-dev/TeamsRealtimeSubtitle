# 上游审计记录

## 固定基线

- 仓库：[`fmadore/Live-translation`](https://github.com/fmadore/Live-translation)
- Release：`v1.7.1`
- Commit：`2b525525b5a5125f27a9ffad75ac90e766748060`
- 许可证：MIT。保留上游 `LICENSE`、版权归属和来源说明；模型与第三方依赖另按各自许可处理。
- 源码快照：本仓库的 [`app/`](app/) 目录；没有复制上游 `.git` 目录。官方仓库应配置为本地 `upstream` remote，避免把上游改动推回原作者仓库。

## 已核对的架构

- 桌面应用使用 Tauri 2，前端是 TypeScript/Svelte，核心为 Rust；项目需要 Node 22.13+/24、Rust 1.90+、Windows C++ 工具链和 Windows SDK。
- `app/src-tauri/src/audio/loopback.rs` 已实现 WASAPI 系统输出设备混音回环（设备上各应用声音的混合结果），不需要虚拟音频设备。该实现与麦克风路径共享后续分帧、采样率转换和音量状态逻辑。
- `app/src-tauri/src/audio/applications.rs` 已对进程级采集做运行时版本检查：Windows build 20348 及以上可选单个应用；低于版本时返回 `supported: false`。当前设备 build 19045 不支持这条路径。
- 应用选择器 `app/src/lib/SystemCapturePicker.svelte` 同时提供设备混音与应用模式；应保留不支持时的解释，并确保用户不会误以为设备混音只包含某个应用。
- `app/src-tauri/src/whisper/` 有本机 Whisper 推理；`whisper-translate` 使用 Whisper 翻译任务，输出目标仅为英语。现有本机翻译不能满足“任意源语言译成中文”。
- `app/src-tauri/src/ondevice/` 中的 `ondevice` 是演示用固定文本时间线，不是真实的本机语音识别或翻译引擎。
- Gemini、OpenAI、Mistral 路径是云端处理。产品改造应在 UI 中明确区分，离线优先模式不得把它们当作静默回退。
- 上游 UI 与数据结构也包含麦克风输入、会话历史/恢复、API 密钥和会议配置。首版应默认系统声音、本地引擎、关闭历史；可暂时保留底层功能但不得默认启动或混淆产品范围。

## T01 当前改动

- `app/src/lib/startOptions.ts` 将全新安装的输入来源从麦克风改为系统播放声音；仍使用本机 Whisper 的原文字幕模式。打开应用不会自动启动采集或下载模型。
- 已在应用 README 标明这是 Windows 10 适配中的个人分支、设备混音会包含其他声音、中文离线翻译尚未实现。
- 该改动尚未通过构建或运行验证；当前环境 PATH 缺少 Rust/C++ 构建工具。

## Win10 兼容性结论

1. Win10 build 19045 的单应用进程采集不可用；这由代码和 Windows API 最低版本共同确认。
2. 系统播放设备回环已经存在于上游，具有实现 Win10 跨应用字幕的技术基础；但上游产品声明 Windows 11，所以尚不能据此宣称整个应用兼容 Win10。
3. T01 需核对应用包/安装器最低系统版本、Windows 10 下构建和启动、WebView2、浮层和设备回环。若只有打包目标版本阻挡，应修改包配置；若是运行时 API 阻挡，应隔离该 API 并保留系统混音模式。
4. 对不支持或无音频的情形，应显示状态并停止/等待；不可自动切换成麦克风、另一设备或云服务。

## 当前本机开发环境观察

- 已发现 Node.js 运行时和 pnpm 启动器。
- 本次检查的 PATH 中未发现 `cargo`、`rustc`、`cl`、`cmake`、`clang`、`ninja` 或 `rustup`。因此当前环境还不能确认原生 Rust/Whisper 构建条件；T01 需检查完整安装路径。没有尝试安装这些系统工具。
- 当前记录仅是文件/配置审查，没有运行应用、构建、测试或录制音频。

## 下一步

- T01：在不改功能的情况下建立完整 Windows 构建环境清单，确认 `app` 可否在 Win10 编译和启动。
- T02/T03：把设备混音明确设为 Win10 首选来源，并在本机验证 WASAPI 回环。
- T06/T07：评估并实现本机中文翻译前，保持“本机原文字幕”和“本机 Whisper→英语”是仅有的离线路径；不要把云端能力标成本机。
