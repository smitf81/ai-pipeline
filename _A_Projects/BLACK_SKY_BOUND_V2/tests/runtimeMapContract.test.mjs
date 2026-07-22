import { assert, equal } from './assert.mjs';
import {
  RUNTIME_MAP_AUTHORING_FIELDS,
  RUNTIME_MAP_CONTRACT,
  RUNTIME_MAP_REQUIRED_FIELDS
} from '../src/world/runtimeMapContract.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();

equal(map.contract, RUNTIME_MAP_CONTRACT, 'runtime maps should identify the baked map contract');
for (const field of RUNTIME_MAP_REQUIRED_FIELDS) {
  assert(Object.hasOwn(map, field), `runtime map should expose required field: ${field}`);
}
for (const field of RUNTIME_MAP_AUTHORING_FIELDS) {
  equal(Object.hasOwn(map, field), false, `runtime map should not carry authoring field: ${field}`);
}
