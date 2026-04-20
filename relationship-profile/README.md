# Relationship Profile Skill

这个目录是 `relationship-profile` 的独立工作区。

它负责消费已经确认并写回的 `profile store`，提供 4 类能力：

- 单人物档案读取
- 档案检索
- 档案健康检查 / 维护建议
- 受控的手工 patch 写回

当前版本优先做稳定、可审计的 `profile service layer`，不依赖大模型也能运行。

## 目录结构

```text
relationship-profile/
  README.md
  schemas/
    relationship-profile.input.schema.json
    relationship-profile.output.schema.json
  samples/
    relationship-profile.request.get.example.json
    relationship-profile.response.get.example.json
    relationship-profile.request.patch.example.json
    relationship-profile.response.patch.example.json
  runtime/
    relationship-profile.mjs
    run-relationship-profile.mjs
    profile-smoke.mjs
    runs/
```

## 当前支持的模式

1. `get_profile`
- 读取单个人物档案
- 生成结构化 `profile_read`
- 输出相关人物和档案维护建议

2. `search_profiles`
- 按姓名、别名、标签、summary、intent 等检索档案

3. `maintain_store`
- 对整个 `profile store` 做健康检查
- 输出 stale / low-confidence / open-questions 队列

4. `apply_profile_patch`
- 对已有档案做受控 patch
- 支持 patch 后写回 `profile store`

## 运行方式

```powershell
node D:\Lenny_Bcontext\skill-system\relationship-profile\runtime\run-relationship-profile.mjs `
  D:\Lenny_Bcontext\skill-system\relationship-profile\samples\relationship-profile.request.get.example.json `
  D:\Lenny_Bcontext\skill-system\relationship-profile\samples\relationship-profile.response.get.example.json
```

## 默认 profile store

默认会复用：

`D:\Lenny_Bcontext\skill-system\relationship-ingestion\runtime\stores\relationship-profile-store.json`

如果请求里显式传了 `profile_store_path`，则优先使用请求里的路径。
