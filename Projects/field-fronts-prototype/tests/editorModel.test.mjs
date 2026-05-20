import assert from 'node:assert/strict';
import { createBlankMap, deserializeMap, getElevation, getTile, serializeMap } from '../src/world/mapModel.js';
import { createBrush, getBrushTiles, paintHeightMap, paintMap } from '../src/editor/brush.js';
import { deriveTerrainFields, getFieldValue } from '../src/world/fields.js';
import { createEditorState } from '../src/editor/editorState.js';

export function run() {
  const initialState = createEditorState(createBlankMap({ width: 9, height: 9, fill: 'land' }));
  assert.equal(initialState.gameOverlay, 'none');
  assert.equal(initialState.showCommandRadii, false);

  const map = createBlankMap({ width: 9, height: 9, fill: 'land' });
  const brush = createBrush({ terrainId: 'forest', radius: 1, shape: 'circle' });
  const preview = getBrushTiles(map, 4, 4, brush);
  assert.equal(preview.length, 5);

  const changes = paintMap(map, 4, 4, brush);
  assert.equal(changes.length, 5);
  assert.equal(getTile(map, 4, 4), 'forest');
  assert.equal(getTile(map, 0, 0), 'land');
  assert.ok(Number.isFinite(getElevation(map, 4, 4)));

  const fields = deriveTerrainFields(map);
  assert.ok(getFieldValue(fields, 'cover', 4, 4) >= 0.78);
  assert.equal(getFieldValue(fields, 'height', 4, 4), getElevation(map, 4, 4));
  assert.ok(getFieldValue(fields, 'passability', 4, 4) <= 0.5);

  const heightBrush = createBrush({ tool: 'height', radius: 0, heightDelta: 0.1 });
  const beforeHeight = getElevation(map, 4, 4);
  const raised = paintHeightMap(map, 4, 4, heightBrush, { direction: 'raise' });
  assert.equal(raised.length, 1);
  assert.ok(getElevation(map, 4, 4) > beforeHeight);
  const lowered = paintHeightMap(map, 4, 4, heightBrush, { direction: 'lower' });
  assert.equal(lowered.length, 1);
  assert.equal(getElevation(map, 4, 4).toFixed(3), beforeHeight.toFixed(3));

  const roundTrip = deserializeMap(serializeMap(map));
  assert.equal(roundTrip.width, 9);
  assert.equal(roundTrip.height, 9);
  assert.equal(getTile(roundTrip, 4, 4), 'forest');
  assert.equal(getElevation(roundTrip, 4, 4), getElevation(map, 4, 4));

  const legacyRoundTrip = deserializeMap(JSON.stringify({
    width: 5,
    height: 5,
    tiles: Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 'land'))
  }));
  assert.ok(Number.isFinite(getElevation(legacyRoundTrip, 2, 2)));
}
