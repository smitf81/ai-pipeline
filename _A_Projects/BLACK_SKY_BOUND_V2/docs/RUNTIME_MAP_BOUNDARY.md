# BSB Runtime Map Boundary

Black Sky Bound is the game runtime. AXIOM is the authoring toolbench.

## Current runtime owner

- `data/maps/manifest.json` owns the registered maps, standalone default, and runtime paths.
- `data/maps/manifest.json` also owns catalogue ordering and optional `nextMapId` links between registered regions.
- `src/data/maps.js` validates and resolves that manifest.
- `src/world/runtimeMapBootstrap.js` resolves the manifest default or explicit `?map=` import and publishes the load receipt.
- `src/world/runtimeMapLoader.js` fetches, hashes, validates, and freezes baked maps.
- `src/game/createGame.js::createInitialGameState()` consumes map truth for simulation.
- `src/world/runtimeMapContract.js` names the baked-map interchange shape.

The contract is `black-sky-bound.runtime-map.v0`. Runtime map payloads contain canonical resolved terrain plus spawn/object/spawner facts. Renderer blob masks are deterministically derived by `runtimeMapLoader.js` after validation and are not a second serialized terrain truth. Payloads do not contain editor state, resize receipts, selection, brushes, local scene libraries, or authoring documents.

## AXIOM handoff seam

AXIOM persists editable source as `axiom.bsb-map-authoring.v0`, reads the BSB map manifest, and bakes `black-sky-bound.runtime-map.v0` to the selected entry's `runtimePath`. First Flightless Night / First Escape currently resolves to:

```text
/data/maps/axiom-first-escape.runtime-map.json
```

Standalone browser startup loads this entry as the manifest default. BSB also accepts a bounded explicit import request such as:

```text
?map=/data/maps/axiom-first-escape.runtime-map.json
```

The loader rejects missing/invalid manifests, traversal, wrong contracts or IDs, malformed terrain, out-of-bounds markers, missing required fields, and authoring-only fields. An invalid manifest or map blocks boot visibly; it never silently falls back to the built-in demo map.

Loaded maps are deeply frozen before `createInitialGameState()` receives them. `createDemoMap()` remains a programmatic/test fixture, not a standalone browser fallback.

## Escape transition contract

Baked runtime maps may include:

```text
transitions.escapeZone.mode = "load_next_map"
transitions.escapeZone.nextMapPath = "/data/maps/<target>.runtime-map.json"
```

When the player enters an escape zone with that transition, BSB emits a scenario-completed event, marks the game `transitioning`, validates the target against the manifest, loads the next immutable runtime map, rebuilds simulation state, resets the camera to the new map, and records a transition receipt in `render_game_to_text().runtimeMap.transition`.

The first registered region currently transitions to:

```text
/data/maps/axiom-second-approach.runtime-map.json
```

If a map has no escape transition, the old terminal win-state behaviour is preserved. If a transition points to an unregistered or invalid map, the failure is exposed as a transition error instead of silently falling back or pretending the map completed.

The loaded map's `width` and `height` own terrain projection and collision-safe movement/steering bounds. Camera clamping also derives its world extents from those dimensions. BSB currently has no separate A* or pathfinding-grid subsystem with an independent size contract.

Every successful browser load logs and exposes the map id, dimensions, exact path, SHA-256 hash when Web Crypto is available, contract/revision version, selection source, and `fallbackUsed: false`. `render_game_to_text()` also publishes runtime-map and camera/map dimensions. Failures expose the failed path and reason through `window.BSB_V2_BOOT_ERROR` and a `[BSB map] load failed` console entry.

Authoring UI, draft state, filesystem persistence, and bake receipts remain AXIOM-owned. BSB contains no editor panel, authoring input, local scene library, or authoring document conversion.
