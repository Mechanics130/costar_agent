// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { __briefing_internal } from "../relationship-briefing/runtime/relationship-briefing.mjs";
import { __review_internal } from "../relationship-ingestion/runtime/relationship-review-resolution.mjs";

const processedAt = "2026-04-24T00:00:00.000Z";

const baseProfile = {
  person_name: "Ava Chen",
  person_ref: "person_ava_chen",
  resolution_action: "create",
  profile_tier: "active",
  confidence: "medium",
  aliases: [],
  compiled_truth: {
    summary: "Pragmatic partner who wants concrete execution details.",
    current_judgment: "Ava Chen is cautious but open to a pilot.",
    relationship_stage: "follow-up",
    intent: "Validate whether a low-risk pilot is worthwhile.",
    attitude: {
      label: "interested but cautious",
      reason: "She asked for proof before committing."
    },
    traits: ["pragmatic"],
    tags: ["pilot"],
    preferences: ["clear ROI"],
    boundaries: [],
    risk_flags: [],
    open_questions: [],
    next_actions: ["send pilot outline"]
  },
  timeline: [],
  evidence_summary: {
    excerpt_count: 0,
    source_count: 0,
    last_updated_at: "",
    key_evidence: []
  },
  linked_relationships: {
    detected_as: true,
    matched_existing_person_id: null,
    matched_existing_person_name: null
  }
};

const incomingProfile = {
  ...baseProfile,
  compiled_truth: {
    ...baseProfile.compiled_truth,
    latent_needs: {
      counterpart: [
        {
          need: "Needs confidence that the pilot will not create uncontrolled operational risk.",
          evidence: ["Asked to see rollback plan before launch."],
          confidence: "high"
        }
      ],
      self: [
        {
          need: "Needs a clear next-step commitment without forcing a premature decision.",
          evidence: ["Meeting goal is to confirm the decision window."],
          confidence: "medium"
        }
      ]
    },
    key_issues: [
      {
        issue: "Pilot launch threshold",
        consensus: ["Start with a small scope."],
        non_consensus: ["Budget owner is not confirmed."],
        key_quotes: ["Let's not scale before the rollback plan is clear."],
        evidence: ["Discussion focused on scope and rollback."],
        confidence: "high"
      }
    ],
    attitude_intent: {
      counterpart: {
        attitude: "Cautiously supportive",
        intent: "Reduce launch risk before approving the pilot.",
        evidence: ["Asked for rollback plan."],
        confidence: "high"
      },
      self: {
        attitude: "Constructive and seeking commitment",
        intent: "Secure a concrete next step.",
        evidence: ["Conversation goal is to confirm decision window."],
        confidence: "medium"
      }
    }
  }
};

const merged = __review_internal.mergeProfile(baseProfile, incomingProfile, processedAt);
assert.equal(merged.compiled_truth.latent_needs.counterpart[0].confidence, "high");
assert.equal(merged.compiled_truth.key_issues[0].issue, "Pilot launch threshold");
assert.equal(merged.compiled_truth.attitude_intent.counterpart.intent, "Reduce launch risk before approving the pilot.");

const request = {
  conversation_goal: "Confirm whether to move into a pilot decision.",
  conversation_topic: "Pilot next step",
  meeting_context: {
    scheduled_time: "2026-04-25"
  }
};
const context = {
  receipt: {
    auto_context_applied: true,
    auto_context_interaction_count: 1,
    auto_context_used_views: false,
    auto_context_view_path: ""
  },
  interactions: []
};

const result = __briefing_internal.normalizeBriefingOutput({
  parsed: {
    briefing: {
      quick_brief: "Focus the meeting on risk and decision timing.",
      relationship_read: {
        current_state: "follow-up",
        likely_intent: "Reduce launch risk before approving the pilot.",
        attitude: "Cautiously supportive",
        trust_level: "medium"
      },
      needs_read: {},
      issue_map: [
        {
          issue: "Pilot launch threshold",
          consensus: ["Start with a small scope."],
          non_consensus: ["Budget owner is not confirmed."],
          key_quotes: ["Let's not scale before the rollback plan is clear."],
          evidence: ["Discussion focused on scope and rollback."],
          confidence: "high",
          suggested_move: "Ask for the minimum proof needed to unlock approval."
        }
      ],
      attitude_intent_read: {
        alignment: "Mostly aligned on a cautious pilot.",
        risk: "Pushing for commitment before risk proof could backfire."
      },
      approach_strategy: {
        goal_translation: "Get a concrete decision window.",
        recommended_opening: "Start by validating the rollback concern.",
        recommended_style: "Practical and evidence-led.",
        why_now: "The next decision depends on risk proof."
      },
      talking_points: ["Use rollback proof as the anchor."],
      watchouts: ["Do not frame caution as resistance."],
      questions_to_ask: ["What proof would make the pilot safe enough?"],
      next_actions: ["Send updated pilot risk plan."]
    },
    open_questions: []
  },
  request,
  profile: merged,
  context,
  config: {
    provider: "test",
    base_url: "https://api.example.com/v1",
    model: "test-model",
    temperature: 0
  },
  source: "smoke"
});

assert.equal(result.briefing.needs_read.counterpart_needs[0].need, incomingProfile.compiled_truth.latent_needs.counterpart[0].need);
assert.equal(result.briefing.issue_map[0].suggested_move, "Ask for the minimum proof needed to unlock approval.");
assert.equal(result.briefing.attitude_intent_read.counterpart.attitude, "Cautiously supportive");

const markdown = __briefing_internal.renderBriefingMarkdown({
  request,
  result,
  profile: merged,
  context,
  title: "CoStar Briefing Insight Smoke"
});

assert.match(markdown, /隐性需求识别/);
assert.match(markdown, /关键议题地图/);
assert.match(markdown, /态度与意图预判/);

console.log("CoStar briefing insight smoke passed.");
