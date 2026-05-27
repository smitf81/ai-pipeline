import {
  AI_BEHAVIOUR_CONTRACT_ID,
  AI_EMOTIONAL_STATES,
  AI_INTENT_RESPONSE_STATUSES,
  AI_INTENT_STATES,
  AI_PERCEPTION_STATES,
  calculateOverrideCost,
  clamp01,
  createIntentAccumulator,
  createIntentAccumulatorKey,
  createIntentPacket,
  createIntentResponse,
  normaliseEmotionalState,
  normaliseIntentState,
  normalisePerceptionState,
  registerIntentPulse
} from './aiContracts.js';

export const AI_STATE_MACHINE_VERSION = 0;

export function createAISystemState(seed = {}) {
  return normaliseAISystemState({
    contract: `${AI_BEHAVIOUR_CONTRACT_ID}.system-state`,
    version: AI_STATE_MACHINE_VERSION,
    intentSerial: Math.max(0, Math.floor(Number(seed.intentSerial) || 0)),
    lastIssuedIntent: seed.lastIssuedIntent ?? null,
    intentAccumulators: seed.intentAccumulators ?? {},
    intentResponses: seed.intentResponses ?? {},
    attentionMarkers: Array.isArray(seed.attentionMarkers) ? seed.attentionMarkers : [],
    lastAppraisalTick: Number.isInteger(seed.lastAppraisalTick) ? seed.lastAppraisalTick : null
  });
}

export function normaliseAISystemState(state = {}, tick = 0) {
  const accumulators = state.intentAccumulators && typeof state.intentAccumulators === 'object' ? state.intentAccumulators : {};
  return {
    contract: `${AI_BEHAVIOUR_CONTRACT_ID}.system-state`,
    version: AI_STATE_MACHINE_VERSION,
    intentSerial: Math.max(0, Math.floor(Number(state.intentSerial) || 0)),
    lastIssuedIntent: state.lastIssuedIntent ? createIntentPacket(state.lastIssuedIntent) : null,
    intentAccumulators: Object.fromEntries(Object.entries(accumulators).map(([key, value]) => [key, createIntentAccumulator({ ...value, key })])),
    intentResponses: normaliseIntentResponses(state.intentResponses),
    attentionMarkers: normaliseAttentionMarkers(state.attentionMarkers, tick),
    lastAppraisalTick: Number.isInteger(state.lastAppraisalTick) ? Math.max(0, state.lastAppraisalTick) : null
  };
}

export function createAIEntityState(seed = {}) {
  return normaliseAIEntityState(seed);
}

export function normaliseAIEntityState(state = {}) {
  const emotionalState = normaliseEmotionalState(state.emotionalState);
  const intentState = normaliseIntentState(state.intentState);
  const perceptionState = normalisePerceptionState(state.perceptionState);
  return {
    contract: `${AI_BEHAVIOUR_CONTRACT_ID}.entity-state`,
    emotionalState,
    intentState,
    perceptionState,
    morale: clamp01(state.morale ?? 0.68),
    commandConfidence: clamp01(state.commandConfidence ?? 0.66),
    mentalStrain: clamp01(state.mentalStrain ?? 0),
    maxMoralePenalty: clamp01(state.maxMoralePenalty ?? 0),
    lastIntentResponse: state.lastIntentResponse ? createIntentResponse(state.lastIntentResponse) : null,
    lastAppraisalTick: Number.isInteger(state.lastAppraisalTick) ? Math.max(0, state.lastAppraisalTick) : null,
    flags: state.flags && typeof state.flags === 'object' ? { ...state.flags } : {}
  };
}

export function issueIntentThroughAccumulator(aiSystemState, args = {}) {
  const state = normaliseAISystemState(aiSystemState, args.issuedAtTick);
  const nextSerial = state.intentSerial + 1;
  const packet = createIntentPacket({
    ...args,
    id: args.id ?? `intent_${nextSerial}`,
    issuedAtTick: args.issuedAtTick ?? 0
  });
  const key = createIntentAccumulatorKey(packet);
  const accumulator = registerIntentPulse(state.intentAccumulators[key], packet);
  const enrichedPacket = createIntentPacket({
    ...packet,
    urgency: accumulator.urgency,
    repeatCount: accumulator.repeatCount,
    metadata: {
      ...packet.metadata,
      accumulatorKey: key,
      overrideRisk: accumulator.overrideRisk,
      strainDebt: accumulator.strainDebt
    }
  });
  return {
    state: {
      ...state,
      intentSerial: nextSerial,
      lastIssuedIntent: enrichedPacket,
      intentAccumulators: {
        ...state.intentAccumulators,
        [key]: accumulator
      }
    },
    packet: enrichedPacket,
    accumulator
  };
}

export function applyIntentResponseToEntityAI(entityAI, response, context = {}) {
  const ai = normaliseAIEntityState(entityAI);
  const normalisedResponse = createIntentResponse(response);
  const overrideCost = normalisedResponse.overrideCost || calculateOverrideCost({
    urgency: normalisedResponse.urgency,
    emotionalState: ai.emotionalState,
    commandConfidence: ai.commandConfidence,
    shelter: context.shelter,
    threat: context.threat
  });
  const strainDelta = [
    AI_INTENT_RESPONSE_STATUSES.degraded,
    AI_INTENT_RESPONSE_STATUSES.overriddenBySurvival,
    AI_INTENT_RESPONSE_STATUSES.rejected
  ].includes(normalisedResponse.status)
    ? overrideCost * 0.18
    : overrideCost * 0.05;
  const moralePenaltyDelta = normalisedResponse.status === AI_INTENT_RESPONSE_STATUSES.overriddenBySurvival
    ? overrideCost * 0.12
    : 0;
  return normaliseAIEntityState({
    ...ai,
    intentState: normalisedResponse.chosenState ?? ai.intentState,
    mentalStrain: ai.mentalStrain + strainDelta,
    maxMoralePenalty: ai.maxMoralePenalty + moralePenaltyDelta,
    lastIntentResponse: {
      ...normalisedResponse,
      overrideCost
    },
    lastAppraisalTick: context.tick ?? ai.lastAppraisalTick
  });
}

export function classifyIntentAgainstEmotion(entityAI, packet, context = {}) {
  const ai = normaliseAIEntityState(entityAI);
  const intent = createIntentPacket(packet);
  if (intent.type === AI_INTENT_STATES.regroup) {
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId ?? entity.id,
      status: ai.emotionalState === AI_EMOTIONAL_STATES.routed ? AI_INTENT_RESPONSE_STATUSES.degraded : AI_INTENT_RESPONSE_STATUSES.accepted,
      confidence: clamp01(0.36 + commandConfidence * 0.48),
      chosenState: AI_INTENT_STATES.regroup,
      chosenTarget: context.commanderTarget ?? context.fallbackTarget ?? intent.target,
      reason: context.commanderTarget ? 'Regrouping on commander command anchor' : 'Regrouping toward nearest fallback rally',
      urgency,
      overrideCost: calculateOverrideCost({ urgency, emotionalState: ai.emotionalState, commandConfidence, shelter, threat })
    });
  }

  if (intent.type === AI_INTENT_STATES.seekShelter) {
    const shelterRejected = context.shelterAvailable === false;
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId ?? entity.id,
      status: shelterRejected ? AI_INTENT_RESPONSE_STATUSES.degraded : AI_INTENT_RESPONSE_STATUSES.accepted,
      confidence: clamp01(0.38 + commandConfidence * 0.44 + shelter * 0.12),
      chosenState: shelterRejected ? AI_INTENT_STATES.flee : AI_INTENT_STATES.seekShelter,
      chosenTarget: context.shelterTarget ?? context.fallbackTarget ?? intent.target,
      reason: shelterRejected
        ? describeShelterDegradation(context)
        : describeShelterAccepted(context),
      urgency,
      overrideCost: calculateOverrideCost({ urgency, emotionalState: ai.emotionalState, commandConfidence, shelter, threat }),
      targetHonoured: context.shelterSource === 'command_target' ? !shelterRejected : null,
      degradationReason: shelterRejected ? context.shelterDegradeReason ?? 'no_actionable_shelter' : null,
      shelterTargetId: context.shelterTargetId ?? null,
      shelterRating: context.shelterRating ?? null,
      shelterSource: context.shelterSource ?? null
    });
  }

  if (ai.emotionalState === AI_EMOTIONAL_STATES.routed && ![AI_INTENT_STATES.regroup, AI_INTENT_STATES.flee, AI_INTENT_STATES.seekShelter].includes(intent.type)) {
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId,
      status: AI_INTENT_RESPONSE_STATUSES.rejected,
      confidence: 0.08,
      chosenState: AI_INTENT_STATES.flee,
      chosenTarget: context.fallbackTarget ?? intent.target,
      reason: 'Routed units reject non-recovery orders',
      urgency: intent.urgency,
      overrideCost: calculateOverrideCost({ urgency: intent.urgency, emotionalState: ai.emotionalState, commandConfidence: ai.commandConfidence, shelter: context.shelter, threat: context.threat })
    });
  }
  if (ai.emotionalState === AI_EMOTIONAL_STATES.panicked && [AI_INTENT_STATES.moveToTarget, AI_INTENT_STATES.engage, AI_INTENT_STATES.work].includes(intent.type)) {
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId,
      status: AI_INTENT_RESPONSE_STATUSES.degraded,
      confidence: 0.28,
      chosenState: context.shelterAvailable === false ? AI_INTENT_STATES.flee : AI_INTENT_STATES.seekShelter,
      chosenTarget: context.shelterTarget ?? intent.target,
      reason: 'Panicked unit degraded the order into survival movement',
      urgency: intent.urgency,
      overrideCost: calculateOverrideCost({ urgency: intent.urgency, emotionalState: ai.emotionalState, commandConfidence: ai.commandConfidence, shelter: context.shelter, threat: context.threat })
    });
  }
  return createIntentResponse({
    intentId: intent.id,
    entityId: context.entityId,
    status: AI_INTENT_RESPONSE_STATUSES.accepted,
    confidence: Math.max(0.12, ai.commandConfidence - ai.mentalStrain * 0.25),
    chosenState: intent.type,
    chosenTarget: intent.target,
    reason: 'Intent accepted by behaviour contract',
    urgency: intent.urgency,
    overrideCost: calculateOverrideCost({ urgency: intent.urgency, emotionalState: ai.emotionalState, commandConfidence: ai.commandConfidence, shelter: context.shelter, threat: context.threat })
  });
}


function describeShelterAccepted(context = {}) {
  if (context.shelterSource === 'command_target' && context.shelterTargetId) {
    return `Seeking selected shelter target ${context.shelterTargetId}`;
  }
  return 'Seeking nearest survivable shelter tile';
}

function describeShelterDegradation(context = {}) {
  const reason = context.shelterDegradeReason ?? 'no_actionable_shelter';
  return `Shelter unavailable: ${reason}; falling back to escape movement`;
}

export function createAttentionMarker(args = {}) {
  const createdAtTick = Math.max(0, Math.floor(Number(args.createdAtTick) || 0));
  const durationTicks = Math.max(1, Math.floor(Number(args.durationTicks) || 12));
  return {
    id: typeof args.id === 'string' ? args.id : `attention_${createdAtTick}_${Math.round(Number(args.position?.x) || 0)}_${Math.round(Number(args.position?.y) || 0)}`,
    type: typeof args.type === 'string' ? args.type : 'noise',
    factionId: typeof args.factionId === 'string' ? args.factionId : null,
    position: normaliseMarkerPosition(args.position),
    strength: clamp01(args.strength ?? 0.55),
    audibleRadiusTiles: Math.max(0.5, Number(args.audibleRadiusTiles) || 6),
    createdAtTick,
    expiresAtTick: createdAtTick + durationTicks,
    sourceIntentId: typeof args.sourceIntentId === 'string' ? args.sourceIntentId : null,
    sourceId: typeof args.sourceId === 'string' ? args.sourceId : null,
    label: typeof args.label === 'string' ? args.label : null,
    noiseKind: typeof args.noiseKind === 'string' ? args.noiseKind : null
  };
}

function normaliseIntentResponses(responses = {}) {
  if (!responses || typeof responses !== 'object') {
    return {};
  }
  return Object.fromEntries(Object.entries(responses).map(([key, value]) => [key, createIntentResponse(value)]));
}

function normaliseAttentionMarkers(markers = [], tick = 0) {
  const safeTick = Math.max(0, Math.floor(Number(tick) || 0));
  return (Array.isArray(markers) ? markers : [])
    .map(createAttentionMarker)
    .filter((marker) => marker.expiresAtTick >= safeTick && marker.position);
}

function normaliseMarkerPosition(position = null) {
  if (!position || typeof position !== 'object') return null;
  if (Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))) {
    return { x: Math.round(Number(position.x)), y: Math.round(Number(position.y)) };
  }
  return null;
}

export function appraiseEntityBehaviour(entity = {}, fieldSample = {}, context = {}) {
  const ai = normaliseAIEntityState(entity.ai ?? entity);
  const shelter = clamp01(fieldSample.shelter ?? context.shelter ?? 0.35);
  const exposure = clamp01(fieldSample.exposure ?? context.exposure ?? Math.max(0, 1 - shelter));
  const threat = clamp01(fieldSample.threat ?? context.threat ?? 0);
  const attention = clamp01(fieldSample.attention ?? context.attention ?? 0);
  const fieldMorale = clamp01(fieldSample.morale ?? context.morale ?? ai.morale);
  const fieldCommand = clamp01(fieldSample.commandConfidence ?? context.commandConfidence ?? ai.commandConfidence);
  const deathPressure = clamp01(context.deathPressure ?? 0);
  const isolation = clamp01(context.isolation ?? 0);
  const commanderDead = Boolean(context.commanderDead);
  const nearCommander = Boolean(context.nearCommander);

  const dangerPressure = clamp01(
    threat * 0.36 +
    exposure * 0.28 +
    deathPressure * 0.24 +
    isolation * 0.14 +
    (commanderDead ? 0.32 : 0)
  );
  const recoveryPressure = clamp01(
    shelter * 0.28 +
    fieldMorale * 0.24 +
    fieldCommand * 0.18 +
    (nearCommander ? 0.22 : 0)
  );

  const emotionalState = chooseNextEmotionalState(ai.emotionalState, dangerPressure, recoveryPressure, {
    commanderDead,
    mentalStrain: ai.mentalStrain
  });
  const morale = clamp01(fieldMorale - ai.maxMoralePenalty - dangerPressure * 0.18 + recoveryPressure * 0.08);
  const commandConfidence = clamp01(fieldCommand - emotionalCommandPenaltyForState(emotionalState) - isolation * 0.12 - ai.mentalStrain * 0.1);
  const mentalStrain = clamp01(ai.mentalStrain + dangerPressure * 0.035 - recoveryPressure * 0.028);
  const perceptionState = chooseNextPerceptionState(ai.perceptionState, { threat, attention, dangerPressure });

  return normaliseAIEntityState({
    ...ai,
    emotionalState,
    perceptionState,
    morale,
    commandConfidence,
    mentalStrain,
    lastAppraisalTick: context.tick ?? ai.lastAppraisalTick,
    flags: {
      ...ai.flags,
      lastShelter: round3(shelter),
      lastExposure: round3(exposure),
      lastThreat: round3(threat),
      lastAttention: round3(attention),
      lastDangerPressure: round3(dangerPressure),
      lastRecoveryPressure: round3(recoveryPressure)
    }
  });
}

export function resolveIntentResponseForEntity(entity = {}, packet = {}, fieldSample = {}, context = {}) {
  const ai = normaliseAIEntityState(entity.ai ?? entity);
  const intent = createIntentPacket(packet);
  const shelter = clamp01(fieldSample.shelter ?? context.shelter ?? 0.35);
  const threat = clamp01(fieldSample.threat ?? context.threat ?? 0);
  const commandConfidence = clamp01(fieldSample.commandConfidence ?? context.commandConfidence ?? ai.commandConfidence);
  const urgency = clamp01(intent.urgency ?? intent.priority ?? 0.4);

  if (intent.type === AI_INTENT_STATES.regroup) {
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId ?? entity.id,
      status: ai.emotionalState === AI_EMOTIONAL_STATES.routed ? AI_INTENT_RESPONSE_STATUSES.degraded : AI_INTENT_RESPONSE_STATUSES.accepted,
      confidence: clamp01(0.36 + commandConfidence * 0.48),
      chosenState: AI_INTENT_STATES.regroup,
      chosenTarget: context.commanderTarget ?? context.fallbackTarget ?? intent.target,
      reason: context.commanderTarget ? 'Regrouping on commander command anchor' : 'Regrouping toward nearest fallback rally',
      urgency,
      overrideCost: calculateOverrideCost({ urgency, emotionalState: ai.emotionalState, commandConfidence, shelter, threat })
    });
  }

  if (intent.type === AI_INTENT_STATES.seekShelter) {
    const shelterRejected = context.shelterAvailable === false;
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId ?? entity.id,
      status: shelterRejected ? AI_INTENT_RESPONSE_STATUSES.degraded : AI_INTENT_RESPONSE_STATUSES.accepted,
      confidence: clamp01(0.38 + commandConfidence * 0.44 + shelter * 0.12),
      chosenState: shelterRejected ? AI_INTENT_STATES.flee : AI_INTENT_STATES.seekShelter,
      chosenTarget: context.shelterTarget ?? context.fallbackTarget ?? intent.target,
      reason: shelterRejected
        ? describeShelterDegradation(context)
        : describeShelterAccepted(context),
      urgency,
      overrideCost: calculateOverrideCost({ urgency, emotionalState: ai.emotionalState, commandConfidence, shelter, threat }),
      targetHonoured: context.shelterSource === 'command_target' ? !shelterRejected : null,
      degradationReason: shelterRejected ? context.shelterDegradeReason ?? 'no_actionable_shelter' : null,
      shelterTargetId: context.shelterTargetId ?? null,
      shelterRating: context.shelterRating ?? null,
      shelterSource: context.shelterSource ?? null
    });
  }

  if (ai.emotionalState === AI_EMOTIONAL_STATES.routed && ![AI_INTENT_STATES.regroup, AI_INTENT_STATES.flee, AI_INTENT_STATES.seekShelter].includes(intent.type)) {
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId ?? entity.id,
      status: AI_INTENT_RESPONSE_STATUSES.rejected,
      confidence: 0.06,
      chosenState: AI_INTENT_STATES.flee,
      chosenTarget: context.fallbackTarget ?? context.shelterTarget ?? intent.target,
      reason: 'Routed unit rejected non-recovery order',
      urgency,
      overrideCost: calculateOverrideCost({ urgency, emotionalState: ai.emotionalState, commandConfidence, shelter, threat })
    });
  }

  if (ai.emotionalState === AI_EMOTIONAL_STATES.panicked && urgency >= 0.9 && commandConfidence >= 0.18) {
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId ?? entity.id,
      status: AI_INTENT_RESPONSE_STATUSES.overriddenBySurvival,
      confidence: clamp01(0.3 + commandConfidence * 0.34),
      chosenState: intent.type,
      chosenTarget: intent.target ?? context.fallbackTarget,
      reason: 'Urgent repeated command overrode survival instinct at a strain cost',
      urgency,
      overrideCost: calculateOverrideCost({ urgency, emotionalState: ai.emotionalState, commandConfidence, shelter, threat })
    });
  }

  if (ai.emotionalState === AI_EMOTIONAL_STATES.panicked && [AI_INTENT_STATES.moveToTarget, AI_INTENT_STATES.engage, AI_INTENT_STATES.work].includes(intent.type)) {
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId ?? entity.id,
      status: AI_INTENT_RESPONSE_STATUSES.degraded,
      confidence: 0.22,
      chosenState: context.shelterAvailable === false ? AI_INTENT_STATES.flee : AI_INTENT_STATES.seekShelter,
      chosenTarget: context.shelterTarget ?? context.fallbackTarget ?? intent.target,
      reason: 'Panic degraded the order into survival movement',
      urgency,
      overrideCost: calculateOverrideCost({ urgency, emotionalState: ai.emotionalState, commandConfidence, shelter, threat })
    });
  }

  if (commandConfidence < 0.2 && urgency < 0.75 && ![AI_INTENT_STATES.regroup, AI_INTENT_STATES.seekShelter, AI_INTENT_STATES.flee].includes(intent.type)) {
    return createIntentResponse({
      intentId: intent.id,
      entityId: context.entityId ?? entity.id,
      status: AI_INTENT_RESPONSE_STATUSES.degraded,
      confidence: 0.18,
      chosenState: AI_INTENT_STATES.regroup,
      chosenTarget: context.commanderTarget ?? context.fallbackTarget ?? intent.target,
      reason: 'Weak command confidence degraded order into regrouping',
      urgency,
      overrideCost: calculateOverrideCost({ urgency, emotionalState: ai.emotionalState, commandConfidence, shelter, threat })
    });
  }

  return classifyIntentAgainstEmotion(ai, intent, {
    ...context,
    entityId: context.entityId ?? entity.id,
    shelter,
    threat,
    commandConfidence,
    shelterTarget: context.shelterTarget,
    fallbackTarget: context.fallbackTarget
  });
}

export function applyResolvedIntentToEntityAI(entity = {}, packet = {}, fieldSample = {}, context = {}) {
  const response = resolveIntentResponseForEntity(entity, packet, fieldSample, context);
  return {
    response,
    ai: applyIntentResponseToEntityAI(entity.ai ?? entity, response, {
      ...context,
      shelter: fieldSample.shelter ?? context.shelter,
      threat: fieldSample.threat ?? context.threat,
      tick: context.tick
    })
  };
}

function chooseNextEmotionalState(current, dangerPressure, recoveryPressure, { commanderDead = false, mentalStrain = 0 } = {}) {
  const state = normaliseEmotionalState(current);
  if (commanderDead && dangerPressure >= 0.58) return AI_EMOTIONAL_STATES.routed;
  if (state === AI_EMOTIONAL_STATES.routed) {
    return recoveryPressure >= 0.72 && dangerPressure < 0.32 ? AI_EMOTIONAL_STATES.panicked : AI_EMOTIONAL_STATES.routed;
  }
  if (dangerPressure >= 0.82 || mentalStrain >= 0.86) return AI_EMOTIONAL_STATES.panicked;
  if (state === AI_EMOTIONAL_STATES.panicked) {
    if (recoveryPressure >= 0.62 && dangerPressure < 0.45) return AI_EMOTIONAL_STATES.pressured;
    return AI_EMOTIONAL_STATES.panicked;
  }
  if (dangerPressure >= 0.58) return AI_EMOTIONAL_STATES.pressured;
  if (state === AI_EMOTIONAL_STATES.pressured) {
    if (recoveryPressure >= 0.58 && dangerPressure < 0.28) return AI_EMOTIONAL_STATES.alert;
    return AI_EMOTIONAL_STATES.pressured;
  }
  if (dangerPressure >= 0.28) return AI_EMOTIONAL_STATES.alert;
  if (state === AI_EMOTIONAL_STATES.alert && recoveryPressure < 0.45) return AI_EMOTIONAL_STATES.alert;
  return AI_EMOTIONAL_STATES.calm;
}

function chooseNextPerceptionState(current, { threat = 0, attention = 0, dangerPressure = 0 } = {}) {
  const state = normalisePerceptionState(current);
  if (threat >= 0.72 || dangerPressure >= 0.8) return AI_PERCEPTION_STATES.lockedOn;
  if (threat >= 0.42) return AI_PERCEPTION_STATES.aware;
  if (attention >= 0.55) return AI_PERCEPTION_STATES.investigating;
  if (attention >= 0.22) return AI_PERCEPTION_STATES.suspicious;
  if ([AI_PERCEPTION_STATES.lockedOn, AI_PERCEPTION_STATES.aware, AI_PERCEPTION_STATES.investigating].includes(state)) {
    return AI_PERCEPTION_STATES.lostTarget;
  }
  return AI_PERCEPTION_STATES.unaware;
}

function emotionalCommandPenaltyForState(state) {
  if (state === AI_EMOTIONAL_STATES.routed) return 0.62;
  if (state === AI_EMOTIONAL_STATES.panicked) return 0.38;
  if (state === AI_EMOTIONAL_STATES.pressured) return 0.18;
  if (state === AI_EMOTIONAL_STATES.alert) return 0.08;
  return 0;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
