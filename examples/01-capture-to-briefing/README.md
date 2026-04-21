# Example 01 - Capture to Briefing by Codex

This example shows the shortest useful loop:

`capture -> profile update -> briefing`

## Scenario

You have a fresh meeting note and want a usable briefing before the next
conversation.

## Input

Use the sample request in:

- `relationship-capture/samples/relationship-capture.request.ingest.example.json`

## Run

```powershell
node bin/costar.mjs capture relationship-capture/samples/relationship-capture.request.ingest.example.json
```

Then inspect:

- the capture response
- the updated profile sample
- the briefing sample

## What to check

- Did the run explain what it found?
- Did it identify the right people?
- Did it ask for confirmation when needed?
- Is the briefing short enough to read before a meeting?
