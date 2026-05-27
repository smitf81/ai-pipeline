import assert from 'node:assert/strict';
import { createBlankMap, setTile } from '../src/world/mapModel.js';
import {
  buildContourPaths,
  buildLandWaterContourProjection,
  buildLandWaterScalarField,
  marchingSquaresSegments,
  smoothContourPath
} from '../src/rendering/marchingSquares.js';

export function run() {
  const water = createBlankMap({ width: 4, height: 4, fill: 'sea' });
  assert.equal(buildLandWaterContourProjection(water).segments.length, 0);

  const land = createBlankMap({ width: 4, height: 4, fill: 'land' });
  assert.equal(buildLandWaterContourProjection(land).segments.length, 0);

  const island = createBlankMap({ width: 3, height: 3, fill: 'sea' });
  setTile(island, 1, 1, 'land');
  const islandProjection = buildLandWaterContourProjection(island, { smoothIterations: 0 });
  assert.equal(islandProjection.segments.length, 4);
  assert.equal(islandProjection.paths.length, 1);
  assert.ok(isClosed(islandProjection.paths[0]), 'single land tile should produce a closed contour path');

  const diagonal = createBlankMap({ width: 2, height: 2, fill: 'sea' });
  setTile(diagonal, 0, 0, 'land');
  setTile(diagonal, 1, 1, 'land');
  const diagonalSegments = marchingSquaresSegments(buildLandWaterScalarField(diagonal), 0.5);
  assert.equal(diagonalSegments.length, 2, 'diagonal saddle should resolve deterministically into two segments');
  assert.deepEqual(
    [...new Set(diagonalSegments.map((segment) => segment.caseIndex))],
    [5]
  );

  const coast = createBlankMap({ width: 5, height: 3, fill: 'sea' });
  for (let x = 0; x < coast.width; x += 1) {
    setTile(coast, x, 1, 'land');
    setTile(coast, x, 2, 'land');
  }
  const coastProjection = buildLandWaterContourProjection(coast, { smoothIterations: 0 });
  assert.equal(coastProjection.paths.length, 1);
  assert.ok(coastProjection.paths[0].length >= 5, 'straight coastline should be collected into one connected path');

  const first = JSON.stringify(buildLandWaterContourProjection(coast, { smoothIterations: 1 }).smoothedPaths);
  const second = JSON.stringify(buildLandWaterContourProjection(coast, { smoothIterations: 1 }).smoothedPaths);
  assert.equal(first, second, 'marching-squares output must be deterministic');

  const smoothed = smoothContourPath(islandProjection.paths[0], 2);
  assert.ok(smoothed.length > islandProjection.paths[0].length);
  assert.ok(isClosed(smoothed), 'smoothing should preserve closed loops');

  const emptyFieldSegments = marchingSquaresSegments({ width: 0, height: 0, values: [] });
  assert.deepEqual(emptyFieldSegments, []);
}

function isClosed(path) {
  const first = path[0];
  const last = path[path.length - 1];
  return Math.abs(first.x - last.x) <= 0.001 && Math.abs(first.y - last.y) <= 0.001;
}
