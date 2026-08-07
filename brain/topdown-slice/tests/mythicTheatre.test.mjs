import test from 'node:test';
import assert from 'node:assert/strict';

import { createField, setFieldValue } from '../src/world/fields.js';
import {
  createMythicTheatreState,
  deriveDominantRegion,
  registerBattlefieldWhisper,
  registerImpactMoment,
  tickMythicTheatre
} from '../src/world/mythicTheatre.js';

test('mythic theatre whispers and impacts decay deterministically', () => {
  const theatre = createMythicTheatreState();
  registerBattlefieldWhisper(theatre, { text: 'A breach opens…', ttlFrames: 3, frame: 10 });
  registerImpactMoment(theatre, { type: 'breach', x: 4, y: 5, ttlFrames: 2, frame: 10 });

  assert.equal(theatre.whispers.length, 1);
  assert.equal(theatre.impacts.length, 1);

  tickMythicTheatre(theatre);
  assert.equal(theatre.whispers[0].remainingFrames, 2);
  assert.equal(theatre.impacts[0].remainingFrames, 1);

  tickMythicTheatre(theatre);
  tickMythicTheatre(theatre);
  assert.equal(theatre.whispers.length, 0);
  assert.equal(theatre.impacts.length, 0);
});

test('dominant region detection identifies strongest pressure mood', () => {
  const threat = createField(6, 6, 0);
  const defensibility = createField(6, 6, 0);
  const flow = createField(6, 6, 0);

  setFieldValue(threat, 4, 3, 0.8);
  setFieldValue(defensibility, 4, 3, 0.15);
  setFieldValue(flow, 4, 3, 0.35);

  const region = deriveDominantRegion({
    emergence: {
      pressures: { threat, defensibility, flow }
    }
  });

  assert.ok(region);
  assert.deepEqual({ x: region.x, y: region.y }, { x: 4, y: 3 });
  assert.equal(region.mood, 'violent');
  assert.match(region.signature, /^4,3:violent:/);
});
