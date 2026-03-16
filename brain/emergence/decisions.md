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
