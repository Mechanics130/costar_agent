# Relationship Roleplay Skill

这个目录是 `relationship-roleplay` 的独立工作区。

它负责消费已经确认过的人物档案与关系信息，生成：

- 定向对话模拟
- 可能回应与阻力判断
- 建议回复与推进策略
- 对话教练反馈

当前版本先只做单人物 roleplay，不做多人会谈模拟，也不做实时对话介入。

## 目录结构

```text
relationship-roleplay/
  README.md
  prompts/
    relationship-roleplay.system.prompt.md
  schemas/
    relationship-roleplay.input.schema.json
    relationship-roleplay.output.schema.json
  samples/
    relationship-roleplay.request.example.json
    relationship-roleplay.response.example.json
  runtime/
    relationship-roleplay.mjs
    run-relationship-roleplay.mjs
    roleplay-smoke.mjs
    runs/
```

## 当前输入

当前优先支持两种输入方式：
1. 直接传 `target_profile`
2. 传 `profile_store_path + person_name/person_ref`

## 当前输出

当前输出会稳定产出结构化 roleplay 结果，包括：

- `persona_read`
- `opening_assessment`
- `simulated_turns`
- `likely_pushbacks`
- `recommended_replies`
- `danger_zones`
- `coach_feedback`

## 运行方式

```powershell
node relationship-roleplay\runtime\run-relationship-roleplay.mjs `
  relationship-roleplay\samples\relationship-roleplay.request.example.json `
  relationship-roleplay\samples\relationship-roleplay.response.example.json
```

模型配置默认复用：
`relationship-ingestion\runtime\model-config.local.json`
