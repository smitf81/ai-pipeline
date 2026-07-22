---
name: projection-vs-truth-discipline
description: Keep projections, previews, advisory outputs, generated proposals, ghost state, cached state, and canonical persisted truth separate. Use when ACE/AXIOM work touches ghost projections, truth kernel views, plugin proposals, generated patches, previews, runtime state, persistence, or any UI/backend claim that could confuse candidate state with committed truth.
---

# Projection Vs Truth Discipline

Use this skill whenever a thing may look real before it is canonical.

## Core Rule

A projection can guide action, but it is not truth until the canonical owner accepts and persists it through the proper mutation path.

## Classify State

Label each state surface as one of:

- `canonical`: source of truth or accepted persisted state.
- `projection`: candidate, ghost, preview, proposed delta, or uncommitted plan.
- `advisory`: analysis, recommendation, model output, QA note, or human-readable guidance.
- `historical`: previous state, log, archive, snapshot, or evidence.
- `fallback`: degraded substitute that must not masquerade as success.

## Promotion Gate

Before treating projected state as truth, confirm:

- Canonical owner.
- Mutation authority.
- Validation gate.
- Persistence path.
- Provenance.
- Consumer route.
- Rollback or blocker state when relevant.

## Failure Mode

The agent displays, stores, or reports a ghost/proposal/advisory result as if it were committed system truth.

## Output Requirement

Report:

- State surface:
- Classification:
- Canonical owner, if any:
- Promotion gate:
- What remains uncommitted:
