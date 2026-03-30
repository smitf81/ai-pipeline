# Next Slice

Generated: 2026-03-30T08:54:32.1008763+01:00

## Interpreted Task

The repo already has deterministic preflight guard logic plus failure-memory plumbing, and the next useful slice is to surface guard-blocked reasons in a human-visible review surface before planner or executor work starts.

## Scope Risks

- This can easily sprawl across server gating, desk UI, and failure-memory presentation.
- If the slice changes guard criteria instead of just surfacing guard output, it will blur diagnosis with policy changes.
- The smallest safe pass is visibility first: show why work was blocked, do not change the block logic.

## Best Next Slice

Objective: expose structured preflight guard failures in one existing review surface so humans can see why a run was skipped.

Exact focus: wire the current `ui/preflightGuards.js` output into the nearest existing planner or archivist view, keeping the trusted prompt path unchanged.

Likely systems involved:

- `ui/server.js`
- `ui/preflightGuards.js`
- `ui/public/spatial/spatialApp.js`
- `ui/archivistWriteback.js`
- `ui/tests/preflightGuards.test.mjs`
- `brain/context/`

Why this comes first:

- The guard helper already exists, so surfacing it is a real next step rather than new policy work.
- It reduces wasted retries by making deterministic blocks obvious to humans.
- It preserves the current separation between trusted prompt content and review-only diagnostics.

Explicitly leave out:

- changing the guard rules themselves
- auto-fixing blocked runs
- broad prompt architecture changes
- UI redesign beyond a small diagnostics surface

## Definition of Done

- Blocked runs show the structured guard reason and the relevant input context in a reviewable place.
- The trusted worker prompt path still excludes review-only diagnostics.
- Tests cover the surfaced block state, not just the guard helper internals.

## Likely Follow-up Slices

1. Add a compact review panel for recent guard blocks and their counts.
2. Link repeated guard blocks to failure history and candidate fixes for manual review.
3. Add a manual acknowledge or dismiss action for blocked diagnostics.
4. Only then consider expanding the matcher or consolidating more preflight signals.

## Confidence / Uncertainty

- Assumption: the next highest-value gap is visibility, not new guard logic.
- Assumption: the existing planner or archivist surface is the right place to show blocks.
- Unclear: whether the review view should live in the archivist desk, Spatial Studio, or both.
