import { ComponentType } from '../constants/componentTypes.js';
import { SmokeAwakeningCueId } from '../data/smokeAwakening.js';
import { getComponent } from '../ecs/world.js';
import { spawnActor } from './spawn.js';

export const AuthoredTransitionPhase = Object.freeze({
  INACTIVE: 'inactive',
  IMPACT: 'impact',
  RAIDER_CHARGE: 'raider_charge',
  SMOKE_COVER: 'smoke_cover',
  COMPLETE: 'complete',
  FAILED: 'failed'
});

export function createAuthoredTransitionSequenceState() {
  return {
    active: false,
    complete: false,
    failed: false,
    error: null,
    sequenceId: null,
    sequence: null,
    phase: AuthoredTransitionPhase.INACTIVE,
    elapsedReal: 0,
    phaseElapsedReal: 0,
    phaseProgress: 0,
    smokeCoverage: 0,
    handoffReady: false,
    playerAnchor: null,
    actorEntities: [],
    audio: { sequence: 0, cueId: null, reason: null, events: [] },
    diagnostics: {
      startCount: 0,
      updateTicks: 0,
      resolvedActorIds: [],
      missingActorIds: [],
      handoffCount: 0
    }
  };
}

export function startAuthoredTransitionSequence({ scene, game, map, sequenceId }) {
  if (!scene || scene.active || scene.complete) return { ok: false, reason: 'transition_sequence_not_startable' };
  const sequence = map.sceneSequences?.find((entry) => entry.id === sequenceId);
  if (!sequence) return fail(scene, `transition_sequence_missing:${sequenceId}`);
  const actorBindings = [];
  const missingActorIds = [];
  for (const track of sequence.actorTracks) {
    const entity = game.authoredEntities?.[track.actorId] ?? null;
    const placement = game.reservedTransitionActorPlacements?.[track.actorId] ?? null;
    const existingAvailable = entity
      && getComponent(game.world, entity, ComponentType.Health)?.alive
      && getComponent(game.world, entity, ComponentType.Transform);
    if (!existingAvailable && !placement) {
      missingActorIds.push(track.actorId);
      continue;
    }
    actorBindings.push({ actorId: track.actorId, entity: existingAvailable ? entity : null, placement, track });
  }
  if (missingActorIds.length > 0) {
    scene.diagnostics.missingActorIds = missingActorIds;
    return fail(scene, `transition_sequence_actor_unavailable:${missingActorIds.join(',')}`);
  }
  const playerTransform = getComponent(game.world, game.dragonId, ComponentType.Transform);
  if (!playerTransform) return fail(scene, 'transition_sequence_player_transform_missing');
  const actorEntities = actorBindings.map((binding) => materializeActorBinding(game, binding));

  scene.active = true;
  scene.complete = false;
  scene.failed = false;
  scene.error = null;
  scene.sequenceId = sequence.id;
  scene.sequence = sequence;
  scene.phase = AuthoredTransitionPhase.IMPACT;
  scene.elapsedReal = 0;
  scene.phaseElapsedReal = 0;
  scene.phaseProgress = 0;
  scene.smokeCoverage = 0;
  scene.handoffReady = false;
  scene.playerAnchor = { x: playerTransform.x, y: playerTransform.y, rotation: sequence.camera.playerFacingRadians };
  scene.actorEntities = actorEntities;
  scene.audio = { sequence: 0, cueId: null, reason: null, events: [] };
  scene.diagnostics.startCount += 1;
  scene.diagnostics.resolvedActorIds = actorEntities.map((entry) => entry.actorId);
  playerTransform.rotation = sequence.camera.playerFacingRadians;
  for (const actor of actorEntities) {
    const transform = getComponent(game.world, actor.entity, ComponentType.Transform);
    const team = getComponent(game.world, actor.entity, ComponentType.Team);
    const ai = getComponent(game.world, actor.entity, ComponentType.EnemyPressureAI);
    transform.x = actor.track.path[0].x;
    transform.y = actor.track.path[0].y;
    if (ai) ai.disabled = true;
  }
  queueAudio(scene, SmokeAwakeningCueId.IMPACT, 'mama_lands_offscreen_north', 1);
  return { ok: true, sequenceId: sequence.id, actorIds: [...scene.diagnostics.resolvedActorIds] };
}

export function updateAuthoredTransitionSequence({ scene, game, realDt = 0 }) {
  if (!scene?.active || scene.complete || scene.failed) return { active: false, handoffNow: false };
  const delta = Math.max(0, Number(realDt) || 0);
  scene.elapsedReal += delta;
  scene.phaseElapsedReal += delta;
  scene.diagnostics.updateTicks += 1;
  const phase = scene.sequence.phases.find((entry) => entry.id === scene.phase);
  if (!phase) return fail(scene, `transition_sequence_phase_missing:${scene.phase}`);
  scene.phaseProgress = Math.min(1, scene.phaseElapsedReal / phase.durationSeconds);

  if (scene.phase === AuthoredTransitionPhase.RAIDER_CHARGE) applyActorTracks(scene, game, easeInOut(scene.phaseProgress));
  else if (scene.phase === AuthoredTransitionPhase.SMOKE_COVER) {
    applyActorTracks(scene, game, 1);
    scene.smokeCoverage = easeInOut(scene.phaseProgress);
    if (!scene.handoffReady && scene.smokeCoverage >= scene.sequence.smoke.coverageThreshold) {
      scene.handoffReady = true;
      scene.complete = true;
      scene.active = false;
      scene.phase = AuthoredTransitionPhase.COMPLETE;
      scene.diagnostics.handoffCount += 1;
      return { active: false, handoffNow: true };
    }
  } else {
    applyActorTracks(scene, game, 0);
  }

  if (scene.phaseProgress >= 1) advancePhase(scene);
  return { active: scene.active, handoffNow: false };
}

export function isAuthoredTransitionSequenceBlockingGameplay(scene) {
  return scene?.active === true && scene.failed !== true;
}

function applyActorTracks(scene, game, progress) {
  for (const actor of scene.actorEntities) {
    const transform = getComponent(game.world, actor.entity, ComponentType.Transform);
    if (!transform) continue;
    const point = interpolatePath(actor.track.path, progress);
    const dx = point.x - transform.x;
    const dy = point.y - transform.y;
    transform.x = point.x;
    transform.y = point.y;
    if (Math.hypot(dx, dy) > 0.0001) transform.rotation = Math.atan2(dy, dx);
  }
  const player = getComponent(game.world, game.dragonId, ComponentType.Transform);
  if (player && scene.playerAnchor) {
    player.x = scene.playerAnchor.x;
    player.y = scene.playerAnchor.y;
    player.rotation = scene.playerAnchor.rotation;
  }
}

function interpolatePath(path, progress) {
  const t = Math.max(0, Math.min(1, progress));
  const rightIndex = path.findIndex((node) => node.at >= t);
  if (rightIndex <= 0) return path[0];
  const right = path[rightIndex];
  const left = path[rightIndex - 1];
  const local = (t - left.at) / Math.max(0.000001, right.at - left.at);
  return { x: left.x + (right.x - left.x) * local, y: left.y + (right.y - left.y) * local };
}

function materializeActorBinding(game, binding) {
  if (binding.entity) return { actorId: binding.actorId, entity: binding.entity, track: binding.track };
  const placement = binding.placement;
  const entity = spawnActor(game.world, placement.type, placement.x + 0.5, placement.y + 0.5, placement.team, {
    creature: placement.creature,
    audioEmitter: placement.audioEmitter,
    sourceId: placement.id ?? binding.actorId,
    sourceKind: 'authored_transition_actor_id'
  });
  game.authoredEntities[binding.actorId] = entity;
  game.entityAuthoredIds[entity] = binding.actorId;
  return { actorId: binding.actorId, entity, track: binding.track };
}

function advancePhase(scene) {
  scene.phaseElapsedReal = 0;
  scene.phaseProgress = 0;
  if (scene.phase === AuthoredTransitionPhase.IMPACT) {
    scene.phase = AuthoredTransitionPhase.RAIDER_CHARGE;
    queueAudio(scene, SmokeAwakeningCueId.DEBRIS, 'impact_debris_falls_north_to_south', 0.9);
    queueAudio(scene, SmokeAwakeningCueId.RAIDER_SHOUT, 'authored_raiders_charge_landing', 0.78);
  } else if (scene.phase === AuthoredTransitionPhase.RAIDER_CHARGE) {
    scene.phase = AuthoredTransitionPhase.SMOKE_COVER;
    queueAudio(scene, SmokeAwakeningCueId.MAMA_ROAR, 'mama_smoke_covers_outgoing_map', 1);
  }
}

function queueAudio(scene, cueId, reason, intensity) {
  const sequence = scene.audio.sequence + 1;
  const event = { sequence, cueId, reason, intensity, atRealSeconds: round3(scene.elapsedReal) };
  scene.audio = { sequence, cueId, reason, events: [...scene.audio.events, event].slice(-20) };
}

function fail(scene, reason) {
  scene.active = false;
  scene.complete = false;
  scene.failed = true;
  scene.error = String(reason);
  scene.phase = AuthoredTransitionPhase.FAILED;
  return { ok: false, reason: scene.error, active: false, handoffNow: false };
}

function easeInOut(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
