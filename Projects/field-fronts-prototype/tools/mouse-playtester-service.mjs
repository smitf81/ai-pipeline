import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..', '..');
const { callOllamaGenerate } = require(resolve(workspaceRoot, 'ui', 'llmAdapter.js'));
const { DEFAULT_OLLAMA_HOST, runOllamaTagsProbe } = require(resolve(workspaceRoot, 'ui', 'localModelClient.js'));

export const MOUSE_WAITING_MESSAGE = 'Mouse is waiting for local model connection';
export const DEFAULT_MOUSE_CADENCE_MS = 5000;
export const DEFAULT_MOUSE_TIMEOUT_MS = 18000;
export const PREFERRED_MOUSE_MODELS = Object.freeze([
  'qwen2.5-coder:1.5b',
  'phi3:mini',
  'gemma3:4b',
  'mistral:latest',
  'llama3:latest'
]);
const FIRST_NIGHT_UNSEEN_CIVILISATION_TERMS = /\b(camp(?:site)?|village|farm|barn|fence|road|cart|wall|ruin|shrine|watchtower|house|hut|tower|masonry|crop|plough|settlement)\b/i;

export function createMousePlaytesterService(options = {}) {
  const outputRoot = resolve(options.outputRoot ?? join(projectRoot, 'playtests', 'mouse'));
  const host = String(options.host ?? process.env.FIELD_FRONTS_MOUSE_HOST ?? DEFAULT_OLLAMA_HOST).replace(/\/+$/, '');
  const configuredModel = String(options.model ?? process.env.FIELD_FRONTS_MOUSE_MODEL ?? '').trim() || null;
  const cadenceMs = positiveNumber(options.cadenceMs ?? process.env.FIELD_FRONTS_MOUSE_CADENCE_MS, DEFAULT_MOUSE_CADENCE_MS);
  const timeoutMs = positiveNumber(options.timeoutMs ?? process.env.FIELD_FRONTS_MOUSE_TIMEOUT_MS, DEFAULT_MOUSE_TIMEOUT_MS);
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const modelClient = options.modelClient ?? {
    probe: ({ host: targetHost, timeoutMs: targetTimeoutMs }) => runOllamaTagsProbe({
      host: targetHost,
      timeoutMs: targetTimeoutMs,
      fetchImpl: options.fetchImpl ?? globalThis.fetch
    }),
    generate: ({ prompt, model, host: targetHost, timeoutMs: targetTimeoutMs }) => callOllamaGenerate({
      prompt,
      model,
      host: targetHost,
      timeoutMs: targetTimeoutMs,
      expectJson: false,
      fetchImpl: options.fetchImpl ?? globalThis.fetch
    })
  };

  let run = null;
  let thoughtSequence = 0;
  let actionSequence = 0;
  let lastThoughtRequestedAt = 0;
  let retryAfterAt = 0;
  let dependencyCheck = null;
  let pendingDecision = null;

  async function beginRun(metadata = {}) {
    const startedAt = isoNow(now);
    const runId = createRunId(startedAt);
    run = {
      runId,
      scenarioId: text(metadata.scenarioId, 'chapter_001'),
      scenarioTitle: text(metadata.scenarioTitle, 'The First Night'),
      status: 'checking',
      currentMouseMode: 'waiting',
      stateLabel: MOUSE_WAITING_MESSAGE,
      model: configuredModel,
      modelEndpoint: `${host}/api/generate`,
      modelAvailable: false,
      startedAt,
      updatedAt: startedAt,
      latestThought: null,
      recentThoughts: [],
      latestAction: null,
      latestActionStatus: null,
      recentActions: [],
      pendingAction: null,
      latestSnapshotSummary: null,
      performanceSummary: null,
      flags: [],
      lastError: null,
      paths: {
        runDirectory: join(outputRoot, 'runs', runId),
        thoughts: join(outputRoot, 'runs', runId, 'thoughts.jsonl'),
        actions: join(outputRoot, 'runs', runId, 'actions.jsonl'),
        snapshots: join(outputRoot, 'runs', runId, 'snapshots.jsonl'),
        summary: join(outputRoot, 'runs', runId, 'summary.md')
      }
    };
    thoughtSequence = 0;
    actionSequence = 0;
    lastThoughtRequestedAt = 0;
    retryAfterAt = 0;
    dependencyCheck = null;
    pendingDecision = null;
    await mkdir(run.paths.runDirectory, { recursive: true });
    await persistLatest();
    void refreshDependencyStatus();
    return getStatus();
  }

  async function acceptSnapshot(source = {}) {
    if (!run) {
      await beginRun({
        scenarioId: source.scenarioId,
        scenarioTitle: source.scenarioTitle
      });
    }
    const snapshot = normaliseMouseSnapshot(source);
    run.latestSnapshotSummary = snapshot;
    run.performanceSummary = {
      fps: snapshot.fps,
      frameMs: snapshot.frameMs,
      capturedAt: snapshot.timestamp
    };
    applySnapshotFlags(snapshot);
    touch();
    await appendJsonLine(run.paths.snapshots, snapshot);
    await persistLatest();
    queueDecision(snapshot);
    return getStatus();
  }

  function queueDecision(snapshot) {
    const nowMs = dateValue(now);
    if (pendingDecision || run?.pendingAction || nowMs < retryAfterAt || (lastThoughtRequestedAt && nowMs - lastThoughtRequestedAt < cadenceMs)) {
      return;
    }
    lastThoughtRequestedAt = nowMs;
    pendingDecision = generateDecision(snapshot)
      .catch(async (error) => {
        if (!run) return;
        run.status = 'error';
        run.currentMouseMode = 'error';
        run.stateLabel = MOUSE_WAITING_MESSAGE;
        run.modelAvailable = false;
        run.lastError = text(error?.message ?? error, 'Local model request failed.');
        addFlag('model_request_failed');
        retryAfterAt = dateValue(now) + Math.max(cadenceMs, 15000);
        touch();
        await persistLatest();
      })
      .finally(() => {
        pendingDecision = null;
      });
  }

  async function generateDecision(snapshot) {
    const dependencyReady = await refreshDependencyStatus();
    if (!dependencyReady || !run?.modelAvailable || !run.model) {
      return;
    }
    run.status = 'thinking';
    run.currentMouseMode = 'thinking';
    run.stateLabel = 'Mouse is thinking';
    touch();
    await persistLatest();
    const prompt = buildMousePrompt(snapshot, run.recentThoughts, run.recentActions);
    const result = await modelClient.generate({
      prompt,
      model: run.model,
      host,
      timeoutMs
    });
    let decision = null;
    try {
      decision = parseMouseDecisionResponse(result?.text);
      validateMouseDecisionGrounding(decision, snapshot);
    } catch (error) {
      await recordInvalidModelResponse(snapshot, error);
      return;
    }
    thoughtSequence += 1;
    const thoughtEntry = {
      timestamp: isoNow(now),
      thoughtId: `mouse_thought_${String(thoughtSequence).padStart(3, '0')}`,
      model: run.model,
      promptSummary: summarizePromptInput(snapshot),
      thought: decision.thought,
      eventType: snapshot.eventType,
      fps: snapshot.fps,
      commanderState: snapshot.commander?.state ?? null,
      objectiveState: snapshot.objective?.label ?? null
    };
    actionSequence += 1;
    const candidate = snapshot.targetCandidates.find((entry) => entry.id === decision.action.targetId) ?? null;
    const actionEntry = {
      timestamp: isoNow(now),
      actionId: `mouse_action_${String(actionSequence).padStart(3, '0')}`,
      phase: 'decision',
      model: run.model,
      commandId: decision.action.commandId,
      targetId: decision.action.targetId,
      targetPosition: decision.action.targetPosition ?? candidate?.position ?? null,
      targetLabel: candidate?.label ?? decision.action.targetId ?? null,
      audienceId: decision.action.audienceId,
      confidence: decision.action.confidence,
      reason: decision.action.reason,
      validationStatus: 'pending_game_validation',
      executionStatus: 'pending',
      commandResponseStatus: null,
      outcomeSummary: 'Awaiting command wheel validation.',
      objectiveBefore: snapshot.objective.label,
      objectiveAfter: null,
      commanderState: snapshot.commander.state,
      fps: snapshot.fps
    };
    run.latestThought = decision.thought;
    run.recentThoughts = [...run.recentThoughts, thoughtEntry].slice(-5);
    run.latestAction = actionEntry;
    run.latestActionStatus = actionEntry.executionStatus;
    run.pendingAction = actionEntry;
    run.status = 'acting';
    run.currentMouseMode = 'acting';
    run.stateLabel = 'Mouse chose a command';
    run.lastError = null;
    retryAfterAt = 0;
    touch();
    await Promise.all([
      appendJsonLine(run.paths.thoughts, thoughtEntry),
      appendJsonLine(run.paths.actions, actionEntry)
    ]);
    await persistLatest();
  }

  async function recordInvalidModelResponse(snapshot, error) {
    actionSequence += 1;
    const entry = {
      timestamp: isoNow(now),
      actionId: `mouse_action_${String(actionSequence).padStart(3, '0')}`,
      phase: 'outcome',
      model: run.model,
      commandId: null,
      targetId: null,
      targetPosition: null,
      targetLabel: null,
      audienceId: null,
      confidence: null,
      reason: 'The model did not return a safe structured decision.',
      validationStatus: 'invalid_model_response',
      executionStatus: 'not_executed',
      commandResponseStatus: null,
      outcomeSummary: text(error?.message, 'Mouse returned invalid structured output.'),
      objectiveBefore: snapshot.objective.label,
      objectiveAfter: snapshot.objective.label,
      commanderState: snapshot.commander.state,
      fps: snapshot.fps
    };
    run.latestAction = entry;
    run.latestActionStatus = entry.validationStatus;
    run.recentActions = [...run.recentActions, entry].slice(-5);
    run.status = 'idle';
    run.currentMouseMode = 'observing';
    run.stateLabel = 'Mouse is watching';
    addFlag('invalid_model_response');
    touch();
    await appendJsonLine(run.paths.actions, entry);
    await persistLatest();
  }

  async function recordActionOutcome(source = {}) {
    if (!run) return getStatus();
    const pending = run.pendingAction;
    if (!pending || !source.actionId || source.actionId !== pending.actionId) {
      addFlag('orphan_action_outcome');
      touch();
      await persistLatest();
      return getStatus();
    }
    const completed = {
      ...pending,
      timestamp: isoNow(now),
      phase: 'outcome',
      targetPosition: normalisePosition(source.targetPosition) ?? pending.targetPosition,
      targetLabel: text(source.targetLabel, pending.targetLabel),
      audienceId: text(source.audienceId, pending.audienceId),
      validationStatus: text(source.validationStatus, 'rejected'),
      executionStatus: text(source.executionStatus, 'not_executed'),
      commandResponseStatus: text(source.commandResponseStatus, pending.commandResponseStatus),
      outcomeSummary: text(source.outcomeSummary, 'No command outcome was reported.'),
      objectiveBefore: text(source.objectiveBefore, pending.objectiveBefore),
      objectiveAfter: text(source.objectiveAfter, pending.objectiveBefore),
      commanderState: text(source.commanderState, pending.commanderState),
      unitsResponded: boundedInteger(source.unitsResponded, 0, 99),
      targetHonoured: typeof source.targetHonoured === 'boolean' ? source.targetHonoured : null,
      shelterRating: finiteNumber(source.shelterRating),
      degradationReason: text(source.degradationReason, null),
      fps: finiteNumber(source.fps) ?? pending.fps
    };
    run.latestAction = completed;
    run.latestActionStatus = completed.executionStatus;
    run.recentActions = [...run.recentActions, completed].slice(-5);
    run.pendingAction = null;
    run.status = run.modelAvailable ? 'idle' : 'waiting';
    run.currentMouseMode = run.modelAvailable ? 'observing' : 'waiting';
    run.stateLabel = run.modelAvailable ? 'Mouse is watching' : MOUSE_WAITING_MESSAGE;
    touch();
    await appendJsonLine(run.paths.actions, completed);
    await persistLatest();
    return getStatus();
  }

  async function refreshDependencyStatus() {
    if (!run) return false;
    if (dependencyCheck) return dependencyCheck;
    const currentRunId = run.runId;
    dependencyCheck = (async () => {
      const result = await modelClient.probe({ host, timeoutMs: Math.min(timeoutMs, 2500) });
      if (!run || run.runId !== currentRunId) return false;
      const availableModels = Array.isArray(result?.availableModels) ? result.availableModels : [];
      const selectedModel = chooseMouseModel(availableModels, configuredModel);
      run.model = selectedModel;
      run.modelAvailable = Boolean(result?.ok && selectedModel);
      if (run.modelAvailable) {
        if (!['thinking', 'acting'].includes(run.status)) {
          run.status = 'idle';
          run.currentMouseMode = 'observing';
          run.stateLabel = 'Mouse is watching';
        }
        removeFlag('model_unavailable');
        run.lastError = null;
      } else {
        run.status = 'waiting';
        run.currentMouseMode = 'waiting';
        run.stateLabel = MOUSE_WAITING_MESSAGE;
        run.lastError = text(result?.reason, 'No compatible local model is available.');
        addFlag('model_unavailable');
      }
      touch();
      await persistLatest();
      return run.modelAvailable;
    })().finally(() => {
      dependencyCheck = null;
    });
    return dependencyCheck;
  }

  function getStatus() {
    return run ? structuredClone({
      runId: run.runId,
      scenarioId: run.scenarioId,
      scenarioTitle: run.scenarioTitle,
      status: run.status,
      currentMouseMode: run.currentMouseMode,
      stateLabel: run.stateLabel,
      model: run.model,
      modelEndpoint: run.modelEndpoint,
      modelAvailable: run.modelAvailable,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      latestThought: run.latestThought,
      recentThoughts: run.recentThoughts,
      latestAction: run.latestAction,
      latestActionStatus: run.latestActionStatus,
      recentActions: run.recentActions,
      pendingAction: run.pendingAction,
      latestSnapshotSummary: run.latestSnapshotSummary,
      performanceSummary: run.performanceSummary,
      flags: run.flags,
      lastError: run.lastError
    }) : {
      status: 'disabled',
      currentMouseMode: 'waiting',
      stateLabel: MOUSE_WAITING_MESSAGE,
      modelEndpoint: `${host}/api/generate`,
      modelAvailable: false,
      latestThought: null,
      latestAction: null,
      recentThoughts: [],
      recentActions: [],
      pendingAction: null,
      flags: []
    };
  }

  async function waitForIdle() {
    if (dependencyCheck) await dependencyCheck;
    if (pendingDecision) await pendingDecision;
    return getStatus();
  }

  function touch() {
    if (run) run.updatedAt = isoNow(now);
  }

  function addFlag(flag) {
    if (run && !run.flags.includes(flag)) run.flags.push(flag);
  }

  function removeFlag(flag) {
    if (run) run.flags = run.flags.filter((entry) => entry !== flag);
  }

  function applySnapshotFlags(snapshot) {
    if (snapshot.fps != null && snapshot.fps < 35) addFlag('low_fps');
    if (snapshot.issues.includes('A non-commander group is selected.')) addFlag('non_commander_selected');
  }

  async function persistLatest() {
    if (!run) return;
    await mkdir(outputRoot, { recursive: true });
    const payload = getStatus();
    await Promise.all([
      writeFile(join(outputRoot, 'latest.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8'),
      writeFile(join(outputRoot, 'latest.md'), renderMouseMarkdown(payload), 'utf8'),
      writeFile(run.paths.summary, renderMouseMarkdown(payload), 'utf8')
    ]);
  }

  return {
    beginRun,
    acceptSnapshot,
    recordActionOutcome,
    getStatus,
    waitForIdle,
    refreshDependencyStatus
  };
}

export function normaliseMouseSnapshot(source = {}) {
  const commander = source.commander && typeof source.commander === 'object' ? source.commander : {};
  const camera = source.camera && typeof source.camera === 'object' ? source.camera : {};
  const mouseFocus = source.mouseFocus && typeof source.mouseFocus === 'object' ? source.mouseFocus : {};
  const objective = source.objective && typeof source.objective === 'object' ? source.objective : {};
  const nearbyBand = source.nearbyBand && typeof source.nearbyBand === 'object' ? source.nearbyBand : {};
  return {
    contract: 'field-fronts.mouse-snapshot.v1',
    timestamp: text(source.timestamp, new Date().toISOString()),
    eventType: text(source.eventType, 'cadence'),
    scenarioId: text(source.scenarioId, 'chapter_001'),
    scenarioTitle: text(source.scenarioTitle, 'The First Night'),
    objective: {
      id: text(objective.id, null),
      label: text(objective.label, 'Find shelter'),
      progress: text(objective.progress, '0/0'),
      completed: boundedInteger(objective.completed, 0, 99),
      total: boundedInteger(objective.total, 0, 99),
      shelterNodeId: text(objective.shelterNodeId, null)
    },
    commander: {
      id: text(commander.id, null),
      name: text(commander.name, 'Tribal Leader'),
      position: normalisePosition(commander.position),
      selected: Boolean(commander.selected),
      visible: commander.visible !== false,
      state: text(commander.state, 'ready')
    },
    camera: {
      mode: text(camera.mode, 'unknown'),
      commanderCentred: Boolean(camera.commanderCentred)
    },
    mouseFocus: {
      target: text(mouseFocus.target, 'Tribal Leader'),
      position: normalisePosition(mouseFocus.position)
    },
    nearbyBand: {
      hunters: boundedInteger(nearbyBand.hunters, 0, 20),
      scouts: boundedInteger(nearbyBand.scouts, 0, 20),
      vulnerable: boundedInteger(nearbyBand.vulnerable, 0, 40),
      wounded: boundedInteger(nearbyBand.wounded, 0, 10),
      separated: boundedInteger(nearbyBand.separated, 0, 40)
    },
    nearbyShelters: Array.isArray(source.nearbyShelters)
      ? source.nearbyShelters.slice(0, 5).map((shelter) => ({
        id: text(shelter?.id, null),
        type: text(shelter?.type, 'unknown shelter'),
        distance: finiteNumber(shelter?.distance),
        rating: finiteNumber(shelter?.rating),
        objectiveState: text(shelter?.objectiveState, null),
        knowledgeState: text(shelter?.knowledgeState, null)
      }))
      : [],
    availableCommands: Array.isArray(source.availableCommands)
      ? source.availableCommands.slice(0, 10).map((command) => ({
        id: text(command?.id, null),
        label: text(command?.label, null),
        targetTypes: stringList(command?.targetTypes, 4)
      })).filter((command) => command.id)
      : [],
    targetCandidates: Array.isArray(source.targetCandidates)
      ? source.targetCandidates.slice(0, 8).map((candidate) => ({
        id: text(candidate?.id, null),
        label: text(candidate?.label, null),
        type: text(candidate?.type, null),
        shelterType: text(candidate?.shelterType, null),
        position: normalisePosition(candidate?.position),
        relativeDirection: text(candidate?.relativeDirection, null),
        distanceFromCommander: finiteNumber(candidate?.distanceFromCommander),
        shelterRating: finiteNumber(candidate?.shelterRating),
        tags: stringList(candidate?.tags, 8),
        objectiveState: text(candidate?.objectiveState, null),
        objectiveId: text(candidate?.objectiveId, null),
        objectiveLabel: text(candidate?.objectiveLabel, null),
        knowledgeState: text(candidate?.knowledgeState, null),
        knowledgeSource: text(candidate?.knowledgeSource, null),
        directVisibility: text(candidate?.directVisibility, 'not_asserted'),
        knownToCommander: candidate?.knownToCommander === true,
        reachable: candidate?.reachable !== false,
      })).filter((candidate) => candidate.id && candidate.position)
      : [],
    recentCommandOutcomes: Array.isArray(source.recentCommandOutcomes)
      ? source.recentCommandOutcomes.slice(-3).map((outcome) => ({
        commandId: text(outcome?.commandId, null),
        executionStatus: text(outcome?.executionStatus, null),
        outcomeSummary: text(outcome?.outcomeSummary, null)
      }))
      : [],
    fps: finiteNumber(source.fps),
    frameMs: finiteNumber(source.frameMs),
    issues: stringList(source.issues, 5),
    recentEvents: stringList(source.recentEvents, 4)
  };
}

export function buildMousePrompt(snapshot, recentThoughts = [], recentActions = []) {
  const safe = normaliseMouseSnapshot(snapshot);
  const shelters = safe.nearbyShelters.length
    ? safe.nearbyShelters.map((entry) => `${entry.type} (${entry.distance ?? '?'} tiles; ${entry.objectiveState ?? 'route_support'}; ${entry.knowledgeState ?? 'commander_local'})`).join(', ')
    : 'none known nearby';
  const issues = safe.issues.length ? safe.issues.join('; ') : 'none explicitly observed';
  const commands = safe.availableCommands.map((entry) => entry.id).join(', ') || 'observe';
  const targets = safe.targetCandidates.length
    ? safe.targetCandidates.map((entry) => `${entry.id}: ${entry.label} ${entry.relativeDirection ?? ''} (${entry.distanceFromCommander ?? '?'} tiles; ${entry.objectiveState ?? 'route_support'}; ${entry.knowledgeState ?? 'commander_local'})`).join('; ')
    : 'none';
  const preferredTarget = safe.targetCandidates.find((entry) => entry.type === 'shelter' && entry.objectiveState === 'active')
    ?? safe.targetCandidates.find((entry) => entry.type === 'shelter')
    ?? null;
  const example = preferredTarget
    ? JSON.stringify({
        thought: `The ${preferredTarget.label} route is marked; I will move the band beneath it.`,
        action: {
          commandId: 'seek_shelter',
          targetId: preferredTarget.id,
          targetPosition: null,
          audienceId: 'all_band',
          confidence: 0.72,
          reason: 'Known shelter is within command reach.'
        }
      })
    : '{"thought":"I will hold close and listen.","action":{"commandId":"observe","targetId":null,"targetPosition":null,"audienceId":null,"confidence":0.72,"reason":"No known shelter target is offered."}}';
  const memory = recentThoughts.slice(-3).map((entry) => `- ${text(entry?.thought ?? entry, '')}`).filter((entry) => entry !== '- ').join('\n') || '- none yet';
  const outcomes = recentActions.slice(-3).map((entry) => `- ${entry.commandId}: ${entry.executionStatus}; ${entry.outcomeSummary}`).join('\n') || '- none yet';
  return [
    'You are Mouse, a small embodied local-model playtester inside the game.',
    'You are trying to survive Chapter 1 using only the commander command wheel.',
    'You only know this compact commander-local snapshot and the listed legal actions and targets.',
    'Return ONLY valid JSON. Never use markdown or explanatory text outside JSON.',
    'Use one listed commandId exactly and, unless observing, one listed targetId exactly.',
    'Set targetPosition to null. The game resolves offered target IDs; invented coordinates are rejected.',
    'Prefer the active objective shelter when it is listed; otherwise use a route-support shelter to approach it.',
    'Shelter targets are commander-known command options, not guaranteed direct sight. Do not claim to see or spot a shelter unless its directVisibility is visible.',
    'Do not invent state, use unseen targets, command individual survivors, write code, or bypass the command wheel.',
    'Name only what is supplied below: commander, band roles, objective, command, and listed natural shelter labels.',
    'There is no camp, campsite, building, road, settlement, or permanent structure in this opening region. Never mention one.',
    'If you mention direction, copy the target relativeDirection exactly; never translate it to left, right, front, behind, or peripheral.',
    'Copy a known shelter label exactly; do not rename light tree cover as canopy or any stronger shelter.',
    'Keep thought to 1-2 short first-person sentences under 60 words and reason to one short sentence.',
    '',
    'Required JSON shape for this snapshot:',
    example,
    '',
    `scenario: ${safe.scenarioTitle} (${safe.scenarioId})`,
    `objective: ${safe.objective.label} [${safe.objective.progress}]`,
    `commander: ${safe.commander.name}, ${safe.commander.visible ? 'visible' : 'not visible'}, ${safe.commander.state}`,
    `camera: ${safe.camera.mode}, ${safe.camera.commanderCentred ? 'centred' : 'not centred'}`,
    `nearby_band: ${safe.nearbyBand.hunters} hunters, ${safe.nearbyBand.scouts} scouts, ${safe.nearbyBand.vulnerable} vulnerable, ${safe.nearbyBand.wounded} wounded, ${safe.nearbyBand.separated} separated`,
    `shelter_known: ${shelters}`,
    safe.fps == null ? 'performance: not sampled yet' : `performance: FPS ${safe.fps}, frame ${safe.frameMs ?? 'unknown'}ms`,
    `issues: ${issues}`,
    `availableCommands: ${commands}`,
    `targetCandidates: ${targets}`,
    'recent outcomes:',
    outcomes,
    'recent Mouse thoughts:',
    memory
  ].join('\n');
}

export function parseMouseDecisionResponse(value) {
  const raw = String(value ?? '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const firstBrace = fenced.indexOf('{');
  const lastBrace = fenced.lastIndexOf('}');
  const candidate = firstBrace >= 0 && lastBrace > firstBrace ? fenced.slice(firstBrace, lastBrace + 1) : fenced;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`invalid_model_response: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.action || typeof parsed.action !== 'object') {
    throw new Error('invalid_model_response: missing action object.');
  }
  const thought = trimThought(parsed.thought);
  const commandId = text(parsed.action.commandId, null);
  if (!thought || !commandId) {
    throw new Error('invalid_model_response: thought and commandId are required.');
  }
  if (FIRST_NIGHT_UNSEEN_CIVILISATION_TERMS.test(thought)) {
    throw new Error('invalid_model_response: thought invented civilised or settled scenery.');
  }
  return {
    thought,
    action: {
      commandId,
      targetId: text(parsed.action.targetId, null),
      targetPosition: normalisePosition(parsed.action.targetPosition),
      audienceId: text(parsed.action.audienceId, commandId === 'observe' ? null : 'all_band'),
      confidence: clampConfidence(parsed.action.confidence),
      reason: trimReason(parsed.action.reason)
    }
  };
}

export function validateMouseDecisionGrounding(decision, snapshot) {
  const safe = normaliseMouseSnapshot(snapshot);
  const target = safe.targetCandidates.find((candidate) => candidate.id === decision?.action?.targetId) ?? null;
  const thought = String(decision?.thought ?? '');
  const groundedLanguage = `${thought} ${String(decision?.action?.reason ?? '')}`;
  if (decision?.action?.commandId !== 'observe' && !target) {
    throw new Error('invalid_model_response: selected target is not offered in this snapshot.');
  }
  if (/\b(left|right|front|behind|peripheral)\b/i.test(groundedLanguage)) {
    throw new Error('invalid_model_response: thought used an unsupported relative direction.');
  }
  const namedDirection = groundedLanguage.toLowerCase().match(/\b(north-east|north-west|south-east|south-west|north|south|east|west)\b/)?.[1] ?? null;
  if (namedDirection && (!target || namedDirection !== target.relativeDirection)) {
    throw new Error('invalid_model_response: thought direction does not match the selected target.');
  }
  if (target?.directVisibility !== 'visible' && /\b(see|sees|saw|spot|spotted|visible|in sight)\b/i.test(groundedLanguage)) {
    throw new Error('invalid_model_response: thought claimed unverified direct visibility.');
  }
  const visibleLabels = safe.targetCandidates.map((candidate) => String(candidate.label ?? '').toLowerCase()).join(' ');
  const shelterTokens = ['canopy', 'boulder', 'reed', 'root hollow', 'thorn', 'riverbank', 'overhang', 'cave', 'mist'];
  for (const token of shelterTokens) {
    if (groundedLanguage.toLowerCase().includes(token) && !visibleLabels.includes(token)) {
      throw new Error('invalid_model_response: thought named unseen shelter terrain.');
    }
  }
  return true;
}

export function chooseMouseModel(availableModels = [], configuredModel = null) {
  const models = availableModels.map((entry) => String(entry).trim()).filter(Boolean);
  if (configuredModel && models.includes(configuredModel)) return configuredModel;
  return PREFERRED_MOUSE_MODELS.find((model) => models.includes(model)) ?? models[0] ?? null;
}

function renderMouseMarkdown(status) {
  const recentThoughts = status.recentThoughts?.length
    ? status.recentThoughts.slice().reverse().map((entry) => `- ${entry.timestamp}: ${entry.thought}`).join('\n')
    : '- No generated thoughts yet.';
  const recentActions = status.recentActions?.length
    ? status.recentActions.slice().reverse().map((entry) => `- ${entry.timestamp}: ${entry.commandId} -> ${entry.targetLabel ?? 'none'} [${entry.validationStatus}/${entry.executionStatus}${entry.commandResponseStatus ? `/${entry.commandResponseStatus}` : ''}] ${entry.outcomeSummary}${entry.targetHonoured === true ? ' (target honoured)' : entry.targetHonoured === false ? ` (target not honoured${entry.degradationReason ? `: ${entry.degradationReason}` : ''})` : ''}`).join('\n')
    : '- No resolved actions yet.';
  const flags = status.flags?.length ? status.flags.map((flag) => `- ${flag}`).join('\n') : '- none';
  const action = status.latestAction;
  return [
    '# Mouse Playtester',
    '',
    `- Status: ${status.stateLabel}`,
    `- Mode: ${status.currentMouseMode ?? 'waiting'}`,
    `- Scenario: ${status.scenarioTitle ?? 'Not started'} (${status.scenarioId ?? 'n/a'})`,
    `- Model: ${status.model ?? 'not selected'}`,
    `- Endpoint: ${status.modelEndpoint ?? 'n/a'}`,
    `- Local model available: ${status.modelAvailable ? 'yes' : 'no'}`,
    `- Updated: ${status.updatedAt ?? 'n/a'}`,
    '',
    '## Latest Thought',
    '',
    status.latestThought ?? MOUSE_WAITING_MESSAGE,
    '',
    '## Latest Action',
    '',
    action
      ? `${action.commandId} -> ${action.targetLabel ?? 'none'} [${action.validationStatus}/${action.executionStatus}${action.commandResponseStatus ? `/${action.commandResponseStatus}` : ''}]\n\n${action.outcomeSummary}`
      : 'No command chosen yet.',
    '',
    '## Recent Observations',
    '',
    recentThoughts,
    '',
    '## Recent Actions',
    '',
    recentActions,
    '',
    '## Flags',
    '',
    flags,
    status.lastError ? `\n## Dependency Detail\n\n${status.lastError}\n` : ''
  ].join('\n');
}

function summarizePromptInput(snapshot) {
  return `${snapshot.scenarioTitle}: ${snapshot.objective.label}; commander ${snapshot.commander.state}; commands ${snapshot.availableCommands.map((command) => command.id).join(', ')}; issues ${snapshot.issues.join(', ') || 'none'}`;
}

function trimThought(value) {
  return trimWords(value, 80);
}

function trimReason(value) {
  return trimWords(value, 32) || 'Mouse gave no reason.';
}

function trimWords(value, limit) {
  const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.slice(0, limit).join(' ');
}

async function appendJsonLine(filePath, value) {
  await appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

function createRunId(iso) {
  return `mouse-${iso.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}`;
}

function isoNow(now) {
  const value = now();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dateValue(now) {
  return new Date(isoNow(now)).getTime();
}

function text(value, fallback = '') {
  const next = typeof value === 'string' ? value.trim() : '';
  return next || fallback;
}

function stringList(value, limit) {
  return Array.isArray(value)
    ? value.map((entry) => text(entry, null)).filter(Boolean).slice(0, limit)
    : [];
}

function normalisePosition(value) {
  return value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y))
    ? { x: Math.round(Number(value.x) * 10) / 10, y: Math.round(Number(value.y) * 10) / 10 }
    : null;
}

function finiteNumber(value) {
  return value != null && value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : null;
}

function boundedInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function clampConfidence(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, Math.round(numeric * 100) / 100)) : null;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
