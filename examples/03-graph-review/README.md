# Example 03 - Graph Review

This example shows how CoStar handles relationship edges that need human
confirmation.

`graph -> review -> commit -> rerun graph`

## Scenario

You want to check whether two people really have a meaningful relationship
edge, or whether they only co-occur in the same source.

## Files

- `input.json`
- `graph-review-input.json`
- `expected-output.md`

## Run

```powershell
node bin/costar.mjs graph examples/03-graph-review/input.json
node relationship-graph\runtime\run-relationship-graph-review-resolution.mjs `
  examples/03-graph-review/graph-review-input.json
```

## What to check

- Does the graph explain why the edge exists?
- Does it separate strong edges from weak co-occurrence edges?
- Does the review step make the next graph run cleaner?

## Why this example matters

- It shows that graph data is not frozen forever.
- It demonstrates the human review loop for uncertain edges.
- It helps people trust the graph instead of treating it like a black box.
