import { COMMAND_WHEEL_ACTIONS, getCommandWheelAction } from './commandWheel.js';
import { isNomadicSurvivalScene, SHELTER_NODE_TYPES } from '../world/sceneEntity.js';

export const COMMAND_WHEEL_SHELTER_CONTRACT_ID = 'field-fronts.command-wheel.shelter-target.v2';
export const MIN_ACTIONABLE_SHELTER_RATING = 0.2;

export const MOUSE_OBSERVE_COMMAND_ID = 'observe';

const COMMAND_TARGET_TYPES = Object.freeze({
  move_to_target: ['shelter'],
  seek_shelter: ['shelter'],
  quiet_move: ['shelter'],
  distract: ['shelter'],
  regroup: ['rally']
});

export function getAvailableCommands(state = {}, actorId = null) {
  const commander = findPlayerCommander(state);
  const observer = {
    id: MOUSE_OBSERVE_COMMAND_ID,
    label: 'Observe',
    shortLabel: 'Observe',
    targetTypes: [],
    description: 'Wait and read the current commander-local situation.'
  };
  if (!commander || (actorId && actorId !== commander.id) || !isNomadicSurvivalScene(state.map)) {
    return [observer];
  }
  return [
    observer,
    ...COMMAND_WHEEL_ACTIONS.map((action) => ({
      id: action.id,
      label: action.label,
      shortLabel: action.shortLabel,
      targetTypes: COMMAND_TARGET_TYPES[action.id] ?? [],
      description: action.description
    }))
  ];
}

export function getCommandTargets(state = {}, commandId, actorId = null) {
  const commander = findPlayerCommander(state);
  if (!commander || (actorId && actorId !== commander.id)) return [];
  const position = getPosition(commander);
  if (!position) return [];
  if (commandId === MOUSE_OBSERVE_COMMAND_ID) return [];
  if (commandId === 'regroup') {
    return [createRallyCandidate(position)];
  }
  const radius = Math.max(1, Number(state.map?.scenario?.scenarioLayer?.cameraRig?.commandRadiusTiles) || 12);
  const route = createShelterRouteContext(state);
  return (state.map?.scenario?.scenarioLayer?.shelterNodes ?? [])
    .map((node) => createShelterCandidate(node, position, route))
    .filter((candidate) => candidate && candidate.distanceFromCommander <= radius)
    .filter((candidate) => candidate.commandSuitability === 'actionable')
    .filter((candidate) => candidate.objectiveState !== 'completed')
    .sort(compareShelterCandidates)
    .slice(0, 5);
}

export function collectCommandTargetCandidates(state = {}, actorId = null) {
  const candidates = new Map();
  for (const action of getAvailableCommands(state, actorId)) {
    for (const candidate of getCommandTargets(state, action.id, actorId)) {
      candidates.set(candidate.id, candidate);
    }
  }
  return [...candidates.values()];
}

export function validateCommandIntent(decision = {}, state = {}) {
  const commandId = decision?.commandId ?? null;
  const commander = findPlayerCommander(state);
  if (!commander) {
    return reject('commander_unavailable', 'Mouse cannot issue orders without the tribal leader.');
  }
  const available = getAvailableCommands(state, commander.id);
  const offered = available.find((command) => command.id === commandId);
  if (!offered) {
    return reject('unavailable_command', `Mouse requested an unavailable command: ${commandId ?? 'none'}.`);
  }
  if (commandId === MOUSE_OBSERVE_COMMAND_ID) {
    if (decision.targetId != null) {
      return reject('invalid_target', 'Observe does not accept an invented command target.');
    }
    return {
      ok: true,
      observeOnly: true,
      command: offered,
      commander,
      target: null,
      intent: null
    };
  }
  const target = getCommandTargets(state, commandId, commander.id)
    .find((candidate) => candidate.id === decision.targetId);
  if (!target) {
    return reject('invalid_target', 'Mouse selected a target outside the offered commander-local choices.');
  }
  if (decision.targetPosition && !samePosition(decision.targetPosition, target.position)) {
    return reject('invalid_target', 'Mouse supplied coordinates that do not match the offered command target.');
  }
  const action = getCommandWheelAction(commandId);
  if (!action) {
    return reject('unavailable_command', `No command wheel action exists for ${commandId}.`);
  }
  return {
    ok: true,
    observeOnly: false,
    command: offered,
    action,
    commander,
    target,
    intent: {
      actionId: action.id,
      intentType: action.intentType,
      priority: action.priority,
      tile: target.position,
      commandTarget: createShelterCommandTargetContract(target),
      source: 'mouse-command-wheel',
      scope: 'faction',
      sourceEntityId: commander.id,
      mouseActionId: decision.actionId ?? null,
      mouseTargetId: target.id,
      mouseTargetLabel: target.label,
      audienceId: decision.audienceId ?? 'all_band'
    }
  };
}

export function executeCommandIntent(validation, bus) {
  if (!validation?.ok || validation.observeOnly || !validation.intent || typeof bus?.emit !== 'function') {
    return false;
  }
  bus.emit('orders:survival-intent', validation.intent);
  return true;
}

function findPlayerCommander(state) {
  return (state.game?.leaders ?? [])
    .find((leader) => leader.factionId === 'player' && leader.health?.state !== 'dead') ?? null;
}

function createRallyCandidate(position) {
  return {
    id: 'commander',
    label: 'tribal leader position',
    type: 'rally',
    position,
    relativeDirection: 'here',
    distanceFromCommander: 0,
    shelterRating: null,
    tags: ['commander_local', 'regroup_safe'],
    reachable: true,
    knownToCommander: true,
    knowledgeState: 'self_anchor',
    knowledgeSource: 'commander_position',
    directVisibility: 'self'
  };
}

function createShelterCandidate(node, commanderPosition, route) {
  const position = getPosition(node);
  if (!position) return null;
  const distanceFromCommander = round1(distance(position, commanderPosition));
  const shelterType = node.shelterType ?? node.type ?? null;
  const label = node.label ?? SHELTER_NODE_TYPES[shelterType]?.label ?? 'Natural shelter';
  const objective = route.objectivesByShelterId.get(node.id) ?? null;
  const activeObjective = route.activeShelterId === node.id ? route.activeObjective : null;
  const objectiveState = activeObjective
    ? 'active'
    : route.completedShelterIds.has(node.id)
      ? 'completed'
      : objective
        ? 'upcoming'
        : 'route_support';
  const knowledgeState = activeObjective
    ? 'objective_revealed'
    : objectiveState === 'completed'
      ? 'visited'
      : 'commander_local';
  const candidate = {
    id: node.id,
    label: String(label).toLowerCase(),
    type: 'shelter',
    shelterType,
    position,
    relativeDirection: describeDirection(commanderPosition, position),
    distanceFromCommander,
    shelterRating: round1(node.shelterRating) ?? 0,
    tags: [...new Set(node.tags ?? [])].slice(0, 8),
    reachable: true,
    knownToCommander: true,
    knowledgeState,
    knowledgeSource: activeObjective ? 'active_objective' : objectiveState === 'completed' ? 'completed_objective' : 'command_radius',
    directVisibility: 'not_asserted',
    objectiveState,
    objectiveId: activeObjective?.id ?? objective?.id ?? null,
    objectiveLabel: activeObjective?.label ?? objective?.label ?? null
  };
  const commandSuitability = candidate.shelterRating >= MIN_ACTIONABLE_SHELTER_RATING
    ? 'actionable'
    : 'not_actionable';
  return {
    ...candidate,
    commandSuitability,
    fallbackReason: commandSuitability === 'actionable' ? null : 'target_below_shelter_threshold'
  };
}

function createShelterCommandTargetContract(target) {
  if (!target || target.type !== 'shelter') return null;
  return {
    contract: COMMAND_WHEEL_SHELTER_CONTRACT_ID,
    id: target.id,
    label: target.label,
    type: target.type,
    shelterType: target.shelterType,
    shelterRating: target.shelterRating,
    position: target.position,
    tags: target.tags ?? [],
    knownToCommander: target.knownToCommander === true,
    knowledgeState: target.knowledgeState,
    knowledgeSource: target.knowledgeSource,
    directVisibility: target.directVisibility,
    objectiveState: target.objectiveState,
    objectiveId: target.objectiveId,
    reachableKnown: target.reachable !== false,
    commandSuitability: target.commandSuitability,
    fallbackReason: target.fallbackReason ?? null
  };
}

function createShelterRouteContext(state) {
  const objectives = Array.isArray(state.map?.scenario?.scenarioSpine?.objectives)
    ? state.map.scenario.scenarioSpine.objectives
    : [];
  const completedObjectiveIds = new Set(state.scenarioRuntime?.completedObjectiveIds ?? state.map?.scenario?.scenarioRuntime?.completedObjectiveIds ?? []);
  const activeObjective = objectives.find((objective) => !completedObjectiveIds.has(objective.id)) ?? null;
  const objectivesByShelterId = new Map();
  const completedShelterIds = new Set();
  for (const objective of objectives) {
    const shelterId = objective?.condition?.shelterNodeId;
    if (!shelterId) continue;
    if (!objectivesByShelterId.has(shelterId)) {
      objectivesByShelterId.set(shelterId, objective);
    }
    if (completedObjectiveIds.has(objective.id)) {
      completedShelterIds.add(shelterId);
    }
  }
  return {
    activeObjective,
    activeShelterId: activeObjective?.condition?.shelterNodeId ?? null,
    completedShelterIds,
    objectivesByShelterId
  };
}

function compareShelterCandidates(left, right) {
  const rank = (candidate) => candidate.objectiveState === 'active' ? 0 : candidate.objectiveState === 'upcoming' ? 1 : 2;
  return rank(left) - rank(right) || left.distanceFromCommander - right.distanceFromCommander;
}

function reject(reason, message) {
  return { ok: false, reason, message, observeOnly: false, command: null, target: null, intent: null };
}

function getPosition(entity) {
  const source = entity?.position ?? entity?.tile ?? entity;
  return source && Number.isFinite(Number(source.x)) && Number.isFinite(Number(source.y))
    ? { x: Math.round(Number(source.x) * 10) / 10, y: Math.round(Number(source.y) * 10) / 10 }
    : null;
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function samePosition(left, right) {
  const safeLeft = getPosition(left);
  return Boolean(safeLeft && right && distance(safeLeft, right) < 0.05);
}

function round1(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : null;
}

function describeDirection(origin, target) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const horizontal = dx > 1 ? 'east' : dx < -1 ? 'west' : '';
  const vertical = dy > 1 ? 'south' : dy < -1 ? 'north' : '';
  return [vertical, horizontal].filter(Boolean).join('-') || 'here';
}
