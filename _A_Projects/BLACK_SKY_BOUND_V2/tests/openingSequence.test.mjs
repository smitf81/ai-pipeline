import { assert, equal } from './assert.mjs';
import { createOpeningSequenceState, updateOpeningSequence } from '../src/game/openingSequence.js';
import {
  OPENING_CRACK_SEGMENTS,
  OPENING_SEQUENCE,
  OPENING_SHELL_FRAGMENTS,
  OPENING_WORLD_SHELL_PIECES,
  OpeningSoundscapeCueId,
  OpeningSequencePhase
} from '../src/data/openingSequence.js';
import { buildOpeningSequenceProjection } from '../src/projection/openingSequenceProjection.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createDemoMap } from '../src/world/map.js';
import { buildWebGLOpeningEggDepthItems } from '../src/render/backends/webgl/WebGLOpeningEggGeometry.js';

const opening = createOpeningSequenceState({
  eggMapId: 'first_flightless_night',
  eggTileX: 40.5,
  eggTileY: 53.5,
  eggWorldX: 1296,
  eggWorldY: 1712,
  tileSize: 32
});
const input = createInputHarness();
updateOpeningSequence({ opening, input, realDt: 0.6 });
equal(opening.phase, OpeningSequencePhase.INSIDE_EGG, 'opening should begin inside the egg');
equal(opening.promptVisible, false, 'Move prompt should wait for the restrained reveal delay');
tap(input, 'w', () => updateOpeningSequence({ opening, input, realDt: 0.01 }));
equal(opening.acceptedInputCount, 0, 'input before prompt reveal must not crack the shell');

updateOpeningSequence({ opening, input, realDt: 0.31 });
equal(opening.promptVisible, true, 'Move prompt should appear after the bounded delay');
tap(input, 'w', () => updateOpeningSequence({ opening, input, realDt: 0.01 }));
equal(opening.acceptedInputCount, 1, 'first deliberate movement edge should rock the egg');
equal(opening.crackStage, 1, 'first accepted edge should expose the first crack stage');
equal(opening.audio.cueId, 'opening.egg.rock', 'first edge should publish the rock cue through canonical opening audio state');
assert(opening.movementPulse > 0.9 && opening.lightPulse > 0.9, 'accepted movement should publish movement and light impulses');
updateOpeningSequence({ opening, input, realDt: OPENING_SEQUENCE.timing.inputCooldownSeconds + 0.1 });
equal(opening.acceptedInputCount, 1, 'held or unpressed input must not skip crack stages after cooldown');
assert(
  opening.audio.events.some((event) => event.cueId === OpeningSoundscapeCueId.THUNDER_THROUGH_SHELL),
  'first opened light path should be followed by a deeply muffled storm answer after audio unlock'
);

const movementKeys = ['a', 'd', 's', 'w', 'd'];
for (let index = 0; index < movementKeys.length; index += 1) {
  updateOpeningSequence({ opening, input, realDt: OPENING_SEQUENCE.timing.inputCooldownSeconds + 0.01 });
  tap(input, movementKeys[index], () => updateOpeningSequence({ opening, input, realDt: 0.01 }));
  equal(opening.acceptedInputCount, index + 2, `movement edge ${index + 2} should advance one crack stage`);
}
equal(opening.phase, OpeningSequencePhase.OPENING, 'sixth movement edge should begin the authored shell-opening beat');
equal(opening.audio.cueId, 'opening.egg.break', 'final edge should publish the shell break cue');
equal(opening.movementHistory.length, 6, 'bounded movement history should preserve all six authored struggle directions');
assert(opening.movementHistory.every((entry) => Number.isFinite(entry.atRealSeconds)), 'movement history should timestamp authored sound anchors');
assert(
  opening.audio.events.some((event) => event.cueId === OpeningSoundscapeCueId.HUSK_THROUGH_SHELL)
    && opening.audio.events.some((event) => event.cueId === OpeningSoundscapeCueId.WEREWOLF_THROUGH_SHELL),
  'inside-shell struggle should expose distinct muffled husk and werewolf voices'
);

updateOpeningSequence({ opening, input, realDt: OPENING_SEQUENCE.timing.openingSeconds * 0.55 });
assert(opening.openingProgress > 0.5 && opening.phase === OpeningSequencePhase.OPENING, 'shell opening should remain visible for a substantial beat');
assert(
  opening.audio.events.some((event) => event.cueId === OpeningSoundscapeCueId.RAIDER_THROUGH_SHELL)
    && opening.audio.events.some((event) => event.cueId === OpeningSoundscapeCueId.MAMA_ROAR),
  'shell opening should reveal the raider alarm before Mama answers through the widening crown'
);
updateOpeningSequence({ opening, input, realDt: OPENING_SEQUENCE.timing.openingSeconds });
equal(opening.phase, OpeningSequencePhase.EMERGING, 'shell opening should hand off to body emergence');
assert(opening.emergenceProgress > 0, 'large deterministic steps should carry overflow into emergence');
updateOpeningSequence({ opening, input, realDt: OPENING_SEQUENCE.timing.emergenceSeconds * 0.45 });
assert(opening.emergenceProgress > 0.5 && opening.egressProgress > 0, 'emergence should progressively move the hatchling beyond the egg anchor');
equal(opening.audio.events.filter((event) => event.cueId === OpeningSoundscapeCueId.HUSK_THROUGH_SHELL).length, 1, 'the trapped husk beat should use one opening-only shell derivative');
equal(opening.audio.events.filter((event) => event.cueId === OpeningSoundscapeCueId.HUSK_GARGLE).length, 1, 'the exposed husk beat should return as the reusable normal gameplay cue');
updateOpeningSequence({
  opening,
  input,
  realDt: OPENING_SEQUENCE.timing.emergenceSeconds - opening.phaseElapsedReal + 0.2
});
equal(opening.phase, OpeningSequencePhase.SETTLING, 'completed emergence should enter a recovery beat before control');
assert(opening.settleProgress > 0, 'overflow should carry into the settling phase');
updateOpeningSequence({ opening, input, realDt: OPENING_SEQUENCE.timing.settlingSeconds });
equal(opening.phase, OpeningSequencePhase.RELEASED, 'bounded settling should release normal gameplay');
equal(opening.released, true, 'opening state should explicitly mark release');
equal(opening.diagnostics.releaseCount, 1, 'release should happen exactly once');
assert(opening.releasedAtRealSeconds > 12, 'v2 opening should be materially longer than the first proof');

const reducedState = {
  map: { id: 'first_flightless_night' },
  opening: createOpeningSequenceState({
    eggMapId: 'first_flightless_night',
    eggWorldX: 1296,
    eggWorldY: 1712
  }),
  playerProfile: { settings: { reducedMotion: true } }
};
reducedState.opening.promptVisible = true;
reducedState.opening.phase = OpeningSequencePhase.CRACKING;
reducedState.opening.crackStage = 4;
reducedState.opening.acceptedInputCount = 4;
reducedState.opening.strainProgress = 4 / 6;
reducedState.opening.movementPulse = 1;
const projection = buildOpeningSequenceProjection(reducedState);
equal(projection.prompt.title, 'MOVE', 'opening prompt should come from the canonical movement action');
assert(projection.prompt.bindings.includes('W'), 'opening projection should carry canonical movement binding evidence');
equal(projection.settings.reducedMotion, true, 'opening projection should preserve reduced-motion preference');
assert(projection.cracks.length >= 20, 'stage four should expose a dense deterministic branching crack network');
assert(projection.lightRays.length >= 7, 'stage four should expose multiple widening light paths');
equal(projection.camera.impulseWorldX, 0, 'reduced motion should suppress directional camera impulse');

reducedState.opening.phase = OpeningSequencePhase.OPENING;
reducedState.opening.openingProgress = 0.6;
reducedState.opening.crackStage = 6;
const openingProjection = buildOpeningSequenceProjection(reducedState);
assert(openingProjection.egg.visible && openingProjection.egg.revealOpacity > 0.5, 'opening phase should reveal a real world-space egg');
equal(openingProjection.egg.shellPieceCount, OPENING_WORLD_SHELL_PIECES.length, 'egg projection should preserve every irregular world shell piece');
equal(openingProjection.shellFragments.length, OPENING_SHELL_FRAGMENTS.length, 'shell crown break should emit all varied transition fragments');
assert(new Set(OPENING_SHELL_FRAGMENTS.map((fragment) => fragment.shape.length)).size > 1, 'detached fragments should vary in polygon silhouette');
assert(new Set(OPENING_SHELL_FRAGMENTS.map((fragment) => fragment.size)).size > 8, 'detached fragments should vary materially in size');
equal(OPENING_CRACK_SEGMENTS.length, 33, 'crack network should remain deterministic and bounded');
const eggDepth = buildWebGLOpeningEggDepthItems(
  { opening: openingProjection },
  { camera: { visibleWorldBounds: () => ({ left: 0, top: 0, right: 3000, bottom: 3000 }) } }
);
equal(eggDepth.items.length, 2, 'physical egg should produce separate back and foreground depth items');
assert(eggDepth.items[0].depthY < eggDepth.items[1].depthY, 'egg depth halves should bracket the player actor');
assert(eggDepth.primitiveCount > 100, 'physical egg should carry enough bounded geometry to read as a shell rather than a marker');

reducedState.map.id = 'ash_road_threshold';
equal(buildOpeningSequenceProjection(reducedState).egg.visible, false, 'persistent egg remains should stay scoped to their authored map');

const game = createInitialGameState(createDemoMap());
const poseState = {
  opening: createOpeningSequenceState(),
  game
};
poseState.opening.promptVisible = true;
wyvernProjectionSystem({ state: poseState, game, dt: 1 / 60 });
syncGameViews(game);
let player = game.actors.find((actor) => actor.id === game.dragonId);
assert(player.wyvernProjection.proceduralPose.openingState?.curl01 > 0.9, 'inside-egg pose should tightly curl the canonical hatchling rig');
assert(player.wyvernProjection.proceduralPose.bodyOffsets.tailTip.right < -0.8, 'inside-egg pose should visibly coil the long tail back around the body');

poseState.opening.phase = OpeningSequencePhase.OPENING;
poseState.opening.openingProgress = 0.72;
wyvernProjectionSystem({ state: poseState, game, dt: 1 / 60 });
syncGameViews(game);
player = game.actors.find((actor) => actor.id === game.dragonId);
assert(player.wyvernProjection.proceduralPose.openingState.crownLift01 > 0.5, 'shell-opening pose should begin lifting the head before the crawl-out');

poseState.opening.phase = OpeningSequencePhase.EMERGING;
poseState.opening.emergenceProgress = 0.16;
wyvernProjectionSystem({ state: poseState, game, dt: 1 / 60 });
syncGameViews(game);
player = game.actors.find((actor) => actor.id === game.dragonId);
let emergencePose = player.wyvernProjection.proceduralPose;
assert(emergencePose.openingState.neckOut01 > 0.4, 'neck should follow the head during the first emergence beat');
assert(
  emergencePose.constraintState.effectiveNeckHeadSeparation <= 0.26,
  'early emergence should keep the head and neck visually connected under the opening-specific anatomical limit'
);

poseState.opening.emergenceProgress = 0.72;
wyvernProjectionSystem({ state: poseState, game, dt: 1 / 60 });
syncGameViews(game);
player = game.actors.find((actor) => actor.id === game.dragonId);
emergencePose = player.wyvernProjection.proceduralPose;
assert(emergencePose.openingState.torsoOut01 > 0.8, 'emergence should progress anatomically through the torso');
assert(emergencePose.openingState.hindOut01 > 0, 'late emergence should begin drawing hips and hind legs free');

poseState.opening.phase = OpeningSequencePhase.SETTLING;
poseState.opening.settleProgress = 0.32;
wyvernProjectionSystem({ state: poseState, game, dt: 1 / 60 });
syncGameViews(game);
player = game.actors.find((actor) => actor.id === game.dragonId);
assert(player.wyvernProjection.proceduralPose.openingState.brace01 > 0, 'settling pose should visibly brace before control is released');

function createInputHarness() {
  const down = new Set();
  const pressed = new Set();
  return {
    isDown: (key) => down.has(key),
    wasPressed: (key) => pressed.has(key),
    press(key) {
      down.add(key);
      pressed.add(key);
    },
    release(key) {
      down.delete(key);
    },
    afterUpdate() {
      pressed.clear();
    }
  };
}

function tap(input, key, action) {
  input.press(key);
  action();
  input.afterUpdate();
  input.release(key);
}
