# Structure Joinery Coherence v1 — Apply Notes

## Scope
Narrow patch for wall/trench/gate joinery coherence. This does not rewrite terrain rendering, combat, economy, enemy AI, or unit pathfinding.

## What changed

### 1. Explicit join topology
- Corner segments no longer average an L-bend into a fake diagonal orientation.
- Joinery now records `junction.kind` and `junction.directions`.
- Supported junction kinds include: `single`, `end`, `straight`, `corner`, `t`, `cross`, `isolated`.

### 2. Less accidental auto-joining
- Runtime join refresh no longer treats every adjacent path segment as a valid visual/network join.
- Path-to-path joins now require exposed socket directions to face each other.
- Anchor structures still accept nearby joins.
- Same-tile build-on/replace behaviour is preserved.

### 3. Shared ribbon rendering for preview and built paths
- Completed path structures are grouped by `joinery.pathId` and rendered as a smoothed continuous ribbon.
- Preview and completed line structures now use the same ribbon drawing helper.
- Internal same-path previous/next spans are skipped in the per-pair renderer to avoid double-thick sausage overlays.

### 4. Reduced per-segment glyph noise
- Connected completed wall/trench segments no longer redraw every tile as a full mini-structure unless selected.
- Corners, ends, T-junctions and crosses still get small topology markers.
- Gates remain explicit glyphs.

### 5. Oriented navigation/collision footprints
- Structure blockers and movement modifiers now carry orientation.
- Rectangular collision/modifier checks now rotate test tiles into local structure space.
- Navigation signatures include orientation so rotated blockers/modifiers invalidate cached nav correctly.

## Files changed
- `src/game/structureJoinery.js`
- `src/game/gameModel.js`
- `src/game/structureTopology.js`
- `src/game/structureRegistry.js`
- `src/rendering/canvasRenderer.js`
- `tests/structureJoinery.test.mjs`
- `tests/structureTopology.test.mjs`

## Verification run

Syntax checks:
- `node --check src/game/structureJoinery.js` ✅
- `node --check src/game/gameModel.js` ✅
- `node --check src/game/structureTopology.js` ✅
- `node --check src/rendering/canvasRenderer.js` ✅

Targeted tests:
- `structureJoinery.test.mjs` ✅
- `structureTopology.test.mjs` ✅
- `navigationConstructionRegressionLock.test.mjs` ✅
- `collisionAuthority.test.mjs` ✅

Full suite note:
- `npm test` still times out in this project runner. The uploaded baseline zip also timed out, so this is not introduced by this patch.
- Baseline uploaded project timed out after `collision authority`.
- Patched project progressed further, through `resource gathering`, before the same runner timeout pattern.

## Remaining known limitations
- Terrain/coast/vector tile smoothing is still separate. This patch improves structure joinery, not map tile contours.
- Closed-loop wall/trench topology is still represented by one structure per tile; the loop closure can be visually clearer now, but true loop semantics are not yet a separate graph object.
- Diagonal visual relationships are improved only for structures. Terrain still needs marching-squares/scalar-field style boundary extraction later.
