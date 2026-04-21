# CoStar by Codex

<p align="center">
  <img src="assets/branding/costar.png" alt="CoStar logo" width="560" />
</p>

<p align="center"><strong>I&#39;ll handle everything. You just go.</strong></p>

CoStar 是一个开源的 skill 引擎，用来把零散的人物信息、互动记录和关系信号，整理成可长期使用的关系上下文。

它适合：

- 归档杂乱的个人或工作资料
- 识别并更新关键关系人
- 安全地确认和写回档案变化
- 持续维护长期关系视图
- 基于已确认上下文生成 briefing / roleplay / graph 输出

## 它现在做什么

CoStar 目前以 `capture -> profile -> briefing` 为核心闭环：

1. `capture`
   - 接收单条或批量输入
   - 自动召回相关已有上下文
   - 给出清晰的处理反馈和待确认项

2. `profile`
   - 读取、搜索、维护人物档案
   - 支持冷启动档案和成熟档案

3. `briefing`
   - 基于已确认档案生成会前准备
   - 适合在沟通前快速看一遍

4. `roleplay` / `graph` / `view`
   - 分别用于模拟对话、关系图谱和持续视图
   - 作为增强能力保留

## 分发方式

这是开源引擎，不是完整消费端 UI。

- `main` 分支：干净的对外分发版本
- `build-history` 分支：保留开发过程、测试和验收材料

如果你是 OpenClaw 用户，最快的安装方式是：

1. 阅读 `integrations/openclaw/README.md`
2. 运行 `integrations/openclaw/bootstrap-costar.ps1`
3. 让脚本帮你写本地模型配置并安装适配层

## 需要注意

- 不要把 `model-config.local.json` 提交到仓库
- 不要把真实业务数据直接放进公开 sample
- 本仓库的公开样例会持续脱敏

## 继续看哪里

- 英文总说明：[`README.md`](README.md)
- 快速开始：[`START_HERE.md`](START_HERE.md)
- 路线图：[`ROADMAP.md`](ROADMAP.md)
- 产品介绍：[`docs/pitch-zh.md`](docs/pitch-zh.md)
- 对比说明：[`docs/comparison.md`](docs/comparison.md)
- 架构说明：[`docs/architecture.md`](docs/architecture.md)
