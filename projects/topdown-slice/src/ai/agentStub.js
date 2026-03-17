import { BUILDING_STATE, BUILDING_TYPES, placeBuilding, removeBuilding } from '../buildings/buildings.js';
import { spawnUnit } from '../units/units.js';
import { getTileType, TILE_TYPES } from '../world/tilemap.js';

const MOVE_STEP_FRAMES = 8;

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
    parseNaturalLanguage() {
      return {
        ok: false,
        error: 'Natural language parsing is not enabled in thin-slice mode yet.'
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
  return actor.type === 'god-agent' ? `God Agent (${actor.id})` : `Worker (${actor.id})`;
}

export function taskToLabel(task) {
  switch (task.type) {
    case 'moveTo':
      return `Move to (${task.target?.x ?? '-'}, ${task.target?.y ?? '-'})`;
    case 'placeBuilding':
      return `Place ${task.payload?.buildingType} at (${task.target?.x ?? '-'}, ${task.target?.y ?? '-'})`;
    case 'spawnUnit':
      return `Spawn ${task.payload?.unitType} at (${task.target?.x ?? '-'}, ${task.target?.y ?? '-'})`;
    case 'deleteBuilding':
      return `Delete building ${task.payload?.id}`;
    case 'paintTile':
      return `Paint tile (${task.target?.x ?? '-'}, ${task.target?.y ?? '-'}) -> ${task.payload?.tileType}`;
    default:
      return task.type;
  }
}

export function createTask(store, spec) {
  const id = `task-${String(store.counters.task).padStart(4, '0')}`;
  store.counters.task += 1;
  return {
    id,
    type: spec.type,
    status: TASK_STATUS.QUEUED,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    target: spec.target ?? null,
    payload: spec.payload ?? {},
    assignedActorId: spec.assignedActorId,
    issuedByActorId: spec.issuedByActorId,
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
    .filter((unit) => unit.type === 'worker')
    .forEach((worker) => tickTaskActor(worker, state, reportEvent));
}

function tickTaskActor(actor, state, reportEvent) {
  if (!actor.currentTask) {
    const next = actor.taskQueue.shift();
    if (!next) {
      actor.state = 'idle';
      return;
    }

    actor.currentTask = next;
    transitionTask(next, TASK_STATUS.IN_PROGRESS, null);
    next.startedAt = next.startedAt ?? new Date().toISOString();
    actor.state = 'working';
    reportEvent(`${actorLabel(actor)} | ${next.id} | ${next.type} -> in_progress`, 'ok');
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
    const stepResult = stepTowardTarget(state.map, actor, target.target);
    if (!stepResult.ok) {
      transitionTask(task, TASK_STATUS.BLOCKED, stepResult.reason);
      reportEvent(`${actorLabel(actor)} | ${task.id} | ${task.type} -> blocked (${stepResult.reason})`, 'warn');
      return;
    }

    if (task.status === TASK_STATUS.BLOCKED) {
      transitionTask(task, TASK_STATUS.IN_PROGRESS, null);
      reportEvent(`${actorLabel(actor)} | ${task.id} | ${task.type} -> in_progress (unblocked)`, 'ok');
    }

    return;
  }

  const result = executeTaskStep(state, actor, task);
  if (!result.ok) {
    failTask(actor, reportEvent, task, result.error);
    return;
  }

  if (result.eventText) {
    reportEvent(`${actorLabel(actor)} | ${task.id} | ${task.type} | ${result.eventText}`, 'ok');
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

  reportEvent(`${actorLabel(actor)} | ${task.id} | ${task.type} -> done`, 'ok');
  actor.currentTask = null;
  actor.state = 'idle';
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

  return { ok: false, error: `unknown actor type: ${actor.type}` };
}

function executeTaskStep(state, actor, task) {
  const { payload } = task;
  switch (task.type) {
    case 'moveTo':
      return { ok: true, done: true };
    case 'placeBuilding':
      return advanceConstruction(state, actor, task);
    case 'spawnUnit': {
      const result = mapBuildError(spawnUnit(state.store, state.map, {
        type: payload.unitType,
        x: task.target.x,
        y: task.target.y
      }));
      return { ...result, done: true };
    }
    case 'deleteBuilding': {
      const result = mapBuildError(removeBuilding(state.store, payload.id));
      return { ...result, done: true };
    }
    case 'paintTile': {
      const result = paintTile(state.map, task.target.x, task.target.y, payload.tileType);
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

function paintTile(map, x, y, tileType) {
  const existing = getTileType(map, x, y);
  if (!existing) {
    return { ok: false, error: 'invalid tile type' };
  }
  if (!TILE_TYPES[tileType]) {
    return { ok: false, error: 'invalid tile type' };
  }
  map.tiles[y][x] = tileType;
  return { ok: true };
}

function getTaskTarget(state, task) {
  switch (task.type) {
    case 'moveTo':
    case 'placeBuilding':
    case 'spawnUnit':
    case 'paintTile':
      return { ok: true, target: { x: task.target.x, y: task.target.y, range: 0 } };
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

function stepTowardTarget(map, actor, target) {
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

  const next = candidates.find((tile) => {
    const tileType = getTileType(map, tile.x, tile.y);
    return tileType && TILE_TYPES[tileType].walkable;
  });

  if (!next) {
    return { ok: false, reason: 'no reachable adjacent execution tile' };
  }

  actor.x = next.x;
  actor.y = next.y;
  actor.state = 'moving';
  actor.moveCooldownFrames = MOVE_STEP_FRAMES;
  return { ok: true, moved: true };
}

function failTask(actor, reportEvent, task, reason) {
  transitionTask(task, TASK_STATUS.FAILED, reason);
  task.completedAt = new Date().toISOString();
  actor.failedTasks.unshift(task);
  if (actor.failedTasks.length > 20) {
    actor.failedTasks.pop();
  }
  reportEvent(`${actorLabel(actor)} | ${task.id} | ${task.type} -> failed (${reason})`, 'error');
  actor.currentTask = null;
  actor.state = 'idle';
}
