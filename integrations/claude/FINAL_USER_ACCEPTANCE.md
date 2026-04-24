# CoStar Claude Final User Acceptance

Use this checklist when you want to validate the **Claude final-user milestone**
rather than only the local engineering slice.

## Goal

Prove these four questions in a real Claude software session:

1. The user does not need to configure a model API.
2. The user can complete the full loop inside Claude.
3. Generated results enter the same CoStar store / schema / review system.
4. CoStar has not split into two data worlds.

## Preconditions

From this installed bundle, run:

```bash
node ./doctor-claude-install.mjs --require-config
```

If you are validating Claude Code in a specific project root:

```bash
node ./doctor-claude-install.mjs --require-config --claude-code-project-root <your-project>
```

## Real-Claude acceptance flow

### Step 1. Start a Claude session

Open Claude Desktop or Claude Code where the CoStar MCP config was installed.

### Step 2. Paste the first-session prompt

Use the exact starter prompt from:

- `FIRST_SESSION.md`

### Step 3. Confirm the review step happens before commit

Claude should:

- import the source
- show feedback
- present review cards
- wait for your answers

Claude should **not**:

- ask for a model API key
- ask for a base URL or model name
- invent a freeform commit payload
- silently commit before review

### Step 4. Give commit decisions

Reply with concrete review decisions such as:

```text
Update Ava Chen.
Create Bella Xu.
Defer any weak candidate mentioned only once.
```

### Step 5. Ask for downstream reads

After commit, ask Claude to:

- refresh the updated view
- show the refreshed view
- generate a briefing
- summarize the local graph

### Step 6. Verify durable truth

Claude should read back artifacts that come from the same CoStar world:

- refreshed person view
- canonical briefing output
- canonical graph output

## Pass criteria

### Hard acceptance 1

Pass if Claude never requires separate model API setup during the user flow.

### Hard acceptance 2

Pass if the user can finish:

- import
- feedback
- review
- commit
- view refresh
- briefing or graph follow-up

inside Claude.

### Hard acceptance 3

Pass if review and commit still flow through CoStar review / commit tools and
later reads come from the same CoStar stores.

### Hard acceptance 4

Pass if Claude acts only as the reasoning/orchestration layer and CoStar
remains the durable system of record.

## Record results

Use:

- `FINAL_USER_RESULTS_TEMPLATE.md`

## Durable truth rule

Host does the reasoning; CoStar owns the durable truth.
