# Example 03 - Graph Review by Codex

This example shows how CoStar handles relationship edges that need human
confirmation.

`graph -> review -> commit -> rerun graph`

## Scenario

You want to check whether two people really have a meaningful relationship
edge, or whether they only co-occur in the same source.

## Input

Use the graph review sample in:

- `relationship-graph/samples/relationship-graph-review-resolution.request.example.json`

## Run

```powershell
node bin/costar.mjs graph relationship-graph/samples/relationship-graph.request.get-person-graph.example.json
node bin/costar.mjs graph relationship-graph/samples/relationship-graph-review-resolution.request.example.json
```

## What to check

- Does the graph explain why the edge exists?
- Does it separate strong edges from weak co-occurrence edges?
- Does the review step make the next graph run cleaner?
