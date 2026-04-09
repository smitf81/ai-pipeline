# Canonical Truth System v0

## Purpose

Canonical truth for ACE must be structural, declared, and enforceable in code.
Prompt-level guidance alone has been insufficient because new slices can add routes, payloads, or client guards that look truthful without being registered against one canonical source.

This v0 system introduces:

- a domain registry
- a projection registry
- a shared truth envelope contract
- a truth access seam that resolves only declared projections

## Canonical Backbone

Current live canonical backbone:

- `workspace`
  - system of record: `data/spatial/workspace.json`
  - live refresh path: `refreshSpatialOrchestrator(...)`
  - automated feed-in: `pumpAutomatedTeamBoardAsync(...)`

Initial governed projections:

- `workspace`
- `runtime`
- `truth_kernel`
- `desk_properties`
- `intent`
- `qa_evidence`

## Governance Rules

1. Every truth-bearing domain must be declared in `canonical_truth_domains.json`.
2. Every truth-bearing projection must be declared in `canonical_truth_projections.json`.
3. Truth access must reject undeclared projection ids.
4. Truth-bearing routes must expose explicit provenance metadata.
5. Fallback must never be silently labeled as canonical truth.

## Envelope Contract

All governed truth payloads must be wrappable as:

```json
{
  "domain": "string",
  "projectionId": "string",
  "classification": "canonical | projection | historical | fallback",
  "sourceOfTruth": "string",
  "owner": "string",
  "contractVersion": "string",
  "generatedAt": "string",
  "freshness": "live | stale | cached | unknown",
  "fallbackUsed": false,
  "data": {}
}
```

Routes may preserve legacy top-level payload fields for compatibility, but they must expose the governed metadata alongside them.

## Initial Drift Report

Truth-bearing routes not yet migrated into the canonical truth seam:

- none

These remain valid operational surfaces, but they are not yet structurally governed by the canonical truth access layer.

## v0 Boundary

This slice governs declaration and access for:

- `/api/spatial/workspace`
- `/api/spatial/runtime`
- `/api/spatial/truth-kernel`
- `/api/spatial/desks/:deskId/properties`
- `/api/spatial/intent`
- `/api/qa/lead/state`
- `/api/qa/repair-loop/state`
- `/api/spatial/qa/runs`

It does not migrate the rest of ACE truth surfaces yet.
