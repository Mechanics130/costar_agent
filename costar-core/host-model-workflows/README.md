# CoStar host-model workflows

This layer materializes host-supplied reasoning into the same CoStar result shapes used by Engine mode.

Current workflows:

- `capture-workflow.mjs`
- `briefing-workflow.mjs`
- `roleplay-workflow.mjs`

Design rules:

- the host model provides reasoning payloads
- CoStar reuses profile resolution, normalization, markdown generation, and artifact persistence
- no separate store or schema world is introduced
