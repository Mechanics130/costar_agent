# CoStar Memory V0.3

CoStar V0.3 adds an atomic memory layer for source-backed, reviewable, and reusable relationship facts. The goal is not to create a second data world. The memory store becomes the long-term fact source, while profile, graph, and view stay as compatible read models and presentation layers.

## What Changed

- `costar-core/memory/` now owns source refs, entities, candidates, facts, relationships, interactions, and artifacts.
- Capture can create memory candidates with source excerpts and confidence labels.
- Users can review, accept, edit, reject, or defer memory candidates before durable write.
- Briefing can retrieve confirmed memory facts and report `facts_included` plus `memory_evidence`.
- Briefing artifact refs are written back to the same memory store, including which facts were used.
- V0.3.1 development adds feedback events, review diffs, reflection candidates, and confirmed extraction hints.
- `costar memory lint` can find stale commitments, zombie facts, isolated entities, likely conflicts, and knowledge gaps.

## Data Model

The atomic memory store is a JSON document with these top-level arrays:

- `sources`: imported materials and metadata.
- `entities`: people, organizations, projects, and topics.
- `candidates`: uncommitted facts or entity updates waiting for review.
- `facts`: accepted long-term facts with confidence, source evidence, review metadata, and quality counters.
- `interactions`: source-backed meetings or exchanges.
- `relationships`: evidence-backed links between entities.
- `artifacts`: generated outputs such as briefings, views, graphs, and lint reports.
- `feedback_events`: user feedback on facts, generated artifacts, review diffs, or briefing outputs.
- `review_diffs`: proposed-to-committed deltas from user review decisions.
- `reflection_candidates`: host-structured explanations for why an extraction or briefing judgment was wrong.
- `hints`: user-confirmed extraction rules that can be injected into later capture or briefing runs.

Every durable fact should have:

- `fact_id`
- `entity_id`
- `fact_type`
- `value`
- `confidence`
- `source_id`
- `source_excerpt`
- `review`
- `quality`

## User Review Rule

V0.3 keeps the same review / commit discipline as V0.2:

- Speculative or inferred content should be shown as a candidate first.
- Accepted or edited candidates can be committed to memory.
- Rejected or deferred candidates must not silently become active facts.
- Commit results must enter the same store / schema / review / commit system.

## Feedback Loop

V0.3.1 keeps the host-model boundary: the host model may translate natural-language
feedback into structured JSON, but CoStar stores and constrains the result.

The minimum loop is:

1. A user accepts, edits, rejects, or adds information during review.
2. CoStar records a `review_diff` that captures the proposed value, committed value, and decision pattern.
3. A user can mark a fact or artifact as `useful`, `wrong`, `stale`, `missing`, or `needs_merge`.
4. CoStar writes a `feedback_event`, updates fact quality counters, and may create a `reflection_candidate`.
5. The user confirms or edits the reflection candidate.
6. CoStar turns the confirmed reflection into an active extraction `hint`.
7. Hosts can call `memory_hints_get` before later capture or briefing runs.

This is not model self-grading. The durable reward signal comes from user
behavior, user correction, source evidence, and post-conversation review.
The model acts as a translator; CoStar remains the system of record.

## Briefing Evidence

When a host or CLI request supplies `memory_store_path`, briefing can:

- find facts for the target person,
- rank source-backed facts for the conversation goal,
- include `facts_included` in the response,
- include `memory_evidence.evidence_trace_available`,
- write a briefing artifact ref back to memory,
- increment each cited fact's retrieval count.

This gives testers a direct way to verify whether generated briefings are grounded in durable memory.

## Memory Lint

Run:

```bash
node bin/costar.mjs memory lint --store costar-core/memory/runtime/stores/memory-store.json
```

The report highlights:

- overdue commitments,
- zombie facts,
- isolated entities,
- possible conflicting facts,
- knowledge gaps.

Host-model tools can call the same deterministic logic through `memory_lint`.

## Migration Strategy

V0.3 is additive:

- Existing V0.2 profile, graph, and view stores still work.
- New durable facts should be written through the memory review path.
- Existing profile facts can be migrated later into memory candidates.
- V0.3 does not require users to configure a separate model API in host-model mode.

## What V0.3 Does Not Do Yet

- It does not replace every profile field with memory-derived projections.
- It does not introduce a database server or multi-tenant auth layer.
- It does not automatically trust hidden needs or inferred intent without user review.
- It does not publish private runtime stores or real user materials.

## Acceptance Checks

- `npm run test:memory`
- `npm test`
- `npm run test:host-model`
- `node scripts/check-public-repo.mjs`
- `npm pack --dry-run --json`

V0.3 is ready to publish only when these checks pass and the public package does not include runtime stores, local validation workspaces, or private data.
