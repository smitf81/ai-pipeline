import test from 'node:test';
import assert from 'node:assert/strict';

import { createEntityStore } from '../src/entities/entityStore.js';
import { getFieldValue, recomputeFieldsFromWorld } from '../src/world/fields.js';
import {
  applyDirectorPhaseToFields,
  buildDirectorPressureFields,
  createDirectorState,
  tickDirectorPhase,
  triggerDirectorPhase
} from '../src/world/directorPhases.js';

function createWorld(width = 12, height = 8) {
  const map = {
    width,
    height,
    tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => 'grass'))
  };
  const store = createEntityStore();
  store.buildings.push({ id: 'anchor-1', type: 'relay', x: 2, y: 2, state: 'complete' });

  return {
    map,
    store,
    emergence: {
      frame: 0,
      director: createDirectorState(width, height)
    }
  };
}

test('director phase lifecycle expires and auto-triggers deterministically', () => {
  const world = createWorld();
  const phase = triggerDirectorPhase(world.emergence.director, world.map, 'blackout');
  assert.equal(phase.type, 'blackout');

  for (let i = 0; i < phase.durationFrames; i += 1) {
    tickDirectorPhase(world.emergence.director, world.map, i);
  }
  assert.equal(world.emergence.director.activePhase, null);

  world.emergence.director.cooldownFrames = 0;
  world.emergence.director.lastAutoTriggerFrame = -999;
  const auto = tickDirectorPhase(world.emergence.director, world.map, 500);
  assert.equal(auto.type, 'blackout');
});

test('each phase deforms fields or director pressure in a deterministic way', () => {
  const phases = ['blackout', 'stampede', 'siege_doctrine', 'collapse'];

  phases.forEach((phaseType, index) => {
    const world = createWorld();
    world.emergence.frame = 100 + index * 20;
    triggerDirectorPhase(world.emergence.director, world.map, phaseType);

    const base = recomputeFieldsFromWorld(world);
    const before = {
      cover: getFieldValue(base.cover, 2, 2),
      traversal: getFieldValue(base.traversal, 6, 4),
      visibility: getFieldValue(base.visibility, 6, 4)
    };

    applyDirectorPhaseToFields(base, world, world.emergence.frame);
    const pressure = buildDirectorPressureFields(base, world, world.emergence.frame);

    const after = {
      cover: getFieldValue(base.cover, 2, 2),
      traversal: getFieldValue(base.traversal, 6, 4),
      visibility: getFieldValue(base.visibility, 6, 4),
      defPressure: getFieldValue(pressure.defensibility, 6, 4),
      threatPressure: getFieldValue(pressure.threat, 6, 4)
    };

    assert.ok(
      after.cover !== before.cover
      || after.traversal !== before.traversal
      || after.visibility !== before.visibility
      || after.defPressure !== 0
      || after.threatPressure !== 0,
      `phase ${phaseType} should deform field or pressure values`
    );
  });
});
