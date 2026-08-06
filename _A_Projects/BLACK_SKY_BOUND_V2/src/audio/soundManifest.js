import { AUDIO_BUS_IDS, AUDIO_TUNING } from '../data/audio/audioTuning.js';

export const SOUND_MANIFEST_CONTRACT = 'black-sky-bound.audio-manifest.v1';

const productionAssetRoot = 'assets/audio/production';

export const SOUND_CUES = Object.freeze({
  'ambience.forest_night': cue({
    id: 'ambience.forest_night',
    bus: 'ambience',
    volume: 0.52,
    loop: true,
    maxVoices: 1,
    procedural: { type: 'forestNightLoop', colour: 'low_wind_ash', rateHz: 0.08 }
  }),
  'player.breath.calm': cue({
    id: 'player.breath.calm',
    bus: 'player',
    volume: 0.52,
    loop: true,
    maxVoices: 1,
    procedural: { type: 'breathCycleLoop', mode: 'calm', rateHz: 0.34 }
  }),
  'player.breath.strained': cue({
    id: 'player.breath.strained',
    bus: 'player',
    volume: 0.72,
    loop: true,
    maxVoices: 1,
    procedural: { type: 'breathCycleLoop', mode: 'strained', rateHz: 0.78 }
  }),
  'player.heartbeat': cue({
    id: 'player.heartbeat',
    files: [`${productionAssetRoot}/player_heartbeat_01.wav`],
    source: 'file',
    required: true,
    bus: 'player',
    volume: 0.62,
    loop: true,
    maxVoices: 1
  }),
  'player.hit.light': cue({
    id: 'player.hit.light',
    bus: 'player',
    volume: 0.74,
    pitchRandom: [0.94, 1.06],
    cooldownMs: 90,
    maxVoices: 3,
    procedural: { type: 'impactThud', frequencyHz: 92, noise: 0.42, durationMs: 170 }
  }),
  'player.hit.heavy': cue({
    id: 'player.hit.heavy',
    bus: 'player',
    volume: 0.9,
    pitchRandom: [0.9, 1.02],
    cooldownMs: 140,
    maxVoices: 2,
    procedural: { type: 'impactThud', frequencyHz: 66, noise: 0.58, durationMs: 260 }
  }),
  'player.stamina.low': cue({
    id: 'player.stamina.low',
    bus: 'player',
    volume: 0.58,
    pitchRandom: [0.96, 1.04],
    cooldownMs: 1450,
    maxVoices: 1,
    procedural: { type: 'breathBurst', frequencyHz: 180, durationMs: 340 }
  }),
  'player.smoke.exhale': cue({
    id: 'player.smoke.exhale',
    bus: 'player',
    volume: 0.72,
    pitchRandom: [0.9, 1.08],
    cooldownMs: 220,
    maxVoices: 2,
    procedural: { type: 'smokeExhale', frequencyHz: 145, noise: 0.86, durationMs: 620 }
  }),
  'instinct.smoke.impact': cue({
    id: 'instinct.smoke.impact',
    bus: 'ambience',
    volume: 0.92,
    pitchRandom: [0.96, 1.01],
    cooldownMs: 900,
    maxVoices: 1,
    procedural: { type: 'impactThud', frequencyHz: 38, noise: 0.72, durationMs: 980 }
  }),
  'instinct.smoke.debris': cue({
    id: 'instinct.smoke.debris',
    bus: 'ambience',
    volume: 0.7,
    pitchRandom: [0.94, 1.04],
    cooldownMs: 720,
    maxVoices: 1,
    procedural: { type: 'shellBreak', frequencyHz: 76, noise: 0.52, durationMs: 740 }
  }),
  'instinct.smoke.cough': cue({
    id: 'instinct.smoke.cough',
    bus: 'player',
    volume: 0.56,
    pitchRandom: [0.95, 1.06],
    cooldownMs: 430,
    maxVoices: 1,
    procedural: { type: 'breathBurst', frequencyHz: 172, noise: 0.62, durationMs: 360 }
  }),
  'player.claw.swipe': cue({
    id: 'player.claw.swipe',
    bus: 'combat',
    volume: 0.62,
    pitchRandom: [0.95, 1.1],
    cooldownMs: 80,
    maxVoices: 3,
    procedural: { type: 'airSlice', frequencyHz: 610, durationMs: 160 }
  }),
  'player.bite.snap': cue({
    id: 'player.bite.snap',
    files: [
      `${productionAssetRoot}/player_bite_snap_01.wav`,
      `${productionAssetRoot}/player_bite_snap_02.wav`,
      `${productionAssetRoot}/player_bite_snap_03.wav`
    ],
    source: 'file',
    required: true,
    bus: 'combat',
    volume: 0.66,
    pitchRandom: [0.985, 1.015],
    cooldownMs: 105,
    maxVoices: 2
  }),
  'player.lunge.body': cue({
    id: 'player.lunge.body',
    bus: 'combat',
    volume: 0.78,
    pitchRandom: [0.92, 1.03],
    cooldownMs: 180,
    maxVoices: 2,
    procedural: { type: 'bodyRush', frequencyHz: 98, durationMs: 300 }
  }),
  'combat.enemy.hit.flesh': cue({
    id: 'combat.enemy.hit.flesh',
    files: [`${productionAssetRoot}/enemy_hit_flesh_01.wav`, `${productionAssetRoot}/enemy_hit_flesh_02.wav`],
    source: 'file',
    required: true,
    bus: 'combat',
    volume: 0.67,
    pitchRandom: [0.965, 1.035],
    cooldownMs: 70,
    maxVoices: 4
  }),
  'enemy.raider.near': cue({
    id: 'enemy.raider.near',
    bus: 'enemies',
    volume: 0.46,
    pitchRandom: [0.94, 1.08],
    cooldownMs: 900,
    maxVoices: 2,
    procedural: { type: 'distantCall', frequencyHz: 210, durationMs: 420 }
  }),
  'enemy.raider.warn': cue({
    id: 'enemy.raider.warn',
    files: [
      `${productionAssetRoot}/enemy_raider_warning_01.wav`,
      `${productionAssetRoot}/enemy_raider_warning_02.wav`,
      `${productionAssetRoot}/enemy_raider_warning_03.wav`,
      `${productionAssetRoot}/enemy_raider_warning_04.wav`,
      `${productionAssetRoot}/enemy_raider_warning_05.wav`
    ],
    source: 'file',
    required: true,
    bus: 'enemies',
    volume: 0.7,
    pitchRandom: [0.985, 1.015],
    cooldownMs: 360,
    maxVoices: 3
  }),
  'enemy.raider.distant_shout': cue({
    id: 'enemy.raider.distant_shout',
    bus: 'enemies',
    volume: 0.56,
    pitchRandom: [0.94, 1.04],
    cooldownMs: 1200,
    maxVoices: 1,
    procedural: { type: 'distantShout', frequencyHz: 190, durationMs: 560 }
  }),
  'enemy.werewolf.distant_howl': cue({
    id: 'enemy.werewolf.distant_howl',
    bus: 'enemies',
    volume: 0.64,
    pitchRandom: [0.96, 1.025],
    cooldownMs: 1800,
    maxVoices: 1,
    procedural: { type: 'creatureHowl', frequencyHz: 205, durationMs: 1320 }
  }),
  'enemy.husk.distant_gargle': cue({
    id: 'enemy.husk.distant_gargle',
    bus: 'enemies',
    volume: 0.5,
    pitchRandom: [0.92, 1.05],
    cooldownMs: 1400,
    maxVoices: 1,
    procedural: { type: 'huskGargle', frequencyHz: 96, durationMs: 820 }
  }),
  'world.storm.thunder': cue({
    id: 'world.storm.thunder',
    bus: 'ambience',
    volume: 0.78,
    pitchRandom: [0.94, 1.025],
    cooldownMs: 900,
    maxVoices: 2,
    procedural: { type: 'thunderRoll', frequencyHz: 46, durationMs: 1680 }
  }),
  'world.mama_wyvern.distant_roar': cue({
    id: 'world.mama_wyvern.distant_roar',
    files: [`${productionAssetRoot}/mama_wyvern_distant_roar_02.wav`],
    source: 'file',
    required: true,
    bus: 'enemies',
    volume: 0.7,
    pitchRandom: [0.985, 1.01],
    cooldownMs: 1200,
    maxVoices: 1
  }),
  'world.mama_wyvern.flyover_roar': cue({
    id: 'world.mama_wyvern.flyover_roar',
    files: [`${productionAssetRoot}/mama_wyvern_flyover_roar_01.wav`],
    source: 'file',
    required: true,
    bus: 'enemies',
    volume: 1,
    pitchRandom: [0.985, 1.01],
    cooldownMs: 1200,
    maxVoices: 1
  }),
  'world.mama_wyvern.napalm_projection': cue({
    id: 'world.mama_wyvern.napalm_projection',
    files: [`${productionAssetRoot}/mama_wyvern_napalm_projection_01.wav`],
    source: 'file',
    required: true,
    bus: 'combat',
    volume: 0.96,
    pitchRandom: [0.98, 1.015],
    cooldownMs: 900,
    maxVoices: 1
  }),
  'world.mama_wyvern.inferno_aftermath': cue({
    id: 'world.mama_wyvern.inferno_aftermath',
    files: [`${productionAssetRoot}/mama_wyvern_inferno_aftermath_01.wav`],
    source: 'file',
    required: true,
    bus: 'ambience',
    volume: 0.58,
    pitchRandom: [0.995, 1.005],
    cooldownMs: 1600,
    maxVoices: 1
  }),
  'ui.pause.breath_stop': cue({
    id: 'ui.pause.breath_stop',
    bus: 'ui',
    volume: 0.42,
    pitchRandom: [0.98, 1.02],
    cooldownMs: 160,
    maxVoices: 1,
    procedural: { type: 'softThump', frequencyHz: 82, durationMs: 150 }
  }),
  'opening.egg.rock': cue({
    id: 'opening.egg.rock',
    bus: 'player',
    volume: 0.48,
    pitchRandom: [0.94, 1.02],
    cooldownMs: 260,
    maxVoices: 1,
    procedural: { type: 'shellRock', frequencyHz: 68, noise: 0.22, durationMs: 260 }
  }),
  'opening.egg.crack': cue({
    id: 'opening.egg.crack',
    bus: 'player',
    volume: 0.56,
    pitchRandom: [0.98, 1.05],
    cooldownMs: 260,
    maxVoices: 1,
    procedural: { type: 'shellCrack', frequencyHz: 540, noise: 0.36, durationMs: 250 }
  }),
  'opening.egg.break': cue({
    id: 'opening.egg.break',
    bus: 'player',
    volume: 0.72,
    pitchRandom: [0.96, 1.02],
    cooldownMs: 500,
    maxVoices: 1,
    procedural: { type: 'shellBreak', frequencyHz: 82, noise: 0.48, durationMs: 620 }
  })
});

export function getSoundCue(id) {
  return SOUND_CUES[id] ?? null;
}

export function validateSoundManifest(cues = SOUND_CUES) {
  const ids = Object.keys(cues);
  const errors = [];
  const seen = new Set();
  for (const [id, cueDef] of Object.entries(cues)) {
    if (seen.has(id)) errors.push(`duplicate_cue_id:${id}`);
    seen.add(id);
    if (cueDef.id !== id) errors.push(`cue_key_id_mismatch:${id}`);
    if (!AUDIO_BUS_IDS.includes(cueDef.bus)) errors.push(`unknown_bus:${id}:${cueDef.bus}`);
    if (!Array.isArray(cueDef.files)) errors.push(`missing_files_array:${id}`);
    if (!['file', 'procedural_sfx'].includes(cueDef.source)) errors.push(`unknown_source:${id}:${cueDef.source}`);
    if (cueDef.source === 'file' && cueDef.files.length === 0) errors.push(`file_source_missing_files:${id}`);
    if (cueDef.source === 'procedural_sfx' && !cueDef.procedural?.type) errors.push(`missing_procedural_profile:${id}`);
    if (cueDef.required && cueDef.source !== 'file') errors.push(`required_cue_must_be_file:${id}`);
    if (cueDef.loop && cueDef.maxVoices !== 1) errors.push(`loop_must_be_single_voice:${id}`);
  }
  return {
    ok: errors.length === 0,
    contract: SOUND_MANIFEST_CONTRACT,
    cueCount: ids.length,
    errors
  };
}

function cue(definition) {
  return Object.freeze({
    cooldownMs: AUDIO_TUNING.cueDefaults.cooldownMs,
    maxVoices: AUDIO_TUNING.cueDefaults.maxVoices,
    pitchRandom: AUDIO_TUNING.cueDefaults.pitchRandom,
    volume: AUDIO_TUNING.cueDefaults.volume,
    loop: false,
    source: 'procedural_sfx',
    required: false,
    ...definition,
    files: Object.freeze([...(definition.files ?? [])]),
    pitchRandom: Object.freeze([...(definition.pitchRandom ?? AUDIO_TUNING.cueDefaults.pitchRandom)]),
    procedural: definition.procedural ? Object.freeze({ ...definition.procedural }) : null
  });
}
