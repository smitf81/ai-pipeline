# AXIOM File Manager Slice 19 Verification Report

Date: 2026-06-02

## Slice Continued

Slice 19 - Plugin repair contract integration.

## Target

AXIOM can request targeted plugin repair while preserving exact runtime
evidence and keeping repair output as a proposal, not an applied patch.

## Implementation

- Added Plugin Builder tool:
  - `axiom_plugin_repair`
- Exposed `axiom_plugin_repair` through:
  - Plugin Builder MCP registry
  - AXIOM launcher MCP tool list
  - FileManager `plugin_repair` action
- Added `FileManagerRuntime.requestPluginRepair(...)`.
- Stored repair results in FileManager state as:
  - `axiom.fileMutationProposal.pluginRepair.v1`
  - `type: FileMutationProposal`
- Preserved repair evidence:
  - `plugin_id`
  - `target_file`
  - exact runtime `error`
  - `message`
  - `stack`
  - exact `repair_instruction`
- Added exact chat/agent parsing for:

```txt
Repair plugin ViewportNavigationImplementation. Error: Uncaught TypeError: t.set is not a function. Target file: src/index.js. Replace unsafe orbitTarget.set calls with a helper supporting THREE.Vector3 and plain objects.
```

- Added FileManager receipts under:
  - `plugin.repair`
- Added MSOL capability:
  - `PluginRepairProposalCapability`

## Proposal / Apply Boundary

Plugin repair does not apply patches.

Repair proposals explicitly carry the apply gate:

```txt
Use FileManagerRuntime.action("propose_edit") then FileManagerRuntime.action("apply_edit")
```

If Plugin Builder cannot produce a ready exact expected-find patch, the proposal
is marked `blocked_expected_find_required` and FileManager records a warning
instead of manufacturing a broad patch.

## Validation

Commands run:

```txt
node --check AXIOM/apps/plugin-builder/src/builder/index.js
node --check AXIOM/apps/plugin-builder/src/mcp/server.js
node --check AXIOM/apps/launcher/server.js
inline script parse for AXIOM/apps/launcher/public/axiom-editor.html
Slice 19 source invariant check
npm.cmd test from AXIOM/apps/plugin-builder
```

Results:

```txt
plugin-builder builder syntax: pass
plugin-builder MCP syntax: pass
launcher server syntax: pass
browser script parse: pass
source invariants: pass
plugin-builder smoke test: pass
```

## Scope Guard

Black Sky Bound gameplay code was not modified. This slice changed AXIOM
FileManager, launcher MCP metadata, Plugin Builder repair tooling, and
file-management documentation only.

## Caveats

- Live browser repair acceptance was not run in this sandbox turn.
- The repair tool only emits a ready patch when exact expected-find/replacement
  evidence is present. Narrow deterministic `orbitTarget.set` signals identify a
  candidate repair site only and remain blocked until exact edit evidence is
  supplied before safe edit/apply.
- Plugin runtime activation remains outside this slice.

## Next Slice

Slice 20 - End-to-end v1 verification harness.
