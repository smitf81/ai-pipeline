import { WORLD_SCALE } from '../data/worldScale.js';
import { WORLD_TRANSFORM_3D } from '../render/three/worldTransform3D.js';
import { AudioSpatialProfileId, resolveAudioEmitter } from '../data/audio/spatialAudioProfiles.js';

export const AUDIO_SPATIAL_FRAME_CONTRACT = 'black-sky-bound.audio-spatial-frame.v1';
export const AUDIO_SOURCE_REF_CONTRACT = 'black-sky-bound.audio-source-ref.v1';
export const AUDIO_LISTENER_EAR_HEIGHT_METERS = 0.35;
export const AUDIO_VELOCITY_FRAME_GAP_SECONDS = 0.25;
export const AUDIO_TELEPORT_REJECTION_METERS = 5;

export function createAudioSourceRef(ownerKind, ownerId, emitterId = 'voice') {
  const ref = { ownerKind: text(ownerKind), ownerId: text(ownerId), emitterId: text(emitterId, 'voice') };
  if (!ref.ownerKind || !ref.ownerId) throw new Error('audio_source_ref_owner_required');
  return Object.freeze(ref);
}

export function audioSourceRefKey(ref) {
  if (!ref?.ownerKind || !ref?.ownerId || !ref?.emitterId) return null;
  return `${ref.ownerKind}:${ref.ownerId}:${ref.emitterId}`;
}

export function worldTilesToAudioPosition(x, y, heightMeters = 0) {
  return {
    x: finite(x) * WORLD_SCALE.tileMeters,
    y: finite(heightMeters),
    z: finite(y) * WORLD_SCALE.tileMeters
  };
}

export function inverseDistanceGain(distanceMeters, profile) {
  const distance = Math.max(0, finite(distanceMeters));
  const ref = Math.max(0.001, finite(profile?.referenceDistanceMeters, 1));
  const max = Math.max(ref, finite(profile?.maxDistanceMeters, 10000));
  const rolloff = Math.max(0, finite(profile?.rolloffFactor, 1));
  if (distance >= max) return 0;
  if (distance <= ref) return 1;
  return clamp01(ref / (ref + rolloff * (distance - ref)));
}

export function cameraRelativePan(listener, source) {
  const dx = finite(source?.x) - finite(listener?.position?.x);
  const dz = finite(source?.z) - finite(listener?.position?.z);
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.0001) return 0;
  const forward = listener?.forward ?? { x: 0, z: -1 };
  const rightX = -finite(forward.z, -1);
  const rightZ = finite(forward.x, 0);
  return clamp(dx / distance * rightX + dz / distance * rightZ, -1, 1);
}

export function radialDopplerRatio(listener, emitter, previousRatio = 1, dt = 0) {
  const sourcePosition = emitter?.position ?? emitter;
  const dx = finite(sourcePosition?.x) - finite(listener?.position?.x);
  const dy = finite(sourcePosition?.y) - finite(listener?.position?.y);
  const dz = finite(sourcePosition?.z) - finite(listener?.position?.z);
  const length = Math.hypot(dx, dy, dz) || 1;
  const normal = { x: dx / length, y: dy / length, z: dz / length };
  const listenerRadial = dot(listener?.velocity, normal);
  const sourceRadial = dot(emitter?.velocity, normal);
  const raw = clamp((343 + listenerRadial) / Math.max(1, 343 + sourceRadial), 0.85, 1.18);
  const scale = clamp01(finite(emitter?.profile?.dopplerScale, 1));
  const target = 1 + (raw - 1) * scale;
  const alpha = dt > 0 ? 1 - Math.exp(-dt / 0.08) : 1;
  return finite(previousRatio, 1) + (target - finite(previousRatio, 1)) * alpha;
}

export function deriveAudioVelocity(position, previousPosition, dt) {
  const delta = finite(dt);
  if (!previousPosition || delta <= 0 || delta > AUDIO_VELOCITY_FRAME_GAP_SECONDS) return zeroVector();
  const displacement = Math.hypot(
    position.x - previousPosition.x,
    position.y - previousPosition.y,
    position.z - previousPosition.z
  );
  if (displacement > AUDIO_TELEPORT_REJECTION_METERS) return zeroVector();
  return {
    x: (position.x - previousPosition.x) / delta,
    y: (position.y - previousPosition.y) / delta,
    z: (position.z - previousPosition.z) / delta
  };
}

export function buildAudioSpatialFrame(state, previousFrame = null, dt = 0, transientEmitters = []) {
  const game = state?.game ?? state;
  const player = (game?.actors ?? []).find((actor) => actor.id === game?.dragonId)
    ?? (game?.actors ?? []).find((actor) => actor.team === 'player');
  const listenerPosition = worldTilesToAudioPosition(player?.x ?? 0, player?.y ?? 0, AUDIO_LISTENER_EAR_HEIGHT_METERS);
  const yaw = finite(WORLD_TRANSFORM_3D.camera?.yawDegrees, 45) * Math.PI / 180;
  const forward = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
  const previousListener = previousFrame?.listener?.position;
  const listener = {
    ownerKind: 'actor',
    ownerId: player?.authoredId ?? player?.id ?? 'player',
    position: listenerPosition,
    velocity: deriveAudioVelocity(listenerPosition, previousListener, dt),
    forward,
    up: { x: 0, y: 1, z: 0 },
    earHeightMeters: AUDIO_LISTENER_EAR_HEIGHT_METERS
  };
  const candidates = [
    ...actorEmitters(game),
    ...sceneObjectEmitters(game),
    ...mamaEmitters(game),
    ...openingEmitters(state?.opening),
    ...(transientEmitters ?? [])
  ];
  const emitters = {};
  for (const candidate of candidates) {
    const key = audioSourceRefKey(candidate.sourceRef);
    if (!key || candidate.profile?.enabled === false) continue;
    const previous = previousFrame?.emitters?.[key];
    const velocity = deriveAudioVelocity(candidate.position, previous?.position, dt);
    const distanceMeters = distance3(listener.position, candidate.position);
    const dopplerRatio = radialDopplerRatio(listener, { ...candidate, velocity }, previous?.dopplerRatio ?? 1, dt);
    const occlusion = resolveWorldOcclusion(game, listener.position, candidate.position);
    emitters[key] = {
      ...candidate,
      key,
      velocity,
      distanceMeters,
      attenuationGain: inverseDistanceGain(distanceMeters, candidate.profile),
      pan: cameraRelativePan(listener, candidate.position),
      dopplerRatio,
      occlusion
    };
  }
  return {
    contract: AUDIO_SPATIAL_FRAME_CONTRACT,
    listener,
    emitters,
    emitterCount: Object.keys(emitters).length
  };
}

export function resolveWorldOcclusion(game, listenerPosition, sourcePosition) {
  const blockers = game?.occlusionBlockers ?? [];
  let blockerCount = 0;
  for (const blocker of blockers) {
    const center = worldTilesToAudioPosition(blocker.x, blocker.y, 0);
    const radius = Math.max(0, finite(blocker.radius, 0) * WORLD_SCALE.tileMeters);
    const hit = closestPointOnPlanarSegment(center.x, center.z, listenerPosition.x, listenerPosition.z, sourcePosition.x, sourcePosition.z);
    if (hit.t <= 0.04 || hit.t >= 0.96 || hit.distance > radius) continue;
    const rayHeight = listenerPosition.y + (sourcePosition.y - listenerPosition.y) * hit.t;
    if (finite(blocker.height, 0) + 0.05 < rayHeight) continue;
    blockerCount += 1;
  }
  const pressure = clamp01(blockerCount / 3);
  return {
    blocked: blockerCount > 0,
    blockerCount,
    gain: Math.max(0.42, 1 - blockerCount * 0.18),
    cutoffHz: Math.round(18000 - pressure * 14500)
  };
}

function actorEmitters(game) {
  return (game?.actors ?? []).flatMap((actor) => {
    const definition = actor.audioEmitter;
    if (!definition || definition.enabled === false) return [];
    const profile = resolveAudioEmitter(definition, AudioSpatialProfileId.CREATURE_VOICE);
    const anchor = resolveActorAnchor(actor, profile);
    const ownerIds = new Set([actor.id, actor.authoredId].filter(Boolean));
    return [...ownerIds].map((ownerId) => ({
      sourceRef: createAudioSourceRef('actor', ownerId, profile.emitterId),
      profile,
      position: worldTilesToAudioPosition(anchor.x, anchor.y, profile.anchorHeightMeters),
      forward: actorForward(actor)
    }));
  });
}

function sceneObjectEmitters(game) {
  return (game?.sceneObjects ?? []).flatMap((object) => {
    if (!object?.audioEmitter || object.audioEmitter.enabled === false) return [];
    const profile = resolveAudioEmitter(object.audioEmitter, AudioSpatialProfileId.SMOULDER_FIRE);
    return [{
      sourceRef: createAudioSourceRef('sceneObject', object.id, profile.emitterId),
      profile,
      position: worldTilesToAudioPosition(
        finite(object.x) + profile.anchorOffsetX,
        finite(object.y) + profile.anchorOffsetY,
        profile.anchorHeightMeters
      ),
      forward: { x: 0, y: 0, z: -1 }
    }];
  });
}

function mamaEmitters(game) {
  const event = game?.worldEvents?.activeEvent;
  if (!event?.audioEmitter) return [];
  const profile = resolveAudioEmitter(event.audioEmitter, AudioSpatialProfileId.MAMA_VOICE);
  return [{
    sourceRef: createAudioSourceRef('worldEvent', event.id, profile.emitterId),
    profile,
    position: worldTilesToAudioPosition(event.worldX, event.worldY, profile.anchorHeightMeters),
    forward: { x: finite(event.forwardX, 1), y: 0, z: finite(event.forwardY, 0) }
  }];
}

function openingEmitters(opening) {
  return Object.values(opening?.audio?.emitters ?? {}).flatMap((entry) => {
    if (!entry?.sourceRef || !Number.isFinite(entry.x) || !Number.isFinite(entry.y)) return [];
    const profile = resolveAudioEmitter(entry, entry.profileId ?? AudioSpatialProfileId.STORM);
    return [{
      sourceRef: entry.sourceRef,
      profile,
      position: worldTilesToAudioPosition(entry.x, entry.y, profile.anchorHeightMeters),
      forward: { x: finite(entry.forwardX, 0), y: 0, z: finite(entry.forwardY, -1) }
    }];
  });
}

function resolveActorAnchor(actor, profile) {
  const socketName = profile.anchor;
  const sockets = actor.humanoidProjection?.sockets ?? actor.predatorProjection?.sockets ?? actor.wyvernProjection?.sockets ?? {};
  const socket = sockets?.[socketName] ?? sockets?.head ?? sockets?.mouth ?? null;
  return {
    x: finite(socket?.x, actor.x) + profile.anchorOffsetX,
    y: finite(socket?.y, actor.y) + profile.anchorOffsetY
  };
}

function actorForward(actor) {
  const angle = finite(actor?.rotation);
  return { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
}

function distance3(a, b) {
  return Math.hypot(finite(b?.x) - finite(a?.x), finite(b?.y) - finite(a?.y), finite(b?.z) - finite(a?.z));
}

function closestPointOnPlanarSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSquared = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lengthSquared, 0, 1);
  return { t, distance: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)) };
}

function dot(a, b) {
  return finite(a?.x) * finite(b?.x) + finite(a?.y) * finite(b?.y) + finite(a?.z) * finite(b?.z);
}

function zeroVector() {
  return { x: 0, y: 0, z: 0 };
}

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function text(value, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(finite(value), 0, 1);
}
