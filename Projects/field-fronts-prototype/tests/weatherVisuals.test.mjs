import assert from 'node:assert/strict';
import { createBlankMap } from '../src/world/mapModel.js';
import { createField } from '../src/world/fields.js';
import {
  generateForkBoltGeometry,
  getStormCloudCells,
  sampleWeatherVisualCell,
  selectLightningEvents,
  selectStormRenderCells
} from '../src/rendering/weatherVisuals.js';

export function run() {
  const map = createBlankMap({ width: 18, height: 12, fill: 'land' });
  const fields = makeWeatherFields(map.width, map.height);

  fields.humidity.values[4][7] = 0.92;
  fields.uplift.values[4][7] = 0.88;
  fields.stormPotential.values[4][7] = 0.96;
  fields.cloudCover.values[4][7] = 0.94;
  fields.rainfall.values[4][7] = 0.72;
  fields.heat.values[4][7] = 0.36;

  const stormSample = sampleWeatherVisualCell(fields, 7, 4);
  const drySample = sampleWeatherVisualCell(fields, 1, 1);
  assert.ok(stormSample.cloudDensity > drySample.cloudDensity, 'storm cell should derive denser cloud visuals');
  assert.ok(stormSample.darkCore > drySample.darkCore, 'storm potential should create a darker cloud core');
  assert.ok(stormSample.charge > 0.78, 'storm/humidity/uplift should accumulate lightning charge');

  const cloudCells = getStormCloudCells(map, fields, { minCloud: 0.4 });
  assert.ok(cloudCells.some((cell) => cell.x === 7 && cell.y === 4), 'storm visual cells should include high cloud field cells');

  const renderCells = selectStormRenderCells(map, fields, {
    maxCells: 4,
    minCloud: 0.2,
    stride: 3
  });
  assert.ok(renderCells.length <= 4, 'storm render cells should cap expensive visual draws');
  assert.ok(renderCells.some((cell) => Math.abs(cell.x - 7) <= 2 && Math.abs(cell.y - 4) <= 2), 'storm render cells should preserve high-priority storm masses');
  assert.ok(renderCells.every((cell) => cell.stride >= 2), 'storm render cells should be coarser than individual map tiles');

  const lightning = selectLightningEvents(map, fields, {
    nowMs: 250,
    weatherPhase: 0,
    bucketMs: 1300,
    ttlMs: 420,
    maxEvents: 3,
    threshold: 0.72,
    seed: 'test-storm'
  });
  assert.ok(lightning.length >= 1, 'high charge storm cell should be eligible for lightning events');
  assert.ok(lightning[0].strength > 0.7, 'lightning event strength should preserve storm charge');

  const bolt = generateForkBoltGeometry({ x: 10, y: 0 }, { x: 18, y: 28 }, {
    seed: 42,
    segments: 8,
    forks: 4,
    jitter: 0.3
  });
  assert.equal(bolt.main.length, 9, 'main bolt should contain segment endpoints');
  assert.equal(bolt.forks.length, 4, 'fork bolt generation should honour requested branch count');
  assert.ok(bolt.forks.every((fork) => fork.points.length === 3), 'each fork should be drawable as a short branch path');
}

function makeWeatherFields(width, height) {
  return {
    heat: createField(width, height, 0.48),
    humidity: createField(width, height, 0.22),
    uplift: createField(width, height, 0.12),
    stormPotential: createField(width, height, 0.08),
    cloudCover: createField(width, height, 0.1),
    rainfall: createField(width, height, 0.04)
  };
}
