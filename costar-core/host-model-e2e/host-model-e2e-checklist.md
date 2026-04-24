# CoStar Host-model E2E Checklist

## 1. Purpose

This checklist defines what must be true before we can say Host-model mode is
running the same CoStar world as Engine mode.

It is intentionally stricter than "the host can call a tool."

## 2. Baseline scenarios

### Scenario A: Cold-start import

Goal:

- import a small batch of historical notes
- produce candidate people
- return feedback and review candidates
- commit confirmed people
- refresh persistent views

### Scenario B: Incremental update

Goal:

- ingest one new meeting note
- match existing people first
- surface only the genuinely new candidates
- commit reviewed updates
- verify view / graph reflect the change

## 3. Required checkpoints

### 3.1 Ingest / capture

- Host can call `capture_ingest_sources`
- Host receives a receipt
- Host receives processing feedback
- Host receives a confirmation request when needed
- No direct write happens at ingest time

### 3.2 Review

- Host can call `review_list_candidates`
- Host can call `review_prepare_cards`
- Host can call `review_translate_answers`
- Pending people and pending graph edges are distinguishable
- Review output stays in the same schema family as Engine mode

### 3.3 Commit

- Host writes only through `review_commit_decisions`
- Commit target is explicit:
  - `profile_review`
  - `graph_review`
- Commit returns store delta + commit feedback

### 3.4 Durable assets

- Committed changes end up in the same profile store
- Graph decisions end up in the same graph review store
- View refresh uses the same view store and markdown materializer

### 3.5 Cross-mode consistency

- Engine mode and Host-model mode do not produce two separate stores
- Engine mode and Host-model mode do not use separate review logic
- Engine mode and Host-model mode do not use separate commit logic

## 4. Final acceptance questions

Host-model mode is not "done" until all four answers are yes:

1. Does the user no longer need to configure a model API?
2. Can the user complete the full loop inside the host?
3. Do the generated results enter the same store / schema / review system?
4. Has CoStar avoided splitting into two data worlds?
