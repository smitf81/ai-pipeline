---
name: evidence-first-completion
description: Require evidence before completion claims. Use when finishing ACE/AXIOM work, reporting implementation status, validating UI/backend behavior, proving skill packages, or deciding whether a task is passed, partial, blocked, or failed.
---

# Evidence-First Completion

Use this skill when the next sentence might be "done."

## Core Rule

Completion is a claim backed by evidence, not a feeling that the implementation looks right.

## Evidence Ladder

Prefer the highest applicable proof:

1. User-visible runtime proof: rendered UI, viewport state, live route behavior, or real workflow.
2. Direct behavioral test: targeted unit/integration test covering the changed contract.
3. Direct probe: command, API call, payload inspection, or fixture proving the path.
4. Static proof: source inspection showing ownership, wiring, and no alternate path.
5. Stated blocker: exact missing dependency, failing command, or unavailable tool.

Static proof alone is not enough for UI/runtime claims unless runtime proof is blocked and the blocker is named.

## Status Labels

- `passed`: required proof succeeded.
- `partial`: useful proof exists, but a named completion gap remains.
- `blocked`: a specific external or environmental blocker prevents proof.
- `failed`: the attempted proof disproved the claim.

## Failure Mode

The agent reports success after editing files but before proving the behavior the user actually cares about.

## Output Requirement

Report:

- Completion claim:
- Evidence used:
- Command/probe/result:
- Status:
- Remaining proof gap, if any:
