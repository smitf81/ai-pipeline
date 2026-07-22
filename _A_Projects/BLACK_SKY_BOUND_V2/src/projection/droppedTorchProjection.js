import { LightEmitterId } from '../constants/lightEmitterIds.js';
import { getHumanoidProjectionProfile } from '../data/humanoids/raiderHumanoid.js';

export function buildDroppedTorchProjection(actors, tileSize, creatureTuning = null) {
  return actors
    .filter((actor) => actor?.lightEmitter?.id === LightEmitterId.TORCH)
    .map((actor) => buildDroppedTorchPacket(actor, tileSize, creatureTuning))
    .filter(Boolean);
}

function buildDroppedTorchPacket(actor, tileSize, creatureTuning) {
  const humanoid = actor?.humanoidProjection;
  const torchState = humanoid?.torchState ?? null;
  if (!humanoid?.profileId || !torchState || torchState.mode === 'carried') return null;

  const profile = getHumanoidProjectionProfile(humanoid.profileId, creatureTuning);
  const torch = profile.torch ?? {};
  const palette = profile.palette ?? {};
  const visualScale = Number(profile.visual?.scale ?? 1) || 1;
  const forward = resolveTorchDirection(torchState);
  const right = { x: -forward.y, y: forward.x };
  const flameLead = Math.max(0.02, Number(torch.flameRadius ?? 0.13) * visualScale * 0.4);
  const shaftLength = Math.max(0.12, Number(torch.length ?? 0.42) * visualScale);
  const shaftWidth = Math.max(0.02, Number(torch.width ?? 0.055) * visualScale);
  const flameX = torchState.x;
  const flameY = torchState.y;
  const tipX = flameX - forward.x * flameLead;
  const tipY = flameY - forward.y * flameLead;
  const gripX = tipX - forward.x * shaftLength;
  const gripY = tipY - forward.y * shaftLength;
  const midX = (gripX + tipX) * 0.5;
  const midY = (gripY + tipY) * 0.5;
  const fade01 = clamp01(torchState.fade01 ?? 1);
  const emissionScale = clamp01(torchState.emissionScale ?? fade01);
  const flameAlpha = torchState.mode === 'extinguished' ? 0 : Math.max(0.04, Math.min(1, emissionScale * 1.12));
  const emberAlpha = torchState.mode === 'extinguished' ? 0 : Math.max(0.03, Math.min(1, emissionScale * 0.92 + 0.04));
  const shaftAlpha = lerp(0.62, 0.92, Math.max(fade01, 0.18));
  const charAlpha = lerp(0.46, 0.82, Math.max(fade01, 0.12));

  return {
    classification: 'renderer_neutral_dropped_torch_projection',
    id: `${actor.id}:dropped_torch`,
    sourceEntityId: actor.id,
    sourceKind: LightEmitterId.TORCH,
    visualRole: 'defeated_torch_prop',
    profileId: humanoid.profileId,
    worldX: midX * tileSize,
    worldY: midY * tileSize,
    depthY: Math.max(gripY, tipY, flameY) * tileSize,
    worldRadius: Math.max(6, shaftLength * tileSize * 0.9),
    gripWorldX: gripX * tileSize,
    gripWorldY: gripY * tileSize,
    tipWorldX: tipX * tileSize,
    tipWorldY: tipY * tileSize,
    flameWorldX: flameX * tileSize,
    flameWorldY: flameY * tileSize,
    previousFlameWorldX: Number.isFinite(torchState.previousX) ? torchState.previousX * tileSize : null,
    previousFlameWorldY: Number.isFinite(torchState.previousY) ? torchState.previousY * tileSize : null,
    flameTrailActive: torchState.mode === 'falling'
      && Number.isFinite(torchState.previousX)
      && Math.hypot(flameX - torchState.previousX, flameY - torchState.previousY) > 0.01,
    worldLength: shaftLength * tileSize,
    worldWidth: Math.max(1.6, shaftWidth * tileSize),
    flameWorldRadius: Math.max(2.2, Number(torch.flameRadius ?? 0.13) * visualScale * tileSize),
    forwardWorldX: forward.x,
    forwardWorldY: forward.y,
    rightWorldX: right.x,
    rightWorldY: right.y,
    drop01: clamp01(torchState.drop01 ?? 1),
    fade01,
    groundContact: torchState.groundContact === true,
    mode: torchState.mode,
    palette: {
      torch: palette.torch ?? '#6d3f1e',
      flame: palette.flame ?? 'rgba(255, 160, 72, 0.92)',
      flameCore: palette.flameCore ?? 'rgba(255, 229, 164, 0.96)',
      outline: palette.outline ?? '#1c130f'
    },
    render: {
      shaftAlpha,
      charAlpha,
      flameAlpha,
      emberAlpha
    }
  };
}

function resolveTorchDirection(torchState) {
  const dropDx = Number(torchState?.groundX) - Number(torchState?.startX);
  const dropDy = Number(torchState?.groundY) - Number(torchState?.startY);
  if (Number.isFinite(dropDx) && Number.isFinite(dropDy) && Math.hypot(dropDx, dropDy) > 0.001) {
    return normalise(dropDx, dropDy);
  }
  return normalise(torchState?.forwardX, torchState?.forwardY);
}

function normalise(x, y) {
  const nx = Number(x);
  const ny = Number(y);
  const length = Math.hypot(nx, ny);
  if (!Number.isFinite(length) || length <= 0.001) return { x: 1, y: 0 };
  return { x: nx / length, y: ny / length };
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}
