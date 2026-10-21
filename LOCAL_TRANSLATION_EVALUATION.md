# 本机翻译模型评估（T06）

最后更新：2026-10-21
范围：为简体中文目标选择可在 Windows 10 / CPU 上离线运行的本机翻译方案。**本报告不集成、不改 UI、不接云端回退。**

## 结论摘要

- **T07 首选：Qwen2.5-0.5B-Instruct，CTranslate2 int8。**  
  Apache-2.0；源模型 988 MB，int8 后 **473 MiB**；4 线程单句 mean **0.272 s**、median 0.278、max 0.384（英→中）；法→中 mean **0.234 s**；RSS 约 **1.05 GB**。中文质量显著优于 OPUS-MT，且一个模型直接覆盖英/法，不需要中转。
- **快速后备：OPUS-MT en→zh int8。**  
  Apache-2.0；**79.6 MB**；单句 **33.6 ms**、5 句批 72.7 ms；RSS 约 353 MB。速度极好，但游戏/会议/技术术语质量不足，只适合作为低延迟后备或加术语表的快速模式。
- **M2M100-418M 已删除，不再纳入。**  
  曾实测 int8 490.7 MB（约 468 MiB）、单句 178.6 ms、5 句批 1.6–2.4 s；中文质量没有优于 OPUS-MT，且出现术语错误和幻觉。权重、int8 转换和 HF 缓存已从本机删除。
- **NLLB-200 600M** 因 **CC-BY-NC-4.0** 不适合 MIT 发布链；**tc-big en→zh** 在 HF 返回 401；**Whisper translate** 只能译成英语。三者均不选。
- Qwen 仍是通用 LLM，不是专用 MT；需要固定提示词、术语表、输出清洗和 50–100 条领域门禁，不能把 10 条样例当作生产验收。

## 本机约束

| 项目 | 实测/确认值 |
|---|---|
| 系统 | Windows 10 Pro 22H2 19045.2965，x64 |
| CPU | Intel Core i5-13420H，2.61 GHz |
| 内存 | 16 GB |
| GPU | Intel UHD Graphics（无独立 GPU；本次仅 CPU） |
| 磁盘 | D: 约 278 GB 空闲（删除 M2M100 后） |
| 运行环境 | Python 3.12.14；torch 2.14.1+cpu；transformers 5.20.2；CTranslate2 4.8.3 |
| 目标 | 简体中文；本机离线；不自动云回退；模型首次下载可联网 |

## 方法

- 模型元数据/许可证/权重大小：Hugging Face API 与模型卡（2026-10-21）。
- Qwen：用 CTranslate2 int8，4 个 intra-op 线程，chat template，system prompt 固定为“专业字幕翻译，只输出简体中文”；问题句额外带术语表。生成 max 64 new tokens，greedy。
- OPUS-MT：CTranslate2 int8，4 线程，beam 4，max decoding 128；en→zh 直接测，fr→zh 用 fr→en→zh 中转测。
- 句子集：会议、聊天、游戏、构建/技术、设备设置；先 warm-up；Qwen 逐句测 10 条英文 + 3 条法文，OPUS 测 5 句批与单句。
- 质量：人工阅读；本轮是**小样本筛查**，不是 BLEU/COMET/chrF 或完整领域评测。
- 模型/脚本在仓库外：D:\Codex\.toolchains\translation-eval\；模型权重未提交到 Git。

## 候选对比

| 候选 | 许可证 | 参数/权重 | int8 体积 | 语言方向 | 实测延迟 | 结论 |
|---|---|---:|---:|---|---|---|
| **Qwen2.5-0.5B-Instruct** | Apache-2.0 | 494M / 988 MB fp16 | **473 MiB** | en/fr→zh，通用 LLM | **0.272 s/句 en；0.234 s/句 fr** | **T07 首选** |
| **OPUS-MT en→zh** | Apache-2.0 | 77M / 297.6 MB fp32 | **79.6 MB** | en→zh | **33.6 ms/句；72.7 ms/5句** | 快速后备 |
| OPUS-MT fr→en + en→zh | Apache-2.0 | 75M + 77M / 584.5 MB fp32 | 156.3 MB | fr→en→zh | 105.2 ms/句；728.2 ms/5句 | 被 Qwen 直译取代 |
| M2M100-418M | MIT | 418M / 1.85 GB fp32 | 490.7 MB（约 468 MiB） | 100 语言直译 | 178.6 ms/句；1.6–2.4 s/5句 | **已删除，不选** |
| NLLB-200 distilled 600M | **CC-BY-NC-4.0** | 600M / 2.35 GB fp32 | 约 600 MB（估算） | 200 语言直译 | 未测 | **不建议**（非商用） |
| OPUS-MT tc-bible-big zhx | Apache-2.0 | 237M / 904.2 MB fp32 | 约 237 MB（估算） | de/en/fr/pt/es→zh | 未测 | 圣经领域，通用风险高 |
| OPUS-MT tc-big en→zh | 未取得 | — | — | en→zh | 未测 | HF 401，无法评估 |
| Whisper translate | MIT（随 Whisper） | 随 Whisper 模型 | — | 任意→**英语** | — | 不满足中文目标 |

## 实测细节

### 1) Qwen2.5-0.5B-Instruct CTranslate2 int8

- 模型：[Qwen/Qwen2.5-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)，Apache-2.0。
- 源权重 988,097,824 bytes，SHA256 fdf756fa7fcbe7404d5c60e26bff1a0c8b8aa1f72ced49e7dd0210fe288fb7fe；int8 **model.bin** 495,952,759 bytes（473 MiB）。
- 4 threads；RSS 1,048.4 MB；模型加载可接受，未单独记录加载秒数。
- 英文 10 句：mean **0.272 s**、median 0.278、max 0.384。
- 法文 3 句：mean **0.234 s**。

英文质量样例（第 4–7 句带术语表）：

| 英文 | 中文 |
|---|---|
| Hello everyone, can you hear me? | 大家好，你能听到我吗？ |
| Please mute your microphone when you're not speaking. | 静音你的麦克风，当你不在说话时。 |
| Push mid, the enemy jungler is coming. | 推中路，敌打野来了。 |
| I'll send the patch after the stand-up. | 在站会上发送补丁。 |
| The build passed on Windows 10. | 该构建在Windows 10上通过。 |
| I can't hear you; your audio is breaking up. | 我听不懂你；你的音频断断续续。 |
| Open the settings and select system audio. | 打开设置，选择系统音频。 |
| The deadline is October 24th at 3 p.m. | 截止日期是10月24日15:00。 |

法文样例：

| 法文 | 中文 |
|---|---|
| Bonjour à tous, pouvez-vous m'entendre ? | 你好大家，能听懂吗？ |
| La réunion commencera dans cinq minutes. | 会议将在五分钟后开始。 |
| Merci de votre participation, bonne journée. | 谢谢你的参与，好心情！ |

判断：Qwen 在术语（mute/build/stand-up/jungler）和自然度上明显优于 OPUS-MT；仍有“听不到→听不懂”“敌打野”“好心情”等小错误，需要术语表和输出后处理，但已经可以作为质量模式。

### 2) OPUS-MT en→zh int8（快速后备）

- 模型：Helsinki-NLP/opus-mt-en-zh，Apache-2.0；297.6 MB fp32 / **79.6 MB int8**。
- 4 threads：load 0.20 s；RSS 353.5 MB；单句 mean **33.6 ms**、median 32.9、p95 40.9；5 句批 mean **72.7 ms**、p95 85.0。
- 8 threads 反而变慢（单句 mean 173.7 ms、5 句批 360.0 ms）；固定 4 线程。

已知质量问题：

- *jungler* → “丛林杀手”
- *mute your microphone* → “闭上你的麦克风”
- *stand-up* → “站出来”
- *build passed* → “传递的建筑”

结论：OPUS-MT 只适合低延迟/低内存的快速模式；不能未经术语表直接承诺游戏或技术会议质量。

### 3) 法语中转（被 Qwen 取代）

OPUS-MT fr→en→zh：int8 156.3 MB，单句 105.2 ms、5 句批 728.2 ms；输出比 Qwen 直译更绕，且多一层误差。Qwen 已能直接 fr→zh，且 mean 0.234 s，因此不再把中转作为首选。

## 许可证与发布影响

- **Qwen2.5-0.5B**：Apache-2.0，适合与 MIT 项目一起分发；仍需保留模型来源、许可证和版权说明，模型权重不提交进 Git。
- **OPUS-MT**：Apache-2.0，适合分发；模型体积小，是低延迟后备。
- **M2M100**：MIT，但已实测质量/延迟不佳，模型已删除，不纳入 T07。
- **NLLB-200**：CC-BY-NC-4.0，不适合作为默认发布依赖。
- **tc-big en→zh**：HF 401，缺少可访问权重；不纳入。
- 所有候选首次下载都要展示来源、体积、许可证，由用户主动触发；下载后推理离线，不自动云回退。

## 推荐与 T07 准入

1. **T07 先接 Qwen2.5-0.5B-Instruct CTranslate2 int8**：473 MiB，0.27 s/句，1.05 GB RSS，Apache-2.0；直接 en/fr→zh，固定 system prompt + 术语表。
2. **保留 OPUS-MT en→zh 作为快速后备**：80 MB、34 ms；当机器内存/CPU 紧张或用户选择低延迟时使用，并明确质量较弱。
3. **输出约束**：只输出译文；失败/空输出时显示原文；统一简体中文和全角标点；术语表至少覆盖 jungler、mid、push、mute、stand-up、build、patch、share screen。
4. **T07 门禁**：50–100 条会议/游戏/聊天句子人工评分；Qwen 目标 p95 ≤ 500 ms（已测 max 384 ms 单句）、RSS ≤ 1.5 GB；OPUS 快速模式 ≤ 100 ms。并行 Whisper 推理时的 CPU 竞争必须实测。
5. **语言覆盖**：本轮实测 en→zh、fr→zh；日语/韩语/其他源语言需单独测试，不能从模型支持列表推定质量。中文变体加 zh-Hans 检查。
6. **集成风险**：CTranslate2 的 Rust 绑定/C++ API 尚未验证；Qwen chat template 与 tokenizer 需随模型版本固定；1 GB 级 RSS 与 Whisper 并发要测。

## 未验证/风险

- Qwen 只测了 10 条英文 + 3 条法文，未做长句、多人对话、专有名词、数字/日期、代码切换、COMET/BLEU/chrF 或母语者评分。
- 没有真实会议音频；没有测 Qwen 与 Whisper 同时占用 CPU 的端到端延迟。
- Qwen 是通用 LLM，可能漏译/改写/幻觉；必须加提示词、术语表和后处理。
- CTranslate2 Generator 的 Rust 集成方式尚未评估；T07 需先做最小集成验证。
- 首次下载需要网络；本轮用本地模型推理，未在断网 OS 环境下重复。
- 不涉及 TTS/变声/虚拟麦克风/云端 API。

## 证据

- https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct
- https://huggingface.co/Helsinki-NLP/opus-mt-en-zh
- https://huggingface.co/Helsinki-NLP/opus-mt-fr-en
- https://huggingface.co/facebook/nllb-200-distilled-600M
- https://huggingface.co/Helsinki-NLP/opus-mt-tc-bible-big-zhx-deu_eng_fra_por_spa
- https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-en-zh（当前 401，未评估）
