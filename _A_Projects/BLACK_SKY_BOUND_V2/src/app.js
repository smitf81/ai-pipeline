import { CONFIG } from './config.js';
import { ComponentType } from './constants/componentTypes.js';
import { createFixedStepLoop } from './core/loop.js';
import { createInput } from './core/input.js';
import { getComponent } from './ecs/world.js';
import { createAudioDirector } from './audio/audioDirector.js';
import { createSmokeAwakeningAudioBridge } from './audio/smokeAwakeningAudioBridge.js';
import { createDemoMap, buildAllBlobMasks } from './world/map.js';
import { clampCameraToMap, createCamera, updateCameraForAction } from './render/camera.js';
import { createRenderer } from './render/renderer.js';
import { createInitialGameState, getDragon, updateActionSystems } from './game/state.js';
import { ScenarioPhase } from './constants/scenarioPhases.js';
import { TerrainType } from './world/terrain.js';
import { paintTerrainBlob } from './terrain/blobRules.js';
import { createDebugSnapshot } from './debug/snapshot.js';
import { renderGameToText } from './debug/runtimeText.js';
import { validateWorldState } from './debug/validation.js';
import { createPerformanceDiagnostics } from './debug/performance.js';
import { applyPauseInput, applyPauseMenuInput, createPauseMenuState } from './game/pause.js';
import { setCreatureTuningValue } from './data/creatures/creatureTuning.js';
import { loadCreatureTuningFromServer, saveCreatureTuningToServer } from './tuning/creatureTuningClient.js';
import { createCreatureTuningOverlay } from './tuning/tuningOverlay.js';
import {
  applyTuningInput,
  applyTuningSelectionInput,
  createTuningState,
  refreshCreatureRigForTuning,
  syncTuningSummary
} from './tuning/tuningRuntime.js';
import {
  createProgrammaticRuntimeMapLoad,
  loadRuntimeMapTransition,
  loadStandaloneRuntimeMap,
  logRuntimeMapLoad
} from './world/runtimeMapBootstrap.js';
import { applyWorldEventDebugQuery, createWorldEventAudioBridge, createWorldEventDebugControls } from './game/worldEventControls.js';
import {
  captureAbilityProgressionInProfile,
  createPlayerProfileStore,
  normalizePlayerProfile
} from './game/playerProfile.js';
import {
  advanceGameTime,
  createGameTimeState,
  releaseGameTimeScale
} from './game/gameTime.js';
import {
  createTutorialRuntime,
  requestTutorialCue,
  resetTutorialRuntimeForGame,
  temporarilyDismissActiveTutorialCue,
  updateTutorialRuntime
} from './game/tutorialRuntime.js';
import { TutorialCueId, TUTORIAL_TUNING } from './data/tutorialCues.js';
import { SMOKE_AWAKENING } from './data/smokeAwakening.js';
import {
  createOpeningSequenceState,
  isOpeningSequenceBlockingGameplay,
  updateOpeningSequence
} from './game/openingSequence.js';
import { wyvernProjectionSystem } from './systems/wyvernProjectionSystem.js';
import { syncGameViews } from './game/selectors.js';
import { buildOpeningSequenceProjection } from './projection/openingSequenceProjection.js';
import { buildSmokeAwakeningProjection } from './projection/smokeAwakeningProjection.js';
import {
  createSmokeAwakeningState,
  isSmokeAwakeningBlockingGameplay,
  updateSmokeAwakening
} from './game/smokeAwakening.js';
import { AbilityId } from './constants/abilityIds.js';
import { AbilityUnlockEventId } from './data/abilityUnlockEvents.js';
import { applyAbilityUnlockEvent, canUseAbility } from './game/playerAbilities.js';
import { emitRadialSmokeBurst } from './systems/smokeSystem.js';

export function createApp(canvas, options = {}) {
  const map = options.map ?? createDemoMap();
  const profileStore = options.playerProfileStore ?? createPlayerProfileStore(
    options.profileStorage ?? globalThis.localStorage,
    options.profileStorageKey
  );
  const profileOptions = { reducedMotion: detectReducedMotion() };
  const playerProfile = options.playerProfile
    ? normalizePlayerProfile(options.playerProfile, profileOptions)
    : profileStore.load(profileOptions);
  const game = createInitialGameState(map, { creatureTuning: options.creatureTuning, playerProfile });
  const openingDragon = getDragon(game);
  const audio = options.audioDirector ?? createAudioDirector({
    enabled: options.audioEnabled !== false,
    ...(Object.hasOwn(options, 'audioContext') ? { context: options.audioContext } : {})
  });
  const state = {
    time: 0,
    realTime: 0,
    map,
    runtimeMapSource: options.runtimeMapLoad?.path ?? options.runtimeMapSource ?? 'built_in_demo',
    runtimeMapLoad: options.runtimeMapLoad ?? createProgrammaticRuntimeMapLoad(map, options.runtimeMapSource),
    camera: createCamera(canvas, map),
    game,
    paused: false,
    pauseMenu: createPauseMenuState(),
    playerProfile,
    gameTime: createGameTimeState(),
    tutorial: createTutorialRuntime(),
    opening: createOpeningSequenceState({
      enabled: options.openingEnabled !== false,
      source: options.openingSource,
      eggMapId: map.id,
      eggTileX: openingDragon?.x,
      eggTileY: openingDragon?.y,
      eggWorldX: (openingDragon?.x ?? 0) * CONFIG.tileSize,
      eggWorldY: (openingDragon?.y ?? 0) * CONFIG.tileSize,
      eggRotation: openingDragon?.rotation ?? 0,
      eggExitAngle: (openingDragon?.rotation ?? 0) - Math.PI / 7.2,
      tileSize: CONFIG.tileSize
    }),
    smokeAwakening: createSmokeAwakeningState(),
    diagnostics: {
      frame: 0,
      performance: createPerformanceDiagnostics(),
      architecture: game.architecture,
      activeModel: 'entity_component_system',
      validation: validateWorldState(game.world),
      snapshot: createDebugSnapshot(game)
    },
    tuning: createTuningState()
  };
  state.audio = audio.getDebugState();
  state.tuning.source = options.tuningSource ?? 'not_loaded';
  state.tuning.saveStatus = options.tuningLoadStatus ?? 'idle';
  state.tuning.saveError = options.tuningLoadError ?? null;
  const input = createInput(canvas);
  const renderer = createRenderer(canvas, CONFIG);
  const worldEvents = createWorldEventDebugControls(state);
  const worldEventAudio = createWorldEventAudioBridge(audio);
  const smokeAwakeningAudio = createSmokeAwakeningAudioBridge(audio);
  audio.attachUnlockTarget(canvas);
  let saveTimer = null;
  let saveSequence = 0;
  let transitionLoad = null;
  if (isOpeningSequenceBlockingGameplay(state.opening)) snapCameraToDragon(state);

  function persistPlayerProfile(profile = state.playerProfile) {
    state.playerProfile = profileStore.save(profile);
    return state.playerProfile;
  }

  const overlay = createCreatureTuningOverlay({
    state,
    onChange(path, value) {
      const profileId = state.tuning.selectedProfileId;
      if (!profileId) return;
      const result = setCreatureTuningValue(state.game.creatureTuning, profileId, path, value);
      if (!result.ok) {
        state.tuning.saveStatus = 'error';
        state.tuning.saveError = result.reason;
        return;
      }
      state.game.creatureTuning = result.tuning;
      state.tuning.saveStatus = 'saving';
      state.tuning.saveError = null;
      refreshCreatureRigForTuning(state);
      scheduleTuningSave();
      overlay.update();
    }
  });

  refreshCreatureRigForTuning(state);

  function update(dt) {
    state.realTime += dt;
    applyTuningInput(state, input);
    state.game.renderTime = state.time;

    if (state.tuning.active) {
      applyTuningSelectionInput(state, input);
      refreshCreatureRigForTuning(state);
      overlay.update();
      updateAudio(dt);
      input.afterUpdate();
      return;
    }

    if (isOpeningSequenceBlockingGameplay(state.opening)) {
      updateOpeningSequence({ opening: state.opening, input, realDt: dt });
      applyOpeningPlayerTransform(state);
      wyvernProjectionSystem({ state, game: state.game, dt });
      syncGameViews(state.game);
      snapCameraToDragon(state);
      state.diagnostics.validation = validateWorldState(state.game.world);
      state.diagnostics.snapshot = createDebugSnapshot(state.game);
      syncTuningSummary(state);
      overlay.update();
      updateAudio(dt);
      input.afterUpdate();
      return;
    }

    if (isSmokeAwakeningBlockingGameplay(state.smokeAwakening)) {
      const sceneUpdate = updateSmokeAwakening({ scene: state.smokeAwakening, input, realDt: dt });
      if (sceneUpdate.finalExhaleNow) completeSmokeAwakeningUnlock();
      if (sceneUpdate.releasedNow) {
        requestTutorialCue(state.tutorial, state, TutorialCueId.SMOKE_ESCAPE, {
          source: 'smoke_instinct_transition_release',
          mapId: state.map.id
        }, persistPlayerProfile);
      }
      wyvernProjectionSystem({ state, game: state.game, dt });
      syncGameViews(state.game);
      snapCameraToDragon(state);
      state.diagnostics.validation = validateWorldState(state.game.world);
      state.diagnostics.snapshot = createDebugSnapshot(state.game);
      syncTuningSummary(state);
      overlay.update();
      updateAudio(dt);
      input.afterUpdate();
      return;
    }

    applyPauseInput(state, input);
    applyPauseMenuInput(state, input);
    if (state.pauseMenu.settingsChanged) {
      persistPlayerProfile();
      if (state.pauseMenu.lastChangedSettingId?.startsWith('tutorial_')) {
        releaseGameTimeScale(state.gameTime, TUTORIAL_TUNING.slowTimeRequestId, 'tutorial_setting_changed');
        if (state.playerProfile.settings.tutorialPrompts === false) {
          temporarilyDismissActiveTutorialCue(state.tutorial, state, 'tutorial_prompts_disabled');
        }
      }
      state.pauseMenu.settingsChanged = false;
      state.pauseMenu.lastChangedSettingId = null;
    }

    if (!state.paused) {
      const gameplayScale = advanceGameTime(state.gameTime, dt);
      const gameplayDt = dt * gameplayScale;
      state.time += gameplayDt;
      state.game.renderTime = state.time;
      if (state.game.status === ScenarioPhase.TRANSITIONING) processMapTransitionRequest();
      else {
        updateActionSystems(state, input, gameplayDt);
        updateTutorialRuntime({
          state,
          input,
          realDt: dt,
          gameplayDt,
          persistProfile: persistPlayerProfile
        });
        processMapTransitionRequest();
      }
      const dragon = getDragon(state.game);
      const focus = dragon ? { x: dragon.x * CONFIG.tileSize, y: dragon.y * CONFIG.tileSize } : null;
      updateCameraForAction(state.camera, input, focus, gameplayDt, CONFIG.camera, state.map);
      state.diagnostics.validation = validateWorldState(state.game.world);
      state.diagnostics.snapshot = createDebugSnapshot(state.game);
    }

    syncTuningSummary(state);
    overlay.update();
    updateAudio(dt);
    input.afterUpdate();
  }

  function updateAudio(dt) {
    worldEventAudio.sync(state.game);
    smokeAwakeningAudio.sync(state.smokeAwakening);
    state.audio = audio.update(state, dt);
  }

  function completeSmokeAwakeningUnlock() {
    const receipt = applyAbilityUnlockEvent(state.game.world, state.game.dragonId, AbilityUnlockEventId.INSTINCT_SMOKE_AWAKENED);
    state.smokeAwakening.unlockApplied = receipt.ok;
    if (receipt.ok) {
      state.playerProfile = captureAbilityProgressionInProfile(state.game.world, state.game.dragonId, state.playerProfile);
      persistPlayerProfile();
    }
    const spawned = emitRadialSmokeBurst(state.game, state.game.dragonId, {
      actionId: 'smoke_instinct_exhale',
      reason: 'first_uncontrolled_radial_exhale'
    });
    state.smokeAwakening.radialSmokeEmitted = spawned.length > 0;
  }

  function processMapTransitionRequest() {
    const request = state.game.mapTransition;
    if (!request || request.status !== 'requested' || transitionLoad) return;
    state.game.mapTransition = { ...request, status: 'loading', startedAt: state.time };
    state.game.status = ScenarioPhase.TRANSITIONING;
    state.game.message = `Loading ${request.label || 'next region'}...`;
    transitionLoad = loadRuntimeMapTransition(request.nextMapPath, {
      fetchImpl: options.runtimeMapFetchImpl ?? options.fetchImpl,
      hashImpl: options.runtimeMapHashImpl ?? options.hashImpl
    }).then((result) => {
      applyRuntimeMapTransition(result, request);
    }).catch((error) => {
      state.game.mapTransition = {
        ...request,
        status: 'failed',
        error: String(error?.message || error)
      };
      state.game.status = ScenarioPhase.PLAYING;
      state.game.message = `Map transition failed: ${state.game.mapTransition.error}`;
    }).finally(() => {
      transitionLoad = null;
    });
  }

  function applyRuntimeMapTransition(result, request) {
    const previousLoad = state.runtimeMapLoad;
    const creatureTuning = state.game.creatureTuning;
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
    state.game = createInitialGameState(result.map, { creatureTuning, playerProfile: state.playerProfile });
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

  function render(alpha) {
    renderer.render(state, alpha);
    overlay.update();
  }

  function paintBlob(type, cx, cy, radius = 3) {
    if (!Object.values(TerrainType).includes(type)) throw new Error(`Unknown terrain type: ${type}`);
    const targetMap = state.map;
    if (Object.isFrozen(targetMap)) throw new Error('runtime_map_is_immutable');
    const painted = paintTerrainBlob(targetMap, { cx, cy, radius, type });
    targetMap.blobMasks = buildAllBlobMasks(targetMap);
    targetMap.revision = (targetMap.revision ?? 0) + 1;
    return { painted: painted.length, type, cx, cy, radius };
  }

  function scheduleTuningSave() {
    if (saveTimer) clearTimeout(saveTimer);
    const sequence = ++saveSequence;
    saveTimer = setTimeout(async () => {
      const result = await saveCreatureTuningToServer(state.game.creatureTuning);
      if (sequence !== saveSequence) return;
      if (result.ok) {
        state.game.creatureTuning = result.tuning;
        state.tuning.saveStatus = 'saved';
        state.tuning.saveError = null;
        state.tuning.lastSavedAt = new Date().toISOString();
      } else {
        state.tuning.saveStatus = 'blocked';
        state.tuning.saveError = result.reason;
      }
      refreshCreatureRigForTuning(state);
      overlay.update();
    }, 90);
  }

  const loop = createFixedStepLoop({ stepMs: CONFIG.fixedStepMs, update, render });
  return {
    state,
    input,
    renderer,
    audio,
    worldEvents,
    loop,
    paintBlob,
    get tuning() { return state.tuning; },
    get profile() { return state.playerProfile; },
    persistPlayerProfile,
    start: loop.start,
    stop: loop.stop
  };
}

function detectReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

const canvas = typeof document !== 'undefined' ? document.getElementById('game') : null;
if (canvas) {
  bootBrowserApp(canvas);
}

async function bootBrowserApp(canvas) {
  const search = globalThis.location?.search ?? '';
  const runtimeResult = await loadStandaloneRuntimeMap(search);
  logRuntimeMapLoad(runtimeResult);
  window.BSB_V2_MAP_LOAD = runtimeResult.load;
  if (!runtimeResult.ok) {
    window.BSB_V2_BOOT_ERROR = runtimeResult.load;
    renderBootError(canvas, runtimeResult.load.reason);
    return;
  }
  const map = runtimeResult.map;
  const runtimeMapLoad = runtimeResult.load;
  const loaded = await loadCreatureTuningFromServer();
  const app = createApp(canvas, {
    map,
    runtimeMapLoad,
    creatureTuning: loaded.tuning,
    tuningSource: loaded.source,
    tuningLoadStatus: loaded.ok ? 'loaded' : 'blocked',
    tuningLoadError: loaded.ok ? null : loaded.reason,
    openingEnabled: !queryFlag(search, 'skipHatch'),
    openingSource: queryFlag(search, 'skipHatch') ? 'debug_query_skip_hatch' : 'fresh_launch'
  });
  window.BSB_V2_DEMO = app;
  applyWorldEventDebugQuery(app.worldEvents, globalThis.location?.search ?? '');
  window.advanceTime = (ms = CONFIG.fixedStepMs) => app.loop.tickForTest(Math.max(0, Number(ms) || 0));
  window.render_game_to_text = () => renderGameToText(app);
  app.start();
}

function snapCameraToDragon(state) {
  const instinct = buildSmokeAwakeningProjection(state);
  const instinctCamera = instinct?.active ? instinct.camera : null;
  const opening = buildOpeningSequenceProjection(state);
  const openingCamera = opening?.active ? opening.camera : null;
  const camera = instinctCamera ?? openingCamera;
  if (camera) {
    state.camera.x = camera.anchorWorldX + camera.impulseWorldX;
    state.camera.y = camera.anchorWorldY + camera.impulseWorldY;
    state.camera.zoom = camera.zoom;
  } else {
    const dragon = getDragon(state.game);
    if (!dragon) return;
    state.camera.x = dragon.x * CONFIG.tileSize;
    state.camera.y = dragon.y * CONFIG.tileSize;
    state.camera.zoom = 2.75;
  }
  clampCameraToMap(state.camera, state.map);
}

function applyOpeningPlayerTransform(state) {
  const opening = state.opening;
  const egg = opening?.egg;
  if (!opening || !egg) return;
  const transform = getComponent(state.game.world, state.game.dragonId, ComponentType.Transform);
  if (!transform) return;
  const distance = egg.exitDistanceTiles * Math.max(0, Math.min(1, opening.egressProgress ?? 0));
  transform.x = egg.tileX + Math.cos(egg.exitAngle) * distance;
  transform.y = egg.tileY + Math.sin(egg.exitAngle) * distance;
  transform.rotation = egg.rotation;
}

function queryFlag(search, key) {
  const value = new URLSearchParams(search).get(key);
  return ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
}

function renderBootError(canvas, reason) {
  const dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
  const width = Math.max(1, Math.floor((canvas.clientWidth || 1280) * dpr));
  const height = Math.max(1, Math.floor((canvas.clientHeight || 720) * dpr));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#08090b';
  ctx.fillRect(0, 0, width / dpr, height / dpr);
  ctx.fillStyle = '#ff8f8f';
  ctx.font = '600 18px ui-monospace, monospace';
  ctx.fillText('BLACK SKY BOUND V2 — MAP LOAD BLOCKED', 32, 52);
  ctx.fillStyle = '#c8ccd4';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(reason.slice(0, 120), 32, 82);
}
