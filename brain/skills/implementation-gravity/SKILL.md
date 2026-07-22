---
name: implementation-gravity
description: Identify where a change must physically land across files, routes, runtime state, persistence, UI visibility, validation, and docs. Use before implementing ACE/AXIOM work that could otherwise stop at one layer while missing the real integration points.
---

# Implementation Gravity

Use this skill to find the places a change is pulled toward by the actual system.

Implementation gravity asks: "Where must this land for the feature to be real?"

## Gravity Map

Check each relevant landing point:

- **Source**: where the input or artifact originates.
- **Discovery**: how the system finds it.
- **Contract**: schema, route, manifest, registry, or API shape.
- **Runtime**: how it becomes live state.
- **Persistence**: how it survives reload or restart.
- **Visibility**: where the user or operator sees it.
- **Control**: how it is selected, opened, activated, applied, or reverted.
- **Proof**: test, smoke, probe, screenshot, payload, or log that shows it works.
- **Docs**: canonical note, decision, changelog, or operational handoff when the task changes system behavior.

## Failure Mode

The agent edits the easy layer and misses the gravitational sink: the thing appears in one place but is not discoverable, not live, not persisted, not visible, or not provable.

## Pattern

1. Name the intended outcome.
2. Fill only the relevant gravity map points.
3. Identify missing landings before editing.
4. Implement through the necessary landings.
5. Validate the highest-level landing that proves usefulness.

## Output Requirement

Report:

- Required landing points:
- Landings implemented:
- Landings intentionally not touched:
- Proof at the highest meaningful layer:
