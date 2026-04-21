# CoStar Test User Start Here

This guide is for people who want to try CoStar from the clean `main` branch.

## What This Repo Is

CoStar is a skill-first relationship operating system. It helps you:

- ingest materials
- identify and update people
- review changes safely
- keep long-lived relationship views fresh
- generate briefing, roleplay, and graph outputs from confirmed context

The `main` branch is the clean distribution branch. It includes:

- core runtimes
- prompts and schemas
- mock example inputs and outputs
- minimal repo metadata

It does **not** include:

- development notes
- validation workspaces
- generated run artifacts
- private real-data scenario outputs

## What You Need

- Git
- Node.js 18+ recommended
- Your own OpenAI-compatible model endpoint

## First Run

1. Clone the repo.
2. Open `relationship-ingestion/runtime/model-config.template.json`.
3. Copy it to `relationship-ingestion/runtime/model-config.local.json`.
4. Fill in your own `base_url`, `api_key`, and `model`.
5. Run the ingestion sample from the repo root:

```powershell
node relationship-ingestion/runtime/run-relationship-ingestion.mjs `
  relationship-ingestion/samples/relationship-ingestion.request.example.json
```

6. Run capture:

```powershell
node relationship-capture/runtime/run-relationship-capture.mjs `
  relationship-capture/samples/relationship-capture.request.ingest.example.json
```

7. When you have a confirmed profile store, try briefing:

```powershell
node relationship-briefing/runtime/run-relationship-briefing.mjs `
  relationship-briefing/samples/relationship-briefing.request.example.json
```

## What To Look For

After each run, check:

- whether the command completed successfully
- whether the names and paths in the output look clean
- whether the result summary is understandable
- whether the next action is clear

For a good first test, focus on:

1. `capture`
   - Did it tell you what it found?
   - Did it ask for confirmation when needed?

2. `profile`
   - Did it update the right person?

3. `view`
   - Did the persistent markdown view refresh?

4. `briefing`
   - Is the briefing short, direct, and usable before a conversation?

5. `graph`
   - Does the graph make the relationship structure clearer?

## What To Keep Private

Do not commit these files:

- `relationship-ingestion/runtime/model-config.local.json`
- runtime run outputs
- validation workspaces
- private real-data scenarios

Keep your own private data local unless you explicitly want to share a test case.

## What To Send Back

If you are testing CoStar, send back:

- the command you ran
- the input file you used
- the output file you got
- anything that felt confusing, slow, or wrong

That feedback helps us improve the skill layer without touching the product shell.
