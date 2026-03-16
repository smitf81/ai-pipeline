# Active Plan

Created: 2026-03-15T00:00:00Z

## Goal

- Make `brain/emergence` the canonical source of truth for ACE manager and context behavior.

## MVP scope (must-haves)

- Add a shared anchor resolver and bundle builder.
- Route runtime, dashboard, intent analysis, throughput, and tests through canonical anchor resolution.
- Rename external target config to `targets.json` with `projects.json` fallback.
- Carry anchor provenance into handoffs, cards, runtime payloads, and drift detection.
- Stage legacy folders under a dedicated legacy namespace after compatibility checks pass.

## Out of scope (not now)

- Multi-domain manager support.
- New desk/agent roles.
- Removing compatibility aliases in the same pass.

## Acceptance criteria

- [x] Runtime and dashboard read canonical anchor files from `brain/emergence`.
- [x] Intent reports include anchor provenance and manager truth metadata.
- [x] Unanchored execution cards are blocked from automatic advancement.
- [x] External target lookup prefers `targets.json` but still works with `projects.json`.

## Risks / notes

- Legacy compatibility must survive the path move.
- Canonical docs must stay aligned with runtime fields or drift warnings will become noise.
- Archived content under `legacy/` must stay out of active runtime resolution.
