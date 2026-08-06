import fs from 'node:fs';
import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { Faction } from '../src/constants/factions.js';
import { getComponent } from '../src/ecs/world.js';
import {
  AuthoredTransitionPhase,
  createAuthoredTransitionSequenceState,
  startAuthoredTransitionSequence,
  updateAuthoredTransitionSequence
} from '../src/game/authoredTransitionSequence.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildAuthoredTransitionSequenceProjection } from '../src/projection/authoredTransitionSequenceProjection.js';
import { WebGLAuthoredTransitionLayer } from '../src/render/backends/webgl/layers/WebGLAuthoredTransitionLayer.js';
import { normalizeRuntimeMap } from '../src/world/runtimeMapLoader.js';

const source = JSON.parse(fs.readFileSync(new URL('../data/maps/axiom-first-escape.runtime-map.json', import.meta.url), 'utf8'));
const map = normalizeRuntimeMap(source);
const game = createInitialGameState(map);
const scene = createAuthoredTransitionSequenceState();
const sequence = map.sceneSequences[0];

equal(map.transitions.escapeZone.departureSequenceId, sequence.id, 'escape transition should point at its authored departure sequence');
equal(sequence.actorTracks.length, 2, 'first smoke departure should name exactly two authored raiders');
for (const track of sequence.actorTracks) {
  equal(game.authoredEntities[track.actorId] ?? null, null, `reserved actor ${track.actorId} should have no pre-cue ECS binding`);
  assert(game.reservedTransitionActorPlacements[track.actorId], `reserved actor ${track.actorId} should retain an exact dormant authored placement`);
}
equal(game.actors.filter((actor) => sequence.actorTracks.some((track) => track.actorId === actor.authoredId)).length, 0, 'reserved sequence actors should not render before their cue');
equal(game.lights.filter((light) => sequence.actorTracks.some((track) => track.actorId === game.entityAuthoredIds[light.id])).length, 0, 'reserved sequence torches should not light the playable map before their cue');

const started = startAuthoredTransitionSequence({ scene, game, map, sequenceId: sequence.id });
assert(started.ok, 'authored departure should start when every exact actor is alive');
equal(scene.phase, AuthoredTransitionPhase.IMPACT, 'Mama landing should be the first outgoing-map phase');
equal(scene.diagnostics.resolvedActorIds.join(','), sequence.actorTracks.map((track) => track.actorId).join(','), 'runtime should report exact authored actor provenance');
for (const actor of scene.actorEntities) {
  equal(getComponent(game.world, actor.entity, ComponentType.Team).id, Faction.RAIDERS, 'scene start should reveal the reserved entity as a real raider');
}
syncGameViews(game);
equal(game.actors.filter((actor) => sequence.actorTracks.some((track) => track.actorId === actor.authoredId)).length, 2, 'scene cue should materialise exactly two authored raiders');

updateAuthoredTransitionSequence({ scene, game, realDt: sequence.phases[0].durationSeconds + 0.01 });
equal(scene.phase, AuthoredTransitionPhase.RAIDER_CHARGE, 'impact should hand off to authored raider movement');
updateAuthoredTransitionSequence({ scene, game, realDt: sequence.phases[1].durationSeconds * 0.5 });
const firstActor = scene.actorEntities[0];
const firstTransform = getComponent(game.world, firstActor.entity, ComponentType.Transform);
assert(firstTransform.y < firstActor.track.path[0].y && firstTransform.y > firstActor.track.path.at(-1).y, 'authored raider should charge north along its world-space path');
updateAuthoredTransitionSequence({ scene, game, realDt: sequence.phases[1].durationSeconds * 0.51 });
equal(scene.phase, AuthoredTransitionPhase.SMOKE_COVER, 'raider charge must complete before Mama uses smoke');
let projection = buildAuthoredTransitionSequenceProjection({ authoredTransitionSequence: scene });
equal(projection.actorTracks.length, 2, 'projection should expose real actor bindings rather than surrogate silhouettes');
equal(projection.landing.direction, 'north_to_south', 'impact debris should use the authored north-to-south direction');
equal(projection.landing.debris.length, 32, 'impact packet should preserve the authored debris count');

const layer = new WebGLAuthoredTransitionLayer();
updateAuthoredTransitionSequence({ scene, game, realDt: sequence.phases[2].durationSeconds * 0.7 });
projection = buildAuthoredTransitionSequenceProjection({ authoredTransitionSequence: scene });
layer.update({ authoredTransition: projection }, { camera: { viewportW: 1280, viewportH: 720 } });
assert(layer.status === 'active' && layer.smokeCoverage > 0.5, 'WebGL transition layer should visibly roll smoke south across the outgoing map');
const completion = updateAuthoredTransitionSequence({ scene, game, realDt: sequence.phases[2].durationSeconds * 0.3 });
assert(completion.handoffNow, 'runtime should publish its one-shot handoff only after authored smoke coverage reaches threshold');
equal(scene.phase, AuthoredTransitionPhase.COMPLETE, 'departure should complete at smoke-cover handoff');
assert(scene.smokeCoverage >= sequence.smoke.coverageThreshold, 'handoff may not precede the authored smoke coverage threshold');
projection = buildAuthoredTransitionSequenceProjection({ authoredTransitionSequence: scene });
layer.update({ authoredTransition: projection }, { camera: { viewportW: 1280, viewportH: 720 } });
assert(layer.rects.some((entry) => entry.color[3] > 0.78), 'the outgoing smoke layer should become substantially opaque before handoff');
equal(scene.diagnostics.handoffCount, 1, 'authored departure must hand off exactly once');

const broken = createAuthoredTransitionSequenceState();
const brokenGame = createInitialGameState(map);
delete brokenGame.reservedTransitionActorPlacements[sequence.actorTracks[0].actorId];
const failed = startAuthoredTransitionSequence({ scene: broken, game: brokenGame, map, sequenceId: sequence.id });
assert(!failed.ok && broken.failed, 'missing authored raiders should fail loudly instead of generating temporary actors');

equal(sequence.camera.zoom, 3.25, 'authored impact camera should tighten enough to hide the off-screen track starts');

console.log('authoredTransitionSequence.test.mjs passed');
