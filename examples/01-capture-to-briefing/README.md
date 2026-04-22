# Example 01 - Capture to Briefing

This example shows the shortest useful loop:

`capture -> profile update -> briefing`

## Scenario

You have a fresh meeting note and want a usable briefing before the next
conversation.

## Files

- `input.json`
- `briefing-input.json`
- `expected-output.md`

## Run

```powershell
node bin/costar.mjs capture examples/01-capture-to-briefing/input.json
node bin/costar.mjs briefing examples/01-capture-to-briefing/briefing-input.json
```

## What to check

- Did the run explain what it found?
- Did it identify the right people?
- Did it ask for confirmation when needed?
- Is the briefing short enough to read before a meeting?

## Why this example matters

- It shows the first moment of value for a new user.
- It demonstrates how capture turns into something you can actually use.
- It keeps the story small enough to understand in one pass.
