# CoStar

<p align="center">
  <img src="assets/branding/costar.png" alt="CoStar logo" width="560" />
</p>

<p align="center"><strong>把经确认的人物上下文长期保留下来。</strong></p>

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-green.svg)](https://nodejs.org/)
[![CI](https://github.com/Mechanics130/costar_agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Mechanics130/costar_agent/actions/workflows/ci.yml)

CoStar 是一个 open-core skill 引擎，用来把零散的人物信息、会议纪要、聊天记录和历史材料，整理成可以长期使用的关系上下文。你可以把它理解成一个不会忘记的幕僚系统：它会把笔记、会议纪要、转写内容和历史资料，整理成可确认的人物档案、简报、模拟对话、关系图谱和持续视图。

如果你是开发者或产品人，这个仓库提供的是 skill 引擎本体；如果你想要的是给终端用户使用的产品，那会是建立在 CoStar 之上的另一层 UI。

## CoStar 能做什么

CoStar 的核心闭环是：

1. `capture`
   - 接收单条或批量输入
   - 自动召回相关的既有上下文
   - 明确告诉用户识别到了什么、哪些需要确认

2. `profile`
   - 读取、搜索和维护人物档案
   - 同时支持冷启动档案和成熟档案

3. `briefing`
   - 基于已确认的上下文生成会前准备
   - 保持简短，方便在沟通前快速阅读

## 增强能力

下面这些能力也已经包含在仓库里，但它们不是主闭环标题：

- `relationship-roleplay`
- `relationship-graph`
- `relationship-view`
- `relationship-ingestion`

## 快速开始

如果你是测试用户，先看这里：

- [START_HERE.md](START_HERE.md)

如果你想先看英文版说明：

- [README.md](README.md)

如果你想最快完成本地初始化，可以直接运行：

```powershell
node bin/costar.mjs init
```

如果你已经在环境变量里准备好了 `OPENAI_BASE_URL`、`OPENAI_MODEL`
和 `OPENAI_API_KEY`，初始化向导会优先读取这些值；否则它会一步步引导你完成本地模型配置。

如果你使用 OpenClaw，最简单的安装路径是：

1. 阅读 `integrations/openclaw/README.md`
2. 运行 `integrations/openclaw/bootstrap-costar.ps1`
3. 让脚本帮你写本地模型配置并安装适配层

## 对外资料

如果你想把 CoStar 发给别人看，先从这些文档开始：

- [English pitch](docs/pitch-en.md)
- [Chinese pitch](docs/pitch-zh.md)
- [Comparison notes](docs/comparison.md)
- [Architecture overview](docs/architecture.md)
- [Examples](examples/README.md)

## 命令行

克隆仓库后，你可以直接使用 `costar` CLI：

```powershell
node bin/costar.mjs --help
```

可用命令：

- `costar init`
- `costar capture`
- `costar ingestion`
- `costar profile`
- `costar briefing`
- `costar roleplay`
- `costar graph`
- `costar view`
- `costar doctor`

## 仓库结构

```text
costar_agent/
  assets/branding/            品牌图与文档素材
  bin/                        CoStar CLI 入口
  examples/                   面向外部的示例故事
  integrations/openclaw/      OpenClaw 适配层和安装脚本
  relationship-ingestion/     核心抽取与确认引擎
  relationship-capture/       面向用户的导入编排层
  relationship-profile/       持久化档案读取和维护 skill
  relationship-briefing/      基于确认上下文生成简报
  relationship-roleplay/      结构化模拟对话 skill
  relationship-graph/         关系图谱与路径分析 skill
  relationship-view/          持久化 Markdown 视图与刷新逻辑
```

## 安全说明

不要提交这些内容：

- `relationship-ingestion/runtime/model-config.local.json`
- 运行时输出
- 验证工作区
- 私有真实数据场景

如果你要分享测试数据，请先确认不包含敏感信息。

## 社区

- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [行为准则](CODE_OF_CONDUCT.md)

## 路线图

请看 [ROADMAP.md](ROADMAP.md) 里的当前交付计划和剩余内容。
