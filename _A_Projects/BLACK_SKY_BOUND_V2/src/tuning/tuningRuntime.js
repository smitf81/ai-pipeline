import { ComponentType } from '../constants/componentTypes.js';
import { CONFIG } from '../config.js';
import { getCreatureTuningFields, listProfileOverridePaths } from '../data/creatures/creatureTuning.js';
import { getHumanoidTuningFields } from '../data/humanoids/raiderHumanoid.js';
import { getComponent } from '../ecs/world.js';
import { screenToWorld } from '../render/camera.js';
import { syncGameViews } from '../game/selectors.js';
import { wyvernProjectionSystem } from '../systems/wyvernProjectionSystem.js';
import { humanoidProjectionSystem } from '../systems/humanoidProjectionSystem.js';

export function createTuningState() {
  return {
    active: false,
    selectedEntityId: null,
    selectedProfileId: null,
    selectedTuningKind: null,
    saveStatus: 'idle',
    saveError: null,
    source: 'not_loaded',
    changedPaths: [],
    overrideCount: 0,
    lastSavedAt: null,
    manifest: getCreatureTuningFields(),
    suppressedGameplayInput: false,
    visualBounds: null
  };
}

export function applyTuningInput(state, input) {
  const tuning = state.tuning;
  if (!tuning || !input?.wasPressed) return false;
  if (input.wasPressed('`')) {
    tuning.active = !tuning.active;
    tuning.suppressedGameplayInput = tuning.active;
    state.paused = tuning.active;
    if (state.game) state.game.paused = tuning.active;
    if (tuning.active && !tuning.selectedEntityId) selectDefaultWyvern(state);
    return true;
  }
  if (!tuning.active) return false;
  if (input.wasPressed('escape')) {
    tuning.active = false;
    tuning.suppressedGameplayInput = false;
    state.paused = false;
    if (state.game) state.game.paused = false;
    return true;
  }
  return false;
}

export function applyTuningSelectionInput(state, input) {
  if (!state.tuning?.active || !input?.consumePointerClick) return false;
  const clicked = input.consumePointerClick(0);
  input.consumePointerClick(2);
  if (!clicked) return false;
  const selected = pickActorByVisualBounds(state, input.pointer.x, input.pointer.y);
  if (selected) selectTuningEntity(state, selected.id);
  return true;
}

export function selectTuningEntity(state, entityId) {
  const actor = state.game.actors.find((item) => item.id === entityId);
  const target = getTuningTarget(actor);
  if (!target) return false;
  state.tuning.selectedEntityId = entityId;
  state.tuning.selectedProfileId = target.profileId;
  state.tuning.selectedTuningKind = target.kind;
  state.tuning.manifest = target.manifest;
  syncTuningSummary(state);
  return true;
}

export function refreshCreatureRigForTuning(state) {
  if (!state?.game) return;
  wyvernProjectionSystem({ game: state.game, dt: 0 });
  humanoidProjectionSystem({ game: state.game, dt: 0 });
  syncGameViews(state.game);
  syncTuningSummary(state);
}

export function syncTuningSummary(state) {
  const tuning = state.tuning;
  if (!tuning) return;
  const actor = state.game?.actors?.find((item) => item.id === tuning.selectedEntityId);
  const target = getTuningTarget(actor);
  const profileId = target?.profileId ?? tuning.selectedProfileId;
  tuning.selectedProfileId = profileId ?? null;
  tuning.selectedTuningKind = target?.kind ?? tuning.selectedTuningKind ?? null;
  tuning.manifest = target?.manifest ?? tuning.manifest;
  tuning.changedPaths = profileId ? listProfileOverridePaths(state.game.creatureTuning, profileId) : [];
  tuning.overrideCount = tuning.changedPaths.length;
  tuning.visualBounds = target?.visualBounds ?? null;
}

function selectDefaultWyvern(state) {
  const dragonId = state.game?.dragonId;
  if (dragonId) selectTuningEntity(state, dragonId);
}

function pickActorByVisualBounds(state, screenX, screenY) {
  const world = screenToWorld(state.camera, screenX, screenY);
  const tileX = world.x / CONFIG.tileSize;
  const tileY = world.y / CONFIG.tileSize;
  return [...(state.game.actors ?? [])].reverse().find((actor) => {
    const bounds = actor.wyvernProjection?.rigPose?.visualBounds;
    const humanoidBounds = actor.humanoidProjection?.visualBounds;
    const targetBounds = bounds ?? humanoidBounds;
    if (!targetBounds) return false;
    return tileX >= targetBounds.minX && tileX <= targetBounds.maxX && tileY >= targetBounds.minY && tileY <= targetBounds.maxY;
  }) ?? null;
}

function getTuningTarget(actor) {
  if (actor?.wyvernProjection) {
    return {
      kind: 'wyvern',
      profileId: actor.wyvernProjection.rigPose?.profileId ?? actor.wyvernProjection.proceduralPose?.proportionProfileId ?? null,
      manifest: getCreatureTuningFields(),
      visualBounds: actor.wyvernProjection.rigPose?.visualBounds ?? null
    };
  }
  if (actor?.humanoidProjection) {
    return {
      kind: 'humanoid',
      profileId: actor.humanoidProjection.profileId,
      manifest: getHumanoidTuningFields(),
      visualBounds: actor.humanoidProjection.visualBounds ?? null
    };
  }
  return null;
}

export function zeroPlayerIntentWhileTuning(state, input) {
  if (!state.tuning?.active) return false;
  for (const entity of state.game.world.entities) {
    const intent = getComponent(state.game.world, entity, ComponentType.PlayerIntent);
    if (!intent) continue;
    intent.moveX = 0;
    intent.moveY = 0;
    intent.sprint = false;
    intent.dodge = false;
    intent.melee = false;
    intent.bite = false;
    intent.lunge = false;
    intent.smoke = false;
    intent.smokeAbilityId = null;
  }
  input?.consumePointerClick?.(0);
  input?.consumePointerClick?.(2);
  return true;
}
