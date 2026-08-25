import { CONFIG } from '../config.js';
import { AbilityId } from '../constants/abilityIds.js';
import { SMOKE_AWAKENING } from '../data/smokeAwakening.js';
import { getInstinctIdsForArrivalSequence } from '../data/instincts.js';
import { createDebugSnapshot } from '../debug/snapshot.js';
import { validateWorldState } from '../debug/validation.js';
import { createCamera } from '../render/camera.js';
import { refreshCreatureRigForTuning } from '../tuning/tuningRuntime.js';
import { createAuthoredTransitionSequenceState } from './authoredTransitionSequence.js';
import {
  applyFirstPlaythroughInstinctAvailability,
  canUseAbility,
  captureRunAbilityProgression
} from './playerAbilities.js';
import { captureAbilityProgressionInProfile } from './playerProfile.js';
import { createInitialGameState, getDragon } from './state.js';
import { createSmokeAwakeningState } from './smokeAwakening.js';
import { resetTutorialRuntimeForGame } from './tutorialRuntime.js';

export function applyLoadedRuntimeMapTransition({
  state,
  canvas,
  result,
  request,
  persistPlayerProfile,
  snapCameraToDragon
}) {
  const previousLoad = state.runtimeMapLoad;
  const creatureTuning = state.game.creatureTuning;
  const runAbilityProgression = captureRunAbilityProgression(state.game.world, state.game.dragonId);
  state.map = result.map;
  state.runtimeMapSource = result.load.path;
  state.runtimeMapLoad = Object.freeze({
    ...result.load,
    transition: Object.freeze({
      reason: request.reason,
      fromMapId: previousLoad.mapId,
      fromPath: previousLoad.path,
      arrivalSequenceId: request.arrivalSequenceId ?? null,
      label: request.label
    })
  });
  state.camera = createCamera(canvas, result.map);
  state.game = createInitialGameState(result.map, {
    creatureTuning,
    playerProfile: state.playerProfile,
    runAbilityProgression
  });
  const availability = applyFirstPlaythroughInstinctAvailability(
    state.game.world,
    state.game.dragonId,
    result.map.firstPlaythrough?.availableInstinctIds,
    {
      enabled: state.playerProfile.runs.newGamePlusCount === 0,
      deferredInstinctIds: getInstinctIdsForArrivalSequence(request.arrivalSequenceId),
      source: `first_playthrough_region:${result.map.id}`
    }
  );
  if (availability.applied) {
    state.playerProfile = captureAbilityProgressionInProfile(state.game.world, state.game.dragonId, state.playerProfile);
    persistPlayerProfile();
  }
  state.authoredTransitionSequence = createAuthoredTransitionSequenceState();
  state.game.message = `Entered ${result.map.title}.`;
  state.time = 0;
  state.diagnostics.architecture = state.game.architecture;
  state.diagnostics.validation = validateWorldState(state.game.world);
  state.diagnostics.snapshot = createDebugSnapshot(state.game);
  resetTutorialRuntimeForGame(state.tutorial, state);
  const dragon = getDragon(state.game);
  const smokeAwakeningRequested = request.arrivalSequenceId === SMOKE_AWAKENING.arrivalSequenceId;
  state.smokeAwakening = createSmokeAwakeningState({
    enabled: smokeAwakeningRequested && !canUseAbility(state.game.world, state.game.dragonId, AbilityId.SMOKE_BURST),
    startPhase: 'blackout_hold',
    source: request.arrivalSequenceId ?? 'not_requested',
    fromMapId: previousLoad.mapId,
    mapId: result.map.id,
    worldX: (dragon?.x ?? 0) * CONFIG.tileSize,
    worldY: (dragon?.y ?? 0) * CONFIG.tileSize,
    rotation: dragon?.rotation ?? 0
  });
  snapCameraToDragon(state);
  refreshCreatureRigForTuning(state);
  console.info(`[BSB map] transition ${previousLoad.path} -> ${result.load.path} via escape zone`);
}
