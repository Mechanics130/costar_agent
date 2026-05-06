# CoStar V0.3.2 Scope Correction Design

## Background

V0.3.1 shipped a memory feedback loop with `feedback_events`, `review_diffs`,
`feedback_report`, `reflection_candidates`, `hints`, and host tools for
reflection / hint handling. After review, the feedback recording layer is still
valuable, but the reflection and hint injection layer is too early for the
current product stage.

The current user base does not yet have enough review-diff samples to support
automatic error attribution or prompt-patch governance. If host prompts
encourage reflection and hint injection by default, CoStar may create prompt
sprawl, conflicting hints, and false confidence before the data is ready.

## Goal

V0.3.2 should reposition V0.3.1 as a reliable feedback-recording and quality
measurement release. Reflection and hints remain in the codebase as dormant
experimental capabilities, but they are not part of the default host workflow
or public product promise.

## Product Scope

Stable by default:

- `review_diffs`
- `feedback_events`
- `memory_feedback_record`
- `memory_feedback_report`

Experimental / disabled by default:

- `reflection_candidates`
- `hints`
- `memory_reflection_prepare_cards`
- `memory_reflection_commit`
- `memory_hints_get`

## Behavioral Changes

1. Host prompt packets should no longer instruct Claude, Codex, or OpenClaw to
   automatically create reflection cards, commit reflection decisions, or inject
   hints before later capture / briefing runs.
2. Host prompt packets should still encourage recording user feedback and
   reading `memory_feedback_report` as the quality-measurement output.
3. Tool contracts should mark reflection and hint tools as experimental and
   disabled by default.
4. The dispatcher may keep routing those tools for internal experiments and
   backward compatibility.
5. Documentation should present V0.3.2 as a scope correction, not as a
   regression or rollback.

## Onepage Update Rules

The onepage should not receive another appended changelog block. V0.3.2 updates
must be integrated into:

- Section 5: product version route and V0.3.1 / V0.3.2 scope.
- Section 7: development, release, and validation snapshot.

The old V0.3.1 appendix-style updates can remain for history, but the current
truth should live in Sections 5 and 7.

## Acceptance Criteria

- Default host prompt packet includes `memory_feedback_record` and
  `memory_feedback_report`.
- Default host prompt packet does not present reflection / hint tools as part
  of the canonical workflow.
- Reflection / hint tools are marked experimental / disabled-by-default in the
  tool contract.
- Memory feedback smoke tests continue to prove the dormant experimental path
  still works.
- Host adapter smoke tests assert the default prompt behavior has been
  narrowed.
- README, CHANGELOG, memory docs, and onepage Sections 5 / 7 clearly describe
  V0.3.2 scope correction.

## Non-Goals

- Do not remove existing memory store fields.
- Do not delete reflection / hint functions or dispatcher cases.
- Do not migrate user data.
- Do not create a new database or second feedback store.
- Do not add automatic prompt-patch governance in V0.3.2.
