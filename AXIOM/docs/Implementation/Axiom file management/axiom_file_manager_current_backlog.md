# AXIOM File Manager Current Backlog

Updated: 2026-06-02

This is the short operational version of the longer v0-to-v1 implementation
plan. Keep the full plan as historical slice detail; use this file first when
choosing the next file/project-management slice.

## Current State

- Slices 1-8 established FileManager state, receipts, path policy, tool
  capability detection, scan/read/open, Files panel authority, project root,
  and project manifest v0.
- Slice 8A added server-authorised live project roots and made Black Sky Bound
  the first live file-managed project.
- Slice 8B added an isolated active-project viewport preview for declared
  browser entrypoints.
- Slice 8C repaired the Black Sky Bound root relocation to
  `_A_Projects/BLACK_SKY_BOUND_FFP`.
- Slice 8D adds stale bridge diagnostics for the exact case where the browser
  has new frontend code but the running launcher bridge still exposes the old
  project registry.
- 2026-06-03 launcher repair: `AXIOM-Launch.ps1` now rejects stale bridge
  health before opening the editor. The bridge must expose version
  `axiom-file-manager-bridge.v0.4c`, the current Black Sky Bound selector,
  and the project runtime/file-management tools, otherwise the launcher stops
  the stale local bridge and starts the current source.

## Immediate Rule

Do not move into project-file writes until project root truth is visible and
current in the running bridge:

```txt
project_list -> black-sky-bound selector _A_Projects/BLACK_SKY_BOUND_FFP
project_open(_A_Projects/BLACK_SKY_BOUND_FFP) -> status ready
fs_cat(.axiom/project.json scoped to BSB) -> projectId black-sky-bound
```

If the browser reports `bridge_registered_project_index_stale` after launching
through `AXIOM-Launch.ps1`, treat that as a launcher regression: the boot script
is expected to replace stale local bridge state before the editor opens.

## Condensed Remaining Slices

### A. Finish Project Open Truth

Purpose: make known projects, active roots, manifests, and required files
unambiguous before mutation.

Includes:

- Re-run Slice 8C/8D live browser acceptance after launcher restart.
- Ensure stale localStorage roots migrate to the current registered selector.
- Keep legacy selectors visible as aliases only.
- Do not write to Black Sky Bound gameplay files.

### B. Slice 9 - Local Scene Persistence Formalisation

Status: source implementation complete and statically validated.

Purpose: make browser-local scene save/load exact, explicit, and fail-loud
before project scene files.

Includes:

- Confirm schema `axiom.scene.v1`.
- Confirm receipts `scene.save.local`, `scene.load.local`,
  `scene.verify.local`.
- Use exactly one key: `axiom.scene.local.v1`.
- Do not read or write legacy scene keys.
- Fail loudly on missing, malformed, or schema-invalid scene payloads.
- Label localStorage as explicit browser-local scene persistence, not project
  file save.

### C. Slice 10 - Project Scene File Save/Load

Status: source implementation complete and statically validated.

Purpose: save and load AXIOM scenes through FileManager under a project root.

Includes:

- Default path `scenes/default.scene.json`.
- Read -> validate -> preview -> apply -> verify.
- Manifest scene reference update.
- Safe write required; otherwise blocked/degraded.

### D. Slice 11-14 - Shared Surfaces

Status: Slices 11-14 source implementation complete and statically validated.

Purpose: make FileManager state visible and consistent across operator
surfaces.

Includes:

- CLI/menu route through FileManager.
- Chat file intents return structured receipts through FileManager actions.
- Agentic lanes route file work through FileManager.
- MSOL shows project/file authority, graph edges, inspect data, deterministic
  FileManager query answers, and fail-loud ModelBus query errors.

### E. Slice 15-17 - Safe Mutation Path

Status: Slices 15-17 source implementation complete and statically validated.

Purpose: allow carefully bounded file creation and expected-find edits.

Includes:

- File validation by type.
- Safe create file.
- Safe single-replace edit proposal and apply.
- Before/after hashes and receipts.
- External writes blocked.

### F. Slice 18-19 - Registration And Repair

Status: Slices 18-19 source implementation complete and statically validated.

Purpose: register files into project systems without confusing discovery with
activation.

Includes:

- Register file as skill/scene/plugin/config/asset.
- Plugin repair proposal contract.
- No plugin auto-activation from discovery alone.

### G. Slice 20 - End-To-End Authority Verification

Status: source implementation complete and statically validated. Focused AXIOM
validation passed; the repo-level `ui` test gate timed out after 300 seconds
after passing through `talentUi`, matching the known long-run blocker.

Purpose: prove the FileManager authority seam works end to end.

Includes:

- Health, scan, read, validate, create, edit, save/load, register, MSOL, chat,
  receipts, and external-write blocking.

## Current Next Slice

Run live browser acceptance for Slices 8C-20 after launching through
`AXIOM-Launch.ps1`. The launcher now owns stale bridge replacement before the
browser opens.

The numbered v0-to-v1 implementation plan is complete after Slice 20. The next
work is acceptance and repair: run `File Manager Authority Verification v1` in
the live browser, record any failed checks, and repair only the failing
FileManager authority seam.

## Plan Condensation Note

The full v0-to-v1 implementation plan remains useful as historical detail and
acceptance text. This backlog is the condensed working view: group completed
slices by authority surface, keep blocked live-browser acceptance explicit, and
advance implementation one numbered slice at a time.
