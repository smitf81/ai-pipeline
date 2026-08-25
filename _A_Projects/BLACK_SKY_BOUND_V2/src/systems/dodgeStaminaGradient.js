import { metersToTiles } from '../data/worldScale.js';

export const PLAYER_DODGE_GRADIENT_CONTRACT = 'black-sky-bound.player-dodge-stamina-gradient.v1';

export function resolvePlayerDodgeGradient(stamina, dodge) {
  const max = Math.max(0.001, finite(stamina?.max, 1));
  const current = clamp(finite(stamina?.current, 0), 0, max);
  const energy01 = clamp01(current / max);
  const fullEffectEnergy01 = clamp(finite(dodge?.fullEffectEnergy01, 0.4), 0.001, 1);
  const minEffectiveness = clamp(finite(dodge?.minEffectiveness, 0.5), 0, 1);
  const linear01 = clamp01(energy01 / fullEffectEnergy01);
  const curve01 = dodge?.gradientCurve === 'linear' ? linear01 : smooth01(linear01);
  const effectiveness = lerp(minEffectiveness, 1, curve01);
  const cost = Math.max(0, finite(dodge?.cost, 0));
  const funded = current + 0.0001 >= cost;
  const mode = funded ? (curve01 >= 0.9999 ? 'full' : 'strained') : 'emergency';
  const distanceMinMeters = Math.max(0, finite(dodge?.distanceMinMeters, 0.28));
  const distanceMaxMeters = Math.max(distanceMinMeters, finite(dodge?.distanceMaxMeters, 0.56));
  const distanceMeters = lerp(distanceMinMeters, distanceMaxMeters, curve01);
  return Object.freeze({
    contract: PLAYER_DODGE_GRADIENT_CONTRACT,
    energy01,
    curve01,
    effectiveness,
    mode,
    funded,
    followupsEnabled: funded,
    staminaBefore: current,
    staminaSpend: funded ? cost : current,
    distanceMeters,
    distanceTiles: metersToTiles(distanceMeters),
    apexHeightMeters: lerp(
      Math.max(0, finite(dodge?.apexMinMeters, 0.06)),
      Math.max(0, finite(dodge?.apexMaxMeters, 0.12)),
      curve01
    ),
    landingCompressionMeters: lerp(
      Math.max(0, finite(dodge?.landingCompressionLowEnergyMeters, 0.09)),
      Math.max(0, finite(dodge?.landingCompressionFullEnergyMeters, 0.06)),
      curve01
    ),
    cooldownSeconds: lerp(
      Math.max(0, finite(dodge?.cooldownLowEnergySeconds, 0.75)),
      Math.max(0, finite(dodge?.cooldownFullEnergySeconds, 0.55)),
      curve01
    )
  });
}

export function resolveSprintResumeThreshold(stamina) {
  const max = Math.max(0, finite(stamina?.max, 0));
  const ratio = clamp01(finite(stamina?.sprintResumeEnergy01, max > 0
    ? finite(stamina?.sprintResumeThreshold, 0) / max
    : 0));
  return max * ratio;
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function smooth01(value) { const t = clamp01(value); return t * t * (3 - 2 * t); }
function clamp01(value) { return clamp(value, 0, 1); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min)); }
