export const TRANSITION_SEQUENCE_CONTRACT = 'axiom.bsb-transition-sequence.v1';

const PHASE_IDS = Object.freeze(['impact', 'raider_charge', 'smoke_cover']);

export function normalizeRuntimeTransitionSequences(source, options = {}) {
  if (source == null) return [];
  if (!Array.isArray(source)) throw new Error('runtime_transition_sequences_invalid');
  const actorIds = new Set(options.actorIds ?? []);
  const seen = new Set();
  return source.map((entry, index) => {
    const sequence = normalizeSequence(entry, index);
    if (seen.has(sequence.id)) throw new Error(`runtime_transition_sequence_id_duplicate:${sequence.id}`);
    seen.add(sequence.id);
    for (const track of sequence.actorTracks) {
      if (!actorIds.has(track.actorId)) throw new Error(`runtime_transition_sequence_actor_missing:${sequence.id}:${track.actorId}`);
    }
    return sequence;
  });
}

function normalizeSequence(source, index) {
  const label = `sceneSequences:${index}`;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(`runtime_transition_sequence_invalid:${index}`);
  if (source.contract !== TRANSITION_SEQUENCE_CONTRACT) throw new Error(`runtime_transition_sequence_contract_invalid:${source.contract ?? 'missing'}`);
  const phases = Array.isArray(source.phases) ? source.phases.map((phase, phaseIndex) => ({
    id: id(phase?.id, `${label}.phases:${phaseIndex}.id`),
    durationSeconds: number(phase?.durationSeconds, `${label}.phases:${phaseIndex}.durationSeconds`, 0.1, 30)
  })) : [];
  if (phases.length !== PHASE_IDS.length || PHASE_IDS.some((phaseId, phaseIndex) => phases[phaseIndex]?.id !== phaseId)) {
    throw new Error(`runtime_transition_sequence_phase_order_invalid:${index}`);
  }
  const actorTracks = Array.isArray(source.actorTracks) ? source.actorTracks.map((track, trackIndex) => ({
    actorId: id(track?.actorId, `${label}.actorTracks:${trackIndex}.actorId`),
    reserve: track?.reserve !== false,
    path: normalizePath(track?.path, `${label}.actorTracks:${trackIndex}.path`)
  })) : [];
  if (actorTracks.length < 1) throw new Error(`runtime_transition_sequence_actor_tracks_missing:${index}`);
  const actorTrackIds = actorTracks.map((track) => track.actorId);
  if (new Set(actorTrackIds).size !== actorTrackIds.length) throw new Error(`runtime_transition_sequence_actor_duplicate:${index}`);
  const debrisDirection = id(source.landing?.debris?.direction ?? 'north_to_south', `${label}.landing.debris.direction`);
  const smokeDirection = id(source.smoke?.direction ?? 'north_to_south', `${label}.smoke.direction`);
  if (debrisDirection !== 'north_to_south' || smokeDirection !== 'north_to_south') {
    throw new Error(`runtime_transition_sequence_direction_unsupported:${index}`);
  }
  const triggerType = id(source.trigger?.type ?? 'escape_zone', `${label}.trigger.type`);
  const cameraMode = id(source.camera?.mode ?? 'hold_player_north', `${label}.camera.mode`);
  const handoffAction = id(source.handoff?.action ?? 'load_transition', `${label}.handoff.action`);
  if (triggerType !== 'escape_zone' || cameraMode !== 'hold_player_north' || handoffAction !== 'load_transition') {
    throw new Error(`runtime_transition_sequence_mode_unsupported:${index}`);
  }
  return Object.freeze({
    contract: TRANSITION_SEQUENCE_CONTRACT,
    id: id(source.id, `${label}.id`),
    label: text(source.label, 'Authored transition'),
    trigger: Object.freeze({ type: triggerType }),
    camera: Object.freeze({
      mode: cameraMode,
      playerFacingRadians: number(source.camera?.playerFacingRadians ?? -Math.PI / 2, `${label}.camera.playerFacingRadians`, -Math.PI * 4, Math.PI * 4),
      zoom: number(source.camera?.zoom ?? 2.75, `${label}.camera.zoom`, 0.5, 5)
    }),
    landing: Object.freeze({
      anchor: Object.freeze({
        x: number(source.landing?.anchor?.x, `${label}.landing.anchor.x`, -1024, 1024),
        y: number(source.landing?.anchor?.y, `${label}.landing.anchor.y`, -1024, 1024)
      }),
      rumble: Object.freeze({
        durationSeconds: number(source.landing?.rumble?.durationSeconds ?? 0.7, `${label}.landing.rumble.durationSeconds`, 0.1, 5),
        intensity: number(source.landing?.rumble?.intensity ?? 0.8, `${label}.landing.rumble.intensity`, 0, 2)
      }),
      debris: Object.freeze({
        direction: debrisDirection,
        count: integer(source.landing?.debris?.count ?? 24, `${label}.landing.debris.count`, 4, 96)
      })
    }),
    phases: Object.freeze(phases.map(Object.freeze)),
    actorTracks: Object.freeze(actorTracks.map((track) => Object.freeze({
      ...track,
      path: Object.freeze(track.path.map(Object.freeze))
    }))),
    smoke: Object.freeze({
      direction: smokeDirection,
      coverageThreshold: number(source.smoke?.coverageThreshold ?? 0.92, `${label}.smoke.coverageThreshold`, 0.5, 1)
    }),
    handoff: Object.freeze({ action: handoffAction })
  });
}

function normalizePath(source, label) {
  if (!Array.isArray(source) || source.length < 2) throw new Error(`runtime_transition_sequence_path_invalid:${label}`);
  const path = source.map((node, index) => ({
    at: number(node?.at, `${label}:${index}.at`, 0, 1),
    x: number(node?.x, `${label}:${index}.x`, -1024, 1024),
    y: number(node?.y, `${label}:${index}.y`, -1024, 1024)
  }));
  if (path[0].at !== 0 || path.at(-1).at !== 1) throw new Error(`runtime_transition_sequence_path_endpoints_invalid:${label}`);
  for (let index = 1; index < path.length; index += 1) {
    if (path[index].at <= path[index - 1].at) throw new Error(`runtime_transition_sequence_path_order_invalid:${label}:${index}`);
  }
  return path;
}

function id(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!/^[a-z][a-z0-9._:]*$/.test(normalized)) throw new Error(`runtime_transition_sequence_id_invalid:${label}`);
  return normalized;
}

function text(value, fallback) {
  return String(value ?? '').trim() || fallback;
}

function number(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`runtime_transition_sequence_number_invalid:${label}`);
  return parsed;
}

function integer(value, label, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`runtime_transition_sequence_integer_invalid:${label}`);
  return parsed;
}
