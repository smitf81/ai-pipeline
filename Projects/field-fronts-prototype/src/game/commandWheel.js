import { AI_INTENT_STATES } from './aiContracts.js';

export const COMMAND_WHEEL_CONTRACT_ID = 'field-fronts.command-wheel.v0';

export const COMMAND_WHEEL_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'move_to_target',
    label: 'Move',
    shortLabel: 'MoveTo',
    intentType: AI_INTENT_STATES.moveToTarget,
    priority: 0.48,
    slot: 'primary',
    description: 'Move to the selected point through the behaviour contract.'
  }),
  Object.freeze({
    id: 'seek_shelter',
    label: 'Shelter',
    shortLabel: 'Shelter',
    intentType: AI_INTENT_STATES.seekShelter,
    priority: 0.58,
    slot: 'ne',
    description: 'Seek nearby cover/shelter rather than blindly pathing through exposed ground.'
  }),
  Object.freeze({
    id: 'quiet_move',
    label: 'Quiet Move',
    shortLabel: 'Quiet',
    intentType: AI_INTENT_STATES.quietMove,
    priority: 0.46,
    slot: 'e',
    description: 'Move more cautiously, with lower urgency and less command violence.'
  }),
  Object.freeze({
    id: 'distract',
    label: 'Distract',
    shortLabel: 'Distract',
    intentType: AI_INTENT_STATES.distract,
    priority: 0.64,
    slot: 'sw',
    description: 'Create a temporary attention/noise marker at the target point.'
  }),
  Object.freeze({
    id: 'regroup',
    label: 'Regroup',
    shortLabel: 'Regroup',
    intentType: AI_INTENT_STATES.regroup,
    priority: 0.7,
    slot: 's',
    description: 'Recover around the commander or nearest rally fallback.'
  })
]);

export function getCommandWheelAction(actionId) {
  return COMMAND_WHEEL_ACTIONS.find((action) => action.id === actionId || action.intentType === actionId) ?? null;
}

export function createCommandWheelIntentArgs(actionId, tile, options = {}) {
  const action = getCommandWheelAction(actionId) ?? getCommandWheelAction('move_to_target');
  return {
    contract: `${COMMAND_WHEEL_CONTRACT_ID}.intent-args`,
    actionId: action.id,
    type: action.intentType,
    target: tile ? { x: Math.round(Number(tile.x) || 0), y: Math.round(Number(tile.y) || 0) } : null,
    sourceEntityId: typeof options.sourceEntityId === 'string' ? options.sourceEntityId : null,
    scope: options.scope ?? 'selected',
    priority: Number.isFinite(Number(options.priority)) ? Number(options.priority) : action.priority,
    metadata: {
      ...(options.metadata ?? {}),
      inputSurface: 'command-wheel',
      visibleLabel: action.label
    }
  };
}


export const COMMAND_WHEEL_HOVER_DEADZONE_PX = 24;

const COMMAND_WHEEL_SLOT_ANGLES = Object.freeze({
  e: 0,
  ne: -45,
  nw: -135,
  w: 180,
  sw: 135,
  s: 90,
  se: 45,
  primary: -90
});

export function resolveCommandWheelHover(origin = {}, point = {}, options = {}) {
  const actions = Array.isArray(options.actions) && options.actions.length > 0 ? options.actions : COMMAND_WHEEL_ACTIONS;
  const fallbackActionId = options.fallbackActionId ?? 'move_to_target';
  const deadzonePx = Number.isFinite(Number(options.deadzonePx)) ? Number(options.deadzonePx) : COMMAND_WHEEL_HOVER_DEADZONE_PX;
  const dx = Number(point.x) - Number(origin.x);
  const dy = Number(point.y) - Number(origin.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return getCommandWheelAction(fallbackActionId);
  }
  const distance = Math.hypot(dx, dy);
  if (distance <= deadzonePx) {
    return getCommandWheelAction(fallbackActionId);
  }
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  let best = null;
  let bestDelta = Infinity;
  for (const action of actions) {
    const slotAngle = COMMAND_WHEEL_SLOT_ANGLES[action.slot];
    if (!Number.isFinite(slotAngle)) {
      continue;
    }
    const delta = angularDelta(angle, slotAngle);
    if (delta < bestDelta) {
      best = action;
      bestDelta = delta;
    }
  }
  return best ?? getCommandWheelAction(fallbackActionId);
}

export function createCommandFeedback({ action = null, result = null, tile = null, source = 'command-wheel' } = {}) {
  const response = result?.responses?.[0] ?? null;
  const packet = result?.packet ?? null;
  const target = response?.chosenTarget ?? packet?.target ?? tile ?? null;
  return {
    contract: `${COMMAND_WHEEL_CONTRACT_ID}.feedback`,
    actionId: action?.id ?? packet?.type ?? null,
    label: action?.label ?? packet?.metadata?.visibleLabel ?? packet?.type ?? 'Command',
    source,
    intentId: packet?.id ?? response?.intentId ?? null,
    status: response?.status ?? (result?.ok ? 'accepted' : 'failed'),
    confidence: Number.isFinite(Number(response?.confidence)) ? Number(response.confidence) : null,
    reason: response?.reason ?? result?.message ?? 'No command response.',
    target,
    urgency: Number.isFinite(Number(packet?.urgency)) ? Number(packet.urgency) : 0,
    repeatCount: Math.max(1, Math.floor(Number(packet?.repeatCount) || 1)),
    overrideRisk: Number.isFinite(Number(result?.accumulator?.overrideRisk)) ? Number(result.accumulator.overrideRisk) : Number(packet?.metadata?.overrideRisk) || 0,
    strainDebt: Number.isFinite(Number(result?.accumulator?.strainDebt)) ? Number(result.accumulator.strainDebt) : Number(packet?.metadata?.strainDebt) || 0,
    createdAt: Date.now()
  };
}

export function commandFeedbackTone(status) {
  if (status === 'accepted' || status === 'completed') return 'ok';
  if (status === 'rejected' || status === 'failed') return 'critical';
  if (status === 'overridden_by_survival') return 'forced';
  return 'warn';
}

function angularDelta(a, b) {
  const raw = Math.abs(((a - b + 180) % 360 + 360) % 360 - 180);
  return raw > 180 ? 360 - raw : raw;
}
