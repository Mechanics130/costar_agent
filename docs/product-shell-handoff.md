# Product Shell Handoff

CoStar is the open-core engine. The consumer UI is a separate layer.

## What belongs in CoStar

- capture
- profile storage and updates
- briefing generation
- roleplay simulation
- graph logic
- persistent markdown views
- model bootstrap and local skill wiring

## What belongs in the consumer shell

- login and user management
- multi-tenant workspace isolation
- hosted onboarding
- drag-and-drop import
- visual dashboards
- notifications and collaboration

## Why the split matters

The engine can stay focused on durable relationship context while the product
shell focuses on end-user friendliness.

That means:

- developers can self-host and extend the engine
- non-technical users can use a simpler product without seeing the internals

## Handoff checklist

When the shell is ready, it should consume:

- confirmed profiles
- briefing outputs
- graph snapshots
- view refresh results

and it should not depend on:

- raw internal codenames
- development-only artifacts
- local tester paths
