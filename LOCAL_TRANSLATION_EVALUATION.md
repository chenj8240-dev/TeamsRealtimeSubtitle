# 本机翻译模型评估（T06）

最后更新：2026-10-21
范围：为简体中文目标选择可在 Windows 10 / CPU 上离线运行的本机翻译方案。**本报告不集成、不改 UI、不接云端回退。**

## 结论摘要

- **T07 首选基线：OPUS-MT en→zh（Helsinki-NLP），Apache-2.0，CTranslate2 int8。**
  实测单句平均 **33.6 ms**、5 句批 **72.7 ms**，int8 权重 **79.6 MB**，进程 RSS 约 **353 MB**（Python 基准环境；模型文件本身 80 MB）。延迟足够覆盖字幕场景。
- **法语/其他源语言先用中转：fr→en→zh。**
  两个 int8 模型共 **156.3 MB**，单句平均 **105.2 ms**、5 句批 **728.2 ms**；质量可用但会叠加中转误差。
- **OPUS-MT 不能单独作为“游戏/技术会议质量”方案。**
  实测把 *jungler* 译成“丛林杀手”、*stand-up* 译成“站出来”、*mute* 译成“闭上麦克风”、*build passed* 译成“传递的建筑”。T07 必须加术语表/后处理，并用领域样例做准入。
- **M2M100-418M 已补测，但不建议作为基线**：MIT、int8 490.7 MB、单句 178.6 ms、5 句批 1.6–2.4 s；中文质量没有优于 OPUS-MT（mute→“移动麦克风”、build 输出乱码/繁体混用），RSS 772 MB。模型已下载并转换到仓库外，保留作对照，不选为 T07 首选。NLLB-200 600M 因 **CC-BY-NC-4.0** 不建议进入 MIT 发布链。
- Qwen2.5-0.5B（Apache-2.0）语言能力可能更好，但作为通用 LLM 的 CPU 延迟/幻觉/提示工程风险更高，不作为 MVP 首选；只在 OPUS-MT 术语门禁失败时评估。

## 本机约束

| 项目 | 实测/确认值 |
|---|---|
| 系统 | Windows 10 Pro 22H2 19045.2965，x64 |
| CPU | Intel Core i5-13420H，2.61 GHz |
| 内存 | 16 GB（评估时约 2.7 GB 空闲） |
| GPU | Intel UHD Graphics（无独立 GPU；本次仅 CPU） |
| 磁盘 | D: 约 282 GB 空闲 |
| 运行环境 | Python 3.12.14；torch 2.14.1+cpu；transformers 5.20.2；CTranslate2 4.8.3 |
| 目标 | 简体中文；本机离线；不自动云回退；模型首次下载可联网 |

## 方法

- 模型元数据/许可证/权重大小：Hugging Face API 与模型卡（2026-10-21）。
- 延迟：把模型转为 **CTranslate2 int8**，在 CPU 上用 4 个 intra-op 线程、beam size 4、max decoding 128 运行。
- 句子集：会议、聊天、游戏、构建/技术、设备设置各若干句；先 warm-up，再测 20 次单句、10 次 5 句批。
- 中文质量：人工阅读输出；本轮是**小样本筛查**，不是 BLEU/COMET/chrF 或完整领域评测。
- 基准脚本和模型在仓库外：D:\Codex\.toolchains\translation-eval\；模型权重未提交到 Git。

## 候选对比

| 候选 | 许可证 | 参数/权重 | int8 体积 | 语言方向 | 实测延迟 | 结论 |
|---|---|---:|---:|---|---|---|
| **OPUS-MT en→zh** | Apache-2.0 | 77M / 297.6 MB fp32 | **79.6 MB** | en→zh | **33.6 ms/句；72.7 ms/5句** | **T07 基线** |
| **OPUS-MT fr→en + en→zh** | Apache-2.0 | 75M + 77M / 584.5 MB fp32 | **156.3 MB** | fr→en→zh | **105.2 ms/句；728.2 ms/5句** | 法语中转方案 |
| M2M100-418M | MIT | 418M / 1.85 GB fp32 | **490.7 MB（实测）** | 100 语言直译 | **单句 178.6 ms；5句批 1.6–2.4 s** | 已实测；延迟/质量不佳，不选 |
| NLLB-200 distilled 600M | **CC-BY-NC-4.0** | 600M / 2.35 GB fp32 | 约 600 MB（估算） | 200 语言直译 | 未测 | **不建议**（非商用） |
| Qwen2.5-0.5B-Instruct | Apache-2.0 | 494M / 942.3 MB fp16 | 约 400 MB q4（估算） | 通用 LLM | 未测 | 仅质量兜底候选 |
| OPUS-MT tc-bible-big zhx | Apache-2.0 | 237M / 904.2 MB fp32 | 约 237 MB（估算） | de/en/fr/pt/es→zh | 未测 | 圣经领域，通用风险高 |
| OPUS-MT tc-big en→zh | 未取得 | — | — | en→zh | 未测 | HF API/模型页 401，无法评估 |
| Whisper translate | MIT（随 Whisper） | 随 Whisper 模型 | — | 任意→**英语** | — | 不满足中文目标 |

## 实测细节

### 1) OPUS-MT en→zh int8

- 模型：Helsinki-NLP/opus-mt-en-zh，Apache-2.0。
- 权重：297.6 MB fp32；CTranslate2 int8 **79.6 MB**。
- 4 threads：load 0.20 s；RSS 353.5 MB；单句 mean **33.6 ms**、median 32.9、p95 40.9；5 句批 mean **72.7 ms**、p95 85.0。
- 8 threads 反而变慢（单句 mean 173.7 ms、5 句批 360.0 ms）；这台混合 CPU 应固定 **4 线程**。

样例（原文 → 译文）：

| 英文 | 中文 |
|---|---|
| Hello everyone, can you hear me? | 大家好,你能听到我吗? |
| The meeting will start in five minutes. | 会议将在五分钟后开始。 |
| I think we should review the last slide. | 我认为我们应该审查最后一张幻灯片。 |
| The enemy is behind the building; watch out. | 敌人在大楼后面,小心 |
| Thank you for joining, have a great day. | 谢谢大家加入,祝今天愉快。 |

### 2) 法语中转 fr→en→zh

- 模型：Helsinki-NLP/opus-mt-fr-en + en→zh，均 Apache-2.0。
- int8：76.7 + 79.6 = **156.3 MB**；RSS 460.7 MB。
- 单句 mean **105.2 ms**、median 89.8、p95 206.9；5 句批 mean **728.2 ms**、p95 829.7。
- 输出可用但更“直译”：*Merci de votre participation, bonne journée.* → “谢谢你的参加, 美好的一天。”；比直接模型多一层误差。

### 3) 领域质量筛查（OPUS-MT en→zh）

| 英文 | 中文 | 判断 |
|---|---|---|
| Push mid, the enemy jungler is coming. | 冲中点 敌人的丛林杀手要来了 | **术语错误**（jungler） |
| Please mute your microphone when you're not speaking. | 请在不说话时 闭上你的麦克风 | **术语错误**（mute） |
| I'll send the patch after the stand-up. | 我会在站出来后把补丁寄过来 | **歧义**（stand-up） |
| The build passed on Windows 10. | 在Windows 10上传递的建筑 | **技术术语错误**（build） |
| I can't hear you; your audio is breaking up. | 我听不到你的声音 你的音响断了 | 可用但不自然 |
| Open the settings and select system audio. | 打开设置并选择系统的音频。 | 可用 |
| The deadline is October 24th at 3 p.m. | 截止时间是10月24日下午3时 | 可用 |

结论：OPUS-MT 适合“先跑通、低延迟、通用句子”，但**不能未经术语表/后处理直接承诺游戏或技术会议质量**。

### 4) M2M100-418M 补充实测

下载：1,935,796,948 bytes，SHA256 **d907ea45e4e4b9db163382a6674f6218b3c59566fe06d77f4055c208b4e87ed1**；CTranslate2 int8 **490.7 MB**。4 线程，RSS 772.2 MB。

| 指标 | 结果 |
|---|---|
| 单句 en→zh | mean **178.6 ms**、median 174.5、p95 199.6 |
| 5 句批 en→zh | mean 1.62 s、median 2.25 s、p95 2.40 s |
| 3 句批 fr→zh | mean 1.13 s、median 1.12 s、p95 1.17 s |

样例：

| 英文/法文 | M2M100 中文 |
|---|---|
| Please mute your microphone when you're not speaking. | 请在你不说话时移动麦克风。 |
| The build passed on Windows 10. | 此分類上一篇: Windows 10 與 Windows 10 與 Windows 10 同行 |
| Push mid, the enemy jungler is coming. | 点击中间,敌人丛林即将到来。 |
| The meeting will start in five minutes. | 會議將在五分鐘內開始。 |
| Merci de votre participation, bonne journée. | 谢谢您的参与,好日子。 |

结论：M2M100 的直接多语覆盖虽然方便，但在这台 CPU 上比 OPUS-MT 慢约 5 倍，且出现术语错误、繁体混用和整句幻觉；不能作为 T07 的质量升级路径。模型保留在 D:\Codex\.toolchains\translation-eval\，用于后续对照。

## 许可证与发布影响

- **OPUS-MT**：模型卡/API 标为 Apache-2.0，适合与 MIT 项目一起分发；仍需保留模型来源、许可证和版权说明，模型权重不提交进 Git。
- **M2M100**：MIT，许可证友好；但实测 int8 490.7 MB、单句 178.6 ms、5 句批 1.6–2.4 s，中文质量未优于 OPUS-MT；保留本地模型用于对照，不作为推荐依赖。
- **NLLB-200**：CC-BY-NC-4.0，禁止商业使用；即使个人使用也需明确标注，不适合作为默认发布依赖。
- **Qwen2.5-0.5B**：Apache-2.0；但通用 LLM 的输出可能编造/漏译，需提示词、术语约束和后处理。
- **tc-big en→zh**：HF 返回 401，缺少可访问的模型卡/权重；不纳入。
- 所有候选都要求首次下载时展示来源、体积、许可证，用户主动触发；下载后推理离线，不自动云回退。

## 推荐与 T07 准入

1. **先接 OPUS-MT en→zh int8 + fr→en→zh 中转**：Apache-2.0，80/156 MB，34/105 ms，4 线程，CTranslate2。作为 T07 的可回滚基线。
2. **加术语表/后处理**：至少覆盖游戏（jungler、mid、push、queue）、会议（stand-up、mute、share screen）、构建（build、patch、deadline）；保留原文，译文失败/低置信度时显示原文。
3. **T07 质量门禁**：用 50–100 条受控的会议/游戏/聊天句子做人工评分；如果术语错误或不可读比例超过约定阈值，评估 Qwen2.5-0.5B 或更大的直接翻译模型。M2M100-418M 已实测且不是质量升级，不作为首补测项；NLLB 仍受 CC-BY-NC 限制。不要用云端回退。
4. **延迟目标**：单句翻译 ≤ 300 ms、5 句批 ≤ 1 s；OPUS-MT 已满足；M2M100 单句 178.6 ms 但 5 句批超过 1 s，Qwen 未测，不能先写进验收。
5. **语言覆盖**：首版只承诺实测过的 en→zh 和 fr→en→zh；日语、韩语、其他源语言需单独选模型/中转并测试，不能从 200 语言模型的支持列表推定质量。
6. **中文变体**：本轮输出为简体字形；仍要加 zh-Hans 断言/术语表检查，避免繁体或混用。

## 未验证/风险

- M2M100 已下载并通过 SHA256、转成 int8，实测数据见上；但只做了 10 条领域样例，未做完整评测。
- NLLB/Qwen/tc-bible 未实测；Qwen 的 CPU 生成延迟和幻觉风险未知。
- 仅 10 条领域样例，不足以判断长句、多人对话、专有名词、数字/日期、代码切换。
- 没有做 COMET/BLEU/chrF 或母语者评分；没有真实会议音频。
- CTranslate2 的 Rust 集成方式（C++ API/绑定/子进程）尚未评估；T07 需先做最小集成验证。
- 首次下载需要网络；本轮用缓存模型做推理，未在断网 OS 环境下重复。
- 不涉及 TTS/变声/虚拟麦克风/云端 API。

## 证据

- https://huggingface.co/Helsinki-NLP/opus-mt-en-zh
- https://huggingface.co/Helsinki-NLP/opus-mt-fr-en
- https://huggingface.co/facebook/m2m100_418M
- https://huggingface.co/facebook/nllb-200-distilled-600M
- https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct
- https://huggingface.co/Helsinki-NLP/opus-mt-tc-bible-big-zhx-deu_eng_fra_por_spa
- https://huggingface.co/Helsinki-NLP/opus-mt-tc-big-en-zh（当前 401，未评估）
