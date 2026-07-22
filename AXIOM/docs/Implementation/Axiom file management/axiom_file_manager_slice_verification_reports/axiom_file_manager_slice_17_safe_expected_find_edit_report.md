# AXIOM File Manager Slice 17 Verification Report

Date: 2026-06-02

## Slice Continued

Slice 17 - Safe expected-find edit.

## Target

AXIOM can propose and apply small targeted project-file edits without exposing a
blind direct-write path.

## Implementation

- Added `FileManagerRuntime.validateEditProposal(...)`.
- Added `FileManagerRuntime.proposeEdit(...)`.
- Added `FileManagerRuntime.applyEditProposal(...)`.
- Implemented only the planned starting mode:
  - `single_replace`
- Added proposal gates:
  - target path is required and must pass edit path policy
  - absolute and traversal paths are blocked
  - `safe_write_project_file` must be available
  - `expectedFind` is required
  - `expectedFind` must occur exactly once
  - replacement is required and non-empty unless explicitly allowed
  - simulated post-edit content must pass Slice 15 validation
- Added proposal storage in FileManager state, keyed by `proposalId`.
- Added deterministic before/after text hashes to proposals and receipts.
- Added apply gates:
  - proposal id is required
  - proposal must exist in the current FileManager session
  - file is re-read before apply
  - stale before-hash proposals are rejected
  - `expectedFind` is re-confirmed as exactly one occurrence
  - patched content hash must match the proposal's simulated after hash
  - write uses `safe_write_project_file` with `create: false` and
    `overwrite: true`
  - file is read back after write and verified against the expected after hash
- Added receipts:
  - `file.edit.validate`
  - `file.edit.proposal`
  - `file.edit`
- Added action routing for:
  - `validate_edit_proposal`
  - `propose_edit`
  - `apply_edit`
- Kept direct `edit_file` / `write_file` blocked with a loud receipt requiring
  `propose_edit` then `apply_edit`.
- Added exact chat syntax for edit proposals:

```txt
propose edit file docs/file-manager-test.md replace "# Test" with "# Test Updated"
replace "# Test" with "# Test Updated" in file docs/file-manager-test.md
apply edit proposal <proposalId>
```

- Updated MSOL FileManager/SafeWrite capability metadata to expose expected-find
  edit receipts.
- Exposed the new edit helpers through `FileManagerRuntime` and
  `AXIOM_FILE_MANAGER`.

## Validation

Commands run:

```txt
node --check AXIOM/apps/launcher/server.js
inline script parse for AXIOM/apps/launcher/public/axiom-editor.html
source probe for Slice 17 edit proposal/apply symbols and receipt strings
```

Results:

```txt
server syntax: pass
browser script parse: pass
source probe: pass
```

## Scope Guard

Black Sky Bound gameplay code was not modified. This slice only changed AXIOM
file/project-management source and documentation.

## Caveats

- Live edit acceptance against `docs/file-manager-test.md` was not run in this
  turn because the browser/MCP bridge was not exercised from the sandbox.
- Edit proposals are session state in the browser runtime. Refreshing the page
  clears pending proposals, which is acceptable for this starting slice because
  apply re-validates by file content hash.
- `multi_replace` and `full_write_explicit` remain intentionally unimplemented.

## Next Slice

Slice 18 - Register file as skill/scene/plugin/config.
