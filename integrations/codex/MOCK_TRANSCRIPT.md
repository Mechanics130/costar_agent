# Codex Mock Transcript

This mock transcript shows the intended shape of a Codex conversation when
running CoStar Host-model mode.

## Scenario

The user imports a relationship note, confirms a profile candidate, refreshes
the view, and then asks for a roleplay.

## Transcript

**User**  
Import this note and tell me if anyone new should be added.

**Codex**  
I imported 1 source and generated a CoStar receipt.

- Existing update candidate: `Ava Chen`
- New profile candidate: `Bella Xu`
- Commit status: nothing has been written yet

I need one confirmation before writing durable state.

**Codex (uses `review_prepare_cards`)**  
Candidate: `Bella Xu`  
Suggested action: `create`  
Evidence: "Bella Xu is willing to keep moving if examples and scheduling are ready."

Reply with one of:
- create
- ignore
- defer

**User**  
Create Bella Xu and continue.

**Codex (uses `review_translate_answers` -> `review_commit_decisions`)**  
Commit successful.

- Created: `Bella Xu`
- Updated: `Ava Chen`
- Deferred: none

I am refreshing the persistent view now.

**Codex (uses `view_refresh`)**  
View refresh completed.  
Next options:
- inspect the relationship graph
- open the refreshed view
- run a roleplay

**User**  
Run a roleplay before I talk to Ava Chen again.

**Codex (uses `roleplay_generate`)**  
Roleplay ready.

- persona read
- likely pushbacks
- recommended replies
- coaching notes

## What this transcript proves

- Codex distinguishes feedback from committed state
- Codex uses CoStar review tools instead of inventing a custom confirmation layer
- durable state is refreshed before downstream assets are generated
- Host does the reasoning; CoStar owns the durable truth
