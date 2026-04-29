# CoStar Claude Quickstart

This is the fastest path to a local Claude-side CoStar install on Windows or macOS.

## 1. Install the Claude adapter bundle

From the repo root:

```bash
node bin/costar.mjs host install claude
```

If you want CoStar to also wire your local Claude config automatically:

```bash
node bin/costar.mjs host install claude --apply-config
```

This command uses the cross-platform Node installer. It does not require PowerShell.

## 2. If needed, apply Claude config from this bundle

From this installed bundle:

```bash
node ./install-claude-config.mjs
```

That writes the local CoStar MCP server into:

- Claude Desktop config
- repo-root `.mcp.json` for Claude Code

Default Claude Desktop config paths:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Those config entries point to the installed bundle's:

- `run-costar-mcp.mjs`

## 3. Validate the install

From the repo root:

```bash
node bin/costar.mjs host doctor claude
```

From this installed bundle:

```bash
node ./doctor-claude-install.mjs --require-config
```

If you wired Claude Code for a specific project root:

```bash
node ./doctor-claude-install.mjs --require-config --claude-code-project-root <your-project>
```

## 4. Start the first real Claude session

Open:

- `FIRST_SESSION.md`
- `FINAL_USER_ACCEPTANCE.md`

That file gives you the shortest copy/paste prompt for:

- importing a real note
- reviewing candidate updates
- committing decisions
- refreshing view
- reading briefing / graph from the same durable truth

When you want to record a true Claude-side user acceptance run, use:

- `FINAL_USER_RESULTS_TEMPLATE.md`

## What this gives you

- a local CoStar MCP server entrypoint
- a bundle-local Claude install doctor
- a first-session starter prompt
- the Claude prompt packet and session protocol
- the Claude test pack and result template
- host-model sample requests

## Durable Truth Rule

Host does the reasoning; CoStar owns the durable truth.
