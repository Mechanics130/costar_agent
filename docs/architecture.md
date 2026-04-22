# CoStar Architecture

```mermaid
flowchart LR
  A["Raw notes / meetings / transcripts"] --> B["capture"]
  B --> C["relationship-ingestion"]
  C --> D["review bundle"]
  D --> E["review -> commit"]
  E --> F["profile store"]
  F --> G["view refresh"]
  F --> H["briefing"]
  F --> I["roleplay"]
  F --> J["graph"]
  J --> K["graph edge review"]
  K --> E

  subgraph OpenCore["CoStar open-core engine"]
    B
    C
    E
    F
    G
    H
    I
    J
    K
  end

  subgraph ProductShell["Hosted consumer layer"]
    L["RelationChief UI / other product shells"]
  end

  F -. serves .-> L
```

## Reading the diagram

- `capture` handles intake and feedback.
- `relationship-ingestion` resolves people and proposes updates.
- `review -> commit` writes back only what is confirmed.
- `profile store` is the long-lived memory layer.
- `view`, `briefing`, `roleplay`, and `graph` consume the confirmed store.
- A separate product shell can sit on top of the engine for non-technical users.
