# Decision Log

## 2026-03-15 - Canonical brain moves to brain/emergence

ACE now treats `brain/emergence` as the canonical manager/context anchor bundle.
`projects/emergence` remains as a deprecated compatibility path during migration.

## 2026-03-15 - External targets move to targets.json

External repos and tools are now configured through `targets.json`.
`projects.json` remains as a compatibility input until the migration is complete.

## 2026-03-15 - Legacy repo trees move under legacy

Archived repo content now lives under `legacy/`.
Active runtime resolution must not depend on `legacy/ai-pipeline` or `legacy/Old`.

## 2026-03-25 - Shift to intent-driven spatial system

### Rationale

ACE is moving beyond direct task execution so the system can reason over persistent world state, reconcile competing pressures, and produce more adaptive behavior than fixed pipeline outputs allow.

### Consequences

- Architecture planning now centers on three layers: ACE orchestration, a persistent graph world model, and spatial field systems.
- New features should prefer continuous evaluation, spatial reasoning, and constrained agent action over one-shot object edits or instant global changes.
- Success criteria increasingly shift from predefined task completion toward stable, emergent outcomes shaped by world conditions.
