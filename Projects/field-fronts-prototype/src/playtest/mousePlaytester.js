import { collectCommandTargetCandidates, getAvailableCommands } from '../game/commandWheelAdapter.js';

const MOUSE_API_ROOT = './api/mouse';
const MOUSE_WAITING_MESSAGE = 'Mouse is waiting for local model connection';
const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_OBSERVATION_INTERVAL_MS = 5000;

export function isMouseModeEnabled(search = globalThis.location?.search ?? '') {
  return new URLSearchParams(search).get('mouse') === '1';
}

export function createMousePlaytester({
  state,
  bus,
  enabled = isMouseModeEnabled(),
  fetchImpl = globalThis.fetch,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  observationIntervalMs = DEFAULT_OBSERVATION_INTERVAL_MS
} = {}) {
  state.mousePlaytest = createMouseUiState(enabled);
  let started = false;
  let stopped = false;
  let busy = false;
  let nextObservationAt = 0;
  let timer = null;
  const handledActionIds = new Set();

  async function start() {
    if (!enabled || stopped || timer) return;
    await pump({ eventType: 'scenario_loaded', forceSnapshot: true });
    timer = setInterval(() => void pump(), pollIntervalMs);
  }

  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function pump({ eventType = 'cadence', forceSnapshot = false } = {}) {
    if (!enabled || stopped || busy || state.uiScreen !== 'game') return;
    busy = true;
    try {
      if (!started) {
        const payload = await requestJson(`${MOUSE_API_ROOT}/start`, {
          method: 'POST',
          body: JSON.stringify({
            scenarioId: state.activeScenarioId ?? 'chapter_001',
            scenarioTitle: state.map?.scenario?.scenarioSpine?.title ?? 'The First Night'
          })
        }, fetchImpl);
        applyServerState(payload.mouse);
        started = true;
      }
      const now = Date.now();
      if (forceSnapshot || now >= nextObservationAt) {
        nextObservationAt = now + observationIntervalMs;
        const payload = await requestJson(`${MOUSE_API_ROOT}/observe`, {
          method: 'POST',
          body: JSON.stringify(collectMouseSnapshot(state, { eventType }))
        }, fetchImpl);
        applyServerState(payload.mouse);
      }
      const payload = await requestJson(`${MOUSE_API_ROOT}/status`, {}, fetchImpl);
      applyServerState(payload.mouse);
    } catch (error) {
      state.mousePlaytest.status = 'waiting';
      state.mousePlaytest.stateLabel = MOUSE_WAITING_MESSAGE;
      state.mousePlaytest.lastError = String(error?.message ?? error);
      state.mousePlaytest.modelAvailable = false;
      bus?.emit('render');
    } finally {
      busy = false;
    }
  }

  function applyServerState(source = {}) {
    Object.assign(state.mousePlaytest, {
      ...source,
      enabled: true
    });
    bus?.emit('render');
    const pendingAction = source.pendingAction;
    if (pendingAction?.actionId && !handledActionIds.has(pendingAction.actionId)) {
      handledActionIds.add(pendingAction.actionId);
      bus?.emit('mouse:action-decision', { decision: pendingAction });
    }
  }

  async function reportActionOutcome(outcome = {}) {
    try {
      const payload = await requestJson(`${MOUSE_API_ROOT}/action-outcome`, {
        method: 'POST',
        body: JSON.stringify(outcome)
      }, fetchImpl);
      applyServerState(payload.mouse);
    } catch (error) {
      state.mousePlaytest.lastError = String(error?.message ?? error);
      bus?.emit('render');
    }
  }

  return {
    enabled,
    start,
    stop,
    pump,
    reportActionOutcome,
    getState: () => state.mousePlaytest
  };
}

export function collectMouseSnapshot(state = {}, { eventType = 'cadence' } = {}) {
  const game = state.game ?? {};
  const commander = (game.leaders ?? []).find((leader) => leader.factionId === 'player') ?? null;
  const commanderPosition = getPosition(commander);
  const radius = Math.max(4, Number(state.scenarioCamera?.commandRadiusTiles) || 12);
  const alliedSquads = (game.squads ?? []).filter((squad) => squad.factionId === 'player');
  const nearbySquads = alliedSquads.filter((squad) => distance(getPosition(squad), commanderPosition) <= radius);
  const separatedSquads = alliedSquads.filter((squad) => distance(getPosition(squad), commanderPosition) > radius);
  const objectives = state.map?.scenario?.scenarioSpine?.objectives ?? [];
  const completedObjectives = new Set(state.scenarioRuntime?.completedObjectiveIds ?? []);
  const activeObjective = objectives.find((objective) => !completedObjectives.has(objective.id)) ?? objectives.at(-1);
  const selectedId = game.selectedEntityId;
  const selectedNonCommander = Boolean(selectedId && commander && selectedId !== commander.id);
  const fps = eventType !== 'scenario_loaded' && Number(state.runtimeStats?.fps) > 0 ? finiteOrNull(state.runtimeStats?.fps) : null;
  const frameMs = eventType !== 'scenario_loaded' ? finiteOrNull(state.runtimeStats?.frameMs) : null;
  const availableCommands = getAvailableCommands(state, commander?.id).map((command) => ({
    id: command.id,
    label: command.label,
    targetTypes: command.targetTypes
  }));
  const targetCandidates = collectCommandTargetCandidates(state, commander?.id);
  const nearbyShelters = targetCandidates
    .filter((candidate) => candidate.type === 'shelter')
    .map((candidate) => ({
      id: candidate.id,
      type: candidate.label,
      distance: candidate.distanceFromCommander,
      rating: candidate.shelterRating,
      objectiveState: candidate.objectiveState,
      knowledgeState: candidate.knowledgeState
    }));
  const issues = [];
  if (!commander) issues.push('I cannot find the commander.');
  if (selectedNonCommander) issues.push('A non-commander group is selected.');
  if (separatedSquads.length > 0) issues.push(`${separatedSquads.length} band group${separatedSquads.length === 1 ? ' is' : 's are'} outside calling range.`);
  if (fps != null && fps < 35) issues.push(`Frame rate is low at ${Math.round(fps)} FPS.`);
  if (nearbyShelters.length === 0) issues.push('No readable shelter is close to the commander.');

  return {
    timestamp: new Date().toISOString(),
    eventType,
    scenarioId: state.activeScenarioId ?? state.map?.scenario?.activeScenarioId ?? 'chapter_001',
    scenarioTitle: state.map?.scenario?.scenarioSpine?.title ?? 'The First Night',
    objective: {
      id: activeObjective?.id ?? null,
      label: activeObjective?.label ?? 'Find shelter',
      progress: `${completedObjectives.size}/${objectives.length}`,
      completed: completedObjectives.size,
      total: objectives.length,
      shelterNodeId: activeObjective?.condition?.shelterNodeId ?? null
    },
    commander: {
      id: commander?.id ?? null,
      name: commander?.name ?? 'Tribal Leader',
      position: commanderPosition,
      selected: selectedId === commander?.id,
      visible: Boolean(commander),
      state: commander?.ai?.emotionalState ?? commander?.behavior?.intent ?? 'ready'
    },
    camera: {
      mode: state.scenarioCamera?.mode ?? 'unknown',
      commanderCentred: state.scenarioCamera?.mode === 'commander_follow_tactical_leash'
    },
    mouseFocus: {
      target: commander?.name ?? 'Tribal Leader',
      position: commanderPosition ? { x: commanderPosition.x + 0.6, y: commanderPosition.y + 0.5 } : null
    },
    nearbyBand: {
      hunters: countRole(nearbySquads, ['hunter']),
      scouts: countRole(nearbySquads, ['scout', 'forager']),
      vulnerable: nearbySquads
        .filter((squad) => ['vulnerable', 'survivors'].includes(squad.scenarioRole) || squad.unitId === 'survivors')
        .reduce((total, squad) => total + (Number(squad.survivorCount) || squad.members?.length || 1), 0),
      wounded: countRole(nearbySquads, ['wounded']),
      separated: separatedSquads.length
    },
    nearbyShelters,
    availableCommands,
    targetCandidates,
    recentCommandOutcomes: (state.mousePlaytest?.recentActions ?? []).slice(-3).map((action) => ({
      commandId: action.commandId ?? null,
      executionStatus: action.executionStatus ?? null,
      outcomeSummary: action.outcomeSummary ?? null
    })),
    fps,
    frameMs,
    issues,
    recentEvents: [
      state.commandFeedback?.reason,
      state.scenarioRuntime?.lastEffect?.label,
      state.status
    ].filter((entry) => typeof entry === 'string' && entry.trim()).slice(0, 4)
  };
}

export function createMouseUiState(enabled = false) {
  return {
    enabled: Boolean(enabled),
    status: enabled ? 'waiting' : 'disabled',
    stateLabel: enabled ? MOUSE_WAITING_MESSAGE : 'Mouse mode disabled',
    model: null,
    modelEndpoint: null,
    modelAvailable: false,
    latestThought: null,
    recentThoughts: [],
    latestAction: null,
    latestActionStatus: null,
    recentActions: [],
    pendingAction: null,
    currentMouseMode: enabled ? 'waiting' : 'disabled',
    latestSnapshotSummary: null,
    updatedAt: null,
    flags: [],
    lastError: null
  };
}

async function requestJson(url, options, fetchImpl) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Mouse cannot reach the local observer service.');
  }
  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    throw new Error(`Mouse observer returned HTTP ${response.status}.`);
  }
  return response.json();
}

function countRole(squads, roles) {
  return squads.filter((squad) => roles.some((role) => squad.scenarioRole === role || String(squad.name ?? '').toLowerCase().includes(role))).length;
}

function getPosition(entity) {
  const source = entity?.position ?? entity?.tile;
  return source && Number.isFinite(Number(source.x)) && Number.isFinite(Number(source.y))
    ? { x: Number(source.x), y: Number(source.y) }
    : null;
}

function distance(left, right) {
  return left && right ? Math.hypot(left.x - right.x, left.y - right.y) : Infinity;
}

function round1(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : null;
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? round1(value) : null;
}
