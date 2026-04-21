# Relationship Graph Skill

这个目录是 `relationship-graph` 的独立工作区。

它负责在已经确认过的人物档案之上，构建和读取最小可用的人脉关系图谱能力，包括：

- 单人物局部网络 `get_person_graph`
- 两个人之间的连接路径 `find_connection_path`
- 全局网络摘要 `summarize_network`
- 关系边人工确认写回 `relationship-graph-review-resolution`

当前版本仍然是 `skill` 层实现，不是产品原型。
它的重点是：

- 让我们快速判断图谱识别对不对
- 明确哪些关系边证据不够强，需要用户确认
- 让确认结果真正影响后续 graph 输出

## 目录结构

```text
relationship-graph/
  README.md
  schemas/
    relationship-graph.input.schema.json
    relationship-graph.output.schema.json
    relationship-graph-review-resolution.input.schema.json
    relationship-graph-review-resolution.output.schema.json
  samples/
    relationship-graph.request.get-person-graph.example.json
    relationship-graph.response.get-person-graph.example.json
    relationship-graph.request.find-path.example.json
    relationship-graph.response.find-path.example.json
    relationship-graph.request.summarize-network.example.json
    relationship-graph.response.summarize-network.example.json
    relationship-graph-review-resolution.request.example.json
    relationship-graph-review-resolution.response.example.json
  runtime/
    relationship-graph.mjs
    run-relationship-graph.mjs
    graph-smoke.mjs
    relationship-graph-review-resolution.mjs
    run-relationship-graph-review-resolution.mjs
    graph-review-resolution-smoke.mjs
    stores/
    runs/
  scenarios/
```

## 当前输入

`relationship-graph` 支持三种 mode：

1. `get_person_graph`
2. `find_connection_path`
3. `summarize_network`

当前主要输入来源：

- `profile_store_path`
- 可选 `graph_review_store_path`

其中：

- `profile store` 负责提供人物档案和基础关系信号
- `graph review store` 负责保存人工确认后的关系边决议

## 当前输出

`relationship-graph` 当前稳定输出四层内容：

1. `graph`
- 机器可读的节点、边、路径

2. `user_feedback`
- 给用户看的自然语言摘要

3. `review_bundle`
- 待确认关系边

4. `render_artifacts`
- 当前为 `mermaid`
- 便于轻量可视化验证

## 关系边确认逻辑

当前这些边更容易进入 `review_bundle`：

- `same_source_context`
- `shared_role`
- `weak_link`
- 分数偏低的边
- 连到 `low confidence / stub` 档案的边
- 被拿来做路径桥接、但证据仍偏弱的边

人工确认后的关系边会写入 `graph review store`，后续 graph 再运行时会读取这些决议。

当前支持的决议包括：

- `confirm`
- `reject`
- `downgrade`
- `reclassify`
- `defer`

## 运行方式

### 1. 运行 graph

```powershell
node relationship-graph\runtime\run-relationship-graph.mjs `
  relationship-graph\samples\relationship-graph.request.get-person-graph.example.json `
  relationship-graph\samples\relationship-graph.response.get-person-graph.example.json
```

### 2. 运行 graph review resolution

```powershell
node relationship-graph\runtime\run-relationship-graph-review-resolution.mjs `
  relationship-graph\samples\relationship-graph-review-resolution.request.example.json `
  relationship-graph\samples\relationship-graph-review-resolution.response.example.json
```

### 3. 运行本地冒烟检查

```powershell
node relationship-graph\runtime\graph-smoke.mjs
node relationship-graph\runtime\graph-review-resolution-smoke.mjs
```

## 当前阶段的边界

当前 graph 还不是最终的人脉图谱系统。

还没做的包括：

- 更长期的独立 graph memory 层
- 关系边的主动新增和人工创建
- 复杂多跳影响路径解释
- 真正的交互式可视化界面

但对当前阶段已经足够：

- 能识别图谱
- 能解释图谱
- 能导出 Mermaid 看图
- 能把人工确认结果写回闭环
