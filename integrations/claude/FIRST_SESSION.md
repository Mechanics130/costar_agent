# CoStar Claude First Session

Use this after the bundle is installed and Claude config has been wired.

## Before you start

From this bundle folder, confirm the install once:

```bash
node ./doctor-claude-install.mjs --require-config
```

If you are testing Claude Code for a specific project root, include it:

```bash
node ./doctor-claude-install.mjs --require-config --claude-code-project-root <your-project>
```

## Start the first real Claude session

Open Claude Desktop or Claude Code in the project where CoStar was wired, then
paste a prompt like this:

```text
Use CoStar to import this meeting note: <path-to-meeting-note.md>

First:
- identify the people you want to update, create, or review
- show me the review cards before committing anything
- do not invent your own commit payload
```

## What should happen next

Claude should:

1. use CoStar tools to ingest the source
2. show you feedback and review cards
3. wait for your decisions
4. translate your answers into CoStar review decisions
5. commit those decisions into the same CoStar store world

## Example follow-up reply to Claude

```text
Update Yanran.
Create Chen Zheng.
Defer any weak candidate that only appears once.

Then commit those decisions, refresh the updated view, and show me:
- the refreshed person view
- a briefing for Yanran
- a graph summary around the updated people
```

## Success signs

- Claude never asks you for a model API key, base URL, or model name
- Claude shows CoStar review cards instead of inventing its own schema
- committed results land back in CoStar profile / graph / view state
- the refreshed view, briefing, and graph all read the same durable truth

## Durable truth rule

Host does the reasoning; CoStar owns the durable truth.
