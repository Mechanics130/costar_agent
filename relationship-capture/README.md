# Relationship Capture Skill

`relationship-capture` 是关系幕僚 skill system 里最贴近用户入口的一层。

它不负责底层抽取本身，而是统一编排：
- `relationship-ingestion`
- `relationship-review-resolution`

对外解决 3 个问题：
1. 用户导入资料后，系统要立刻反馈“收到了什么”
2. 识别结束后，系统要明确反馈“识别出了什么、哪些要确认”
3. 用户确认后，系统要明确反馈“最终创建了谁、更新了谁”

## 当前能力

当前版本已经支持两条主链：

1. `sources -> ingestion -> user feedback`
   - 输入资料
   - 自动调用 `relationship-ingestion`
   - 输出 `receipt / processing_feedback / confirmation_request / next_action / user_feedback`

2. `ingestion_result + review_decisions -> commit feedback`
   - 输入识别结果和用户确认决议
   - 自动调用 `relationship-review-resolution`
   - 输出 `commit_feedback / next_action / user_feedback`

## 自动上下文召回

截至 2026-04-19，`relationship-capture` 已补上自动上下文召回：

- 用户不再必须手动传完整的 `existing_people`
- skill 会先尝试从已有 profile store 中召回相关人物
- 再把召回的人物上下文注入给 `relationship-ingestion`

当前召回策略：
- 优先命中 `focus_people`
- 其次命中 `target_people`
- 再看本次 source 内容里是否直接提到该人物
- 召回结果会写进 `receipt`

当前会额外返回：
- `auto_context_applied`
- `auto_context_added_count`
- `auto_context_matched_people`
- `auto_context_store_count`

这层能力的目标不是替代 `person-resolution`，而是让单次会议纪要或批量资料导入时，先尽可能带上“已有关系记忆”，减少本来应该是 `update` 却被误判成 `create` 的情况。

## 目录结构

```text
relationship-capture/
  README.md
  schemas/
    relationship-capture.input.schema.json
    relationship-capture.output.schema.json
  samples/
    relationship-capture.request.ingest.example.json
    relationship-capture.response.ingest.example.json
    relationship-capture.request.commit.example.json
    relationship-capture.response.commit.example.json
  runtime/
    relationship-capture.mjs
    run-relationship-capture.mjs
    capture-smoke.mjs
```

## 运行方式

```powershell
node relationship-capture\runtime\run-relationship-capture.mjs `
  relationship-capture\samples\relationship-capture.request.ingest.example.json `
  relationship-capture\samples\relationship-capture.response.ingest.example.json
```

```powershell
node relationship-capture\runtime\run-relationship-capture.mjs `
  relationship-capture\samples\relationship-capture.request.commit.example.json `
  relationship-capture\samples\relationship-capture.response.commit.example.json
```

本 skill 默认复用：

`relationship-ingestion\runtime\model-config.local.json`

## 验证

```powershell
node relationship-capture\runtime\capture-smoke.mjs
```

当前 smoke 已覆盖：
- ingestion 反馈链
- commit 反馈链
- auto context 召回链

## 当前边界

当前版本还不负责：
- 实时录音
- OCR / 图片解析
- 关系图谱可视化
- briefing 展示层
- roleplay / 模拟对话

它只负责把：

`导入资料 -> 识别 -> 确认 -> 写回`

这条主链变成用户可感知、可确认、可继续推进的 skill 输出。
