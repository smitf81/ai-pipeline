import { getInputActionPromptLabels, InputActionId } from '../data/inputActions.js';
import { SMOKE_AWAKENING, SmokeAwakeningPhase } from '../data/smokeAwakening.js';

const RAIDER_SHADOW_STAGING = Object.freeze([
  Object.freeze({ x: 0.2, y: 0.38, directionX: -0.46, directionY: 0.12, scale: 0.88, torch: true }),
  Object.freeze({ x: 0.34, y: 0.26, directionX: -0.24, directionY: -0.42, scale: 0.72, torch: false }),
  Object.freeze({ x: 0.66, y: 0.3, directionX: 0.32, directionY: -0.36, scale: 0.8, torch: true }),
  Object.freeze({ x: 0.78, y: 0.43, directionX: 0.48, directionY: 0.08, scale: 0.94, torch: false })
]);

export function buildSmokeAwakeningProjection(state) {
  const scene = state?.smokeAwakening;
  if (!scene) return null;
  const active = scene.enabled === true && scene.released !== true;
  const phaseProgress = phaseProgress01(scene);
  const accepted01 = scene.acceptedInputCount / Math.max(1, scene.requiredInputCount);
  const clearing01 = scene.phase === SmokeAwakeningPhase.CLEARING ? phaseProgress : 0;
  const smokeCoverage = resolveSmokeCoverage(scene.phase, phaseProgress, clearing01);
  const pocket01 = scene.enabled === true
    ? clamp01((SMOKE_AWAKENING.visual.pocketStages[scene.acceptedInputCount] ?? accepted01 * 0.5) + clearing01 * 0.48)
    : 0;
  const reducedMotion = state.playerProfile?.settings?.reducedMotion === true;
  return {
    classification: 'renderer_neutral_smoke_instinct_transition_v1',
    contract: scene.contract,
    source: scene.source,
    active,
    screenActive: active,
    phase: scene.phase,
    elapsedReal: scene.elapsedReal,
    phaseElapsedReal: scene.phaseElapsedReal,
    phaseProgress,
    acceptedInputCount: scene.acceptedInputCount,
    requiredInputCount: scene.requiredInputCount,
    accepted01,
    impactPulse: clamp01(scene.impactPulse),
    exhalePulse: clamp01(scene.exhalePulse),
    smokeCoverage,
    pocket01,
    clearing01,
    raiderShadows: buildRaiderShadows(state, scene.phase, phaseProgress, reducedMotion),
    prompt: scene.phase === SmokeAwakeningPhase.EXHALE && scene.promptVisible
      ? {
          actionId: InputActionId.SMOKE,
          title: SMOKE_AWAKENING.narrative.playerInstruction,
          bindings: getInputActionPromptLabels(InputActionId.SMOKE),
          lastAcceptedLabel: scene.lastInputLabel
        }
      : null,
    camera: buildCamera(scene, reducedMotion),
    narrative: { ...SMOKE_AWAKENING.narrative },
    settings: { reducedMotion },
    released: scene.released === true,
    unlockApplied: scene.unlockApplied === true,
    radialSmokeEmitted: scene.radialSmokeEmitted === true
  };
}

function buildRaiderShadows(state, phase, progress, reducedMotion) {
  if (phase !== SmokeAwakeningPhase.SCATTER && phase !== SmokeAwakeningPhase.SMOKE_ROLL) return [];
  const scatter = phase === SmokeAwakeningPhase.SCATTER ? smoothstep(0.08, 0.96, progress) : 1;
  const smokeFade = phase === SmokeAwakeningPhase.SMOKE_ROLL ? 1 - smoothstep(0.04, 0.72, progress) : 1;
  const actors = state?.game?.actors ?? [];
  const player = actors.find((actor) => actor.id === state?.game?.dragonId) ?? null;
  const raiders = actors
    .filter((actor) => actor.type === 'raider' && actor.alive === true)
    .sort((left, right) => distanceSquared(left, player) - distanceSquared(right, player))
    .slice(0, RAIDER_SHADOW_STAGING.length);
  return raiders.map((actor, index) => ({
    ...RAIDER_SHADOW_STAGING[index],
    index,
    sourceActorId: actor.id,
    sourceType: actor.type,
    sourceTeam: actor.team,
    torch: actor.lightEmitter?.id === 'torch' && actor.lightEmitter?.enabled !== false,
    travel: reducedMotion ? scatter * 0.34 : scatter,
    opacity: smokeFade * (0.72 - index * 0.055)
  }));
}

function distanceSquared(actor, target) {
  if (!target) return 0;
  return (actor.x - target.x) ** 2 + (actor.y - target.y) ** 2;
}

function buildCamera(scene, reducedMotion) {
  const impact = reducedMotion ? 0 : clamp01(scene.impactPulse);
  const oscillation = Math.sin(scene.elapsedReal * 48) * impact;
  return {
    zoom: SMOKE_AWAKENING.visual.cameraZoom,
    anchorWorldX: scene.anchor.worldX,
    anchorWorldY: scene.anchor.worldY,
    impulseWorldX: oscillation * SMOKE_AWAKENING.visual.impactShakeWorld,
    impulseWorldY: Math.cos(scene.elapsedReal * 41) * impact * SMOKE_AWAKENING.visual.impactShakeWorld * 0.68,
    reducedMotion
  };
}

function resolveSmokeCoverage(phase, progress, clearing01) {
  if (phase === SmokeAwakeningPhase.IMPACT) return progress * 0.08;
  if (phase === SmokeAwakeningPhase.SCATTER) return 0.08 + progress * 0.18;
  if (phase === SmokeAwakeningPhase.SMOKE_ROLL) return 0.26 + smoothstep(0.02, 0.92, progress) * 0.74;
  if (phase === SmokeAwakeningPhase.EXHALE) return 1;
  if (phase === SmokeAwakeningPhase.CLEARING) return 1 - clearing01 * 0.28;
  return 0;
}

function phaseProgress01(scene) {
  const duration = scene.phase === SmokeAwakeningPhase.IMPACT ? SMOKE_AWAKENING.timing.impactSeconds
    : scene.phase === SmokeAwakeningPhase.SCATTER ? SMOKE_AWAKENING.timing.scatterSeconds
      : scene.phase === SmokeAwakeningPhase.SMOKE_ROLL ? SMOKE_AWAKENING.timing.smokeRollSeconds
        : scene.phase === SmokeAwakeningPhase.CLEARING ? SMOKE_AWAKENING.timing.clearingSeconds
          : scene.phase === SmokeAwakeningPhase.EXHALE ? SMOKE_AWAKENING.timing.promptDelaySeconds
            : 1;
  return clamp01(scene.phaseElapsedReal / Math.max(0.001, duration));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
