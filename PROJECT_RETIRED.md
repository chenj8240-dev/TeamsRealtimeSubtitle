# 项目终止记录

**终止日期：2026-11-04**

本项目（Windows 实时字幕与翻译工具，仓库 TeamsRealtimeSubtitle）研发终止，不再计划发布或继续实现。

## 最终状态

- T01–T05：已完成本机环境审计、音频采集接口、Win10 WASAPI loopback、帧队列/VAD、本地 Whisper Tiny 冒烟验证。
- T06：已完成本机翻译模型评估；Qwen2.5-0.5B/1.5B、OPUS-MT、M2M100、NLLB 等有实测记录。
- T07：完成了独立 Rust/ct2rs + Qwen2.5 CTranslate2 最小 probe；50 句质量门禁与 Whisper 并发测试未达到可发布标准。
- **没有可发布的 Windows 安装包，没有接入生产 UI/字幕会话，没有云端回退。**

## 保留的开发文档

- [README.md](README.md)
- [AGENT_TASKS.md](AGENT_TASKS.md)
- [UPSTREAM_AUDIT.md](UPSTREAM_AUDIT.md)
- [WIN10_COMPATIBILITY.md](WIN10_COMPATIBILITY.md)
- [LOCAL_TRANSLATION_EVALUATION.md](LOCAL_TRANSLATION_EVALUATION.md)
- [T07_LOCAL_TRANSLATION_INTEGRATION.md](T07_LOCAL_TRANSLATION_INTEGRATION.md)
- [app/docs/](app/docs/)（音频、Whisper、兼容性、翻译门禁语料）

## 分支与最终提交

| 分支 | 最终提交 |
|---|---|
| work/T01-dependency-risk | 70ca772 |
| work/T02-audio-capture-interface | f0399ca |
| work/T03-win10-wasapi-loopback | 1eafdf6 |
| work/T04-audio-framing-vad | bfa09d1 |
| work/T05-local-whisper | 85fe08b |
| work/T06-translation-eval | a47a11c |
| work/T07-local-translation | d16e87d |

## 清理说明

为释放磁盘，已删除可再生成的构建产物、前端依赖缓存，以及仓库外的评测模型/构建目录；未删除源码、Git 历史、开发文档或评估结论。模型权重、音频、日志不属于发布内容。
