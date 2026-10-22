# T07 本机翻译最小集成与门禁

最后更新：2026-10-22
分支：work/T07-local-translation
状态：**Rust 最小集成已跑通；0.5B 质量不足，1.5B 质量接近但内存/延迟不足，未接入 UI/会话默认路径。**

## 结论

- CTranslate2 的 Rust 绑定 ct2rs 0.10.2 在 Windows 10 / MSVC 上构建成功，静态 CRT；独立 probe 可以加载 Qwen2.5-0.5B-Instruct int8 并输出中文。
- app 内链接被 CRT 阻塞：ct2rs 强制 /MT，现有 Whisper/app 为 /MD；cargo check 能过，但示例链接失败。为避免把未过门禁的模型强加给 app，已撤回 app 内 experiment。
- Qwen2.5-0.5B 的 50 句门禁只有约 **30/50（60%）**；峰值 RSS **758 MB**，但与 Whisper 并发时从 **1.30 s/句** 升到 **3.51 s/句**，Whisper smoke 从 **68.1 s** 升到 **90.8 s**。质量与并发都不合格。
- Qwen2.5-1.5B 质量明显提升：Python/CTranslate2 用“只翻译+术语”提示约 **46–48/50（92–96%）**，Rust/ct2rs 约 **43–45/50（86–90%）**；但 RSS **1.93–2.18 GB**，Python mean **2.87 s/句**，Rust mean **5.03 s/句**。质量接近门槛，内存/延迟不满足。
- Rust/ct2rs 走 **ruy** 后端，0.5B 单句约 1.30 s，1.5B 约 5.03 s；Python/CTranslate2 同模型 0.5B 0.272 s、1.5B 2.87 s。ruy 后端和 1.5B 都不适合实时字幕。
- 没有云端回退；模型权重不提交 Git。

## 产物与路径

| 项目 | 值 |
|---|---|
| 原始模型 | Qwen/Qwen2.5-0.5B-Instruct，Apache-2.0 |
| 源权重 | 988,097,824 bytes；SHA256 fdf756fa7fcbe7404d5c60e26bff1a0c8b8aa1f72ced49e7dd0210fe288fb7fe |
| CTranslate2 int8 | 495,952,759 bytes（473 MiB） |
| 0.5B 模型目录 | D:\Codex\.toolchains\translation-eval\qwen2.5-0.5b-instruct-ct2-int8 |
| 1.5B 模型 | jncraton/Qwen2.5-1.5B-Instruct-ct2-int8，Apache-2.0；model.bin 1,547,075,575 bytes；SHA256 b04ba4563ce464a32e3a8804aa838d87cb97c081a297e5c818572b67590b6dd2 |
| 1.5B tokenizer | 预转换仓库的 tokenizer 在 Rust 下只输出 “The”；已替换为 Qwen 官方 tokenizer.json（7,031,645 bytes），原文件备份为 tokenizer.preconverted.json |
| 模型下载 | 16 MB 分块、8 路、SHA256 校验完成；未提交仓库 |
| Rust 绑定 | ct2rs 0.10.2，CTranslate2 源码构建，ruy + tokenizers，静态 CRT |
| Rust probe | tools/qwen-translate-probe（独立 crate；未链接进 app） |
| 语料 | app/docs/translation-gate-corpus.tsv（50 句） |

模型下载是本次实际完成的预置步骤，不是应用内下载 UI；应用内自动下载/校验仍是后续工作。

## Rust 集成

- 新增独立 crate tools/qwen-translate-probe，提供单句翻译和 --corpus 批量模式，便于重复门禁。
- app 内曾尝试 feature-gated translation-probe 模块 + example：cargo check 通过，但链接被 CRT 阻断（ct2rs /MT vs Whisper/app /MD），已撤回。
- 因此当前没有把翻译接入 app 二进制；需要 sidecar、动态 CRT 的 ct2rs 构建，或统一重建所有 native 依赖后再接。
- ct2rs 需要 CMake/C++ 构建，Windows 还需 RUSTFLAGS=-C target-feature=+crt-static。
- 加载模型时需要 tokenizer.json 与 model.bin/config.json/vocabulary.json 同目录。
- ChatML 提示词固定为专业字幕翻译 + 术语表；生成 max 64 tokens，greedy，include_prompt_in_result=false。

## 性能与内存

| 场景 | 结果 |
|---|---|
| Rust Qwen 50 句，无并发 | total 65.1 s；mean **1.301 s/句** |
| Rust Qwen 50 句 + Whisper Tiny | total 175.7 s；mean **3.514 s/句** |
| 峰值 RSS | **757.9 MB**（无并发）；755 MB（并发） |
| Whisper Tiny 单独 | 68.12 s，1 passed |
| Whisper Tiny 与 Qwen 并发 | 90.84 s，1 passed |
| Python CTranslate2 0.5B 对照 | 0.272 s/句（说明 ruy 后端不是最优） |
| Rust Qwen 1.5B 50 句 | total 251.3 s；mean **5.026 s/句**；峰值 RSS **1931.8 MB** |
| Python CTranslate2 1.5B 50 句 | mean **2.872 s/句**；RSS **2181.3 MB** |

结论：0.5B 满足 1 GB 内存，但质量不足；1.5B 质量接近门槛，但内存超过 2 GB、延迟 2.9–5.0 s/句。并发场景没有为 1.5B 重测，按 0.5B 的 2.7 倍退化推断只会更差。

## 50 句门禁

语料：app/docs/translation-gate-corpus.tsv，覆盖会议、游戏、技术/构建、聊天、数字/姓名/URL。

严格人工检查结果：**30/50 通过，20/50 失败（60%）**；门槛 90%，**FAIL**。

代表性失败：

| 英文 | 输出 | 问题 |
|---|---|---|
| Can you share your screen? | 能看我的屏幕吗？ | 说话人方向反了 |
| I'll send the agenda after the stand-up. | 排队后，我将发送议程。 | stand-up 译成排队 |
| Push mid, the enemy jungler is coming. | 推中路，敌方野怪来了。 | jungler 译成野怪 |
| Run the tests before merging. | 验测试件前先合并。 | 动作顺序反了 |
| Alice will present the Q3 numbers. | 安琪拉将发布Q3数据。 | 人名被改成游戏角色 |
| The invoice total is $1,240.50. | 发票总金额为1240.50元。 | 丢掉美元符号/币种 |
| The call starts at 09:30 UTC. | 起源于UTC09:30。 | starts 误译成起源 |
| The build finished in 4 minutes 20 seconds. | 该补丁在4分钟20秒内完成。 | build 误译成补丁，时间变成 4:20 |
| Please email support@example.com. | 请发送至 example@example.com。 | 邮箱本地部分被改 |

few-shot/更强提示词能修复 share screen、stand-up、jungler、merge 的一部分，但仍出现 boss→孵化、I need healing→你需要治疗、queue→再等、merge 顺序、transcript 未译、Alice→安迪、$ 金额丢币种、4:20→42 分钟等错误。0.5B 的能力不足以稳定通过该领域门禁。

### Qwen2.5-1.5B 补充

- 使用预转换的 jncraton CT2 int8（1.547 GB），避免在 1.8 GB 空闲内存下转换 3 GB 源权重。
- 预转换仓库 tokenizer 在 Rust 下会把提示词编码错，模型只输出 “The”；换成 Qwen 官方 tokenizer.json 后恢复正常（会议将在五分钟后开始）。
- Python/CTranslate2，无门禁例句、仅“只翻译+术语”提示：**46–48/50**；Rust/ct2rs 同一提示：**43–45/50**。质量接近 90% 门槛，但未稳定通过。
- 代表性失败：不说话的静音条件变成“发言时静音”、3 p.m. 变成 1:30、mana 未译、Alice 变成艾丽卡/艾丽莎、Let me know when you're ready 句子不完整。
- 延迟/内存：Python mean 2.872 s/句、RSS 2.18 GB；Rust mean 5.026 s/句、RSS 1.93 GB；Rust 有单句 15 s 的 paging 尖峰。
- 结论：1.5B 适合作为“离线质量模式”的候选，不适合作为 1 GB/实时默认路径；仍需专用 MT 或 4-bit/更强后端。

## 决策

1. **不接入默认字幕路径/UI**：当前独立 probe 只能手动运行，不能自动翻译。
2. **不把 Qwen2.5-0.5B 作为发布默认模型**；0.5B 质量不够。
3. **1.5B 只作为“质量模式”候选**：质量接近但内存/延迟不达标，不能默认启用。
4. **下一步优先级**：
   - 测 1.5B 与 Whisper 并发的端到端延迟，确认质量模式是否可用；
   - 启用 ct2rs 的 oneDNN/MKL 后端，验证能否降低 1.5B/0.5B 的 Rust 延迟；
   - 考虑 4-bit/GGUF 或专用 MT + 术语表，把内存压回 1 GB 附近；
   - 解决 app/ct2rs 的 CRT 冲突（sidecar、动态 CRT 构建或统一重建 native 依赖）；
   - 任何方案都必须重跑 50–100 句门禁，并测与 Whisper 并发。
4. **不接云端回退**；无 API key、无网络翻译。

## 构建/运行

- Windows 需要 VS C++、CMake、Ninja；ct2rs 从源码编译 CTranslate2。
- 构建独立 probe：
  - 设置 CMAKE_GENERATOR=Ninja、CC/CXX 为 cl、RUSTFLAGS=-C target-feature=+crt-static；
  - cargo build --release --manifest-path tools/qwen-translate-probe/Cargo.toml。
- 运行：
  - tools/qwen-translate-probe/target/release/qwen-translate-probe.exe <model-dir> "text"；
  - 或加 --corpus <file> 批量输出 TSV。
- 本次 Rust 0.5B/1.5B 的 50 句结果来自仓库外 D:\Codex\ct2-probe；仓库内 tools/qwen-translate-probe 已成功构建，1.5B 单句和 50 句均跑通。

## 未验证/风险

- app 内链接尚未完成：ct2rs 静态 CRT 与现有 Whisper/app 动态 CRT 冲突；sidecar 或统一 CRT 方案未验证。
- 独立 probe 的 Windows 构建依赖 CMake、Ninja、MSVC 和静态 CRT 环境。
- 应用内下载/校验 UI 未实现；当前模型是预置下载。
- 没有真实会议音频；没有端到端 Whisper→Qwen→字幕延迟。
- 没有 COMET/BLEU/chrF；只有严格人工小样本。
- 1.5B 与 Whisper 的并发延迟未测；oneDNN/MKL 的 ct2rs 构建未完成。
- 1.5B 门禁用同一 50 句集做过提示迭代，存在一定过拟合风险；仍需独立测试集。
- 模型权重、日志、音频未提交。
