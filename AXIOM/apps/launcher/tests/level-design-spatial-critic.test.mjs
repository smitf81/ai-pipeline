import assert from 'node:assert/strict';
import {
  deriveTargetedStrokeCenters,
  evaluateMapForgeSpatialQuality,
  MAP_FORGE_SPATIAL_SCORECARD_CONTRACT,
  normalizeMapForgeSpatialScorecard,
  observeAuthoredRoute
} from '../public/level-design-spatial-critic.js';

const goodDocument = makeDocument({
  width: 64,
  height: 42,
  revision: 18,
  waypoints: [
    { x: 4, y: 36 }, { x: 15, y: 36 }, { x: 15, y: 29 }, { x: 27, y: 29 },
    { x: 27, y: 22 }, { x: 39, y: 22 }, { x: 39, y: 14 }, { x: 51, y: 14 },
    { x: 51, y: 6 }, { x: 59, y: 6 }
  ]
});
const goodRoute = observeAuthoredRoute(goodDocument).points;
const placements = [
  ['tree', .05], ['undergrowth', .16],
  ['tree', .30], ['geology', .46],
  ['undergrowth', .60], ['geology', .76],
  ['tree', .88], ['undergrowth', .97]
].map(([family, fraction], index) => makePlacement(goodRoute, family, fraction, index));
goodDocument.sceneObjects = placements;
const goodSession = makeSession(placements, 8);
const goodScorecard = evaluateMapForgeSpatialQuality(goodSession, goodDocument);
assert.equal(goodScorecard.contract, MAP_FORGE_SPATIAL_SCORECARD_CONTRACT);
assert.equal(goodScorecard.integrityGate.pass, true);
assert.equal(goodScorecard.designGate.routeQuality.pass, true);
assert.equal(goodScorecard.designGate.zones.every(zone => zone.pass), true);
assert.equal(goodScorecard.designGate.pass, true);
assert.equal(goodScorecard.criteriaMet, true);
assert.equal(goodScorecard.nextAction.kind, 'complete');

const screenshotDocument = makeDocument({
  width: 146,
  height: 104,
  revision: 229,
  waypoints: [
    { x: 4, y: 99 }, { x: 141, y: 99 }, { x: 141, y: 92 }, { x: 4, y: 92 },
    { x: 4, y: 85 }, { x: 141, y: 85 }, { x: 141, y: 78 }, { x: 4, y: 78 },
    { x: 4, y: 71 }, { x: 141, y: 71 }, { x: 141, y: 64 }, { x: 4, y: 64 },
    { x: 4, y: 57 }, { x: 32, y: 57 }
  ]
});
const screenshotRoute = observeAuthoredRoute(screenshotDocument).points;
const screenshotPlacements = Array.from({ length: 35 }, (_, index) => {
  const family = ['tree', 'undergrowth', 'geology'][index % 3];
  return makePlacement(screenshotRoute, family, .80 + (index % 7) * .004, index);
});
screenshotDocument.sceneObjects = screenshotPlacements;
const screenshotScorecard = evaluateMapForgeSpatialQuality(makeSession(screenshotPlacements, 12, 0), screenshotDocument);
assert.equal(screenshotScorecard.integrityGate.pass, true);
assert.equal(screenshotScorecard.designGate.pass, false);
assert.equal(screenshotScorecard.designGate.routeQuality.blocking, true);
assert.equal(screenshotScorecard.nextAction.kind, 'route_revision_required');
assert.equal(screenshotScorecard.criteriaMet, false);
assert.ok(screenshotScorecard.designGate.reasons.some(item => item.code === 'route_lawnmower_repetition'));
assert.ok(screenshotScorecard.designGate.reasons.some(item => item.code === 'untreated_route_span'));

assert.throws(() => normalizeMapForgeSpatialScorecard({ ...screenshotScorecard, criteriaMet: true }, 229), /gate_mismatch/);

const targeted = deriveTargetedStrokeCenters(goodDocument, { targetStartFraction: .24, targetEndFraction: .55 }, [
  { x: 5, y: 36, marker: 'early' },
  { x: 27, y: 29, marker: 'middle' },
  { x: 58, y: 6, marker: 'late' }
]);
assert.deepEqual(targeted.map(item => item.marker), ['middle']);

console.log('level-design-spatial-critic.test.mjs: ok');

function makeDocument({ width, height, revision, waypoints }) {
  const tiles = Array.from({ length: height }, () => Array.from({ length: width }, () => 'grass'));
  const route = expand(waypoints);
  for (const point of route) tiles[point.y][point.x] = 'dirt';
  const beats = [
    { id: 'beat_arrival', kind: 'arrival', label: 'Read the route', atFraction: .08 },
    { id: 'beat_encounter', kind: 'encounter', label: 'First pressure', atFraction: .38 },
    { id: 'beat_climax', kind: 'climax', label: 'Threshold fight', atFraction: .72 },
    { id: 'beat_exit', kind: 'exit', label: 'Reach the gate', atFraction: .94 }
  ].map(beat => ({
    ...beat,
    routeIndex: Math.round(beat.atFraction * (route.length - 1)),
    tile: route[Math.round(beat.atFraction * (route.length - 1))]
  }));
  return {
    mapId: 'critic_fixture', revision, width, height, tiles, sceneObjects: [], unitPlacements: [], unitSpawners: [],
    playableSpace: {
      contract: 'axiom.playable-space-brief.v1', classification: 'authoring_design_metadata', preflightId: 'critic_preflight',
      requestedMinutes: 10, biome: 'forest', dimensions: { before: { width, height }, target: { width, height }, source: 'test' },
      estimate: {}, route: { from: 'arrival', to: 'exit', targetLengthTiles: route.length, authoredLengthTiles: route.length, widthTiles: 3, rowSpacingTiles: 7, waypoints },
      boundaries: {
        contract: 'axiom.playable-boundary-intent.v1',
        shortcutPolicy: 'open',
        boundaryStyle: 'mixed_natural',
        enforcementStatus: 'not_required'
      },
      pacingBeats: beats, preparedAt: '2026-08-17T00:00:00.000Z'
    }
  };
}

function makePlacement(route, family, fraction, index) {
  const routeIndex = Math.round(fraction * (route.length - 1));
  const point = route[routeIndex];
  const previous = route[Math.max(0, routeIndex - 1)];
  const next = route[Math.min(route.length - 1, routeIndex + 1)];
  const horizontal = Math.abs(next.x - previous.x) >= Math.abs(next.y - previous.y);
  const record = {
    id: `${family}:${index}`,
    type: family === 'tree' ? 'tree' : family === 'undergrowth' ? 'forest_shrub' : 'boulder',
    x: point.x + (horizontal ? 0 : 4),
    y: point.y + (horizontal ? 4 : 0)
  };
  record[family] = {};
  return record;
}

function makeSession(records, minimumCreated, minimumPathClearanceTiles = 1.5) {
  const byFamily = Object.groupBy(records, record => record.tree ? 'tree' : record.undergrowth ? 'undergrowth' : 'geology');
  return {
    successCriteria: { minimumCreated, minimumPathClearanceTiles },
    batches: Object.entries(byFamily).map(([family, familyRecords]) => ({
      family,
      receipt: { createdIds: familyRecords.map(record => record.id), createdCount: familyRecords.length }
    }))
  };
}

function expand(waypoints) {
  const points = [{ ...waypoints[0] }];
  for (const target of waypoints.slice(1)) {
    let current = points.at(-1);
    while (current.x !== target.x) {
      current = { x: current.x + Math.sign(target.x - current.x), y: current.y };
      points.push(current);
    }
    while (current.y !== target.y) {
      current = { x: current.x, y: current.y + Math.sign(target.y - current.y) };
      points.push(current);
    }
  }
  return points;
}
