# CoStar

<p align="center">
  <img src="assets/branding/costar.png" alt="CoStar logo" width="560" />
</p>

<p align="center"><strong>把经过确认的人物上下文长期保存下来，并在下一次沟通前重新派上用场。</strong></p>

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-green.svg)](https://nodejs.org/)
[![CI](https://github.com/Mechanics130/costar_agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Mechanics130/costar_agent/actions/workflows/ci.yml)

CoStar 是一个 open-core skill engine，用来把零散的人物信息、会议纪要、聊天记录和历史材料整理成可以长期复用的关系上下文。你可以把它理解成一个不容易忘事的职场 CoS：负责沉淀人物档案、候选事实确认、会前简报、模拟对话、关系图谱和持续视图。

如果你是开发者或产品构建者，这个仓库提供的是 skill engine 本体。如果你想要面向终端用户的消费级产品，那会是建立在 CoStar 之上的另一层 UI。

## CoStar 能做什么

CoStar 的核心闭环是：

1. `capture`
   - 接收单条或批量输入。
   - 自动召回相关既有人物上下文。
   - 告诉用户识别到了什么，以及哪些内容需要确认。

2. `profile`
   - 读取、搜索和维护人物档案。
   - 同时支持冷启动档案和成熟档案。

3. `briefing`
   - 基于已确认上下文生成会前简报。
   - 输出隐形需求、关键议题、共识 / 非共识、关键语句、态度与意图。
   - 保持足够短，方便沟通前快速阅读。

4. `memory`（V0.3 开发中）
   - 把来源可追溯的长期事实写入同一套 atomic memory store。
   - 所有长期事实先进入候选项，再由用户确认后提交。
   - briefing 可以展示引用了哪些 memory facts。
   - memory lint 可以检查过期承诺、僵尸事实、孤立实体、可能冲突和知识缺口。

## Host-model 模式

CoStar 提供 Claude、Codex、OpenClaw 的 host-model 适配包。在 host-model 模式下，宿主产品负责模型推理和对话编排，CoStar 负责持久化 store、schema、review / commit、graph、view 和 briefing 合约。目标是让用户安装后尽量不再单独配置 CoStar 模型 API。

快速检查：

```bash
node bin/costar.mjs host install claude
node bin/costar.mjs host doctor claude
node bin/costar.mjs host install codex --apply-skill
node bin/costar.mjs host doctor codex
node bin/costar.mjs host install openclaw
node bin/costar.mjs host doctor openclaw
```

当前支持范围见 [support matrix](docs/support-matrix.md) 和 [tester package](docs/tester-package.md)。

## V0.3 Memory

V0.3 增加 `costar-core/memory/` atomic memory 层。它是 CoStar 的长期事实源，不是第二套数据世界。现有 profile、graph、view 仍然作为兼容视图和展示层存在，新事实通过 memory candidates、用户确认和 commit 写入。

常用命令：

```bash
npm run test:memory
node bin/costar.mjs memory lint --store costar-core/memory/runtime/stores/memory-store.json
```

详细说明见 [Memory V0.3](docs/memory-v0.3.md)。

## 快速开始

如果你是测试用户，先看：

- [START_HERE.md](START_HERE.md)

如果你想先看英文说明：

- [README.md](README.md)

如果你要使用旧的 engine-mode CLI，可以运行：

```powershell
node bin/costar.mjs init
```

如果环境变量里已经准备好 `OPENAI_BASE_URL`、`OPENAI_MODEL` 和 `OPENAI_API_KEY`，初始化向导会优先读取这些值；否则它会一步步引导你完成本地模型配置。

## 对外资料

如果你想把 CoStar 发给别人看，可以从这些文档开始：

- [English pitch](docs/pitch-en.md)
- [Chinese pitch](docs/pitch-zh.md)
- [Comparison notes](docs/comparison.md)
- [Architecture overview](docs/architecture.md)
- [Memory V0.3](docs/memory-v0.3.md)
- [Examples](examples/README.md)

## 命令行

克隆仓库后，可以直接使用 `costar` CLI：

```powershell
node bin/costar.mjs --help
```

常用命令：

- `costar init`
- `costar host`
- `costar capture`
- `costar ingestion`
- `costar profile`
- `costar briefing`
- `costar roleplay`
- `costar graph`
- `costar view`
- `costar memory lint`
- `costar doctor`

## 仓库结构

```text
costar_agent/
  assets/branding/            品牌图与文档素材
  bin/                        CoStar CLI 入口
  costar-core/                 共享 store、commit、host tool 和 MCP bridge
  costar-core/memory/          Atomic memory store、review、retrieval 和 lint
  examples/                   面向外部的示例故事
  integrations/claude/        Claude host-model 适配包
  integrations/codex/         Codex host-model skill 适配包
  integrations/openclaw/      OpenClaw host-model 适配包
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
- memory runtime stores
- 验证工作区
- 私有真实数据场景

如果你要分享测试数据，请先确认不包含敏感信息。

## 社区

- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [行为准则](CODE_OF_CONDUCT.md)

## 路线图

请看 [ROADMAP.md](ROADMAP.md) 里的当前交付计划和剩余内容。
