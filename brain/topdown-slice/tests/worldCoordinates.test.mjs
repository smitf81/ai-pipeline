import test from 'node:test';
import assert from 'node:assert/strict';

import { placeBuilding } from '../src/buildings/buildings.js';
import { createEntityStore } from '../src/entities/entityStore.js';
import { createDefensibilityIntent } from '../src/ai/intents.js';
import {
  createLayeredField,
  getFieldValue,
  getLayeredFieldValue,
  setLayeredFieldValue
} from '../src/world/fields.js';
import {
  createCellAddress,
  getCellKey,
  getTileKey
} from '../src/world/coordinates.js';
import {
  createTilemap,
  getGroundCellAddress,
  getTileElevation,
  getTileType,
  isCellAddressInBounds
} from '../src/world/tilemap.js';

test('actors, buildings, and intents expose canonical world positions with z defaulting to zero', () => {
  const store = createEntityStore();
  const map = createTilemap();
  const placed = placeBuilding(store, map, { type: 'relay', x: 6, y: 5, z: 2 });
  const intent = createDefensibilityIntent({ id: 'ridge', x: 9, y: 4, radius: 3, weight: 1 });

  assert.deepEqual(store.agent.position, { x: 3, y: 3, z: 0 });
  store.agent.z = 4;
  store.agent.x = 7;
  assert.deepEqual(store.agent.position, { x: 7, y: 3, z: 4 });

  assert.equal(placed.ok, true);
  assert.deepEqual(placed.building.position, { x: 6, y: 5, z: 2 });
  assert.equal(placed.building.z, 2);

  assert.deepEqual(intent.position, { x: 9, y: 4, z: 0 });
  assert.deepEqual(intent.center, { x: 9, y: 4, z: 0 });
});

test('tile and cell helpers keep ground-plane and volumetric keys distinct', () => {
  const map = createTilemap();

  assert.equal(getTileKey({ x: 4, y: 6 }), '4,6');
  assert.equal(getCellKey({ x: 4, y: 6, z: 3 }), '4,6,3');
  assert.equal(getTileType(map, { x: 4, y: 6, z: 9 }), 'grass');
  assert.equal(getTileElevation(map, { x: 4, y: 6 }), 0);
  assert.deepEqual(getGroundCellAddress(map, { x: 4, y: 6 }), { x: 4, y: 6, z: 0 });
  assert.equal(isCellAddressInBounds(map, { x: 4, y: 6, z: 0 }), true);
  assert.equal(isCellAddressInBounds(map, { x: 4, y: 6, z: 1 }), false);
  assert.deepEqual(createCellAddress({ x: 4, y: 6 }), { x: 4, y: 6, z: 0 });
});

test('layered fields can store z-specific values without changing 2d field reads', () => {
  const layeredField = createLayeredField(8, 6, [0, 2], 0);

  assert.equal(setLayeredFieldValue(layeredField, { x: 2, y: 3, z: 2 }, 0.75), 0.75);
  assert.equal(getLayeredFieldValue(layeredField, { x: 2, y: 3, z: 0 }), 0);
  assert.equal(getLayeredFieldValue(layeredField, { x: 2, y: 3, z: 2 }), 0.75);
  assert.equal(getFieldValue(layeredField.layers['2'], 2, 3), 0.75);
});
