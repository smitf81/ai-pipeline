# BSB V2 Map Authoring v0

## Boundary

AXIOM owns editable Black Sky Bound V2 map source. BSB owns runtime validation, simulation, and rendering.

```text
AXIOM authoring document
  -> safe_write_project_file receipt
  -> BSB data/maps/manifest.json publication lookup
  -> deterministic runtime-map bake
  -> safe_write_project_file receipt
  -> BSB runtime-map loader
  -> immutable runtime map
```

The editable contract is `axiom.bsb-map-authoring.v0`. AXIOM now treats the BSB manifest as a region library and loads the selected map's `authoringPath`. The opening region source is:

```text
AXIOM/apps/launcher/data/bsb-v2/maps/first_escape.authoring.json
```

The placeholder next region source is:

```text
AXIOM/apps/launcher/data/bsb-v2/maps/second_approach.authoring.json
```

The derived runtime contract is `black-sky-bound.runtime-map.v0`. BSB's `black-sky-bound.map-manifest.v0` manifest owns publication paths and optional next-region links; AXIOM resolves the selected entry before every bake. The current opening baked file is:

```text
_A_Projects/BLACK_SKY_BOUND_V2/data/maps/axiom-first-escape.runtime-map.json
```

The current next-region baked file is:

```text
_A_Projects/BLACK_SKY_BOUND_V2/data/maps/axiom-second-approach.runtime-map.json
```

## Active workspace ownership

`FileManagerRuntime` is the active-project owner. It publishes the read-only aggregate contract `axiom.workspace-context.v0` through `window.EDITOR.workspace.getContext()` and `window.AXIOM_FILE_MANAGER.workspaceContext()`.

Black Sky Bound V2 declares its AXIOM integration in `_A_Projects/BLACK_SKY_BOUND_V2/.axiom/project.json` using `axiom.project-workspace.v0`. That declaration identifies:

- the active Map Forge surface;
- the BSB-owned map manifest path;
- the AXIOM project ID that owns editable source writes;
- the BSB project ID that owns explicit runtime bake writes.

Project Preview and Map Forge consume this FileManager-owned identity. Map Forge no longer activates from Project Preview state and no longer guesses its read/write project IDs locally. A project/manifest identity mismatch fails visibly. Switching projects while Map Forge is dirty is blocked until the source is saved or reloaded.

Project-manifest browser caches are scoped by active project root. A manifest cached for one project cannot silently become another project's current manifest.

Loading a project whose workspace declares `surfaceId: bsb-v2-map-authoring` now activates the BSB-first shell automatically. The shell keeps the map dominant and narrows the left workspace to four named areas: Forge, Project, Code, and Debug. Generic scene, spatial-lens, animation, gizmo, and viewport-debug controls are suppressed while this workspace is active; they remain available for non-BSB projects. Forge is the only BSB authoring entry point.

The Forge workbench presents one source-to-runtime lifecycle: editable AXIOM source, explicit BSB runtime bake, and their current/stale/failed evidence. Save, Bake & Preview, and Reload Saved are the primary actions. Tool selection is a single Terrain / Objects / Units / Spawners palette instead of several simultaneously expanded groups. Project ownership and live connection state remain visible without competing with the map.

When an authoring document loads, Map Forge also reads the registered runtime destination and compares contract, map/scenario identity, revision, dimensions, and player spawn. The workspace reports `current`, `stale`, or `failed` from that evidence. A local edit immediately marks the runtime stale; a matching explicit bake or matching reload verification marks it current. Missing or unreadable runtime data is never presented as current.

## Current tools

- terrain painting with a bounded radius;
- growth-only map expansion from `4..256` cells per axis;
- centre anchoring, with the previous map and every coordinate-bearing record shifted by the same offset;
- explicit grass fill for newly exposed cells and a persisted `axiom.bsb-map-resize.v0` receipt;
- Fit, wheel/button zoom, and middle/right/Shift-drag viewport panning;
- scene-object placement and removal;
- direct enemy placement;
- runtime spawner placement;
- player spawn placement;
- escape-zone placement;
- manifest-backed region selection, with dirty-region switching blocked until save/reload;
- governed save and bake receipts;
- Author / Runtime switching in the embedded project preview.

The map-stage header exposes the control reminder directly: click to select/edit, wheel to zoom, middle/right mouse or Shift-drag to pan, and Fit to return to full-map framing. The canvas uses pointer capture for authoring gestures and a resize observer to recompute framing when the workspace changes size.

Draft edits are transient AXIOM UI state until `Save Source` succeeds. A bake always saves first. The runtime JSON excludes editor state, selections, brushes, scene documents, and local libraries.

`width`, `height`, and the matching `tiles` matrix in the authoring document are the canonical editable dimension owner. Expansion preserves the old tile matrix, player spawn, escape zone, scene objects, unit placements, and spawners. Shrinking is deliberately rejected in v0 so authored data cannot be cropped silently.

The baked interchange contains canonical terrain and authored records. Renderer blob masks are a derived cache and are rebuilt by the BSB loader instead of being serialized. This keeps an `80x60` bake comfortably inside the governed write boundary and prevents a second terrain truth.

## Automatic chat and MSOL context

Chat and MSOL consume the same `FileManagerRuntime.getWorkspaceContext()` projection used by Forge and Project Preview. The active project, verified root, authoring surface, selected region/record, source freshness, runtime-bake freshness, and governed tool availability are supplied automatically on every chat turn; users do not need to toggle project context manually. `Scene+` and `Selection+` only request additional generic scene detail.

`ActiveProjectWorkspaceContextCapability` exposes this projection to MSOL as read-only metadata. It grants no write authority. File reads, searches, proposals, and applies still route through `FileManagerRuntime` and require tool receipts. Exact chat edit syntax is parsed by FileManager before the generic agentic file lane, so `propose edit file ... replace ... with ...` creates a non-applied proposal and `apply edit proposal <id>` remains the separate governed mutation step.

## Failure behaviour

- missing or invalid authoring files produce a clearly labelled new draft or error state;
- failed source writes do not proceed to bake;
- missing, invalid, or mismatched BSB map manifests block bake and expose the contract error;
- failed runtime writes do not reload the BSB preview;
- switching regions while the current source has unsaved edits is blocked visibly;
- shrink/no-change resize requests fail visibly and leave the document untouched;
- invalid runtime-map requests block BSB boot instead of falling back;
- the legacy FFP authoring bridge remains separate and is not used by V2.

## Validation

- `AXIOM/apps/launcher/tests/bsb-v2-map-authoring.test.mjs` covers authoring operations, runtime bake shape, manifest-backed region selection, transition preservation, `42x30 -> 80x60` centre preservation, outer-cell painting, viewport edge reachability, and shrink rejection.
- `AXIOM/apps/launcher/tests/project-management.test.mjs` proves a full governed read can return the expanded authoring document without line truncation.
- `_A_Projects/BLACK_SKY_BOUND_V2/tests/mapManifest.test.mjs` and `runtimeMapBootstrap.test.mjs` cover canonical default selection, exact path ownership, no-store loading, and fail-loud behavior.
- `_A_Projects/BLACK_SKY_BOUND_V2/tests/runtimeMapLoader.test.mjs` covers strict load, hashes/versions, immutability, bounded paths, and authoring-field rejection.
- `AXIOM/apps/launcher/tests/bsb-v2-map-authoring.playtest.mjs` proves load, paint, placement, region switching, second-region edit/save/bake, and embedded BSB consumption.
- `AXIOM/apps/launcher/tests/bsb-authoring-goal.playtest.mjs` proves typed-root project loading, the BSB-first shell, automatic chat/MSOL workspace context, project-grounded chat read/search, proposal/apply governed editing, source save, runtime bake, reload, and standalone BSB consumption. Its transient map and fixture mutations are restored exactly and verified by SHA-256 hashes.
- The corresponding screenshots and machine-readable receipt evidence are written under `AXIOM/apps/launcher/output/playwright/bsb-authoring-goal/`.
- `_A_Projects/BLACK_SKY_BOUND_V2/artifacts/map-publication-v0/proof.mjs` proves paint/save/bake, embedded consumption, and a separate bare standalone refresh loading the exact bake hash without fallback.
- `_A_Projects/BLACK_SKY_BOUND_V2/artifacts/map-bounds-expansion-v0/proof.mjs` proves the real centre expansion, outer paint, save/bake, embedded preview, and manifest-default standalone load at `80x60`.
