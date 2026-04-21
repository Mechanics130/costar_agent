# Relationship Graph Skill

This directory is the standalone workspace for `relationship-graph`.

It builds and reads the minimum viable relationship graph capability on top of
confirmed person profiles, including:

- single-person local network queries via `get_person_graph`
- path finding between two people via `find_connection_path`
- global network summaries via `summarize_network`
- manual relationship-edge review and write-back via
  `relationship-graph-review-resolution`

This remains a skill-layer implementation, not a product prototype.
Its focus is:

- quickly checking whether the graph extraction is correct
- surfacing weak edges that need user confirmation
- making confirmed decisions affect future graph outputs

## Directory structure

```text
relationship-graph/
  README.md
  schemas/
    relationship-graph.input.schema.json
    relationship-graph.output.schema.json
    relationship-graph-review-resolution.input.schema.json
    relationship-graph-review-resolution.output.schema.json
  samples/
    relationship-graph.request.get-person-graph.example.json
    relationship-graph.response.get-person-graph.example.json
    relationship-graph.request.find-path.example.json
    relationship-graph.response.find-path.example.json
    relationship-graph.request.summarize-network.example.json
    relationship-graph.response.summarize-network.example.json
    relationship-graph-review-resolution.request.example.json
    relationship-graph-review-resolution.response.example.json
  runtime/
    relationship-graph.mjs
    run-relationship-graph.mjs
    graph-smoke.mjs
    relationship-graph-review-resolution.mjs
    run-relationship-graph-review-resolution.mjs
    graph-review-resolution-smoke.mjs
    stores/
    runs/
  scenarios/
```

## Current input

`relationship-graph` supports three modes:

1. `get_person_graph`
2. `find_connection_path`
3. `summarize_network`

The main input sources are:

- `profile_store_path`
- optional `graph_review_store_path`

Where:

- `profile store` provides person profiles and basic relationship signals
- `graph review store` stores manually confirmed relationship-edge decisions

## Current output

`relationship-graph` consistently outputs four layers:

1. `graph`
- machine-readable nodes, edges, and paths

2. `user_feedback`
- natural-language summary for users

3. `review_bundle`
- edges waiting for confirmation

4. `render_artifacts`
- currently `mermaid`
- useful for lightweight visual verification

## Relationship-edge review logic

The following edges are more likely to enter `review_bundle`:

- `same_source_context`
- `shared_role`
- `weak_link`
- low-scoring edges
- edges connected to `low confidence / stub` profiles
- bridge edges used for path finding when the evidence is still weak

Manually confirmed relationship edges are written into the `graph review store`.
Future graph runs will read those decisions back.

Current supported review decisions:

- `confirm`
- `reject`
- `downgrade`
- `reclassify`
- `defer`

## Run

### 1. Run graph

```powershell
node relationship-graph\runtime\run-relationship-graph.mjs `
  relationship-graph\samples\relationship-graph.request.get-person-graph.example.json `
  relationship-graph\samples\relationship-graph.response.get-person-graph.example.json
```

### 2. Run graph review resolution

```powershell
node relationship-graph\runtime\run-relationship-graph-review-resolution.mjs `
  relationship-graph\samples\relationship-graph-review-resolution.request.example.json `
  relationship-graph\samples\relationship-graph-review-resolution.response.example.json
```

### 3. Run local smoke checks

```powershell
node relationship-graph\runtime\graph-smoke.mjs
node relationship-graph\runtime\graph-review-resolution-smoke.mjs
```

## Current boundary

This is not yet the final relationship graph system.

Still missing:

- a longer-lived standalone graph memory layer
- proactive relationship-edge creation and manual edge authoring
- more complex multi-hop influence-path explanations
- a true interactive visualization UI

But it is already enough for this stage:

- it can identify graphs
- it can explain graphs
- it can export Mermaid for visual checks
- it can write confirmed decisions back into a closed loop
