// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runHostModelTool } from "../../tools/host-model-dispatcher.mjs";

const tempRoot = path.join(os.tmpdir(), "costar-codex-clean-insight-regression-smoke");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const profileStorePath = path.join(tempRoot, "relationship-profile-store.json");

const ingestionResult = {
  skill: "relationship-ingestion",
  stage: "ingestion",
  person_profiles: [
    {
      person_name: "林舟",
      person_ref: "林舟",
      resolution_action: "create",
      profile_tier: "active",
      confidence: "high",
      compiled_truth: {
        summary: "产品负责人，关注天气红利策略的 ROI 口径、灰度策略和上线范围控制。",
        current_judgment: "支持推进 demo，但希望先控制范围并避免过早承诺 ROI。",
        relationship_stage: "项目协作",
        intent: "推动方案更稳妥地进入 BRD 和灰度阶段。",
        attitude: {
          label: "谨慎支持",
          reason: "没有直接反对，但多次提醒“先别扩太大”。"
        },
        latent_needs: [
          {
            need: "需要 BRD 给出清晰 ROI 口径，降低上线后被运营质疑的风险。",
            confidence: "high",
            evidence: "希望 BRD 明确 ROI 口径和灰度策略。"
          },
          {
            need: "需要灰度策略帮助她控制产品上线风险。",
            confidence: "high",
            evidence: "多次提醒“先别扩太大”。"
          }
        ],
        key_issues: [
          {
            issue: "ROI 口径",
            status: "needs_definition",
            evidence: "担心被运营质疑“只补贴没有目标”。"
          },
          {
            issue: "预算自动化程度",
            status: "unresolved",
            evidence: "会议明确列为非共识。"
          },
          {
            issue: "城市、天气、时段三层策略",
            status: "consensus",
            evidence: "共识：先做城市、天气、时段三层策略。"
          }
        ],
        attitude_intent: {
          attitude: "谨慎支持",
          intent: "希望用明确 ROI 和灰度边界换取可控上线。",
          confidence: "medium",
          evidence: "没有直接反对；多次提醒“先别扩太大”。"
        },
        tags: ["产品负责人", "天气红利", "ROI", "灰度策略"],
        boundaries: ["不要过早扩大上线范围", "不要过早承诺 ROI"],
        open_questions: ["预算自动化程度仍是非共识，不能写成确定事实。"],
        next_actions: ["请林舟帮助挡住过早 ROI 承诺，并确认 BRD 中的 ROI/灰度口径。"]
      },
      timeline: [
        {
          date: "2026-03-11",
          source_id: "meeting-2026-03-11-weather-bonus",
          source_title: "2026-03-11 天气红利项目会",
          event_summary: "讨论天气红利 BRD、ROI 口径、灰度策略和预算自动化边界。",
          matched_excerpt_index: 1
        }
      ],
      evidence_summary: {
        excerpt_count: 1,
        source_count: 1,
        key_evidence: ["多次提醒“先别扩太大”。"]
      }
    }
  ],
  resolved_people: [
    {
      person_name: "林舟",
      resolution_action: "create",
      confidence: "high"
    }
  ],
  review_bundle: {
    candidates: [
      {
        person_name: "林舟",
        suggested_action: "create",
        priority: "high",
        needs_confirmation: true,
        fields_to_confirm: [
          {
            field: "compiled_truth.latent_needs",
            current_value: "需要 BRD 给出清晰 ROI 口径；需要灰度策略控制上线风险。"
          },
          {
            field: "compiled_truth.key_issues",
            current_value: "ROI 口径、灰度策略、预算自动化程度（非共识）。"
          },
          {
            field: "compiled_truth.attitude_intent",
            current_value: "谨慎支持，希望用明确 ROI 和灰度边界换取可控上线。"
          }
        ],
        evidence_preview: ["没有直接反对，但多次提醒“先别扩太大”。"]
      }
    ]
  }
};

const translated = await runHostModelTool({
  tool_name: "review_translate_answers",
  tool_input: {
    source_type: "profile_review",
    commit_id: "codex-clean-insight-regression-001",
    ingestion_result: ingestionResult,
    answers: [
      {
        person_name: "林舟",
        final_action: "create",
        resolved_person_ref: "person_lin_zhou",
        resolved_person_name: "林舟",
        profile_tier: "active"
      }
    ],
    profile_store_path: profileStorePath,
    options: {
      write_store: true
    }
  }
});

const commitResult = await runHostModelTool({
  tool_name: "review_commit_decisions",
  tool_input: translated
});

assert.equal(commitResult.status, "success");

const profileRead = await runHostModelTool({
  tool_name: "profile_get",
  tool_input: {
    person_name: "林舟",
    profile_store_path: profileStorePath,
    options: {
      save_run_artifacts: false
    }
  }
});

const insights = profileRead.profile_read.insight_board;
assert.match(insights.latent_needs.counterpart[0].need, /BRD/);
assert.deepEqual(insights.latent_needs.counterpart[0].evidence, ["希望 BRD 明确 ROI 口径和灰度策略。"]);
assert.equal(insights.attitude_intent.counterpart.attitude, "谨慎支持");
assert.equal(insights.attitude_intent.counterpart.intent, "希望用明确 ROI 和灰度边界换取可控上线。");
assert.deepEqual(insights.attitude_intent.counterpart.evidence, ["没有直接反对；多次提醒“先别扩太大”。"]);

const unresolvedIssue = insights.key_issues.find((item) => item.issue === "预算自动化程度");
assert.ok(unresolvedIssue, "unresolved budget automation issue should persist");
assert.deepEqual(unresolvedIssue.evidence, ["会议明确列为非共识。"]);
assert.deepEqual(unresolvedIssue.non_consensus, ["会议明确列为非共识。"]);

const consensusIssue = insights.key_issues.find((item) => item.issue === "城市、天气、时段三层策略");
assert.ok(consensusIssue, "consensus issue should persist");
assert.deepEqual(consensusIssue.consensus, ["共识：先做城市、天气、时段三层策略。"]);

const briefingResult = await runHostModelTool({
  tool_name: "briefing_generate",
  tool_input: {
    target_profile: commitResult.committed_profiles[0],
    conversation_goal: "准备与林舟对齐天气红利 BRD。",
    conversation_topic: "ROI 口径、灰度策略与预算自动化边界",
    host_reasoning_output: {
      briefing: {
        quick_brief: "先对齐 ROI 口径和灰度边界，再推进 demo。",
        relationship_read: {
          current_state: "项目协作中，谨慎支持。",
          likely_intent: "希望上线范围和 ROI 承诺可控。",
          attitude: "谨慎支持",
          trust_level: "medium"
        },
        approach_strategy: {
          goal_translation: "把 BRD 写成可控上线方案。",
          recommended_opening: "先确认她最担心的 ROI 与灰度风险。",
          recommended_style: "克制、具体、以风险边界为先。",
          why_now: "demo 前需要先把共识和非共识讲清楚。"
        },
        talking_points: ["ROI 口径", "灰度策略", "预算自动化边界"],
        watchouts: ["不要把预算自动化程度说成已达成共识。"],
        questions_to_ask: ["什么 ROI 口径能避免过早承诺？"],
        next_actions: ["把半自动方案写入 BRD。"]
      }
    },
    options: {
      save_run_artifacts: false,
      write_briefing_file: false
    }
  }
});

assert.match(briefingResult.briefing.needs_read.counterpart_needs[0].need, /BRD/);
assert.deepEqual(briefingResult.briefing.issue_map.find((item) => item.issue === "预算自动化程度").non_consensus, ["会议明确列为非共识。"]);
assert.equal(briefingResult.briefing.attitude_intent_read.counterpart.attitude, "谨慎支持");

console.log("CoStar Codex clean insight regression smoke passed.");
