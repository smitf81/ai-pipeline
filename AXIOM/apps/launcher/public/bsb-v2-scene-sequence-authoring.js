export const BSB_V2_TRANSITION_SEQUENCE_CONTRACT = 'axiom.bsb-transition-sequence.v1';
export const BSB_V2_TRANSITION_SEQUENCE_OPERATION_CONTRACT = 'axiom.bsb-transition-sequence-operation.v1';
export const BSB_V2_TRANSITION_SEQUENCE_INTENT_PROPOSAL_CONTRACT = 'axiom.bsb-transition-sequence-intent-proposal.v1';
export const SMOKE_INSTINCT_DEPARTURE_ID = 'smoke_instinct_departure';

const PHASE_IDS = Object.freeze(['impact', 'raider_charge', 'smoke_cover']);

export function createSmokeInstinctDepartureSequence() {
  return {
    contract: BSB_V2_TRANSITION_SEQUENCE_CONTRACT,
    id: SMOKE_INSTINCT_DEPARTURE_ID,
    label: 'Mama lands · raiders charge · smoke cover',
    trigger: { type: 'escape_zone' },
    camera: { mode: 'hold_player_north', playerFacingRadians: -Math.PI / 2, zoom: 2.82 },
    landing: {
      anchor: { x: 38.5, y: -2.5 },
      rumble: { durationSeconds: 0.72, intensity: 0.92 },
      debris: { direction: 'north_to_south', count: 32 }
    },
    phases: [
      { id: 'impact', durationSeconds: 0.9 },
      { id: 'raider_charge', durationSeconds: 1.65 },
      { id: 'smoke_cover', durationSeconds: 1.45 }
    ],
    actorTracks: [
      {
        actorId: 'raider:34:8:2200',
        reserve: true,
        path: [
          { at: 0, x: 34.5, y: 8.5 },
          { at: 0.48, x: 36.2, y: 4.9 },
          { at: 1, x: 37.7, y: 1.15 }
        ]
      },
      {
        actorId: 'raider:39:11:2201',
        reserve: true,
        path: [
          { at: 0, x: 39.5, y: 11.5 },
          { at: 0.52, x: 39.15, y: 6.15 },
          { at: 1, x: 38.55, y: 1.35 }
        ]
      }
    ],
    smoke: { direction: 'north_to_south', coverageThreshold: 0.92 },
    handoff: { action: 'load_transition' }
  };
}

export function normalizeBsbV2TransitionSequences(source, options = {}) {
  if (source == null) return [];
  if (!Array.isArray(source)) throw new Error('bsb_transition_sequences_invalid');
  const actorIds = options.actorIds ? new Set(options.actorIds) : null;
  const seen = new Set();
  return source.map((entry, index) => {
    const sequence = normalizeSequence(entry, `sceneSequences:${index}`);
    if (seen.has(sequence.id)) throw new Error(`bsb_transition_sequence_id_duplicate:${sequence.id}`);
    seen.add(sequence.id);
    if (actorIds) {
      for (const track of sequence.actorTracks) {
        if (!actorIds.has(track.actorId)) throw new Error(`bsb_transition_sequence_actor_missing:${sequence.id}:${track.actorId}`);
      }
    }
    return sequence;
  });
}

export function parseBsbV2TransitionSequenceCommand(text) {
  const raw = String(text || '').trim();
  const normalized = raw.toLowerCase();
  const sequenceId = raw.match(/(?:sequence\s+id|sequenceId)\s*[=:]?\s*["'`]([^"'`]+)["'`]/i)?.[1]
    || SMOKE_INSTINCT_DEPARTURE_ID;
  const landing = normalized.match(/(?:landing|mama lands)(?:\s+(?:anchor|at|to))?\s*\(?\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*\)?/i);
  const duration = Number(normalized.match(/(?:to|for|duration)\s+(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds)\b/i)?.[1]);
  let parameters;

  if (/\b(remove|delete)\b/.test(normalized)) {
    parameters = { op: 'remove', sequenceId };
  } else if (landing) {
    parameters = { op: 'set_landing_anchor', sequenceId, x: Number(landing[1]), y: Number(landing[2]) };
  } else if (Number.isFinite(duration)) {
    const phaseId = resolveDurationPhase(normalized);
    if (!phaseId) return null;
    parameters = { op: 'set_phase_duration', sequenceId, phaseId, durationSeconds: duration };
  } else if (/\b(handoff|coverage|threshold)\b/.test(normalized)) {
    const percent = Number(normalized.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]);
    const decimal = Number(normalized.match(/(?:to|at)\s+(0(?:\.\d+)?|1(?:\.0+)?)\b/)?.[1]);
    const coverageThreshold = Number.isFinite(percent) ? percent / 100 : decimal;
    if (!Number.isFinite(coverageThreshold)) return null;
    parameters = { op: 'set_smoke_threshold', sequenceId, coverageThreshold };
  } else if (/\b(author|create|add|ensure|implement)\b/.test(normalized)
    && /\b(smoke instinct|smoke unlock|mama lands|departure sequence|scene transition|transition sequence)\b/.test(normalized)) {
    parameters = { op: 'ensure_smoke_instinct_departure' };
  } else {
    return null;
  }

  return {
    command: 'mcp_call',
    tool: 'axiom_scene_sequence_apply',
    parameters,
    source: 'AgenticToolUseLoop.scene_sequence_action'
  };
}

export function normalizeBsbV2TransitionSequenceIntentProposal(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('bsb_transition_sequence_intent_proposal_invalid');
  const rawOperation = source.operation ?? source.parameters;
  if (!rawOperation || typeof rawOperation !== 'object' || Array.isArray(rawOperation)) throw new Error('bsb_transition_sequence_intent_operation_missing');
  const op = token(rawOperation.op ?? rawOperation.operation, 'sceneSequence.intent.operation');
  const sequenceId = token(rawOperation.sequenceId ?? SMOKE_INSTINCT_DEPARTURE_ID, 'sceneSequence.intent.sequenceId');
  let operation;

  if (op === 'ensure_smoke_instinct_departure') {
    operation = { op };
  } else if (op === 'remove') {
    operation = { op, sequenceId };
  } else if (op === 'set_landing_anchor') {
    operation = {
      op,
      sequenceId,
      x: finite(rawOperation.x, 'sceneSequence.intent.landing.x', -1024, 1024),
      y: finite(rawOperation.y, 'sceneSequence.intent.landing.y', -1024, 1024)
    };
  } else if (op === 'set_phase_duration') {
    const phaseId = token(rawOperation.phaseId, 'sceneSequence.intent.phaseId');
    if (!PHASE_IDS.includes(phaseId)) throw new Error(`bsb_transition_sequence_phase_unknown:${phaseId}`);
    operation = {
      op,
      sequenceId,
      phaseId,
      durationSeconds: finite(rawOperation.durationSeconds, `sceneSequence.intent.phase.${phaseId}.durationSeconds`, 0.1, 30)
    };
  } else if (op === 'set_smoke_threshold') {
    operation = {
      op,
      sequenceId,
      coverageThreshold: finite(rawOperation.coverageThreshold, 'sceneSequence.intent.smoke.coverageThreshold', 0.5, 1)
    };
  } else if (op === 'set_actor_path') {
    operation = {
      op,
      sequenceId,
      actorId: token(rawOperation.actorId, 'sceneSequence.intent.actorId'),
      path: normalizePath(rawOperation.path, 'sceneSequence.intent.actorPath')
    };
  } else {
    throw new Error(`bsb_transition_sequence_intent_operation_unknown:${op}`);
  }

  return {
    contract: BSB_V2_TRANSITION_SEQUENCE_INTENT_PROPOSAL_CONTRACT,
    classification: 'projection',
    operation,
    confidence: finite(source.confidence ?? 0, 'sceneSequence.intent.confidence', 0, 1),
    reason: String(source.reason ?? '').trim().slice(0, 240)
  };
}

export function applyBsbV2TransitionSequenceOperation(source, operation = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('bsb_transition_sequence_document_invalid');
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('bsb_transition_sequence_operation_invalid');
  const op = token(operation.op ?? operation.operation, 'sceneSequence.operation');
  const document = clone(source);
  document.sceneSequences = normalizeBsbV2TransitionSequences(document.sceneSequences, {
    actorIds: (document.unitPlacements ?? []).map((entry) => entry.id)
  });
  const beforeRevision = integer(document.revision, 'revision', 0, Number.MAX_SAFE_INTEGER);
  const sequenceId = token(operation.sequenceId ?? operation.id ?? SMOKE_INSTINCT_DEPARTURE_ID, 'sceneSequence.id');
  let affectedIds = [];

  if (op === 'ensure_smoke_instinct_departure') {
    const sequence = createSmokeInstinctDepartureSequence();
    requireActors(document, sequence);
    const index = document.sceneSequences.findIndex((entry) => entry.id === sequence.id);
    if (index >= 0) document.sceneSequences[index] = sequence;
    else document.sceneSequences.push(sequence);
    document.transitions = document.transitions ?? {};
    if (!document.transitions.escapeZone) throw new Error('bsb_transition_sequence_escape_transition_missing');
    document.transitions.escapeZone.departureSequenceId = sequence.id;
    affectedIds = [sequence.id];
  } else if (op === 'upsert') {
    const sequence = normalizeSequence(operation.sequence, 'sceneSequence.sequence');
    requireActors(document, sequence);
    const index = document.sceneSequences.findIndex((entry) => entry.id === sequence.id);
    if (index >= 0) document.sceneSequences[index] = sequence;
    else document.sceneSequences.push(sequence);
    affectedIds = [sequence.id];
  } else if (op === 'remove') {
    const before = document.sceneSequences.length;
    document.sceneSequences = document.sceneSequences.filter((entry) => entry.id !== sequenceId);
    if (document.sceneSequences.length === before) throw new Error(`bsb_transition_sequence_missing:${sequenceId}`);
    if (document.transitions?.escapeZone?.departureSequenceId === sequenceId) delete document.transitions.escapeZone.departureSequenceId;
    affectedIds = [sequenceId];
  } else {
    const index = document.sceneSequences.findIndex((entry) => entry.id === sequenceId);
    if (index < 0) throw new Error(`bsb_transition_sequence_missing:${sequenceId}`);
    const sequence = clone(document.sceneSequences[index]);
    if (op === 'set_landing_anchor') {
      sequence.landing.anchor = {
        x: finite(operation.x, 'sceneSequence.landing.x', -1024, 1024),
        y: finite(operation.y, 'sceneSequence.landing.y', -1024, 1024)
      };
    } else if (op === 'set_phase_duration') {
      const phaseId = token(operation.phaseId, 'sceneSequence.phaseId');
      if (!PHASE_IDS.includes(phaseId)) throw new Error(`bsb_transition_sequence_phase_unknown:${phaseId}`);
      const phase = sequence.phases.find((entry) => entry.id === phaseId);
      if (!phase) throw new Error(`bsb_transition_sequence_phase_missing:${phaseId}`);
      phase.durationSeconds = finite(operation.durationSeconds, `sceneSequence.phase.${phaseId}.durationSeconds`, 0.1, 30);
    } else if (op === 'set_smoke_threshold') {
      sequence.smoke.coverageThreshold = finite(operation.coverageThreshold, 'sceneSequence.smoke.coverageThreshold', 0.5, 1);
    } else if (op === 'set_actor_path') {
      const actorId = String(operation.actorId ?? '').trim();
      const track = sequence.actorTracks.find((entry) => entry.actorId === actorId);
      if (!track) throw new Error(`bsb_transition_sequence_actor_track_missing:${actorId || 'missing'}`);
      track.path = normalizePath(operation.path, `sceneSequence.actorTrack:${actorId}`);
    } else {
      throw new Error(`bsb_transition_sequence_operation_unknown:${op}`);
    }
    document.sceneSequences[index] = normalizeSequence(sequence, `sceneSequence:${sequenceId}`);
    affectedIds = [sequenceId];
  }

  document.sceneSequences = normalizeBsbV2TransitionSequences(document.sceneSequences, {
    actorIds: (document.unitPlacements ?? []).map((entry) => entry.id)
  });
  document.revision = beforeRevision + 1;
  document.updatedAt = new Date().toISOString();
  return {
    contract: BSB_V2_TRANSITION_SEQUENCE_OPERATION_CONTRACT,
    operation: op,
    affectedIds,
    beforeRevision,
    afterRevision: document.revision,
    document
  };
}

function normalizeSequence(source, label) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(`bsb_transition_sequence_invalid:${label}`);
  if (source.contract !== BSB_V2_TRANSITION_SEQUENCE_CONTRACT) throw new Error(`bsb_transition_sequence_contract_invalid:${source.contract ?? 'missing'}`);
  const phases = Array.isArray(source.phases) ? source.phases.map((phase, index) => ({
    id: token(phase?.id, `${label}.phases:${index}.id`),
    durationSeconds: finite(phase?.durationSeconds, `${label}.phases:${index}.durationSeconds`, 0.1, 30)
  })) : [];
  if (phases.length !== PHASE_IDS.length || PHASE_IDS.some((id, index) => phases[index]?.id !== id)) {
    throw new Error(`bsb_transition_sequence_phase_order_invalid:${label}`);
  }
  const actorTracks = Array.isArray(source.actorTracks) ? source.actorTracks.map((track, index) => ({
    actorId: token(track?.actorId, `${label}.actorTracks:${index}.actorId`),
    reserve: track?.reserve !== false,
    path: normalizePath(track?.path, `${label}.actorTracks:${index}.path`)
  })) : [];
  if (actorTracks.length < 1) throw new Error(`bsb_transition_sequence_actor_tracks_missing:${label}`);
  const actorIds = actorTracks.map((track) => track.actorId);
  if (new Set(actorIds).size !== actorIds.length) throw new Error(`bsb_transition_sequence_actor_duplicate:${label}`);
  const direction = token(source.landing?.debris?.direction ?? 'north_to_south', `${label}.landing.debris.direction`);
  const smokeDirection = token(source.smoke?.direction ?? 'north_to_south', `${label}.smoke.direction`);
  if (direction !== 'north_to_south' || smokeDirection !== 'north_to_south') throw new Error(`bsb_transition_sequence_direction_unsupported:${label}`);
  return {
    contract: BSB_V2_TRANSITION_SEQUENCE_CONTRACT,
    id: token(source.id, `${label}.id`),
    label: String(source.label ?? 'Authored transition').trim() || 'Authored transition',
    trigger: { type: token(source.trigger?.type ?? 'escape_zone', `${label}.trigger.type`) },
    camera: {
      mode: token(source.camera?.mode ?? 'hold_player_north', `${label}.camera.mode`),
      playerFacingRadians: finite(source.camera?.playerFacingRadians ?? -Math.PI / 2, `${label}.camera.playerFacingRadians`, -Math.PI * 4, Math.PI * 4),
      zoom: finite(source.camera?.zoom ?? 2.75, `${label}.camera.zoom`, 0.5, 5)
    },
    landing: {
      anchor: {
        x: finite(source.landing?.anchor?.x, `${label}.landing.anchor.x`, -1024, 1024),
        y: finite(source.landing?.anchor?.y, `${label}.landing.anchor.y`, -1024, 1024)
      },
      rumble: {
        durationSeconds: finite(source.landing?.rumble?.durationSeconds ?? 0.7, `${label}.landing.rumble.durationSeconds`, 0.1, 5),
        intensity: finite(source.landing?.rumble?.intensity ?? 0.8, `${label}.landing.rumble.intensity`, 0, 2)
      },
      debris: {
        direction,
        count: integer(source.landing?.debris?.count ?? 24, `${label}.landing.debris.count`, 4, 96)
      }
    },
    phases,
    actorTracks,
    smoke: {
      direction: smokeDirection,
      coverageThreshold: finite(source.smoke?.coverageThreshold ?? 0.92, `${label}.smoke.coverageThreshold`, 0.5, 1)
    },
    handoff: { action: token(source.handoff?.action ?? 'load_transition', `${label}.handoff.action`) }
  };
}

function normalizePath(source, label) {
  if (!Array.isArray(source) || source.length < 2) throw new Error(`bsb_transition_sequence_path_invalid:${label}`);
  const path = source.map((node, index) => ({
    at: finite(node?.at, `${label}:${index}.at`, 0, 1),
    x: finite(node?.x, `${label}:${index}.x`, -1024, 1024),
    y: finite(node?.y, `${label}:${index}.y`, -1024, 1024)
  }));
  if (path[0].at !== 0 || path.at(-1).at !== 1) throw new Error(`bsb_transition_sequence_path_endpoints_invalid:${label}`);
  for (let index = 1; index < path.length; index += 1) {
    if (path[index].at <= path[index - 1].at) throw new Error(`bsb_transition_sequence_path_order_invalid:${label}:${index}`);
  }
  return path;
}

function requireActors(document, sequence) {
  const actorIds = new Set((document.unitPlacements ?? []).map((entry) => entry.id));
  for (const track of sequence.actorTracks) {
    if (!actorIds.has(track.actorId)) throw new Error(`bsb_transition_sequence_actor_missing:${sequence.id}:${track.actorId}`);
  }
}

function resolveDurationPhase(text) {
  if (/\bsmoke cover\b/.test(text)) return 'smoke_cover';
  if (/\b(?:impact|landing impact|mama lands? impact)\b/.test(text)) return 'impact';
  if (/\b(?:raiders?\s+)?charg(?:e|es|ed|ing)(?:\s+(?:duration|phase|time|timer|timing|variable))?\b/.test(text)) return 'raider_charge';
  return null;
}

function token(value, label) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
  if (!/^[a-z][a-z0-9._:]*$/.test(normalized)) throw new Error(`bsb_transition_sequence_token_invalid:${label}`);
  return normalized;
}

function finite(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`bsb_transition_sequence_number_invalid:${label}`);
  return number;
}

function integer(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`bsb_transition_sequence_integer_invalid:${label}`);
  return number;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
