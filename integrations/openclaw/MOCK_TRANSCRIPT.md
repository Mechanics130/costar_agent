# OpenClaw Mock Transcript

This mock transcript shows the intended shape of an OpenClaw conversation when running CoStar Host-model mode.

## Scenario

The user imports a meeting note, confirms one new profile candidate, refreshes the persistent view, and then asks for a graph summary.

## Transcript

**User**  
Import this meeting note and update Ava Chen.

**OpenClaw**  
I imported 1 source and identified 2 people.

- Updated existing person: `Ava Chen`
- New candidate needing confirmation: `Bella Xu`

Before anything is written, I need your confirmation for Bella Xu.

**OpenClaw (uses `review_prepare_cards`)**  
Candidate: `Bella Xu`  
Suggested action: `create`  
Why review is needed: this looks like a new collaborator rather than an existing profile.

Do you want to:

- create
- ignore
- defer

**User**  
Create Bella Xu.

**OpenClaw (uses `review_translate_answers` -> `review_commit_decisions`)**  
Committed profile review successfully.

- Created: `Bella Xu`
- Updated: `Ava Chen`

I am refreshing the persistent relationship view now.

**OpenClaw (uses `view_refresh`)**  
View refresh completed.

**User**  
Show me the relationship graph around Ava.

**OpenClaw (uses `graph_get_person`)**  
Here is the graph summary from CoStar's committed store world.

## What this transcript proves

- OpenClaw shows a receipt before commit
- OpenClaw uses review cards instead of inventing a freeform confirmation shape
- commit happens only through CoStar
- durable state is refreshed before follow-up graph usage
- Host does the reasoning; CoStar owns the durable truth
