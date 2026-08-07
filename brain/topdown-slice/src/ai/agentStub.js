import {
  BUILDING_STATE,
  BUILDING_TYPES,
  findRechargeRelayInRange,
  placeBuilding,
  removeBuilding
} from '../buildings/buildings.js';
import { registerSpawnedBuilder } from '../buildings/builderSpawner.js';
import {
  actorNeedsEnergy,
  canActorAffordMovement,
  canActorAffordTask,
  getActorEnergyText,
  isActorExhausted,
  rechargeActorEnergy,
  RELAY_RECHARGE_FRAMES,
  spendActorMovementEnergy,
  spendActorTaskEnergy
} from '../units/energy.js';
import {
  executeConflictAttack,
  isConflictUnit,
  isConflictUnitAlive
} from '../units/conflict.js';
import { reinforceFieldValue } from '../world/fields.js';
import { spawnUnit } from '../units/units.js';
import { createTileAddress, createWorldPosition } from '../world/coordinates.js';
import { getTileType, TILE_TYPES } from '../world/tilemap.js';

const MOVE_STEP_FRAMES = 8;
const INTENT_TYPE_KEYWORDS = {
  defensibility: ['defensible', 'defend', 'protect', 'fortify', 'cover', 'reinforce', 'harden'],
  flow: ['open', 'opening', 'flow', 'corridor', 'route', 'path', 'lane', 'movement', 'navigable'],
  threat: ['threat', 'danger', 'enemy', 'risk', 'pressure']
};
const INTENT_STOPWORDS = new Set([
  'a',
  'an',
  'area',
  'at',
  'current',
  'for',
  'keep',
  'make',
  'more',
  'near',
  'opening',
  'region',
  'selected',
  'the',
  'this',
  'to'
]);

export const TASK_STATUS = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  BLOCKED: 'blocked',
  FAILED: 'failed',
  DONE: 'done'
};

// Future integration seam for local LLM adapters (e.g., Mixtral).
export function createConversationalParserStub() {
  return {
    parseNaturalLanguage(request = {}) {
      if (request.mode === 'intent-translation') {
        return parseIntentTranslationStub(request);
      }

      return {
        ok: false,
        source: 'stub-heuristic',
        error: 'Natural language parsing only supports intent translation in thin-slice mode.'
      };
    }
  };
}

// Future integration seam for MCP-driven command intake.
export function createMcpCommandBridgeStub() {
  return {
    pullCommands() {
      return [];
    }
  };
}

export function actorLabel(actor) {
  if (actor.type === 'god-agent') {
    return `God Agent (${actor.id})`;
  }

  if (isConflictUnit(actor)) {
    const faction = String(actor.faction ?? 'neutral');
    return `${faction[0].toUpperCase()}${faction.slice(1)} Fighter (${actor.id})`;
  }

  return `Worker (${actor.id})`;
}

function parseIntentTranslationStub({
  text,
  supportedTypes = [],
  context = {}
}) {
  const normalizedText = normalizeIntentText(text);
  const type = inferIntentType(normalizedText, supportedTypes);
  if (!type) {
    return {
      ok: false,
      source: 'stub-heuristic',
      error: `Could not map that request onto a supported intent type. Supported types: ${supportedTypes.join(', ')}.`
    };
  }

  const explicitPosition = parseIntentPosition(normalizedText);
  const anchor = explicitPosition
    ? null
    : inferIntentAnchor(normalizedText, {
        intents: context.intents ?? [],
        selectedIntent: context.selectedIntent ?? null,
        preferredType: type
      });
  const position = explicitPosition ?? anchor?.position ?? null;

  if (!position) {
    return {
      ok: false,
      source: 'stub-heuristic',
      error: 'Could not determine a target position. Use coordinates like "(17, 8)" or reference an existing region such as "east opening" or "east ridge".'
    };
  }

  const radius = inferIntentRadius(normalizedText, anchor?.radius, context.defaults?.radiusByType?.[type]);
  const weight = inferIntentWeight(normalizedText, anchor?.weight, context.defaults?.weightByType?.[type]);

  return {
    ok: true,
    source: 'stub-heuristic',
    intent: {
      type,
      position,
      radius,
      weight,
      label: anchor?.label ?? `${type} ${position.x},${position.y}`
    }
  };
}

function normalizeIntentText(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function inferIntentType(text, supportedTypes) {
  const ranked = supportedTypes
    .map((type) => ({
      type,
      score: INTENT_TYPE_KEYWORDS[type]?.reduce(
        (total, keyword) => total + (text.includes(keyword) ? 1 : 0),
        0
      ) ?? 0
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.type.localeCompare(right.type));

  return ranked[0]?.type ?? null;
}

function parseIntentPosition(text) {
  const tupleMatch = text.match(/\((\d+)\s*,\s*(\d+)\)/);
  if (tupleMatch) {
    return { x: Number(tupleMatch[1]), y: Number(tupleMatch[2]) };
  }

  const xyMatch = text.match(/\bx\s*(\d+)\D+y\s*(\d+)\b/);
  if (xyMatch) {
    return { x: Number(xyMatch[1]), y: Number(xyMatch[2]) };
  }

  const atMatch = text.match(/\bat\s+(\d+)\s+(\d+)\b/);
  if (atMatch) {
    return { x: Number(atMatch[1]), y: Number(atMatch[2]) };
  }

  return null;
}

function inferIntentAnchor(text, { intents, selectedIntent, preferredType }) {
  if (selectedIntent && /\b(this|selected|current)\b/.test(text)) {
    return toIntentAnchor(selectedIntent, 100);
  }

  const promptTokens = text
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !INTENT_STOPWORDS.has(token));

  const rankedAnchors = intents
    .map((intent) => {
      const haystack = normalizeIntentText(`${intent.id} ${intent.label ?? ''} ${intent.type}`);
      const tokenMatches = promptTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      const typeBias = intent.type === preferredType ? 0.5 : 0;
      return toIntentAnchor(intent, tokenMatches + typeBias);
    })
    .filter((anchor) => anchor.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.id.localeCompare(right.id);
    });

  if (rankedAnchors.length > 0) {
    const top = rankedAnchors[0];
    const second = rankedAnchors[1];
    if (!second || top.score > second.score) {
      return top;
    }
  }

  const typeMatches = intents.filter((intent) => intent.type === preferredType);
  if (typeMatches.length === 1) {
    return toIntentAnchor(typeMatches[0], 1);
  }

  return null;
}

function toIntentAnchor(intent, score) {
  return {
    id: intent.id,
    label: intent.label ?? createIntentAnchorLabel(intent),
    position: createWorldPosition(intent.position),
    radius: Number(intent.radius ?? 3),
    weight: Number(intent.weight ?? 1),
    score
  };
}

function createIntentAnchorLabel(intent) {
  return String(intent.id ?? '')
    .replace(/^demo-/, '')
    .replace(new RegExp(`^${intent.type}-`), '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function inferIntentRadius(text, anchorRadius = 0, defaultRadius = 3) {
  const explicit = text.match(/\bradius\s+(\d+)\b/);
  if (explicit) {
    return Number(explicit[1]);
  }

  if (/\b(tiny|very small)\b/.test(text)) {
    return 2;
  }
  if (/\b(small|tight|narrow)\b/.test(text)) {
    return 3;
  }
  if (/\b(large|wide|broad)\b/.test(text)) {
    return 5;
  }

  return Number(anchorRadius || defaultRadius || 3);
}

function inferIntentWeight(text, anchorWeight = 0, defaultWeight = 1) {
  const explicit = text.match(/\bweight\s+(\d+(?:\.\d+)?)\b/);
  if (explicit) {
    return Number(explicit[1]);
  }

  const baseWeight = Number(anchorWeight || defaultWeight || 1);
  if (/\b(slight|slightly|gently|a bit)\b/.test(text)) {
    return Math.max(0.1, baseWeight - 0.2);
  }
  if (/\b(strong|strongly|heavily|much|really)\b/.test(text)) {
    return Math.min(2, baseWeight + 0.3);
  }

  return baseWeight;
}

export function taskToLabel(task) {
  switch (task.type) {
    case 'moveTo':
      return `Move to (${task.target?.x ?? '-'}, ${task.target?.y ?? '-'})`;
    case 'attackUnit':
      return `Attack ${task.payload?.targetUnitId ?? 'enemy'} @ (${task.target?.x ?? '-'}, ${task.target?.y ?? '-'})`;
    case 'placeBuilding':
      return `Place ${task.payload?.buildingType} at (${task.target?.x ?? '-'}, ${task.target?.y ?? '-'})`;
    case 'spawnUnit': {
      const spawnTarget = task.payload?.spawnAt ?? task.target;
      return `Spawn ${task.payload?.role ?? task.payload?.unitType} at (${spawnTarget?.x ?? '-'}, ${spawnTarget?.y ?? '-'})`;
    }
    case 'deleteBuilding':
      return `Delete building ${task.payload?.id}`;
    case 'paintTile':
      return `Paint tile (${task.target?.x ?? '-'}, ${task.target?.y ?? '-'}) -> ${task.payload?.tileType}`;
    default:
      return task.type;
  }
}

export function formatTaskTraceLabel(task) {
  return `${task.type}${formatTaskContributionSummary(task)}${formatTaskSourceSummary(task)}${formatTaskThreatSummary(task)}`;
}

export function createTask(store, spec) {
  const id = `task-${String(store.counters.task).padStart(4, '0')}`;
  store.counters.task += 1;
  const payload = {
    ...(spec.payload ?? {}),
    ...(spec.payload?.spawnAt ? { spawnAt: createTileAddress(spec.payload.spawnAt) } : {})
  };

  return {
    id,
    type: spec.type,
    status: TASK_STATUS.QUEUED,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    target: spec.target ? createTileAddress(spec.target) : null,
    payload,
    assignedActorId: spec.assignedActorId,
    issuedByActorId: spec.issuedByActorId,
    sourceField: spec.sourceField ?? null,
    localGradientValue: Number.isFinite(spec.localGradientValue) ? spec.localGradientValue : null,
    threatValue: Number.isFinite(spec.threatValue) ? spec.threatValue : null,
    contributingScores: spec.contributingScores ? { ...spec.contributingScores } : null,
    statusReason: null
  };
}

export function enqueueActorTask(actor, task) {
  task.assignedActorId = actor.id;
  task.status = TASK_STATUS.QUEUED;
  task.statusReason = null;
  actor.taskQueue.push(task);
  return task;
}

export function cancelCurrentTask(actor) {
  if (!actor.currentTask) {
    return { ok: false, error: `No active task to cancel for ${actorLabel(actor)}.` };
  }

  const cancelled = actor.currentTask;
  cancelled.status = TASK_STATUS.FAILED;
  cancelled.statusReason = 'cancelled by user';
  cancelled.completedAt = new Date().toISOString();
  actor.failedTasks.unshift(cancelled);

  actor.currentTask = null;
  actor.state = 'idle';
  actor.moveCooldownFrames = 0;
  return { ok: true, task: cancelled };
}


export function executeImmediateDeleteBuilding(state, actor, buildingId) {
  const result = removeBuilding(state.store, buildingId);
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    eventText: `${actorLabel(actor)} | admin-delete | ${buildingId} -> done`
  };
}

export function clearTaskQueue(actor) {
  const cleared = actor.taskQueue.length;
  actor.taskQueue = [];
  return { ok: true, cleared };
}

export function removeQueuedTask(actor, taskId) {
  const index = actor.taskQueue.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return { ok: false, error: `Queued task ${taskId} not found.` };
  }
  const [removed] = actor.taskQueue.splice(index, 1);
  return { ok: true, task: removed };
}

export function moveQueuedTask(actor, taskId, direction) {
  const index = actor.taskQueue.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return { ok: false, error: `Queued task ${taskId} not found.` };
  }

  const nextIndex = direction === 'up' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= actor.taskQueue.length) {
    return { ok: false, error: 'Task cannot be moved further in that direction.' };
  }

  const [task] = actor.taskQueue.splice(index, 1);
  actor.taskQueue.splice(nextIndex, 0, task);
  return { ok: true, task };
}

export function retryFailedTask(actor, taskId) {
  const index = actor.failedTasks.findIndex((task) => task.id === taskId);
  if (index === -1) {
    return { ok: false, error: `Failed task ${taskId} not found.` };
  }

  const [task] = actor.failedTasks.splice(index, 1);
  task.status = TASK_STATUS.QUEUED;
  task.statusReason = 'retried';
  task.startedAt = null;
  task.completedAt = null;
  actor.taskQueue.push(task);
  return { ok: true, task };
}

export function tickAllActors(state, reportEvent) {
  tickTaskActor(state.store.agent, state, reportEvent);
  state.store.units
    .filter((unit) => !isConflictUnit(unit) || isConflictUnitAlive(unit))
    .forEach((unit) => tickTaskActor(unit, state, reportEvent));
}

function tickTaskActor(actor, state, reportEvent) {
  if (isConflictUnit(actor) && !isConflictUnitAlive(actor)) {
    return;
  }

  if (maybeRelayRecharge(actor, state, reportEvent)) {
    return;
  }

  if (!actor.currentTask) {
    const next = actor.taskQueue.shift();
    if (!next) {
      actor.state = isActorExhausted(actor) ? 'exhausted' : 'idle';
      return;
    }

    actor.currentTask = next;
    transitionTask(next, TASK_STATUS.IN_PROGRESS, null);
    next.startedAt = next.startedAt ?? new Date().toISOString();
    actor.state = 'working';
    reportEvent(`${actorLabel(actor)} | ${next.id} | ${formatTaskTraceLabel(next)} -> in_progress`, 'ok');
  }

  const task = actor.currentTask;
  const capabilityCheck = canActorExecuteTask(actor, task);
  if (!capabilityCheck.ok) {
    failTask(actor, reportEvent, task, capabilityCheck.error);
    return;
  }

  const target = getTaskTarget(state, task);
  if (!target.ok) {
    failTask(actor, reportEvent, task, target.error);
    return;
  }

  if (!isInInteractionRange(actor, target.target)) {
    const movementEnergyCheck = canActorAffordMovement(actor);
    if (!movementEnergyCheck.ok) {
      blockTask(actor, reportEvent, task, movementEnergyCheck.error, 'exhausted');
      return;
    }

    const stepResult = stepTowardTarget(state, actor, target.target);
    if (!stepResult.ok) {
      blockTask(actor, reportEvent, task, stepResult.reason, 'blocked');
      return;
    }

    if (stepResult.moved) {
      spendActorMovementEnergy(actor);
    }

    if (task.status === TASK_STATUS.BLOCKED) {
      transitionTask(task, TASK_STATUS.IN_PROGRESS, null);
      reportEvent(`${actorLabel(actor)} | ${task.id} | ${formatTaskTraceLabel(task)} -> in_progress (unblocked)`, 'ok');
    }

    return;
  }

  const actionEnergyCheck = canActorAffordTask(actor, task);
  if (!actionEnergyCheck.ok) {
    blockTask(actor, reportEvent, task, actionEnergyCheck.error, 'exhausted');
    return;
  }

  const result = executeTaskStep(state, actor, task);
  if (!result.ok) {
    failTask(actor, reportEvent, task, result.error);
    return;
  }

  if (result.consumeEnergy !== false) {
    spendActorTaskEnergy(actor, task);
  }

  if (result.eventText) {
    reportEvent(`${actorLabel(actor)} | ${task.id} | ${formatTaskTraceLabel(task)} | ${result.eventText}`, 'ok');
  }

  if (!result.done) {
    transitionTask(task, TASK_STATUS.IN_PROGRESS, result.reason ?? null);
    return;
  }

  transitionTask(task, TASK_STATUS.DONE, null);
  task.completedAt = new Date().toISOString();
  actor.taskHistory.unshift(task);
  if (actor.taskHistory.length > 10) {
    actor.taskHistory.pop();
  }

  reportEvent(`${actorLabel(actor)} | ${task.id} | ${formatTaskTraceLabel(task)} -> done`, 'ok');
  actor.currentTask = null;
  actor.state = isActorExhausted(actor) ? 'exhausted' : 'idle';
}

function maybeRelayRecharge(actor, state, reportEvent) {
  if (!actorNeedsEnergy(actor)) {
    clearRelayRechargeState(actor);
    return false;
  }

  const relay = findRechargeRelayInRange(state.store, actor);
  if (!relay) {
    clearRelayRechargeState(actor);
    return false;
  }

  if (actor.currentTask) {
    if (!shouldRechargeBlockedTask(actor, state)) {
      clearRelayRechargeState(actor);
      return false;
    }
  } else if (actor.taskQueue.length > 0 || !['idle', 'exhausted', 'recharging'].includes(actor.state)) {
    clearRelayRechargeState(actor);
    return false;
  }

  const isNewRelay = actor.rechargeBuildingId !== relay.id;
  const isNewState = actor.state !== 'recharging';
  actor.state = 'recharging';
  actor.rechargeBuildingId = relay.id;

  if (isNewRelay || isNewState) {
    actor.rechargeCooldownFrames = RELAY_RECHARGE_FRAMES;
    reportEvent(`${actorLabel(actor)} | relay ${relay.id} | recharge started`, 'ok');
  }

  if (actor.rechargeCooldownFrames > 0) {
    actor.rechargeCooldownFrames -= 1;
    return true;
  }

  const recharge = rechargeActorEnergy(actor);
  actor.rechargeCooldownFrames = RELAY_RECHARGE_FRAMES;
  reportEvent(`${actorLabel(actor)} | relay ${relay.id} | recharged to ${getActorEnergyText(actor)}`, 'ok');

  if (recharge.full && !actor.currentTask) {
    clearRelayRechargeState(actor);
    actor.state = 'idle';
    reportEvent(`${actorLabel(actor)} | relay ${relay.id} | recharge complete`, 'ok');
  }

  return true;
}

function shouldRechargeBlockedTask(actor, state) {
  if (actor.currentTask?.status !== TASK_STATUS.BLOCKED) {
    return false;
  }

  const target = getTaskTarget(state, actor.currentTask);
  if (!target.ok) {
    return false;
  }

  if (!isInInteractionRange(actor, target.target)) {
    return !canActorAffordMovement(actor).ok;
  }

  return !canActorAffordTask(actor, actor.currentTask).ok;
}

function clearRelayRechargeState(actor) {
  actor.rechargeCooldownFrames = 0;
  actor.rechargeBuildingId = null;
}

function transitionTask(task, status, reason) {
  task.status = status;
  task.statusReason = reason;
}

function canActorExecuteTask(actor, task) {
  if (actor.type === 'god-agent') {
    return { ok: true };
  }

  if (actor.type === 'worker') {
    const allowed = new Set(['moveTo', 'placeBuilding', 'paintTile', 'deleteBuilding']);
    if (!allowed.has(task.type)) {
      return { ok: false, error: 'actor lacks capability' };
    }
    return { ok: true };
  }

  if (isConflictUnit(actor)) {
    const allowed = new Set(['moveTo', 'attackUnit']);
    if (!allowed.has(task.type)) {
      return { ok: false, error: 'actor lacks capability' };
    }
    return { ok: true };
  }

  return { ok: false, error: `unknown actor type: ${actor.type}` };
}

function executeTaskStep(state, actor, task) {
  const { payload } = task;
  switch (task.type) {
    case 'moveTo':
      return { ok: true, done: true };
    case 'attackUnit':
      return executeConflictAttack(state, actor, task);
    case 'placeBuilding':
      return advanceConstruction(state, actor, task);
    case 'spawnUnit': {
      const spawnTarget = payload.spawnAt ?? task.target;
      const result = mapBuildError(spawnUnit(state.store, state.map, {
        type: payload.unitType,
        x: spawnTarget.x,
        y: spawnTarget.y,
        role: payload.role ?? null,
        spawnedBySpawnerId: payload.spawnerId ?? null
      }));
      if (result.ok && payload.source === 'builder-spawner' && payload.spawnerId) {
        const registration = registerSpawnedBuilder(
          state,
          payload.spawnerId,
          result.unit,
          state.emergence?.resolveCycle ?? null
        );
        if (!registration.ok) {
          return { ok: false, error: registration.error };
        }
      }
      return { ...result, done: true };
    }
    case 'deleteBuilding': {
      const result = mapBuildError(removeBuilding(state.store, payload.id));
      return { ...result, done: true };
    }
    case 'paintTile': {
      const result = paintTile(state, task.target.x, task.target.y, payload.tileType);
      return { ...result, done: true };
    }
    default:
      return { ok: false, error: `unsupported task type: ${task.type}` };
  }
}

function advanceConstruction(state, actor, task) {
  const buildType = task.payload.buildingType;

  if (!task.payload.buildingId) {
    const createResult = mapBuildError(placeBuilding(state.store, state.map, {
      type: buildType,
      x: task.target.x,
      y: task.target.y,
      state: BUILDING_STATE.UNDER_CONSTRUCTION,
      buildProgress: 0,
      buildRequired: BUILDING_TYPES[buildType]?.buildRequired ?? 6,
      builderActorId: actor.id,
      startedAt: new Date().toISOString()
    }));
    if (!createResult.ok) {
      return { ok: false, error: createResult.error };
    }

    task.payload.buildingId = createResult.building.id;
    task.payload.nextMilestone = 25;
    return { ok: true, done: false, reason: 'construction started', eventText: `construction started for ${createResult.building.id}` };
  }

  const building = state.store.buildings.find((item) => item.id === task.payload.buildingId);
  if (!building) {
    return { ok: false, error: 'target missing' };
  }

  if (building.state === BUILDING_STATE.COMPLETE) {
    return { ok: true, done: true, eventText: `construction completed for ${building.id}` };
  }

  building.builderActorId = actor.id;
  building.buildProgress = Math.min(building.buildRequired, building.buildProgress + 1);

  const percent = Math.floor((building.buildProgress / building.buildRequired) * 100);
  if (percent >= (task.payload.nextMilestone ?? 25) && percent < 100) {
    task.payload.nextMilestone = (task.payload.nextMilestone ?? 25) + 25;
    return { ok: true, done: false, reason: 'construction progressing', eventText: `${building.id} progress ${percent}%` };
  }

  if (building.buildProgress >= building.buildRequired) {
    building.state = BUILDING_STATE.COMPLETE;
    building.completedAt = new Date().toISOString();
    return { ok: true, done: true, eventText: `construction completed for ${building.id}` };
  }

  return { ok: true, done: false, reason: 'construction progressing' };
}

function mapBuildError(result) {
  if (result.ok) {
    return result;
  }

  if (result.error?.includes('occupied')) {
    return { ok: false, error: 'tile occupied' };
  }
  if (result.error?.includes('Cannot place building on')) {
    return { ok: false, error: 'invalid tile type' };
  }
  if (result.error?.includes('out of bounds')) {
    return { ok: false, error: 'invalid tile type' };
  }
  return result;
}

function paintTile(state, x, y, tileType) {
  const existing = getTileType(state.map, x, y);
  if (!existing) {
    return { ok: false, error: 'invalid tile type' };
  }
  if (!TILE_TYPES[tileType]) {
    return { ok: false, error: 'invalid tile type' };
  }
  if (existing === tileType) {
    return { ok: true, eventText: `tile already ${tileType}` };
  }

  state.map.tiles[y][x] = tileType;
  const reinforcement = reinforceFieldValue(state.emergence?.reinforcement, x, y);
  const reinforcementText = reinforcement == null ? '' : ` | reinforcement ${reinforcement.toFixed(2)}`;
  return { ok: true, eventText: `painted ${existing} -> ${tileType}${reinforcementText}` };
}

function getTaskTarget(state, task) {
  const trackedUnit = resolveTrackedUnitTarget(state, task);

  switch (task.type) {
    case 'moveTo':
      return {
        ok: true,
        target: {
          x: trackedUnit?.x ?? task.target.x,
          y: trackedUnit?.y ?? task.target.y,
          range: Math.max(0, Number(task.payload?.range ?? 0))
        }
      };
    case 'attackUnit':
      if (!trackedUnit) {
        return { ok: false, error: 'target missing' };
      }
      return {
        ok: true,
        target: {
          x: trackedUnit.x,
          y: trackedUnit.y,
          range: Math.max(1, Number(task.payload?.range ?? 1))
        }
      };
    case 'placeBuilding':
    case 'paintTile':
      return { ok: true, target: { x: task.target.x, y: task.target.y, range: 0 } };
    case 'spawnUnit':
      return {
        ok: true,
        target: {
          x: task.target.x,
          y: task.target.y,
          range: task.payload?.source === 'builder-spawner' ? 1 : 0
        }
      };
    case 'deleteBuilding': {
      const building = state.store.buildings.find((b) => b.id === task.payload.id);
      if (!building) {
        return { ok: false, error: 'target missing' };
      }
      return { ok: true, target: { x: building.x, y: building.y, range: 1 } };
    }
    default:
      return { ok: false, error: 'target missing' };
  }
}

function isInInteractionRange(actor, target) {
  const distance = Math.abs(actor.x - target.x) + Math.abs(actor.y - target.y);
  return distance <= target.range;
}

function stepTowardTarget(state, actor, target) {
  if (actor.moveCooldownFrames > 0) {
    actor.moveCooldownFrames -= 1;
    return { ok: true, moved: false };
  }

  const dx = target.x - actor.x;
  const dy = target.y - actor.y;

  const candidates = [];
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    candidates.push({ x: actor.x + Math.sign(dx), y: actor.y });
  }
  if (dy !== 0) {
    candidates.push({ x: actor.x, y: actor.y + Math.sign(dy) });
  }
  if (Math.abs(dx) < Math.abs(dy) && dx !== 0) {
    candidates.push({ x: actor.x + Math.sign(dx), y: actor.y });
  }

  const next = candidates.find((tile) => isActorTraversalTile(state, actor, tile));

  if (!next) {
    return { ok: false, reason: 'no reachable adjacent execution tile' };
  }

  actor.x = next.x;
  actor.y = next.y;
  actor.state = 'moving';
  actor.moveCooldownFrames = MOVE_STEP_FRAMES;
  return { ok: true, moved: true };
}

function resolveTrackedUnitTarget(state, task) {
  const targetId = String(task?.payload?.targetUnitId ?? '').trim();
  if (!targetId) {
    return null;
  }

  return (state?.store?.units ?? []).find((unit) => unit.id === targetId) ?? null;
}

function isActorTraversalTile(state, actor, tile) {
  const tileType = getTileType(state?.map, tile.x, tile.y);
  if (!tileType || !TILE_TYPES[tileType].walkable) {
    return false;
  }

  if ((state?.store?.buildings ?? []).some((building) => building.x === tile.x && building.y === tile.y)) {
    return false;
  }

  if (state?.store?.agent?.id !== actor.id && state?.store?.agent?.x === tile.x && state?.store?.agent?.y === tile.y) {
    return false;
  }

  return !(state?.store?.units ?? []).some((unit) =>
    unit.id !== actor.id
    && (!isConflictUnit(unit) || isConflictUnitAlive(unit))
    && unit.x === tile.x
    && unit.y === tile.y
  );
}

function blockTask(actor, reportEvent, task, reason, actorState = 'blocked') {
  const alreadyBlocked = task.status === TASK_STATUS.BLOCKED && task.statusReason === reason && actor.state === actorState;
  transitionTask(task, TASK_STATUS.BLOCKED, reason);
  actor.state = actorState;
  if (!alreadyBlocked) {
    reportEvent(`${actorLabel(actor)} | ${task.id} | ${formatTaskTraceLabel(task)} -> blocked (${reason})`, 'warn');
  }
}

function failTask(actor, reportEvent, task, reason) {
  transitionTask(task, TASK_STATUS.FAILED, reason);
  task.completedAt = new Date().toISOString();
  actor.failedTasks.unshift(task);
  if (actor.failedTasks.length > 20) {
    actor.failedTasks.pop();
  }
  reportEvent(`${actorLabel(actor)} | ${task.id} | ${formatTaskTraceLabel(task)} -> failed (${reason})`, 'error');
  actor.currentTask = null;
  actor.state = 'idle';
}

function formatTaskContributionSummary(task) {
  if (!task?.contributingScores) {
    return '';
  }

  const scores = task.contributingScores;
  const regionalSummary = Number.isFinite(scores.region)
    ? `, reg=${formatSignedContribution(scores.region)}`
    : '';
  return ` (def=${formatSignedContribution(scores.def)}${regionalSummary}, mem=${formatSignedContribution(scores.reinforce)}, hold=${formatSignedContribution(scores.resistance)}, flow=${formatSignedContribution(scores.flow)}, trav=${formatSignedContribution(scores.traversal)}, corr=${formatSignedContribution(scores.corridor)})`;
}

function formatTaskSourceSummary(task) {
  if (!task?.sourceField) {
    return '';
  }

  if (!Number.isFinite(task.localGradientValue)) {
    return ` [source ${task.sourceField}]`;
  }

  return ` [source ${task.sourceField} @ ${task.localGradientValue.toFixed(2)}]`;
}

function formatTaskThreatSummary(task) {
  if (!Number.isFinite(task?.threatValue) || task.threatValue <= 0.01) {
    return '';
  }

  return ` [threat ${task.threatValue.toFixed(2)}]`;
}

function formatSignedContribution(value) {
  const numeric = Number(value ?? 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
}
