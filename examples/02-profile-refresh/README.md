# Example 02 - Profile Refresh by Codex

This example shows how a confirmed profile stays fresh over time.

`ingestion -> review -> commit -> view refresh`

## Scenario

You already know the person and want the next note to update the same profile.

## Input

Use the sample profile and review files in:

- `relationship-profile/samples/`
- `relationship-capture/samples/`

## Run

```powershell
node bin/costar.mjs profile relationship-profile/samples/relationship-profile.request.get.example.json
node bin/costar.mjs capture relationship-capture/samples/relationship-capture.request.commit.example.json
```

## What to check

- Did the update land on the same person?
- Did the profile show a better summary after the new note?
- Did the persistent view stay aligned with the confirmed profile?
