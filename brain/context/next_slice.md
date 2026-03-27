# Next Slice

Status: active

This file is an operational context artefact for the ACE planner.
Use it as scoping input, not as canonical truth.

## Interpreted Task

The active backlog is empty, so the next slice should come from the current architecture direction: move one step from keyword-weighted intent analysis toward the persistent graph/world model without trying to finish the whole migration.

## Scope Risks

- Graph/world-model work can sprawl quickly into spatial-field simulation, planner orchestration, and persistence schema changes.
- The repo already has a real `graphEngine` and a two-layer graph bundle, so rebuilding graph primitives would duplicate existing infrastructure.
- Compatibility cleanup, desk/agent changes, and UI redesigns are adjacent but should not be mixed into the first graph-to-intent bridge.

## Best Next Slice

- Objective:
  Teach intent intake to read the structured graph bundle so context analysis uses real system/world graph state instead of only the legacy single graph.
- Exact focus:
  `ui/intentAnalysis.js`
  `ui/tests/intentAnalysis.test.mjs`
  `ui/public/spatial/graphEngine.js` only if a small helper is needed
- Why this slice comes first:
  `graphEngine` already ships, `spatialApp` already maintains system/world graphs, and `buildIntentProjectContext` still pulls from `workspace.graph` only. Bridging that gap gives the next graph/world pass a trustworthy foothold without touching spatial-field behavior.
- Explicitly leave out:
  Spatial field simulation
  Compatibility fallback removal
  New desks, agents, or planner UI work
  Broad QA rewrites

## Definition Of Done

- `buildIntentProjectContext` uses the normalized graph bundle for current project context.
- A regression test proves a world-layer node or graph-bundle signal affects intent metadata.
- Legacy single-graph fallback still works for existing workspaces.
- No unrelated spatial or compatibility behavior changes are introduced.

## Likely Follow-up Slices

- Thread the richer graph context into planner handoffs.
- Decide how graph/world persistence should be surfaced in the spatial workspace payload.
- Use the same structured graph state for future world-structure scoring and field reasoning.

## Confidence / Uncertainty

- High confidence that this is the right next seam because the graph layer already exists and the current context analyzer still ignores the bundle structure.
- Medium confidence on the exact helper shape, because the best place to expose the bundle may be a small utility inside `intentAnalysis.js` rather than a new shared module.
- Low confidence that this is the only missing bridge; it is intentionally the smallest safe pass, not the full graph/world-model implementation.
