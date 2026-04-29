# Claude Mock Transcript

This mock transcript shows the intended shape of a Claude conversation when
running CoStar Host-model mode.

## Scenario

The user imports a meeting note, confirms one new profile candidate, refreshes
the persistent view, and then asks for a briefing.

## Transcript

**User**  
Import this meeting note and update Ava Chen.

**Claude**  
I imported 1 source and identified 2 people.  
Current result:

- Updated existing person: `Ava Chen`
- New candidate needing confirmation: `Bella Xu`

Before anything is written, I need your confirmation for Bella Xu.

**Claude (uses `review_prepare_cards`)**  
Candidate: `Bella Xu`  
Suggested action: `create`  
Why review is needed: this looks like a new collaborator rather than an existing profile.  
Evidence preview: "Bella Xu is willing to keep moving if examples and scheduling are ready."

Do you want to:
- create
- ignore
- defer

**User**  
Create Bella Xu.

**Claude (uses `review_translate_answers` -> `review_commit_decisions`)**  
Committed profile review successfully.

- Created: `Bella Xu`
- Updated: `Ava Chen`
- Deferred: none

I am refreshing the persistent relationship view now.

**Claude (uses `view_refresh`)**  
View refresh completed for:
- `Bella Xu`

You can now:
- open the refreshed view
- inspect the local graph
- generate a briefing

**User**  
Generate a briefing before I talk to Ava Chen again.

**Claude (uses `briefing_generate`)**  
Briefing ready.

- recommended opening
- watchouts
- likely pushbacks
- next actions

## What this transcript proves

- Claude shows a receipt before commit
- Claude uses review cards instead of inventing a freeform confirmation shape
- commit happens only through CoStar
- durable state is refreshed before a follow-up briefing is generated
- Host does the reasoning; CoStar owns the durable truth
