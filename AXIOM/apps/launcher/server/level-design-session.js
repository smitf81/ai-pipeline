import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MAP_FORGE_SPATIAL_SCORECARD_CONTRACT, normalizeMapForgeSpatialScorecard } from '../public/level-design-spatial-critic.js';

export { MAP_FORGE_SPATIAL_SCORECARD_CONTRACT };

export const LEVEL_DESIGN_SESSION_CONTRACT = 'axiom.level-design-session.v1';
export const LEVEL_DESIGN_SESSION_STORE_CONTRACT = 'axiom.level-design-session-store.v1';
export const MAP_INTENT_PREFLIGHT_CONTRACT = 'axiom.map-intent-preflight.v1';
export const PLAYABLE_SPACE_PREPARATION_RECEIPT_CONTRACT = 'axiom.map-forge-playable-space-preparation.v1';

const ACTIVE_PHASES = new Set(['planning', 'previewing', 'applying', 'evaluating', 'recovering']);
const TERMINAL_STATES = new Set(['completed', 'stopped', 'blocked']);
const SESSION_STATES = new Set([
  ...ACTIVE_PHASES,
  'paused',
  'awaiting_user',
  ...TERMINAL_STATES
]);
const RECORD_TYPES = new Set(['preflight', 'phase', 'model_invocation', 'projection', 'batch', 'evaluation', 'failure', 'undo']);
const CONTROL_ACTIONS = new Set(['approve', 'pause', 'resume', 'stop', 'intervene', 'heartbeat', 'disconnect', 'block']);
const RECEIPT_CONTRACTS = new Set(['axiom.scene-brush-receipt.v1', 'axiom.undergrowth-brush-receipt.v1', 'axiom.playable-boundary-receipt.v1']);
const MAX_EVENTS = 240;
const MAX_INTERVENTIONS = 40;
const MAX_MODEL_INVOCATIONS = 80;
const MAX_BATCHES = 80;

export function createLevelDesignSessionService(options = {}) {
  const dataRoot = path.resolve(options.dataRoot || path.join(process.cwd(), 'data', 'level-design-sessions'));
  const clock = typeof options.now === 'function' ? options.now : () => new Date();
  const staleAfterMs = boundedInteger(options.staleAfterMs, 8000, 2000, 60000);

  function now() {
    return clock().toISOString();
  }

  function filePath(sessionId) {
    return path.join(dataRoot, `${safeIdentifier(sessionId, 'session_id')}.json`);
  }

  function create(input = {}) {
    const prompt = boundedText(input.prompt, 4000).trim();
    if (!prompt) throw new Error('level_design_session_prompt_required');
    const map = normalizeMap(input.map);
    const project = normalizeProject(input.project);
    const preflight = normalizePreflight(input.preflight, map);
    const createdAt = now();
    const id = safeIdentifier(input.id || `level_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, 'session_id');
    const session = {
      contract: LEVEL_DESIGN_SESSION_CONTRACT,
      id,
      source: {
        prompt,
        surface: input.source?.surface === 'journal' ? 'journal' : 'chat',
        activityAttemptId: boundedText(input.source?.activityAttemptId, 160) || null
      },
      project,
      preflight,
      map: {
        ...map,
        startingRevision: map.revision,
        currentRevision: map.revision
      },
      authority: {
        approved: false,
        approvedAt: null,
        scope: 'resolved_map_playable_space_and_path_corridor',
        region: 'preflight_route_and_derived_dirt_path_corridor',
        operationFamilies: ['map_select', 'map_create_draft', 'map_resize', 'terrain_route', 'spawn_escape_markers', 'tree_scene_brush', 'undergrowth_brush', 'geology_brush', 'natural_ridge_boundary', 'runtime_traversal_audit'],
        atomicBatches: true,
        automaticSave: false,
        automaticBake: false,
        automaticPublish: false
      },
      successCriteria: normalizeSuccessCriteria(input.successCriteria),
      state: 'awaiting_user',
      phase: 'goal_review',
      iteration: 0,
      currentAction: 'Review the resolved map target and playable-space preparation before approving.',
      latestEvaluation: null,
      noProgress: { consecutive: 0, repeatedSignature: null, repeatedCount: 0 },
      controls: {
        clientId: null,
        lastHeartbeatAt: null,
        pausedReason: 'awaiting_goal_approval',
        stopReason: null
      },
      interventions: [],
      modelInvocations: [normalizeModelInvocation(preflight.modelInvocation, createdAt)],
      projections: [],
      batches: [],
      checkpoints: [{ revision: map.revision, reason: 'session_created', at: createdAt }],
      undo: null,
      events: [],
      provenance: {
        owner: 'LevelDesignSessionService',
        mapMutationOwner: 'BsbV2MapAuthoring',
        modelPlanner: 'AXIOM ModelBus',
        createdAt
      },
      createdAt,
      updatedAt: createdAt,
      completedAt: null
    };
    appendEvent(session, 'session_created', 'Goal captured; target map resolved and canonical map content remains unchanged.', {
      revision: map.revision,
      action: preflight.action,
      previousCatalogueMapId: preflight.previousMap.catalogueMapId,
      targetCatalogueMapId: preflight.target.catalogueMapId,
      targetMapId: preflight.target.mapId
    }, createdAt);
    write(session);
    return clone(session);
  }

  function get(sessionId, options = {}) {
    const session = read(sessionId);
    const reconciled = reconcileStaleClient(session);
    if (reconciled.changed && options.persist !== false) write(reconciled.session);
    return clone(reconciled.session);
  }

  function latest(filter = {}) {
    if (!fs.existsSync(dataRoot)) return { ok: true, contract: LEVEL_DESIGN_SESSION_STORE_CONTRACT, session: null };
    const projectId = boundedText(filter.projectId, 240).trim();
    const files = fs.readdirSync(dataRoot, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => path.join(dataRoot, entry.name));
    let chosen = null;
    for (const file of files) {
      try {
        const session = readFile(file);
        if (projectId && session.project.id !== projectId) continue;
        if (!chosen || Date.parse(session.updatedAt) > Date.parse(chosen.updatedAt)) chosen = session;
      } catch {
        // A corrupt unrelated session cannot become the latest valid session.
      }
    }
    if (!chosen) return { ok: true, contract: LEVEL_DESIGN_SESSION_STORE_CONTRACT, session: null };
    const reconciled = reconcileStaleClient(chosen);
    if (reconciled.changed) write(reconciled.session);
    return { ok: true, contract: LEVEL_DESIGN_SESSION_STORE_CONTRACT, session: clone(reconciled.session) };
  }

  function control(sessionId, input = {}) {
    const action = boundedText(input.action, 80).trim();
    if (!CONTROL_ACTIONS.has(action)) throw new Error(`level_design_session_control_invalid:${action || 'missing'}`);
    const session = read(sessionId);
    if (TERMINAL_STATES.has(session.state) && !['heartbeat'].includes(action)) {
      throw new Error(`level_design_session_terminal:${session.state}`);
    }
    const at = now();
    const clientId = boundedText(input.clientId, 180).trim() || session.controls.clientId;

    if (action === 'approve') {
      if (session.authority.approved) throw new Error('level_design_session_authority_already_approved');
      session.authority.approved = true;
      session.authority.approvedAt = at;
      session.state = 'planning';
      session.phase = 'planning';
      session.currentAction = session.preflight.playableSpace.requiresPreparation
        ? 'Prepare the approved playable-space draft through Map Forge, then verify target binding.'
        : 'Verify the resolved target map, then observe its canonical authoring revision.';
      session.controls.clientId = clientId;
      session.controls.lastHeartbeatAt = at;
      session.controls.pausedReason = null;
      appendEvent(session, 'authority_approved', 'Continuing authority approved once for the bounded path corridor.', { clientId }, at);
    } else if (action === 'pause') {
      session.state = 'paused';
      session.phase = 'paused';
      session.currentAction = 'Paused at a safe batch boundary.';
      session.controls.pausedReason = boundedText(input.reason, 300) || 'user_requested';
      appendEvent(session, 'session_paused', 'No new Map Forge batch will start until Resume.', { reason: session.controls.pausedReason }, at);
    } else if (action === 'resume') {
      if (!session.authority.approved) throw new Error('level_design_session_authority_not_approved');
      const observedRevision = integer(input.observedRevision, 'observed_revision', 0, Number.MAX_SAFE_INTEGER);
      session.map.currentRevision = observedRevision;
      session.state = 'planning';
      session.phase = 'planning';
      session.currentAction = 'Re-observe the current revision before planning.';
      session.controls.clientId = clientId;
      session.controls.lastHeartbeatAt = at;
      session.controls.pausedReason = null;
      session.checkpoints.push({ revision: observedRevision, reason: 'session_resumed', at });
      appendEvent(session, 'session_resumed', `Resumed from canonical revision ${observedRevision}.`, { observedRevision }, at);
    } else if (action === 'stop') {
      session.state = 'stopped';
      session.phase = 'stopped';
      session.currentAction = 'Stopped. Applied work is retained and remains undoable.';
      session.controls.stopReason = boundedText(input.reason, 300) || 'user_requested';
      session.completedAt = at;
      appendEvent(session, 'session_stopped', 'Session stopped; no partial rollback was attempted.', { reason: session.controls.stopReason }, at);
    } else if (action === 'intervene') {
      const direction = boundedText(input.direction, 2000).trim();
      if (!direction) throw new Error('level_design_session_intervention_required');
      const intervention = {
        id: `direction_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
        text: direction,
        source: input.source === 'journal' ? 'journal' : 'chat',
        status: 'queued',
        at
      };
      session.interventions.push(intervention);
      session.interventions = session.interventions.slice(-MAX_INTERVENTIONS);
      appendEvent(session, 'intervention_queued', 'New human direction queued for the next safe planning boundary.', { interventionId: intervention.id, source: intervention.source }, at);
    } else if (action === 'heartbeat') {
      if (clientId && session.controls.clientId && clientId !== session.controls.clientId && ACTIVE_PHASES.has(session.state)) {
        throw new Error('level_design_session_client_ownership_mismatch');
      }
      session.controls.clientId = clientId;
      session.controls.lastHeartbeatAt = at;
    } else if (action === 'disconnect') {
      if (!TERMINAL_STATES.has(session.state)) {
        session.state = 'paused';
        session.phase = 'paused';
        session.currentAction = 'Witnessing client disconnected; Resume after reconnect.';
        session.controls.pausedReason = boundedText(input.reason, 300) || 'witness_client_disconnected';
        appendEvent(session, 'client_disconnected', 'Session safe-paused because the witnessing client disconnected.', { clientId }, at);
      }
    } else if (action === 'block') {
      session.state = 'blocked';
      session.phase = 'blocked';
      session.currentAction = boundedText(input.reason, 600) || 'Session blocked.';
      session.completedAt = at;
      appendEvent(session, 'session_blocked', session.currentAction, null, at);
    }

    session.updatedAt = at;
    write(session);
    return clone(session);
  }

  function record(sessionId, input = {}) {
    const type = boundedText(input.type, 80).trim();
    if (!RECORD_TYPES.has(type)) throw new Error(`level_design_session_record_invalid:${type || 'missing'}`);
    const session = read(sessionId);
    if (!session.authority.approved) throw new Error('level_design_session_authority_not_approved');
    if (TERMINAL_STATES.has(session.state) && type !== 'undo') throw new Error(`level_design_session_terminal:${session.state}`);
    if (['paused', 'awaiting_user'].includes(session.state) && type !== 'undo') {
      throw new Error(`level_design_session_inactive_record:${session.state}:${type}`);
    }
    const at = now();

    if (type === 'preflight') {
      const receipt = normalizePreflightReceipt(input.receipt, session);
      session.preflight.receipt = receipt;
      session.map.currentRevision = receipt.afterRevision;
      session.checkpoints.push({ revision: receipt.afterRevision, reason: `preflight:${session.preflight.id}`, at });
      appendEvent(session, 'preflight_prepared', receipt.applied
        ? `Map Forge prepared ${receipt.mapId} at revision ${receipt.afterRevision}.`
        : `Resolved target ${receipt.mapId} verified at revision ${receipt.afterRevision}; no map preparation was requested.`, {
        preflightId: session.preflight.id,
        action: session.preflight.action,
        mapId: receipt.mapId,
        catalogueMapId: receipt.catalogueMapId,
        authoringPath: receipt.authoringPath,
        beforeRevision: receipt.beforeRevision,
        afterRevision: receipt.afterRevision,
        applied: receipt.applied
      }, at);
    } else if (type === 'phase') {
      const phase = boundedText(input.phase, 80).trim();
      if (!ACTIVE_PHASES.has(phase)) throw new Error(`level_design_session_phase_invalid:${phase || 'missing'}`);
      session.state = phase;
      session.phase = phase;
      session.currentAction = boundedText(input.summary, 600) || phase;
      if (phase === 'planning') session.iteration += 1;
      consumeInterventions(session, at);
      appendEvent(session, `phase_${phase}`, session.currentAction, { iteration: session.iteration }, at);
    } else if (type === 'model_invocation') {
      const invocation = normalizeModelInvocation(input.invocation, at);
      session.modelInvocations.push(invocation);
      session.modelInvocations = session.modelInvocations.slice(-MAX_MODEL_INVOCATIONS);
      appendEvent(session, 'model_invocation_recorded', invocation.ok ? 'Fresh local-model plan recorded.' : 'Local-model plan failed validation.', {
        invocationId: invocation.id,
        model: invocation.model,
        ok: invocation.ok,
        repair: invocation.repair
      }, at);
    } else if (type === 'projection') {
      const projection = normalizeProjection(input.projection, session.map.currentRevision, at);
      session.projections.push(projection);
      session.projections = session.projections.slice(-MAX_BATCHES * 2);
      appendEvent(session, 'projection_recorded', `Preview ${projection.id} exposed ${projection.candidateCount} candidate objects.`, {
        projectionId: projection.id,
        family: projection.family,
        sourceRevision: projection.sourceRevision,
        candidateCount: projection.candidateCount
      }, at);
    } else if (type === 'batch') {
      const batch = normalizeBatch(input.batch, session, at);
      session.batches.push(batch);
      session.batches = session.batches.slice(-MAX_BATCHES);
      session.map.currentRevision = batch.receipt.afterRevision;
      session.checkpoints.push({ revision: batch.receipt.afterRevision, reason: `batch:${batch.id}`, at });
      appendEvent(session, 'batch_applied', batch.family === 'boundary'
        ? `${batch.receipt.changedTileCount} verified boundary tiles committed at revision ${batch.receipt.afterRevision}.`
        : `${batch.receipt.createdCount} ${batch.family} objects committed at revision ${batch.receipt.afterRevision}.`, {
        batchId: batch.id,
        receiptId: batch.receipt.receiptId,
        beforeRevision: batch.receipt.beforeRevision,
        afterRevision: batch.receipt.afterRevision,
        createdCount: batch.receipt.createdCount
      }, at);
    } else if (type === 'evaluation') {
      const evaluation = normalizeEvaluation(input.evaluation, session.map.currentRevision, at);
      session.latestEvaluation = evaluation;
      updateNoProgress(session, evaluation);
      appendEvent(session, 'evaluation_recorded', evaluation.summary, {
        criteriaMet: evaluation.criteriaMet,
        integrityPass: evaluation.integrityGate.pass,
        designPass: evaluation.designGate.pass,
        designScore: evaluation.designGate.score,
        nextAction: evaluation.nextAction.kind,
        improvement: evaluation.improvement,
        noProgress: session.noProgress.consecutive
      }, at);
      if (evaluation.criteriaMet) {
        session.state = 'completed';
        session.phase = 'completed';
        session.currentAction = 'Integrity and design-quality gates passed against canonical Map Forge readback.';
        session.completedAt = at;
        appendEvent(session, 'session_completed', session.currentAction, { revision: session.map.currentRevision }, at);
      } else if (evaluation.nextAction.kind === 'route_revision_required') {
        session.state = 'awaiting_user';
        session.phase = 'goal_review';
        session.currentAction = `Route revision required: ${evaluation.nextAction.summary}`;
        session.controls.pausedReason = 'route_revision_required';
        appendEvent(session, 'route_revision_required', session.currentAction, {
          revision: session.map.currentRevision,
          routeQuality: evaluation.designGate.routeQuality
        }, at);
      } else if (evaluation.nextAction.kind === 'boundary_enforcement_required') {
        session.state = 'awaiting_user';
        session.phase = 'goal_review';
        session.currentAction = evaluation.nextAction.summary;
        session.controls.pausedReason = 'boundary_enforcement_required';
        appendEvent(session, 'boundary_enforcement_required', session.currentAction, {
          revision: session.map.currentRevision,
          boundaryQuality: evaluation.designGate.boundaryQuality
        }, at);
      } else if (evaluation.nextAction.kind === 'repair_integrity') {
        session.state = 'awaiting_user';
        session.phase = 'awaiting_user';
        session.currentAction = evaluation.nextAction.summary;
        session.controls.pausedReason = 'integrity_repair_required';
        appendEvent(session, 'integrity_repair_required', session.currentAction, { revision: session.map.currentRevision }, at);
      } else if (session.noProgress.consecutive >= 3 || session.noProgress.repeatedCount >= 3) {
        session.state = 'awaiting_user';
        session.phase = 'awaiting_user';
        session.currentAction = 'Repeated no-progress detected; add direction or Resume to replan.';
        session.controls.pausedReason = 'no_progress_watchdog';
        appendEvent(session, 'no_progress_watchdog', session.currentAction, clone(session.noProgress), at);
      }
    } else if (type === 'failure') {
      const signature = boundedText(input.signature, 300).trim() || 'unknown_failure';
      session.state = input.awaitingUser === true ? 'awaiting_user' : 'recovering';
      session.phase = session.state;
      session.currentAction = boundedText(input.summary, 600) || `Recovering from ${signature}.`;
      session.noProgress.repeatedCount = session.noProgress.repeatedSignature === signature
        ? session.noProgress.repeatedCount + 1
        : 1;
      session.noProgress.repeatedSignature = signature;
      appendEvent(session, 'failure_recorded', session.currentAction, { signature, awaitingUser: input.awaitingUser === true }, at);
    } else if (type === 'undo') {
      const undo = normalizeUndo(input.undo, session, at);
      session.undo = undo;
      if (undo.restoredMap) {
        session.map.mapId = undo.restoredMap.mapId;
        session.map.catalogueMapId = undo.restoredMap.catalogueMapId;
        session.map.authoringPath = undo.restoredMap.authoringPath;
      }
      session.map.currentRevision = undo.afterRevision;
      session.batches = session.batches.map(batch => ({ ...batch, undoneAt: batch.undoneAt || at }));
      session.checkpoints.push({ revision: undo.afterRevision, reason: 'session_undo', at });
      appendEvent(session, 'session_undone', `${undo.removedCount} session-authored objects removed in revision ${undo.afterRevision}.`, clone(undo), at);
    }

    session.updatedAt = at;
    write(session);
    return clone(session);
  }

  function read(sessionId) {
    return readFile(filePath(sessionId));
  }

  function readFile(file) {
    if (!fs.existsSync(file)) throw new Error('level_design_session_not_found');
    const session = JSON.parse(fs.readFileSync(file, 'utf8'));
    validateStoredSession(session);
    return session;
  }

  function write(session) {
    validateStoredSession(session);
    fs.mkdirSync(dataRoot, { recursive: true });
    const target = filePath(session.id);
    const temporary = `${target}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    try {
      replaceFileWithBoundedRetry(temporary, target);
    } finally {
      try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch { /* cleanup must not hide the write result */ }
    }
  }

  function reconcileStaleClient(session) {
    if (!ACTIVE_PHASES.has(session.state)) return { changed: false, session };
    const heartbeat = Date.parse(session.controls.lastHeartbeatAt || '');
    const current = clock().getTime();
    if (Number.isFinite(heartbeat) && current - heartbeat <= staleAfterMs) return { changed: false, session };
    const at = now();
    session.state = 'paused';
    session.phase = 'paused';
    session.currentAction = 'Witnessing client heartbeat expired; Resume after reconnect.';
    session.controls.pausedReason = 'witness_client_heartbeat_expired';
    session.updatedAt = at;
    appendEvent(session, 'client_heartbeat_expired', 'Session safe-paused; no headless Map Forge mutation can continue.', null, at);
    return { changed: true, session };
  }

  return { create, get, latest, control, record, dataRoot, staleAfterMs };
}

function normalizeProject(input = {}) {
  const id = boundedText(input?.id, 240).trim();
  const root = boundedText(input?.root, 2000).trim();
  if (!id || !root) throw new Error('level_design_session_project_identity_required');
  return { id, name: boundedText(input.name, 400).trim() || id, root };
}

function normalizeMap(input = {}) {
  const mapId = boundedText(input?.mapId, 240).trim();
  const catalogueMapId = boundedText(input?.catalogueMapId, 240).trim() || mapId;
  const authoringPath = boundedText(input?.authoringPath, 1000).trim();
  const revision = integer(input?.revision, 'map_revision', 0, Number.MAX_SAFE_INTEGER);
  if (!mapId || !authoringPath) throw new Error('level_design_session_map_identity_required');
  return { mapId, catalogueMapId, authoringPath, revision };
}

function normalizePreflight(input = {}, map) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('level_design_preflight_missing');
  if (input.contract !== MAP_INTENT_PREFLIGHT_CONTRACT) {
    throw new Error(`level_design_preflight_contract_invalid:${input.contract || 'missing'}`);
  }
  const id = safeIdentifier(input.id, 'preflight_id');
  const action = boundedText(input.action, 80).trim();
  if (!['use_existing', 'edit_current', 'create_new'].includes(action)) throw new Error(`level_design_preflight_action_invalid:${action || 'missing'}`);
  const target = {
    status: boundedText(input.target?.status, 80).trim(),
    exists: input.target?.exists === true,
    catalogueMapId: safeIdentifier(input.target?.catalogueMapId, 'preflight_target_catalogue_map_id'),
    title: boundedText(input.target?.title, 300).trim(),
    mapId: safeIdentifier(input.target?.mapId, 'preflight_target_map_id'),
    scenarioId: safeIdentifier(input.target?.scenarioId, 'preflight_target_scenario_id'),
    authoringPath: boundedText(input.target?.authoringPath, 1000).trim(),
    runtimePath: boundedText(input.target?.runtimePath, 1000).trim(),
    changedFromActive: input.target?.changedFromActive === true
  };
  if (target.mapId !== map.mapId || target.catalogueMapId !== map.catalogueMapId || target.authoringPath !== map.authoringPath) {
    throw new Error(`level_design_preflight_map_binding_mismatch:${target.mapId}:${map.mapId}`);
  }
  const previousMap = {
    catalogueMapId: safeIdentifier(input.previousMap?.catalogueMapId, 'preflight_previous_catalogue_map_id'),
    mapId: safeIdentifier(input.previousMap?.mapId, 'preflight_previous_map_id'),
    title: boundedText(input.previousMap?.title, 300).trim(),
    authoringPath: boundedText(input.previousMap?.authoringPath, 1000).trim(),
    revision: integer(input.previousMap?.revision, 'preflight_previous_revision', 0, Number.MAX_SAFE_INTEGER)
  };
  const playableSpace = input.playableSpace && typeof input.playableSpace === 'object' && !Array.isArray(input.playableSpace)
    ? clone(input.playableSpace) : null;
  if (!playableSpace || playableSpace.contract !== 'axiom.playable-space-brief.v1') {
    throw new Error(`level_design_playable_space_contract_invalid:${playableSpace?.contract || 'missing'}`);
  }
  return {
    contract: MAP_INTENT_PREFLIGHT_CONTRACT,
    id,
    status: 'ready',
    prompt: boundedText(input.prompt, 4000).trim(),
    action,
    summary: boundedText(input.summary, 600).trim(),
    rationale: boundedText(input.rationale, 1000).trim(),
    previousMap,
    target,
    playableSpace,
    modelInvocation: clone(input.modelInvocation),
    binding: clone(input.binding || {}),
    receipt: null,
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function normalizePreflightReceipt(input = {}, session) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('level_design_preflight_receipt_missing');
  if (input.contract !== PLAYABLE_SPACE_PREPARATION_RECEIPT_CONTRACT) {
    throw new Error(`level_design_preflight_receipt_contract_invalid:${input.contract || 'missing'}`);
  }
  if (input.preflightId !== session.preflight.id) throw new Error('level_design_preflight_receipt_id_mismatch');
  const sessionId = safeIdentifier(input.sessionId, 'preflight_receipt_session_id');
  if (sessionId !== session.id) throw new Error('level_design_preflight_receipt_session_mismatch');
  const mapId = safeIdentifier(input.mapId, 'preflight_receipt_map_id');
  const catalogueMapId = safeIdentifier(input.catalogueMapId, 'preflight_receipt_catalogue_map_id');
  const authoringPath = boundedText(input.authoringPath, 1000).trim();
  if (mapId !== session.map.mapId || catalogueMapId !== session.map.catalogueMapId || authoringPath !== session.map.authoringPath) {
    throw new Error(`level_design_preflight_receipt_target_mismatch:${mapId}:${session.map.mapId}`);
  }
  const beforeRevision = integer(input.beforeRevision, 'preflight_before_revision', 0, Number.MAX_SAFE_INTEGER);
  const afterRevision = integer(input.afterRevision, 'preflight_after_revision', 0, Number.MAX_SAFE_INTEGER);
  if (beforeRevision !== session.map.currentRevision) throw new Error(`level_design_preflight_revision_stale:${beforeRevision}:${session.map.currentRevision}`);
  const applied = input.applied === true;
  if ((applied && afterRevision !== beforeRevision + 1) || (!applied && afterRevision !== beforeRevision)) {
    throw new Error(`level_design_preflight_revision_increment_invalid:${beforeRevision}:${afterRevision}:${applied}`);
  }
  const preparedDocument = input.preparedDocument && typeof input.preparedDocument === 'object' ? clone(input.preparedDocument) : null;
  if (!preparedDocument || preparedDocument.mapId !== mapId || Number(preparedDocument.revision) !== afterRevision) {
    throw new Error('level_design_preflight_prepared_document_invalid');
  }
  return {
    ...clone(input),
    contract: PLAYABLE_SPACE_PREPARATION_RECEIPT_CONTRACT,
    sessionId,
    preflightId: session.preflight.id,
    action: session.preflight.action,
    applied,
    mapId,
    catalogueMapId,
    authoringPath,
    beforeRevision,
    afterRevision,
    preparedDocument
  };
}

function normalizeSuccessCriteria(input = {}) {
  return {
    requiredFamilies: ['tree', 'undergrowth', 'geology'],
    minimumCreated: boundedInteger(input.minimumCreated, 12, 3, 200),
    minimumPathClearanceTiles: boundedNumber(input.minimumPathClearanceTiles, 1.5, 1, 6),
    requireCanonicalReadback: true,
    requireNoPathClearanceViolations: true
  };
}

function normalizeModelInvocation(input = {}, at) {
  const id = safeIdentifier(input.id || `model_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, 'model_invocation_id');
  const model = boundedText(input.model, 300).trim();
  if (!model) throw new Error('level_design_session_model_identity_required');
  return {
    id,
    model,
    requestedFamily: boundedText(input.requestedFamily, 80) || null,
    ok: input.ok === true,
    repair: input.repair === true,
    responseSummary: boundedText(input.responseSummary, 1000) || null,
    error: boundedText(input.error, 600) || null,
    plan: input.plan && typeof input.plan === 'object' ? clone(input.plan) : null,
    invokedAt: input.invokedAt || at,
    recordedAt: at
  };
}

function normalizeProjection(input = {}, currentRevision, at) {
  const id = safeIdentifier(input.id || input.previewId, 'projection_id');
  const sourceRevision = integer(input.sourceRevision, 'projection_source_revision', 0, Number.MAX_SAFE_INTEGER);
  if (sourceRevision !== currentRevision) throw new Error(`level_design_session_projection_stale:${sourceRevision}:${currentRevision}`);
  return {
    id,
    classification: 'projection',
    family: boundedText(input.family, 80).trim(),
    sourceRevision,
    candidateCount: integer(input.candidateCount, 'projection_candidate_count', 0, 5000),
    blockedCount: boundedInteger(input.blockedCount, 0, 0, 100000),
    strokeCenters: Array.isArray(input.strokeCenters) ? clone(input.strokeCenters).slice(0, 48) : [],
    at
  };
}

function normalizeBatch(input = {}, session, at) {
  const receipt = input.receipt && typeof input.receipt === 'object' ? clone(input.receipt) : null;
  const boundaryReceipt = receipt?.contract === 'axiom.playable-boundary-receipt.v1';
  if (!receipt || !RECEIPT_CONTRACTS.has(receipt.contract) || (!boundaryReceipt && receipt.operation !== 'paint') || (boundaryReceipt && receipt.operation !== 'boundary_enforcement')) {
    throw new Error('level_design_session_batch_receipt_invalid');
  }
  if (receipt.mapId !== session.map.mapId) throw new Error('level_design_session_batch_map_mismatch');
  if (integer(receipt.beforeRevision, 'batch_before_revision', 0, Number.MAX_SAFE_INTEGER) !== session.map.currentRevision) {
    throw new Error(`level_design_session_batch_revision_stale:${receipt.beforeRevision}:${session.map.currentRevision}`);
  }
  const afterRevision = integer(receipt.afterRevision, 'batch_after_revision', 1, Number.MAX_SAFE_INTEGER);
  if (afterRevision !== receipt.beforeRevision + 1) throw new Error('level_design_session_batch_revision_increment_invalid');
  const createdIds = Array.isArray(receipt.createdIds) ? receipt.createdIds.map(value => boundedText(value, 300)).filter(Boolean) : [];
  if (boundaryReceipt) {
    if (createdIds.length || Number(receipt.createdCount) !== 0) throw new Error('level_design_session_boundary_created_ids_invalid');
    if (!Number.isInteger(Number(receipt.changedTileCount)) || Number(receipt.changedTileCount) < 1) throw new Error('level_design_session_boundary_tile_count_invalid');
    if (receipt.runtimeAudit?.contract !== 'axiom.runtime-traversal-audit.v1' || receipt.runtimeAudit?.pass !== true) {
      throw new Error('level_design_session_boundary_runtime_audit_invalid');
    }
  } else if (!createdIds.length || createdIds.length !== Number(receipt.createdCount)) {
    throw new Error('level_design_session_batch_created_ids_invalid');
  }
  receipt.createdIds = createdIds;
  receipt.createdCount = createdIds.length;
  return {
    id: safeIdentifier(input.id || `batch_${session.iteration}_${afterRevision}`, 'batch_id'),
    iteration: session.iteration,
    family: boundedText(input.family, 80).trim(),
    plan: input.plan && typeof input.plan === 'object' ? clone(input.plan) : null,
    projectionId: safeIdentifier(input.projectionId || receipt.previewId, 'projection_id'),
    receipt,
    readback: input.readback && typeof input.readback === 'object' ? clone(input.readback) : null,
    appliedAt: at,
    undoneAt: null
  };
}

function normalizeEvaluation(input = {}, currentRevision, at) {
  return { ...normalizeMapForgeSpatialScorecard(input, currentRevision), at };
}

function normalizeUndo(input = {}, session, at) {
  const beforeRevision = integer(input.beforeRevision, 'undo_before_revision', 0, Number.MAX_SAFE_INTEGER);
  const afterRevision = integer(input.afterRevision, 'undo_after_revision', 0, Number.MAX_SAFE_INTEGER);
  const restoredMap = input.restoredMap && typeof input.restoredMap === 'object' && !Array.isArray(input.restoredMap)
    ? normalizeMap({ ...input.restoredMap, revision: input.restoredMap.revision ?? afterRevision })
    : null;
  if (beforeRevision !== session.map.currentRevision || (!restoredMap && afterRevision !== beforeRevision + 1)) {
    throw new Error(`level_design_session_undo_revision_invalid:${beforeRevision}:${session.map.currentRevision}:${afterRevision}`);
  }
  const removedIds = Array.isArray(input.removedIds) ? input.removedIds.map(value => boundedText(value, 300)).filter(Boolean) : [];
  const expected = session.batches.filter(batch => !batch.undoneAt).flatMap(batch => batch.receipt.createdIds);
  const preflightUndo = input.restoredPreflight === true && session.preflight?.receipt?.applied === true;
  if ((!expected.length && !preflightUndo) || removedIds.length !== expected.length || expected.some(id => !removedIds.includes(id))) {
    throw new Error('level_design_session_undo_lineage_invalid');
  }
  return {
    contract: 'axiom.level-design-session-undo.v1',
    sessionId: session.id,
    beforeRevision,
    afterRevision,
    removedIds,
    removedCount: removedIds.length,
    restoredPreflight: preflightUndo,
    restoredMap,
    at
  };
}

function updateNoProgress(session, evaluation) {
  session.noProgress.consecutive = evaluation.improvement > 0 ? 0 : session.noProgress.consecutive + 1;
  if (evaluation.signature && evaluation.signature === session.noProgress.repeatedSignature) {
    session.noProgress.repeatedCount += 1;
  } else if (evaluation.signature) {
    session.noProgress.repeatedSignature = evaluation.signature;
    session.noProgress.repeatedCount = 1;
  }
}

function consumeInterventions(session, at) {
  session.interventions = session.interventions.map(intervention => intervention.status === 'queued'
    ? { ...intervention, status: 'consumed', consumedAt: at, consumedInIteration: session.iteration }
    : intervention);
}

function appendEvent(session, type, summary, detail, at) {
  session.events.push({
    id: `event_${Date.now()}_${session.events.length}`,
    type,
    state: session.state,
    phase: session.phase,
    iteration: session.iteration,
    summary: boundedText(summary, 1000),
    detail: detail == null ? null : clone(detail),
    at
  });
  session.events = session.events.slice(-MAX_EVENTS);
}

function validateStoredSession(session) {
  if (session?.contract !== LEVEL_DESIGN_SESSION_CONTRACT) throw new Error('level_design_session_contract_invalid');
  safeIdentifier(session.id, 'session_id');
  if (!SESSION_STATES.has(session.state)) throw new Error(`level_design_session_state_invalid:${session.state || 'missing'}`);
  normalizeProject(session.project);
  normalizeMap({ ...session.map, revision: session.map.currentRevision });
  if (!session.preflight || session.preflight.contract !== MAP_INTENT_PREFLIGHT_CONTRACT) throw new Error('level_design_preflight_store_invalid');
  if (session.preflight.target?.mapId !== session.map.mapId && !session.undo?.restoredMap) throw new Error('level_design_preflight_store_target_mismatch');
  if (!Array.isArray(session.events) || !Array.isArray(session.batches) || !Array.isArray(session.modelInvocations)) {
    throw new Error('level_design_session_store_shape_invalid');
  }
}

function safeIdentifier(value, label) {
  const result = boundedText(value, 240).trim();
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(result)) throw new Error(`level_design_session_identifier_invalid:${label}`);
  return result;
}

function integer(value, label, min, max) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`level_design_session_integer_invalid:${label}`);
  return result;
}

function boundedInteger(value, fallback, min, max) {
  const result = Number(value);
  return Number.isInteger(result) && result >= min && result <= max ? result : fallback;
}

function boundedNumber(value, fallback, min, max) {
  const result = Number(value);
  return Number.isFinite(result) && result >= min && result <= max ? result : fallback;
}

function boundedText(value, limit) {
  const result = String(value ?? '');
  return result.length > limit ? result.slice(0, limit) : result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function replaceFileWithBoundedRetry(source, target) {
  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.renameSync(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error?.code) || attempt === 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 12 * (attempt + 1));
    }
  }
  throw lastError;
}
