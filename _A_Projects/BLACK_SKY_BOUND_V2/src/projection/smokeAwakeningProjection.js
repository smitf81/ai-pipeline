import { getInputActionPromptLabels, InputActionId } from '../data/inputActions.js';
import { SMOKE_AWAKENING, SmokeAwakeningPhase } from '../data/smokeAwakening.js';

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
    fullSmokeOpacity: SMOKE_AWAKENING.visual.fullSmokeOpacity,
    pocket01,
    clearing01,
    raiderShadows: [],
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
  if (phase === SmokeAwakeningPhase.BLACKOUT_HOLD) return 1;
  if (phase === SmokeAwakeningPhase.EXHALE) return 1;
  if (phase === SmokeAwakeningPhase.CLEARING) return 1 - clearing01 * 0.62;
  return 0;
}

function phaseProgress01(scene) {
  const duration = scene.phase === SmokeAwakeningPhase.IMPACT ? SMOKE_AWAKENING.timing.impactSeconds
    : scene.phase === SmokeAwakeningPhase.SCATTER ? SMOKE_AWAKENING.timing.scatterSeconds
      : scene.phase === SmokeAwakeningPhase.SMOKE_ROLL ? SMOKE_AWAKENING.timing.smokeRollSeconds
        : scene.phase === SmokeAwakeningPhase.BLACKOUT_HOLD ? SMOKE_AWAKENING.timing.blackoutHoldSeconds
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
