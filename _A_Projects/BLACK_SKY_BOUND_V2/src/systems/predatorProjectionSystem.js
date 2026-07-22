import { clamp } from '../core/math.js';
import { ComponentType } from '../constants/componentTypes.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { EnemyAttackPhase } from '../data/enemyAttackProfiles.js';
import { getPredatorProjectionProfile } from '../data/creatures/werewolfPredator.js';
import { getImpactReactionProfile } from '../data/impactReactionProfiles.js';
import { buildImpactPoseState } from './impactResponseState.js';
import { buildAttackProjectionState } from './humanoidProjectionSystem.js';

const TAU = Math.PI * 2;
const READY_PHASE = 'ready';

export function predatorProjectionSystem({ game, dt }) {
  for (const entity of query(game.world, [ComponentType.Transform, ComponentType.Collider, ComponentType.PredatorProjection])) {
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const projection = getComponent(game.world, entity, ComponentType.PredatorProjection);
    const health = getComponent(game.world, entity, ComponentType.Health);
    const ai = getComponent(game.world, entity, ComponentType.EnemyPressureAI);
    const impact = getComponent(game.world, entity, ComponentType.ImpactResponse);
    const dodgeState = getComponent(game.world, entity, ComponentType.DodgeState);
    const profile = getPredatorProjectionProfile(projection.profileId);
    const dx = transform.x - projection.lastX;
    const dy = transform.y - projection.lastY;
    const moved = Math.hypot(dx, dy);
    const speed = dt > 0 ? moved / dt : 0;
    const alive = health?.alive !== false;
    const attackState = alive ? buildAttackProjectionState(ai) : null;
    const facing = attackState || dodgeState?.active
      ? (transform.rotation ?? projection.facing ?? 0)
      : (moved > 0.0001 ? Math.atan2(dy, dx) : (transform.rotation ?? projection.facing ?? 0));
    const reactionState = alive ? buildImpactPoseState(impact, facing) : null;
    transform.rotation = facing;
    projection.movement01 = clamp(speed / profile.gait.maxMovementForFullGait, 0, 1);
    projection.gaitPhase = (projection.gaitPhase + moved * profile.gait.phasePerWorldUnit) % TAU;
    projection.idlePhase = (projection.idlePhase + dt * profile.gait.idlePhaseSpeed) % TAU;
    projection.facing = facing;
    projection.motionState = resolveMotionState(alive, dodgeState, reactionState, attackState, projection.movement01);
    projection.lastX = transform.x;
    projection.lastY = transform.y;
    const pose = buildPredatorPose(transform, projection, profile, attackState, reactionState);
    Object.assign(projection, pose, { attackState, reactionState, profileLabel: profile.label });
  }
}

export function buildPredatorPose(transform, projection, profile, attackState = null, reactionState = null) {
  const scale = profile.visual.scale;
  const forward = { x: Math.cos(projection.facing), y: Math.sin(projection.facing) };
  const right = { x: -forward.y, y: forward.x };
  const movement01 = projection.movement01 ?? 0;
  const gait = Math.sin(projection.gaitPhase) * movement01;
  const counter = Math.sin(projection.gaitPhase + Math.PI) * movement01;
  const idleWeight = Math.sin(projection.idlePhase * 0.63 + 0.4) * (1 - movement01) * profile.gait.weightShift * scale;
  const breath = Math.sin(projection.idlePhase) * (1 - movement01) * profile.gait.breathAmplitude * scale;
  const reactionProfile = getImpactReactionProfile(reactionState?.profileId);
  const reactionScale = reactionState
    ? reactionState.recoil01 * Math.min(1.3, 0.55 + reactionState.impulse * 0.72 + reactionState.stagger * 0.28)
    : 0;
  const reactionDirection = reactionState ? { x: reactionState.directionX, y: reactionState.directionY } : { x: 0, y: 0 };
  const attack = profile.attack;
  const exaggeration = attack.poseExaggeration ?? 1;
  const anticipation = attackState?.anticipation01 ?? 0;
  const readyLoad = attackState?.phase === READY_PHASE ? 0.3 : 0;
  const load = clamp(readyLoad + anticipation, 0, 1) * exaggeration;
  const strike = clamp(attackState?.strike01 ?? 0, 0, 1) * exaggeration;
  const recovery = attackState?.phase === EnemyAttackPhase.RECOVER ? smooth01(attackState.progress01) : 0;
  const landing = attackState?.phase === EnemyAttackPhase.RECOVER
    ? Math.sin(Math.PI * Math.min(1, attackState.progress01 * 1.2))
    : 0;
  const jawOpen01 = resolveJawOpen(attackState, attack);
  const committed = (attackState?.forwardCommitDistance ?? 0) * (attackState?.commit01 ?? 0);
  const roll = gait * profile.gait.bodyRoll * scale + idleWeight;
  const center = add(add(add({ x: transform.x, y: transform.y }, forward, committed), right, roll), reactionDirection, reactionProfile.centerPush * reactionScale);
  const chestForward = (profile.body.chestForward + Math.abs(gait) * profile.gait.shoulderLead - load * attack.coilBack + strike * attack.chestDrive - recovery * attack.recoverySlump * 0.22) * scale;
  const hipBack = (profile.body.hipBack + load * attack.coilBack * 0.35 - Math.abs(counter) * profile.gait.haunchDrive) * scale;
  const chest = add(add(center, forward, chestForward + breath), right, gait * profile.gait.bodyRoll * scale);
  const hips = add(add(center, forward, -hipBack - breath * 0.28), right, counter * profile.gait.bodyRoll * 0.72 * scale);
  const waist = add(lerpPoint(chest, hips, 0.54), right, -roll * 0.18);
  const neck = add(chest, forward, (profile.body.neckForward - profile.body.hunch * 0.34 - load * attack.headRecoil * 0.34) * scale);
  const naturalHead = add(neck, forward, (profile.head.forward - load * attack.headRecoil) * scale);
  const naturalMuzzle = add(naturalHead, forward, (profile.head.muzzleForward - load * attack.headRecoil * 0.24) * scale);
  const canonicalMuzzle = add({ x: transform.x, y: transform.y }, forward, attackState?.weaponReach ?? distance(transform, naturalMuzzle));
  const muzzle = lerpPoint(naturalMuzzle, canonicalMuzzle, clamp(strike, 0, 1));
  let head = lerpPoint(naturalHead, add(muzzle, forward, -profile.head.muzzleForward * scale), clamp(strike, 0, 1));
  head = add(head, reactionDirection, (reactionProfile.headPush - reactionProfile.centerPush) * reactionScale);

  const shoulderSurge = Math.abs(gait) * profile.gait.shoulderLead * scale;
  const shoulderHalf = profile.body.shoulderWidth * scale * 0.5;
  const leftShoulder = add(add(chest, right, -shoulderHalf), forward, shoulderSurge + profile.body.hunch * 0.2 * scale);
  const rightShoulder = add(add(chest, right, shoulderHalf), forward, shoulderSurge - profile.body.hunch * 0.08 * scale);
  const brace = (load * 0.45 + landing * 0.82 - strike * 0.55) * attack.braceOut * scale;
  const foreBase = (profile.limbs.idleForeForward - load * attack.clawPullback + strike * attack.clawDrive - recovery * attack.recoverySlump * 0.18) * scale;
  const foreStride = gait * profile.gait.stride * scale;
  const foreAsymmetry = profile.limbs.foreAsymmetry * (1 - clamp(strike, 0, 1) * 0.8) * scale;
  const foreGroundOut = profile.limbs.foreGroundOut * scale;
  const leftWrist = add(add(chest, forward, foreBase + foreStride + foreAsymmetry), right, -shoulderHalf - brace - foreGroundOut);
  const rightWrist = add(add(chest, forward, foreBase - foreStride - foreAsymmetry * 0.45), right, shoulderHalf + brace * 0.86 + foreGroundOut);
  const leftElbow = solveBentJoint(leftShoulder, leftWrist, profile.limbs.upperArmLength * scale, profile.limbs.forearmLength * scale, -1, right);
  const rightElbow = solveBentJoint(rightShoulder, rightWrist, profile.limbs.upperArmLength * scale, profile.limbs.forearmLength * scale, 1, right);
  const clawLateral = profile.limbs.clawSpread * (0.42 + jawOpen01 * 0.58) * scale;
  const leftClaw = add(add(leftWrist, forward, profile.limbs.clawLength * scale), right, -clawLateral);
  const rightClaw = add(add(rightWrist, forward, profile.limbs.clawLength * scale), right, clawLateral);

  const hipHalf = profile.body.hipWidth * scale * 0.5;
  const leftHip = add(hips, right, -hipHalf);
  const rightHip = add(hips, right, hipHalf);
  const hindStride = counter * profile.gait.stride * scale;
  const hindBack = (profile.limbs.idleHindBack + load * attack.braceOut * 0.72 - landing * 0.04) * scale;
  const hindBrace = (load + landing * 0.7) * attack.braceOut * 0.72 * scale;
  const hindGroundOut = profile.limbs.hindGroundOut * scale;
  const leftHindPaw = add(add(hips, forward, -hindBack + hindStride - profile.limbs.hindAsymmetry * scale), right, -hipHalf - hindBrace - hindGroundOut);
  const rightHindPaw = add(add(hips, forward, -hindBack - hindStride + profile.limbs.hindAsymmetry * 0.35 * scale), right, hipHalf + hindBrace * 0.82 + hindGroundOut);
  const leftHock = add(add(leftHindPaw, forward, profile.limbs.hockLength * scale), right, -0.035 * scale);
  const rightHock = add(add(rightHindPaw, forward, profile.limbs.hockLength * scale), right, 0.035 * scale);
  const leftKnee = solveBentJoint(leftHip, leftHock, profile.limbs.thighLength * scale, profile.limbs.shinLength * scale, -1, right);
  const rightKnee = solveBentJoint(rightHip, rightHock, profile.limbs.thighLength * scale, profile.limbs.shinLength * scale, 1, right);

  const tailBase = add(hips, forward, -0.13 * scale);
  const tailWave = Math.sin(projection.gaitPhase * 0.55 + projection.idlePhase * 0.18) * profile.tail.side * scale;
  const tailMid = add(add(tailBase, forward, -profile.tail.back * 0.48 * scale), right, tailWave * 0.46 + profile.tail.midpointBias * scale);
  const tailTip = add(add(tailBase, forward, -profile.tail.back * scale), right, tailWave - (reactionState?.localRight ?? 0) * reactionProfile.tailCounter * reactionScale);
  const eyeForward = profile.head.radius * 0.18 * scale;
  const eyeSide = profile.head.width * 0.24 * scale;
  const leftEye = add(add(head, forward, eyeForward), right, -eyeSide);
  const rightEye = add(add(head, forward, eyeForward), right, eyeSide);
  const leftEarBase = add(add(head, forward, -profile.head.radius * 0.2 * scale), right, -profile.head.width * 0.36 * scale);
  const rightEarBase = add(add(head, forward, -profile.head.radius * 0.16 * scale), right, profile.head.width * 0.36 * scale);
  const leftEarTip = add(add(leftEarBase, forward, -profile.head.earLength * 0.48 * scale), right, -profile.head.earLength * 0.62 * scale);
  const rightEarTip = add(add(rightEarBase, forward, -profile.head.earLength * 0.42 * profile.head.brokenEarScale * scale), right, profile.head.earLength * 0.58 * profile.head.brokenEarScale * scale);
  const jawSide = profile.head.jawWidth * (0.34 + jawOpen01 * 0.3) * scale;
  const leftJaw = add(muzzle, right, -jawSide);
  const rightJaw = add(muzzle, right, jawSide);
  const mouth = add(muzzle, forward, profile.head.muzzleRadius * 0.38 * scale);
  const leftMane = add(chest, right, -profile.body.chestRadius * 0.82 * scale);
  const rightMane = add(chest, right, profile.body.chestRadius * 0.82 * scale);
  const spineMane = add(lerpPoint(chest, waist, 0.58), right, profile.fur.flankRaggedness * 0.35 * scale);

  const points = {
    center, chest: withRadius(chest, profile.body.chestRadius * scale), waist: withRadius(waist, profile.body.waistRadius * scale),
    hips: withRadius(hips, profile.body.hipRadius * scale), neck: withRadius(neck, profile.body.neckRadius * scale),
    head: withRadius(head, profile.head.radius * scale), muzzle: withRadius(muzzle, profile.head.muzzleRadius * scale),
    leftShoulder, rightShoulder, leftElbow, rightElbow,
    leftWrist: withRadius(leftWrist, profile.limbs.forePawRadius * scale), rightWrist: withRadius(rightWrist, profile.limbs.forePawRadius * scale),
    leftClaw, rightClaw, leftHip, rightHip, leftKnee, rightKnee, leftHock, rightHock,
    leftHindPaw: withRadius(leftHindPaw, profile.limbs.hindPawRadius * scale), rightHindPaw: withRadius(rightHindPaw, profile.limbs.hindPawRadius * scale),
    tailBase, tailMid, tailTip, leftEye, rightEye, leftEarBase, rightEarBase, leftEarTip, rightEarTip,
    leftJaw, rightJaw, mouth, leftMane, rightMane, spineMane
  };
  return {
    points,
    sockets: {
      chest: socket(chest, forward, right, 'chest_socket'),
      muzzle: socket(muzzle, forward, right, 'muzzle_socket'),
      leftClaw: socket(leftClaw, forward, right, 'left_claw_socket'),
      rightClaw: socket(rightClaw, forward, right, 'right_claw_socket')
    },
    visualBounds: boundsFor(points, profile.visual.boundsPadding * scale),
    partCount: 31,
    animationState: {
      locomotionId: movement01 > 0.08 ? 'heavy_prowl' : 'loaded_idle',
      gaitStep: Number(gait.toFixed(4)),
      breath: Number(breath.toFixed(4)),
      jawOpen01: Number(jawOpen01.toFixed(4)),
      load01: Number(load.toFixed(4)),
      attackProfileId: attackState?.profileId ?? null,
      attackPhase: attackState?.phase ?? EnemyAttackPhase.IDLE,
      attackProgress01: attackState?.progress01 ?? 0,
      reactionProfileId: reactionState?.profileId ?? null,
      reactionRemaining01: reactionState?.remaining01 ?? 0
    }
  };
}

function resolveMotionState(alive, dodgeState, reactionState, attackState, movement01) {
  if (!alive) return 'defeated';
  if (dodgeState?.active) return 'dodge';
  if (reactionState) return 'hit_react';
  if (attackState) return `attack_${attackState.phase}`;
  return movement01 > 0.08 ? 'heavy_prowl' : 'idle';
}

function resolveJawOpen(state, attack) {
  if (!state) return 0.08;
  if (state.phase === READY_PHASE) return 0.12;
  if (state.phase === EnemyAttackPhase.WINDUP) return lerp(0.12, 0.04, state.anticipation01);
  if (state.phase === EnemyAttackPhase.ACTIVE) return lerp(0.08, attack.jawOpen, smoothstep(0.05, state.damageTime01, state.progress01));
  return lerp(attack.jawOpen * 0.72, 0.08, smooth01(state.progress01));
}

function solveBentJoint(start, end, upperLength, lowerLength, bendSide, rightAxis) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(0.0001, Math.hypot(dx, dy));
  let upper = Math.max(upperLength, distance * 0.52);
  let lower = Math.max(lowerLength, distance * 0.52);
  if (distance <= Math.abs(upper - lower) + 0.001) {
    const average = (upper + lower) * 0.5;
    upper = average;
    lower = average;
  }
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const ux = dx / distance;
  const uy = dy / distance;
  const base = { x: start.x + ux * along, y: start.y + uy * along };
  const offset = { x: -uy * height, y: ux * height };
  const first = add(base, offset, 1);
  const second = add(base, offset, -1);
  const firstSide = dot(subtract(first, base), rightAxis) * bendSide;
  const secondSide = dot(subtract(second, base), rightAxis) * bendSide;
  return firstSide >= secondSide ? first : second;
}

function add(point, axis, amount) { return { x: point.x + axis.x * amount, y: point.y + axis.y * amount }; }
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function dot(a, b) { return a.x * b.x + a.y * b.y; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function lerp(a, b, value) { return a + (b - a) * value; }
function lerpPoint(a, b, value) { return { x: lerp(a.x, b.x, value), y: lerp(a.y, b.y, value) }; }
function smooth01(value) { const t = clamp(value ?? 0, 0, 1); return t * t * (3 - 2 * t); }
function smoothstep(min, max, value) { return smooth01((value - min) / Math.max(0.0001, max - min)); }
function withRadius(point, radius) { return { ...point, radius }; }

function socket(point, forward, right, role) {
  return { x: point.x, y: point.y, forward: { ...forward }, right: { ...right }, role, classification: 'projection_socket' };
}

function boundsFor(points, padding) {
  const values = Object.values(points);
  const minX = Math.min(...values.map((point) => point.x - (point.radius ?? 0))) - padding;
  const minY = Math.min(...values.map((point) => point.y - (point.radius ?? 0))) - padding;
  const maxX = Math.max(...values.map((point) => point.x + (point.radius ?? 0))) + padding;
  const maxY = Math.max(...values.map((point) => point.y + (point.radius ?? 0))) + padding;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
