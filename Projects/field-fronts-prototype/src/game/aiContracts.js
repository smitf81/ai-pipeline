export const AI_BEHAVIOUR_CONTRACT_ID = 'field-fronts.ai-behaviour.v0';

export const AI_EMOTIONAL_STATES = Object.freeze({
  calm: 'calm',
  alert: 'alert',
  pressured: 'pressured',
  panicked: 'panicked',
  routed: 'routed'
});

export const AI_INTENT_STATES = Object.freeze({
  idle: 'idle',
  moveToTarget: 'move_to_target',
  holdPosition: 'hold_position',
  seekShelter: 'seek_shelter',
  quietMove: 'quiet_move',
  distract: 'distract',
  regroup: 'regroup',
  investigate: 'investigate',
  engage: 'engage',
  flee: 'flee',
  garrison: 'garrison',
  work: 'work'
});

export const AI_PERCEPTION_STATES = Object.freeze({
  unaware: 'unaware',
  suspicious: 'suspicious',
  investigating: 'investigating',
  aware: 'aware',
  lockedOn: 'locked_on',
  lostTarget: 'lost_target'
});

export const AI_INTENT_RESPONSE_STATUSES = Object.freeze({
  accepted: 'accepted',
  degraded: 'degraded',
  rejected: 'rejected',
  overriddenBySurvival: 'overridden_by_survival',
  completed: 'completed',
  failed: 'failed'
});

export const AI_BEHAVIOUR_FIELD_IDS = Object.freeze({
  shelter: 'shelter',
  exposure: 'exposure',
  threat: 'threat',
  attention: 'attention',
  morale: 'morale',
  commandConfidence: 'commandConfidence'
});

export const AI_INTENT_ACCUMULATOR_DEFAULTS = Object.freeze({
  baseUrgency: 0.42,
  repeatBoost: 0.18,
  maxUrgency: 1,
  decayPerTick: 0.08,
  overrideRiskThreshold: 0.72,
  strainPerForcedRepeat: 0.045,
  maxStrain: 1
});

export function createIntentPacket(args = {}) {
  const issuedAtTick = normaliseTick(args.issuedAtTick);
  const type = normaliseIntentState(args.type, AI_INTENT_STATES.moveToTarget);
  const priority = clamp01(args.priority ?? AI_INTENT_ACCUMULATOR_DEFAULTS.baseUrgency);
  return {
    contract: `${AI_BEHAVIOUR_CONTRACT_ID}.intent-packet`,
    id: typeof args.id === 'string' && args.id.trim() ? args.id : `intent_${issuedAtTick}_${stableIntentPart(type)}_${stableIntentPart(args.sourceEntityId ?? 'source')}`,
    sourceEntityId: typeof args.sourceEntityId === 'string' ? args.sourceEntityId : null,
    factionId: typeof args.factionId === 'string' ? args.factionId : 'player',
    type,
    target: normaliseIntentTarget(args.target),
    scope: normaliseIntentScope(args.scope),
    priority,
    issuedAtTick,
    expiresAtTick: normaliseTick(args.expiresAtTick ?? issuedAtTick + 16),
    fallback: args.fallback ? normaliseIntentState(args.fallback, AI_INTENT_STATES.regroup) : null,
    urgency: clamp01(args.urgency ?? priority),
    repeatCount: Math.max(1, Math.floor(Number(args.repeatCount) || 1)),
    metadata: normaliseMetadata(args.metadata)
  };
}

export function normaliseIntentPacket(packet = {}) {
  return createIntentPacket(packet);
}

export function createIntentResponse(args = {}) {
  const status = normaliseIntentResponseStatus(args.status);
  const chosenState = args.chosenState ? normaliseIntentState(args.chosenState, AI_INTENT_STATES.idle) : null;
  return {
    contract: `${AI_BEHAVIOUR_CONTRACT_ID}.intent-response`,
    intentId: typeof args.intentId === 'string' ? args.intentId : null,
    entityId: typeof args.entityId === 'string' ? args.entityId : null,
    status,
    confidence: clamp01(args.confidence ?? defaultConfidenceForStatus(status)),
    chosenState,
    chosenTarget: normaliseIntentTarget(args.chosenTarget),
    reason: typeof args.reason === 'string' ? args.reason : defaultReasonForStatus(status),
    urgency: clamp01(args.urgency ?? 0),
    overrideCost: clamp01(args.overrideCost ?? 0),
    targetHonoured: typeof args.targetHonoured === 'boolean' ? args.targetHonoured : null,
    degradationReason: typeof args.degradationReason === 'string' ? args.degradationReason : null,
    shelterTargetId: typeof args.shelterTargetId === 'string' ? args.shelterTargetId : null,
    shelterRating: Number.isFinite(Number(args.shelterRating)) ? clamp01(Number(args.shelterRating)) : null,
    shelterSource: typeof args.shelterSource === 'string' ? args.shelterSource : null
  };
}

export function normaliseIntentResponse(response = {}) {
  return createIntentResponse(response);
}

export function createIntentAccumulator(seed = {}) {
  return {
    key: typeof seed.key === 'string' ? seed.key : null,
    type: normaliseIntentState(seed.type, AI_INTENT_STATES.idle),
    targetKey: typeof seed.targetKey === 'string' ? seed.targetKey : 'none',
    sourceEntityId: typeof seed.sourceEntityId === 'string' ? seed.sourceEntityId : null,
    factionId: typeof seed.factionId === 'string' ? seed.factionId : 'player',
    urgency: clamp01(seed.urgency ?? 0),
    repeatCount: Math.max(0, Math.floor(Number(seed.repeatCount) || 0)),
    lastIssuedAtTick: normaliseTick(seed.lastIssuedAtTick ?? 0),
    overrideRisk: clamp01(seed.overrideRisk ?? 0),
    strainDebt: clamp01(seed.strainDebt ?? 0),
    status: typeof seed.status === 'string' ? seed.status : 'idle'
  };
}

export function createIntentAccumulatorKey(packet = {}) {
  const intent = normaliseIntentPacket(packet);
  return [
    intent.factionId,
    intent.sourceEntityId ?? 'no-source',
    intent.scope,
    intent.type,
    createTargetKey(intent.target)
  ].join('::');
}

export function registerIntentPulse(accumulator = null, packet = {}, options = {}) {
  const intent = normaliseIntentPacket(packet);
  const previous = createIntentAccumulator({
    ...(accumulator ?? {}),
    type: intent.type,
    targetKey: createTargetKey(intent.target),
    sourceEntityId: intent.sourceEntityId,
    factionId: intent.factionId
  });
  const settings = { ...AI_INTENT_ACCUMULATOR_DEFAULTS, ...(options.settings ?? {}) };
  const tickDelta = Math.max(0, intent.issuedAtTick - previous.lastIssuedAtTick);
  const decayedUrgency = clamp01(previous.urgency - tickDelta * settings.decayPerTick);
  const sameIntent = previous.repeatCount > 0 && previous.type === intent.type && previous.targetKey === createTargetKey(intent.target);
  const repeatCount = sameIntent ? previous.repeatCount + 1 : 1;
  const repeatBoost = sameIntent ? settings.repeatBoost * Math.min(3, repeatCount - 1) : 0;
  const urgency = clamp01(Math.min(settings.maxUrgency, Math.max(intent.priority, decayedUrgency) + repeatBoost));
  const overrideRisk = clamp01(Math.max(previous.overrideRisk * 0.72, urgency >= settings.overrideRiskThreshold ? urgency : urgency * 0.55));
  const forcedRepeat = sameIntent && urgency >= settings.overrideRiskThreshold;
  const strainDebt = clamp01(Math.min(settings.maxStrain, previous.strainDebt + (forcedRepeat ? settings.strainPerForcedRepeat * repeatCount : 0)));
  return createIntentAccumulator({
    key: createIntentAccumulatorKey(intent),
    type: intent.type,
    targetKey: createTargetKey(intent.target),
    sourceEntityId: intent.sourceEntityId,
    factionId: intent.factionId,
    urgency,
    repeatCount,
    lastIssuedAtTick: intent.issuedAtTick,
    overrideRisk,
    strainDebt,
    status: forcedRepeat ? 'forcing-survival-instincts' : 'building-urgency'
  });
}

export function calculateOverrideCost({ urgency = 0, emotionalState = AI_EMOTIONAL_STATES.calm, commandConfidence = 1, shelter = 0.5, threat = 0 } = {}) {
  const emotionPenalty = {
    [AI_EMOTIONAL_STATES.calm]: 0,
    [AI_EMOTIONAL_STATES.alert]: 0.08,
    [AI_EMOTIONAL_STATES.pressured]: 0.18,
    [AI_EMOTIONAL_STATES.panicked]: 0.34,
    [AI_EMOTIONAL_STATES.routed]: 0.58
  }[emotionalState] ?? 0.12;
  const dangerPenalty = clamp01((1 - clamp01(shelter)) * 0.18 + clamp01(threat) * 0.28);
  const commandPenalty = (1 - clamp01(commandConfidence)) * 0.25;
  return clamp01(clamp01(urgency) * 0.22 + emotionPenalty + dangerPenalty + commandPenalty);
}

export function normaliseEmotionalState(state, fallback = AI_EMOTIONAL_STATES.calm) {
  return Object.values(AI_EMOTIONAL_STATES).includes(state) ? state : fallback;
}

export function normaliseIntentState(state, fallback = AI_INTENT_STATES.idle) {
  return Object.values(AI_INTENT_STATES).includes(state) ? state : fallback;
}

export function normalisePerceptionState(state, fallback = AI_PERCEPTION_STATES.unaware) {
  return Object.values(AI_PERCEPTION_STATES).includes(state) ? state : fallback;
}

export function normaliseIntentResponseStatus(status, fallback = AI_INTENT_RESPONSE_STATUSES.accepted) {
  return Object.values(AI_INTENT_RESPONSE_STATUSES).includes(status) ? status : fallback;
}

export function createTargetKey(target = null) {
  if (!target || typeof target !== 'object') {
    return 'none';
  }
  if (typeof target.entityId === 'string') {
    return `entity:${target.entityId}`;
  }
  if (Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
    return `tile:${Math.round(Number(target.x))},${Math.round(Number(target.y))}`;
  }
  if (Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.z))) {
    return `point:${Number(target.x).toFixed(2)},${Number(target.z).toFixed(2)}`;
  }
  return 'object';
}

export function normaliseIntentTarget(target = null) {
  if (!target || typeof target !== 'object') {
    return null;
  }
  if (typeof target.entityId === 'string') {
    return { entityId: target.entityId };
  }
  if (Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
    return { x: Math.round(Number(target.x)), y: Math.round(Number(target.y)) };
  }
  if (Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.z))) {
    return { x: Number(target.x), z: Number(target.z) };
  }
  return null;
}

export function clamp01(value) {
  const number = Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(number) ? number : 0));
}

function normaliseIntentScope(scope) {
  return ['selected', 'squad', 'faction', 'local_area', 'global'].includes(scope) ? scope : 'selected';
}

function normaliseTick(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normaliseMetadata(metadata = {}) {
  return metadata && typeof metadata === 'object' ? { ...metadata } : {};
}

function stableIntentPart(value) {
  return String(value ?? 'none').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 36) || 'none';
}

function defaultConfidenceForStatus(status) {
  if (status === AI_INTENT_RESPONSE_STATUSES.rejected || status === AI_INTENT_RESPONSE_STATUSES.failed) return 0;
  if (status === AI_INTENT_RESPONSE_STATUSES.degraded || status === AI_INTENT_RESPONSE_STATUSES.overriddenBySurvival) return 0.35;
  return 0.72;
}

function defaultReasonForStatus(status) {
  if (status === AI_INTENT_RESPONSE_STATUSES.degraded) return 'Intent accepted with degraded execution confidence';
  if (status === AI_INTENT_RESPONSE_STATUSES.rejected) return 'Intent rejected by behaviour contract';
  if (status === AI_INTENT_RESPONSE_STATUSES.overriddenBySurvival) return 'Survival state overrode the issued intent';
  if (status === AI_INTENT_RESPONSE_STATUSES.completed) return 'Intent completed';
  if (status === AI_INTENT_RESPONSE_STATUSES.failed) return 'Intent failed';
  return 'Intent accepted';
}
