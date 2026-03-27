# Next Slice

Status: active

This file is an operational context artefact for the ACE planner.
Use it as scoping input, not as canonical truth.

## Interpreted Task

The canonical backlog is empty, so the next useful pass is to harden one canonical anchor-resolution path end to end: keep `brain/emergence` as the source of truth and preserve compatibility fallback for the legacy path/config lookup.

## Scope Risks

- `brain/emergence/slices.md` currently reports no active slices, so carrying forward the old context-weighting slice would be stale.
- Anchor resolution, config lookup, and legacy path cleanup can easily expand into a full runtime migration if not bounded to one verified lookup path.
- Spatial/runtime changes and planner-context work are adjacent but separate; mixing them would reduce trust in the next slice.

## Best Next Slice

- Objective:
  Verify one end-to-end anchor-resolution path so canonical reads stay rooted in `brain/emergence` and compatibility fallback remains intact.
- Exact focus:
  `ui/anchorResolver.js`
  `ui/server.js`
  `ui/tests/anchorResolver.test.mjs`
  `ui/tests/server.test.mjs`
- Why this slice comes first:
  It protects the remaining canonical foundation before any broader spatial or intent-driven work, and it is small enough to prove with existing tests.
- Explicitly leave out:
  New spatial features
  Intent-weighting changes
  Agent/persona changes
  UI styling or dashboard cleanup

## Definition Of Done

- One canonical anchor path is confirmed to resolve from `brain/emergence`.
- Compatibility fallback behavior remains correct for the legacy path or target config.
- Tests cover the expected lookup order and fail if the resolution contract regresses.
- No unrelated runtime or UI behavior changes are introduced.

## Likely Follow-up Slices

- Audit the next runtime entrypoint that still depends on legacy path assumptions.
- Promote any confirmed path-drift fix into the canonical brain notes.
- Revisit spatial/runtime cleanup only after anchor resolution is stable.

## Confidence / Uncertainty

- High confidence that the old weighting slice is stale because the canonical backlog now shows zero active slices.
- Medium confidence on the exact file boundary, because the current focus is architecture-level and the resolution code should be confirmed before editing.
- Low confidence that a functional code change is needed at all until the next implementation pass inspects the actual lookup behavior.
