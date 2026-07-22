# AXIOM File Manager Verification Report - Slice 8C

Date: 2026-06-01

## Slice

**Slice 8C - Known project root relocation and status hardening**

## Scope

This slice repairs AXIOM's registered Black Sky Bound project root after the
live project moved from `Projects/field-fronts-prototype` to
`_A_Projects/BLACK_SKY_BOUND_FFP`.

## Root cause

The launcher bridge still registered `black-sky-bound` at the old
`Projects/field-fronts-prototype` root. The active project now lives under
`_A_Projects/BLACK_SKY_BOUND_FFP`, so project open, manifest reads, root scans,
and runtime probes could fail against a stale path.

## What changed

- Moved the registered `black-sky-bound` root to
  `_A_Projects/BLACK_SKY_BOUND_FFP`.
- Kept `Projects/field-fronts-prototype` as a legacy selector.
- Added required-path verification for `.axiom/project.json`, `README.md`,
  `index.html`, `package.json`, `src`, and `tests`.
- Added project status and missing required path fields to `project_list` and
  `project_open`.
- Updated the Files-panel Black Sky Bound preset to request the current root.

## Validation performed

```txt
node --check AXIOM/apps/launcher/server.js
inline browser script parse for AXIOM/apps/launcher/public/axiom-editor.html
project_list -> black-sky-bound status ready
project_open(projectRoot=_A_Projects/BLACK_SKY_BOUND_FFP) -> ready
project_open(projectRoot=Projects/field-fronts-prototype) -> legacy selector resolves
fs_ls(path=., projectRoot=_A_Projects/BLACK_SKY_BOUND_FFP) -> README.md and .axiom visible
fs_cat(path=.axiom/project.json, projectRoot=_A_Projects/BLACK_SKY_BOUND_FFP) -> projectId black-sky-bound
fs_cat(path=../AGENTS.md, projectRoot=_A_Projects/BLACK_SKY_BOUND_FFP) -> blocked as project-root escape
```

Observed direct launcher probe:

```json
{
  "projectListOk": true,
  "blackStatus": "ready",
  "blackMissing": [],
  "openNewOk": true,
  "openNewSelector": "_A_Projects/BLACK_SKY_BOUND_FFP",
  "openLegacyOk": true,
  "openLegacySelector": "_A_Projects/BLACK_SKY_BOUND_FFP",
  "lsHasReadme": true,
  "lsHasAxiom": true,
  "catHasProjectId": true,
  "escapeBlocked": true
}
```

## Boundary

Black Sky Bound is used as a read-only project-management probe only. This
slice does not modify Black Sky Bound gameplay, scenario, combat, renderer,
pathfinding, or `gameModel.js` files.
