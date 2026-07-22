import { getImpactReactionProfile } from '../data/impactReactionProfiles.js';

export function applyImpactToReceiver(impact, {
  directionX,
  directionY,
  impactStrength = 0,
  staggerStrength = 0,
  source = null,
  target = null,
  actionId = null,
  contactBodyPart = null,
  impactDirection = 'forward',
  phase = null
}) {
  if (!impact) return { impulse: 0, stagger: 0, reactionDuration: 0 };
  const direction = normalise(directionX, directionY);
  const mass = Math.max(0.1, impact.mass ?? 1);
  const impactScale = Math.max(0, 1 - (impact.impactResistance ?? 0));
  const staggerScale = Math.max(0, 1 - (impact.staggerResistance ?? 0));
  const impulse = Math.max(0, impactStrength) * impactScale / mass;
  const stagger = Math.max(0, staggerStrength) * staggerScale;
  const reactionProfile = getImpactReactionProfile(impact.reactionProfileId);
  const reactionDuration = clamp(
    reactionProfile.minDuration + stagger * reactionProfile.durationPerStagger,
    reactionProfile.minDuration,
    reactionProfile.maxDuration
  );
  impact.knockbackVelocityX = (impact.knockbackVelocityX ?? 0) + direction.x * impulse;
  impact.knockbackVelocityY = (impact.knockbackVelocityY ?? 0) + direction.y * impulse;
  impact.staggerTimer = Math.max(impact.staggerTimer ?? 0, reactionDuration);
  impact.reactionDuration = Math.max(impact.reactionDuration ?? 0, reactionDuration);
  impact.lastImpact = {
    classification: 'procedural_impact_receive_receipt',
    source,
    target,
    actionId,
    contactBodyPart,
    impactDirection,
    directionX: direction.x,
    directionY: direction.y,
    impulse,
    stagger,
    reactionDuration,
    reactionProfileId: reactionProfile.id,
    phase
  };
  return { impulse, stagger, reactionDuration };
}

export function buildImpactPoseState(impact, facing = 0) {
  const receipt = impact?.lastImpact;
  const timer = Math.max(0, Number(impact?.staggerTimer) || 0);
  const duration = Math.max(0.001, Number(receipt?.reactionDuration ?? impact?.reactionDuration) || 0);
  if (!receipt || timer <= 0 || duration <= 0.001) return null;
  const direction = normalise(receipt.directionX, receipt.directionY);
  const forward = { x: Math.cos(facing), y: Math.sin(facing) };
  const right = { x: -forward.y, y: forward.x };
  const remaining01 = clamp(timer / duration, 0, 1);
  const recoil01 = remaining01 * (0.82 + Math.sin((1 - remaining01) * Math.PI) * 0.18);
  return {
    classification: 'procedural_impact_receive_pose',
    profileId: receipt.reactionProfileId,
    directionX: direction.x,
    directionY: direction.y,
    localForward: direction.x * forward.x + direction.y * forward.y,
    localRight: direction.x * right.x + direction.y * right.y,
    impulse: Math.max(0, Number(receipt.impulse) || 0),
    stagger: Math.max(0, Number(receipt.stagger) || 0),
    duration,
    remaining01,
    recoil01
  };
}

function normalise(x, y) {
  const dx = Number(x);
  const dy = Number(y);
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0.001) return { x: 1, y: 0 };
  return { x: dx / length, y: dy / length };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
