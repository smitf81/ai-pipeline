import { buildProceduralLoop as buildLoop } from './proceduralLoops.js';
import { buildProceduralOneShot as buildOneShot } from './proceduralOneShots.js';

export function proceduralDuration(cue) {
  return Math.max(80, cue?.procedural?.durationMs ?? 220);
}

export function randomPitch(cue, payload = {}, sequence = 0) {
  if (Number.isFinite(Number(payload.pitch))) return Number(payload.pitch);
  const [min, max] = cue.pitchRandom ?? [1, 1];
  if (min === max) return min;
  const seed = Math.sin((
    cue.id.length
    + Math.round((payload.intensity ?? 1) * 1000)
    + Math.max(0, Math.trunc(sequence)) * 37
  ) * 12.9898) * 43758.5453;
  const t = seed - Math.floor(seed);
  return min + (max - min) * t;
}

export function buildProceduralLoop(context, cue, outputGain) {
  return buildLoop(context, cue, outputGain);
}

export function buildProceduralOneShot(context, cue, outputGain, pitch = 1) {
  return buildOneShot(context, cue, outputGain, pitch);
}
