# Next Slice

Generated: 2026-03-27T23:58:00Z

## Interpreted Task

The active work is currently focused on RGS node status handling, but the broader planning pressure is to avoid another oversized pass and pick the smallest next step that advances the intent-driven spatial direction without reopening compatibility cleanup too early.

## Scope Risks

- The roadmap spans orchestration, persistent graph/world modeling, QA drift surfacing, and eventual compatibility cleanup.
- Trying to fold those into one pass would blur the source of truth and likely produce a partial result that looks complete but is not.
- The current active slice is already in flight, so the next recommendation should be sequenced after it rather than competing with it.

## Best Next Slice

Objective: seed one minimal persistent graph/world-model seam that can carry a real relationship from canonical ACE state into planner-visible context.

Exact focus: introduce or wire the smallest durable graph relation or node representation needed for one live slice of world state, then reflect that state in the planner context artifacts.

Likely systems involved:

- `brain/emergence/`
- `brain/context/`
- the runtime or planner surface that reads canonical world state

Why this comes first:

- It advances the intent-driven direction from the roadmap without requiring the full spatial field layer.
- It creates a real foothold for later orchestration work instead of another diagnostic-only pass.
- It keeps compatibility cleanup out of the critical path until the new seam is trustworthy.

Explicitly leave out:

- removing `projects/emergence/*` compatibility
- broader MCP or QA refactors
- spatial field expansion beyond one durable relationship
- multi-domain brain work

## Definition of Done

- One persistent graph/world-state relationship is represented canonically and can be read back by the planner or context layer.
- The slice is visible in the operational context notes so the next pass has a concrete anchor.
- No placeholder graph model is left behind as if it were complete.

## Likely Follow-up Slices

1. Thread the new canonical graph seam into one runtime or planner read path.
2. Surface graph/world drift or constraint visibility in QA or MCP context.
3. Decide whether `projects/emergence/*` compatibility can be narrowed or removed.
4. Expand from one relation into the first useful spatial pressure layer only after the graph seam is stable.

## Confidence / Uncertainty

- Assumption: the current active RGS-node work is the immediate blocker and should finish before this next slice starts.
- Assumption: the repo is ready for a minimal persistent graph seam without first deleting legacy compatibility paths.
- Unclear: whether the canonical graph representation should land in `brain/emergence` first or in the runtime layer first; the safe choice is whichever path already owns current truth.
