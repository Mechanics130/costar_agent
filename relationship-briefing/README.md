# Relationship Briefing Skill

这个目录是 `relationship-briefing` 的独立工作区。

它负责消费已经确认过的人物档案和关系信息，生成：

- 会前 briefing
- 沟通目标拆解
- 注意事项
- 建议提纲

当前版本先只做单人物 briefing，不做多人会前策略整合。

## 目录结构

```text
relationship-briefing/
  README.md
  prompts/
    relationship-briefing.system.prompt.md
  schemas/
    relationship-briefing.input.schema.json
    relationship-briefing.output.schema.json
  samples/
    relationship-briefing.request.example.json
    relationship-briefing.response.example.json
  briefings/
  runtime/
    relationship-briefing.mjs
    run-relationship-briefing.mjs
    briefing-smoke.mjs
    runs/
```

## 当前输入

当前优先支持两种输入方式：

1. 直接传 `target_profile`
2. 传 `profile_store_path + person_name/person_ref`

并支持这些增强输入：

- `meeting_context`
- `recent_interactions`
- 缺省时自动从 `profile store + relationship-view` 召回上下文

## 当前输出

当前输出会稳定产出结构化 briefing，包括：

- `quick_brief`
- `relationship_read`
- `approach_strategy`
- `talking_points`
- `watchouts`
- `questions_to_ask`
- `next_actions`

同时 runtime 会写一份持久化 markdown 文件到：

`relationship-briefing\briefings\`

返回中会包含：

- `context_receipt`
- `briefing_file`
- `user_feedback`

## 运行方式

```powershell
node relationship-briefing\runtime\run-relationship-briefing.mjs `
  relationship-briefing\samples\relationship-briefing.request.example.json `
  relationship-briefing\samples\relationship-briefing.response.example.json
```

模型配置默认复用：

`relationship-ingestion\runtime\model-config.local.json`
