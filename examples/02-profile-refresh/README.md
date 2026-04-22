# Example 02 - Profile Refresh

This example shows how a confirmed profile stays fresh over time.

`ingestion -> review -> commit -> view refresh`

## Scenario

You already know the person and want the next note to update the same profile.

## Files

- `input.json`
- `profile-input.json`
- `expected-output.md`

## Run

```powershell
node bin/costar.mjs profile examples/02-profile-refresh/input.json
node bin/costar.mjs profile examples/02-profile-refresh/profile-input.json
```

## What to check

- Did the update land on the same person?
- Did the profile show a better summary after the new note?
- Did the persistent view stay aligned with the confirmed profile?

## Why this example matters

- It shows that CoStar is not just a one-shot extractor.
- It demonstrates how old and new context accumulate into one profile.
- It is the simplest proof that the memory loop stays alive.
