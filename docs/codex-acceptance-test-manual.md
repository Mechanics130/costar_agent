# CoStar Codex 验收测试手册

适用场景：在同一台 Windows 电脑上，新开一个 Codex 项目，验证 CoStar Codex Host-model mode 是否能完成真实用户闭环。

测试分支：`release/0.2.0-briefing-host-hygiene`

## 1. 验收目标

这次不是测 CoStar 全部代码质量，而是验证 Codex 作为宿主时是否满足四个硬标准：

| 验收问题 | 通过标准 |
|---|---|
| 用户是否不用再配置 CoStar 模型 API | Codex host-model 模式不要求 `base_url`、`api_key`、`model` |
| 用户是否能在 Codex 里跑完整闭环 | 导入资料、收到反馈、确认候选人、写回档案、刷新 view、查看 briefing / graph |
| 结果是否进入同一套体系 | 写入走 `review_prepare_cards -> review_translate_answers -> review_commit_decisions` |
| CoStar 是否没有拆成两个数据世界 | Codex 只负责推理和编排，CoStar store / schema / review / commit 是唯一事实源 |

## 2. 测试隔离原则

建议使用独立测试目录，避免和开发仓库、真实资料混在一起。

推荐目录：

```powershell
D:\CoStar_Codex_Acceptance\
  costar_agent\          # 公开 release 分支
  codex-test-project\    # 新开的 Codex 测试项目
  stores\                # 测试 profile / graph / view store
```

不要把真实会议纪要、真实人名、真实本地路径用于本轮测试。

## 3. 准备公开 release 仓库

在普通 PowerShell 中执行：

```powershell
New-Item -ItemType Directory -Force D:\CoStar_Codex_Acceptance | Out-Null
Set-Location D:\CoStar_Codex_Acceptance
git clone --branch release/0.2.0-briefing-host-hygiene https://github.com/Mechanics130/costar_agent.git
Set-Location D:\CoStar_Codex_Acceptance\costar_agent
npm install
```

先跑本地预检：

```powershell
npm test
npm run test:host-model
node scripts/generate-file-map.mjs --check
```

通过标准：

- 三个命令都退出成功。
- 没有要求你配置 CoStar 模型 API。
- 没有出现本地开发路径、真实人名、内部 API 地址泄露。

## 4. 安装 Codex Skill

在 `D:\CoStar_Codex_Acceptance\costar_agent` 下执行：

```powershell
node bin/costar.mjs host install codex --apply-skill
node bin/costar.mjs host doctor codex
```

默认会安装到：

```text
%USERPROFILE%\.codex\skills\costar
```

如果你之前装过 CoStar skill，建议先手动备份旧目录，再运行安装命令。验收时需要 Codex 能真实发现 skill，所以这一步建议安装到默认 Codex skills 目录，而不是只装到临时目录。

通过标准：

- `host install codex --apply-skill` 成功。
- `host doctor codex` 成功。
- 安装过程没有要求配置 `OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_API_KEY` 或 CoStar 专用模型 API。
- `%USERPROFILE%\.codex\skills\costar\SKILL.md` 存在，并且里面的 CoStar repo root 指向这次 clone 的 release 仓库。

## 5. 新建 Codex 测试项目

创建测试项目目录：

```powershell
New-Item -ItemType Directory -Force D:\CoStar_Codex_Acceptance\codex-test-project\materials | Out-Null
New-Item -ItemType Directory -Force D:\CoStar_Codex_Acceptance\stores | Out-Null
```

在 `D:\CoStar_Codex_Acceptance\codex-test-project\materials\mock-meeting-note.md` 写入以下 mock 资料：

```markdown
# Mock Meeting Note - Partner Pilot Sync

Date: 2026-04-24
Note taker: Riley

Participants:
- Ava Chen, partner lead
- Bella Xu, operations coordinator
- Me, CoStar user

Discussion:
Ava Chen said she is open to a pilot, but she does not want the team to scale before the rollback plan is clear. She asked for concrete ROI proof and a small launch threshold.

I explained that I need a clear next-step commitment and a decision window, but I do not want to push Ava into a premature approval.

Bella Xu can help coordinate examples and scheduling, but she needs to know who owns the final budget decision.

Consensus:
- Start with a small pilot.
- Prepare a rollback plan before launch.

Non-consensus:
- Budget owner is still unclear.
- Ava has not yet agreed to a launch date.

Key quotes:
- Ava: "Let's not scale before the rollback plan is clear."
- Me: "I need to know what proof would make this safe enough to approve."
```

然后在 Codex 里打开一个新项目，项目目录选择：

```text
D:\CoStar_Codex_Acceptance\codex-test-project
```

如果 Codex 没有自动刷新 skills，关闭并重新打开 Codex，再进入这个测试项目。

## 6. Codex 内第一轮测试 Prompt

在新 Codex 项目里发送：

```text
请使用 CoStar skill 做一次 Codex Host-model mode 验收。

测试资料路径：
D:\CoStar_Codex_Acceptance\codex-test-project\materials\mock-meeting-note.md

测试 store 路径：
D:\CoStar_Codex_Acceptance\stores

请完成完整闭环：
1. 导入这份资料。
2. 给我用户侧反馈：识别到了谁、有什么信息、哪些需要确认。
3. 生成候选人 review cards。
4. 在提交前先让我确认候选人，不要静默写入。
5. 我确认后，用 CoStar 的 review/commit 工具写回档案。
6. 刷新 persistent view。
7. 生成 Ava Chen 的 briefing。
8. 生成 Ava Chen 的 graph/view 摘要。

硬性要求：
- 不要让我配置 CoStar 模型 API。
- 不要创建第二套 profile / graph / view store。
- 所有 durable write 必须走 CoStar review / commit。
- 每一步告诉我调用了哪些 CoStar tool，以及写入了哪些 store 文件。
- 最后回答四个验收问题是否 PASS。
```

## 7. 用户确认模拟

当 Codex 展示候选人后，按实际结果回复。可以使用下面的确认口径：

```text
确认：
- Ava Chen：作为已有/核心关系人写入，保留隐形需求、关键议题、态度意图。
- Bella Xu：可以创建为新关系人，但置信度标记为 medium。
- 如果有关系边候选，请把 Ava Chen 和 Bella Xu 标记为 pilot coordination 关系。
```

通过标准：

- Codex 在你确认前不写入 durable store。
- Codex 能把你的自然语言确认翻译成 CoStar commit payload。
- Codex 明确说明 commit 成功，以及写入的 profile / graph / view 路径。

## 8. 必须观察的输出

### 导入反馈

应该能看到：

- 识别到 Ava Chen 和 Bella Xu。
- 说明 Ava 的隐形需求：降低试点风险、需要 rollback / ROI proof。
- 说明我的隐形需求：需要明确下一步承诺和决策窗口。
- 标出需要确认的候选人或关系边。

### Briefing 增强

Briefing 应该包含：

- `需求识别` 或等价内容。
- `关键议题 + 共识 + 非共识 + 关键语句`。
- `态度意图`，同时覆盖关系人和我方。
- 建议沟通策略和下一步问题。

### Store 一致性

Codex 应该能说明：

- profile 写入同一套 profile store。
- graph / view 使用同一套 store。
- briefing 基于已确认 profile / view，而不是临时编造的第二套资料。

## 9. 失败判定

出现以下任意情况，记为 FAIL：

| 等级 | 情况 |
|---|---|
| P0 | Codex 要求用户配置 CoStar 模型 API |
| P0 | Codex 在用户确认前静默写入 durable store |
| P0 | Codex 绕过 CoStar review / commit，自己写 profile JSON |
| P0 | briefing / view / graph 来自不同 store，形成两个数据世界 |
| P1 | Codex 无法发现 `costar` skill |
| P1 | install / doctor 在 Windows 上失败 |
| P1 | Briefing 没有输出三类增强信息 |
| P2 | 输出可读性差，但主流程可跑通 |

## 10. 验收记录模板

测试完成后，请记录：

```markdown
# CoStar Codex 验收记录

测试日期：
测试机器：
Codex 版本：
CoStar 分支：
CoStar commit：

## 命令结果
- npm test：
- npm run test:host-model：
- host install codex --apply-skill：
- host doctor codex：

## 四个硬验收问题
- 不配置 CoStar 模型 API：PASS / FAIL
- Codex 内完整闭环：PASS / FAIL
- 进入同一套 store / schema / review / commit：PASS / FAIL
- 没有拆成两个数据世界：PASS / FAIL

## Briefing 增强
- 需求识别：PASS / FAIL
- 关键议题 + 共识 + 非共识 + 关键语句：PASS / FAIL
- 态度意图：PASS / FAIL

## 问题清单
- P0：
- P1：
- P2：

## 结论
是否允许进入公开 main 合并：
```

## 11. 清理建议

如果测试结束后暂时不想保留这次安装的 Codex skill，可以把下面目录改名备份，而不是直接删除：

```text
%USERPROFILE%\.codex\skills\costar
```

测试数据在：

```text
D:\CoStar_Codex_Acceptance\
```

如果要继续做第二轮验收，可以保留该目录；如果要模拟更干净的用户环境，可以新建另一个测试根目录重新 clone。
