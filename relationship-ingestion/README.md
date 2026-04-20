# Relationship Ingestion Skill

这个目录是 `relationship-ingestion` 的独立本地工作区，用来管理这个总 skill 的全部核心资产。

它和之前的产品原型目录分开，原因是：

- 这里放的是 skill 本体，而不是页面原型
- 这里的文件会直接服务模型调用、结构化输出和真实数据调试
- 后面你给真实数据时，我们会把每次运行的输入输出也沉淀在这个目录里

---

## 目录结构

```text
relationship-ingestion/
  README.md
  prompts/
    relationship-ingestion.system.prompt.md
  schemas/
    model-config.schema.json
    relationship-ingestion.input.schema.json
    relationship-ingestion.output.schema.json
    relationship-profile.schema.json
    relationship-review-resolution.input.schema.json
    relationship-review-resolution.output.schema.json
  samples/
    relationship-ingestion.request.example.json
    relationship-ingestion.response.example.json
    relationship-review-resolution.request.example.json
    relationship-review-resolution.response.example.json
  runtime/
    relationship-ingestion.mjs
    relationship-review-resolution.mjs
    run-relationship-review-resolution.mjs
    model-config.local.json
    runs/
    stores/
```

---

## 当前版本做什么

当前版本负责把这条主链路先跑通：

`原始资料 -> 标准化 -> 人物识别 -> 信息提炼 -> 档案更新建议 -> 结构化输出`

同时已经开始补第二条闭环：

`review bundle -> 用户确认决议 -> committed profiles -> profile store delta`

这一版先服务：

- `capture`
- `profile`
- `briefing`

`roleplay` 还不在第一阶段主闭环里。

---

## 本地文件管理规则

### `prompts/`

放模型系统提示词，不和代码混在一起，方便单独迭代 prompt。

### `schemas/`

放输入、输出和模型配置 schema。

后面无论是前端、后端、还是真实数据调试，都围绕这套 schema 工作。

### `samples/`

放最小样例请求和返回结果，方便我们每次改完 skill 后快速对照。

### `runtime/model-config.local.json`

如果你后面在页面或接口里配置了自己的模型 API，会保存到这里。

### `runtime/runs/`

每次真实运行 skill 时，都会自动创建一个 run 目录，里面至少保存：

- `request.json`
- `response.json`

### `runtime/stores/`

放本地 profile store。当前 review resolution runtime 已经支持把确认后的档案 upsert 到这个 store。

---

## 当前运行入口

当前 `mvp-app/server.mjs` 已经会把：

- `POST /api/skills/relationship-ingestion`
- `GET /api/config/model`
- `POST /api/config/model`

这些接口路由到这里的 runtime 逻辑。

如果你想不经过页面，直接本地跑一个请求文件，也可以用：

```powershell
node D:\Lenny_Bcontext\skill-system\relationship-ingestion\runtime\run-relationship-ingestion.mjs `
  D:\Lenny_Bcontext\skill-system\relationship-ingestion\samples\relationship-ingestion.request.example.json
```

模型配置可以直接参考：

`D:\Lenny_Bcontext\skill-system\relationship-ingestion\runtime\model-config.template.json`

当前 CLI runner 已兼容 `UTF-8` 和 `UTF-8 with BOM` 的 JSON 请求文件，避免 PowerShell 或其他工具默认写出 BOM 时导致运行失败。

如果你想直接测试“用户确认后如何写回实体”，可以用：

```powershell
node D:\Lenny_Bcontext\skill-system\relationship-ingestion\runtime\run-relationship-review-resolution.mjs `
  D:\Lenny_Bcontext\skill-system\relationship-ingestion\samples\relationship-review-resolution.request.example.json `
  D:\Lenny_Bcontext\skill-system\relationship-ingestion\samples\relationship-review-resolution.response.example.json
```
