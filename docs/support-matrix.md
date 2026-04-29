# CoStar Support Matrix

This matrix describes the current public release surface. It is intentionally
specific so testers know what is supported, what is only smoke-tested, and what
still needs real host-product validation.

## Runtime Support

| Surface | Windows | macOS | Model API required by CoStar | Status |
| --- | --- | --- | --- | --- |
| Engine-mode CLI | Supported | Supported | Yes | Stable local path |
| Claude host-model bundle | Supported | Supported | No | Local install and doctor ready; real Claude acceptance still required |
| Codex host-model skill | Supported | Supported | No | Local install and doctor ready; real Codex acceptance still required |
| OpenClaw host-model bundle | Supported | Supported | No | Local install and doctor ready; real OpenClaw acceptance still required |
| Cursor host-model adapter | Not yet | Not yet | Target: no | Planned after host contract is validated |

## Feature Support

| Feature | Engine mode | Host-model mode | Notes |
| --- | --- | --- | --- |
| Import materials | Supported | Supported through host tool contract | Host reads source material and calls CoStar tools |
| User feedback receipt | Supported | Supported through session protocol | User should see detected people, review needs, and next actions |
| Candidate review | Supported | Supported | Uses the same review card and translation protocol |
| Commit to profile / graph store | Supported | Supported | No second data world |
| Persistent view refresh | Supported | Supported | Same view store and markdown output |
| Briefing | Supported | Supported | Includes enhanced insight fields in `0.2.0` |
| Graph | Supported | Supported | Deterministic graph logic; host may explain results |
| Roleplay | Supported | Supported | Host can provide language quality; CoStar keeps contracts |

## Release Gate

A host path can move from "local ready" to "public recommended" only when:

- A clean install passes on Windows and macOS.
- The user does not configure a separate CoStar model API.
- The user can complete import, feedback, review, commit, view, briefing, and graph in the host.
- Generated results enter the same store / schema / review / commit system.
- Test notes and bugs use the public bug report template.
