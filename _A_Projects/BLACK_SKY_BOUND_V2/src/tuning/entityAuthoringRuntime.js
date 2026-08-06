import { normalizeCreatureTuning, setCreatureTuningValue } from '../data/creatures/creatureTuning.js';
import { CONFIG } from '../config.js';
import { releaseOpeningSequence } from '../game/openingSequence.js';
import { getProfileValue } from './profileValues.js';
import { saveCreatureTuningToServer } from './creatureTuningClient.js';
import {
  ENTITY_AUTHORING_APPLY_RECEIPT_CONTRACT,
  ENTITY_AUTHORING_CANDIDATE_CONTRACT,
  ENTITY_AUTHORING_COMMAND_CONTRACT,
  ENTITY_AUTHORING_FIELD_MANIFEST_CONTRACT,
  ENTITY_AUTHORING_READY_CONTRACT,
  ENTITY_AUTHORING_RESPONSE_CONTRACT,
  ENTITY_AUTHORING_TARGET_CONTRACT,
  hashEntityAuthoringState
} from './entityAuthoringContracts.js';
import { resolveCreatureTuningTarget } from './entityTuningTargets.js';
import { refreshCreatureRigForTuning } from './tuningRuntime.js';
import { setCameraVisibilityFocusTarget } from '../game/cameraVisibilityFocus.js';

export function createEntityAuthoringRuntime(app, options = {}) {
  const persist = options.persist ?? saveCreatureTuningToServer;
  const writable = options.writable !== false;
  let canonicalTuning = normalizedClone(app?.state?.game?.creatureTuning);
  let candidate = null;
  let lastReceipt = null;
  let authoringSession = null;
  let sequence = 0;

  function listTargets() {
    return (app?.state?.game?.actors ?? []).map(buildTarget).filter(Boolean);
  }

  function getTarget(targetId) {
    return listTargets().find((target) => target.targetId === targetId) ?? null;
  }

  function createCandidate(request = {}) {
    if (candidate?.status === 'previewing') restoreCanonicalProjection();
    const target = getTarget(request.targetId);
    if (!target) return failure('entity_authoring_target_unknown', { targetId: request.targetId });
    if (target.writeStatus !== 'ready') return failure(`entity_authoring_target_${target.writeStatus}`, { targetId: target.targetId });
    const field = target.fields.find((entry) => entry.path === request.path);
    if (!field) return failure('entity_authoring_field_unknown', { targetId: target.targetId, path: request.path });
    const result = setCreatureTuningValue(canonicalTuning, target.profileId, field.path, request.value);
    if (!result.ok) return failure(result.reason, { targetId: target.targetId, path: field.path });
    const baseHash = hashEntityAuthoringState(canonicalTuning);
    candidate = {
      contract: ENTITY_AUTHORING_CANDIDATE_CONTRACT,
      classification: 'non_committed_entity_authoring_candidate',
      candidateId: `entity_candidate_${Date.now()}_${++sequence}`,
      providerId: target.providerId,
      targetId: target.targetId,
      targetClass: target.targetClass,
      profileId: target.profileId,
      baseHash,
      status: 'candidate',
      source: normalizeSource(request.source),
      operations: [{ path: field.path, before: field.value, after: result.value }],
      validation: { status: 'ready', errors: [] },
      blockers: [],
      createdAt: new Date().toISOString(),
      resolvedTuning: result.tuning
    };
    return { ok: true, candidate: publicCandidate(candidate) };
  }

  function previewCandidate(candidateId = candidate?.candidateId) {
    const blocked = validateCandidate(candidateId);
    if (blocked) return blocked;
    app.state.game.creatureTuning = normalizedClone(candidate.resolvedTuning);
    refreshCreatureRigForTuning(app.state);
    candidate.status = 'previewing';
    return { ok: true, candidate: publicCandidate(candidate), target: getTarget(candidate.targetId) };
  }

  function revertCandidate(candidateId = candidate?.candidateId) {
    if (!candidate || candidate.candidateId !== candidateId) return failure('entity_authoring_candidate_unknown');
    restoreCanonicalProjection();
    const revertedId = candidate.candidateId;
    candidate = null;
    return { ok: true, reverted: true, candidateId: revertedId, canonicalHash: hashEntityAuthoringState(canonicalTuning) };
  }

  async function applyCandidate(candidateId = candidate?.candidateId) {
    const blocked = validateCandidate(candidateId);
    if (blocked) return blocked;
    if (!writable) return rejectCandidate('entity_authoring_persistence_unavailable');
    candidate.status = 'applying';
    const beforeHash = hashEntityAuthoringState(canonicalTuning);
    const saved = await persist(candidate.resolvedTuning);
    if (!saved?.ok) return rejectCandidate(saved?.reason ?? 'entity_authoring_persist_failed');
    canonicalTuning = normalizedClone(saved.tuning ?? candidate.resolvedTuning);
    app.state.game.creatureTuning = normalizedClone(canonicalTuning);
    refreshCreatureRigForTuning(app.state);
    const afterHash = hashEntityAuthoringState(canonicalTuning);
    lastReceipt = {
      contract: ENTITY_AUTHORING_APPLY_RECEIPT_CONTRACT,
      classification: 'applied_entity_authoring_change',
      applied: true,
      candidateId: candidate.candidateId,
      providerId: candidate.providerId,
      targetId: candidate.targetId,
      beforeHash,
      afterHash,
      persistedDestination: 'tuning/creature-overrides.json',
      runtimeRefresh: 'complete',
      readBack: { status: afterHash === hashEntityAuthoringState(saved.tuning ?? canonicalTuning) ? 'verified' : 'mismatch' },
      source: candidate.source,
      appliedAt: new Date().toISOString()
    };
    candidate = null;
    return { ok: true, receipt: clone(lastReceipt), target: getTarget(lastReceipt.targetId) };
  }

  function replaceCanonicalTuning(tuning, source = 'external_sync') {
    canonicalTuning = normalizedClone(tuning);
    if (!candidate || candidate.status !== 'previewing') {
      app.state.game.creatureTuning = normalizedClone(canonicalTuning);
      refreshCreatureRigForTuning(app.state);
    }
    return { ok: true, source, canonicalHash: hashEntityAuthoringState(canonicalTuning) };
  }

  function snapshot() {
    return {
      contract: 'axiom.entity-authoring-runtime.v0',
      classification: 'runtime_projection',
      writable,
      canonicalHash: hashEntityAuthoringState(canonicalTuning),
      targets: listTargets(),
      candidate: publicCandidate(candidate),
      lastReceipt: clone(lastReceipt),
      session: authoringSession ? { active: true, focusedTargetId: authoringSession.focusedTargetId } : { active: false }
    };
  }

  function beginSession(targetId = null) {
    if (!authoringSession) {
      authoringSession = {
        paused: Boolean(app.state.paused),
        camera: clone(app.state.camera),
        tuningActive: Boolean(app.state.tuning?.active),
        opening: clone(app.state.opening),
        cameraVisibilityFocus: clone(app.state.game.cameraVisibilityFocus),
        focusedTargetId: null
      };
      options.onSessionChange?.({ active: true });
    }
    app.state.paused = true;
    if (app.state.tuning) app.state.tuning.active = true;
    if (app.state.opening) releaseOpeningSequence(app.state.opening);
    if (targetId) return focusTarget(targetId);
    return { ok: true, session: { active: true, focusedTargetId: null } };
  }

  function focusTarget(targetId) {
    const target = getTarget(targetId);
    if (!target) return failure('entity_authoring_target_unknown', { targetId });
    const actor = (app?.state?.game?.actors ?? []).find((entry) => `actor:${entry.id}` === targetId);
    if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.y)) {
      return failure('entity_authoring_target_not_focusable', { targetId });
    }
    if (!authoringSession) beginSession();
    app.state.paused = true;
    app.state.camera.x = (actor.x + 1.2) * CONFIG.tileSize;
    app.state.camera.y = (actor.y - 1.2) * CONFIG.tileSize;
    app.state.camera.zoom = 4.15;
    setCameraVisibilityFocusTarget(app.state.game.cameraVisibilityFocus, actor.id, 'axiom_entity_studio_selection');
    authoringSession.focusedTargetId = targetId;
    return {
      ok: true,
      session: { active: true, focusedTargetId: targetId },
      viewport: { x: app.state.camera.x, y: app.state.camera.y, zoom: app.state.camera.zoom },
      target: getTarget(targetId)
    };
  }

  function endSession() {
    if (!authoringSession) return { ok: true, restored: false };
    Object.assign(app.state.camera, authoringSession.camera);
    app.state.paused = authoringSession.paused;
    if (app.state.tuning) app.state.tuning.active = authoringSession.tuningActive;
    if (authoringSession.opening) app.state.opening = authoringSession.opening;
    if (authoringSession.cameraVisibilityFocus) app.state.game.cameraVisibilityFocus = clone(authoringSession.cameraVisibilityFocus);
    authoringSession = null;
    options.onSessionChange?.({ active: false });
    return { ok: true, restored: true };
  }

  async function dispatch(command, payload = {}) {
    if (command === 'targets.list' || command === 'state.snapshot') return { ok: true, result: snapshot() };
    if (command === 'session.begin') return beginSession(payload.targetId);
    if (command === 'session.end') return endSession();
    if (command === 'target.focus') return focusTarget(payload.targetId);
    if (command === 'target.get') return getTarget(payload.targetId)
      ? { ok: true, result: getTarget(payload.targetId) }
      : failure('entity_authoring_target_unknown');
    if (command === 'candidate.create') return createCandidate(payload);
    if (command === 'candidate.preview') return previewCandidate(payload.candidateId);
    if (command === 'candidate.revert') return revertCandidate(payload.candidateId);
    if (command === 'candidate.apply') return applyCandidate(payload.candidateId);
    return failure('entity_authoring_command_unknown', { command });
  }

  function buildTarget(actor) {
    const resolved = resolveCreatureTuningTarget(actor, app.state.game.creatureTuning);
    if (!resolved) return null;
    const targetId = `actor:${actor.id}`;
    return {
      contract: ENTITY_AUTHORING_TARGET_CONTRACT,
      classification: 'canonical_target_projection',
      targetId,
      targetClass: 'animated_entity',
      providerId: resolved.providerId,
      runtimeIdentity: { id: actor.id, authoredId: actor.authoredId ?? null, kind: actor.type, team: actor.team, alive: actor.alive !== false },
      label: actor.label ?? actor.type,
      profileId: resolved.profileId,
      recipeId: actor.creatureRecipe?.recipeId ?? actor.wyvernProjection?.recipeId ?? null,
      variantSignature: actor.creatureRecipe?.variantSignature ?? null,
      canonicalSource: {
        owner: 'Black Sky Bound creature tuning resolver/API',
        path: 'tuning/creature-overrides.json',
        supplementalRecipePath: actor.creatureRecipe?.recipeId ? 'src/data/creatures/raiderCreatureRecipe.js' : null,
        hash: hashEntityAuthoringState(canonicalTuning)
      },
      writeStatus: resolved.writeStatus,
      capabilities: resolved.capabilities,
      fieldManifest: {
        contract: ENTITY_AUTHORING_FIELD_MANIFEST_CONTRACT,
        providerId: resolved.providerId,
        profileId: resolved.profileId
      },
      fields: resolved.manifest.map((field) => ({ ...field, value: getProfileValue(resolved.profile, field.path) })),
      runtimeProjection: buildRuntimeProjection(actor, resolved, app.state.map, app.state.game.cameraVisibilityFocus)
    };
  }

  function validateCandidate(candidateId) {
    if (!candidate || candidate.candidateId !== candidateId) return failure('entity_authoring_candidate_unknown');
    if (candidate.baseHash !== hashEntityAuthoringState(canonicalTuning)) return rejectCandidate('entity_authoring_candidate_stale');
    return null;
  }

  function rejectCandidate(reason) {
    if (candidate) {
      candidate.status = 'blocked';
      candidate.validation = { status: 'blocked', errors: [reason] };
      candidate.blockers = [reason];
    }
    restoreCanonicalProjection();
    return failure(reason, { candidate: publicCandidate(candidate) });
  }

  function restoreCanonicalProjection() {
    app.state.game.creatureTuning = normalizedClone(canonicalTuning);
    refreshCreatureRigForTuning(app.state);
  }

  return { listTargets, getTarget, createCandidate, previewCandidate, revertCandidate, applyCandidate, replaceCanonicalTuning, beginSession, focusTarget, endSession, snapshot, dispatch };
}

export function attachEntityAuthoringWindowBridge(runtime, host = globalThis) {
  const diagnostics = { received: 0, responded: 0, lastCommand: null, lastId: null, lastError: null };
  host.BSB_ENTITY_AUTHORING_BRIDGE = diagnostics;
  const onMessage = async (event) => {
    const message = event?.data;
    if (message?.contract !== ENTITY_AUTHORING_COMMAND_CONTRACT || message.source !== 'axiom' || message.target !== 'black-sky-bound-v2') return;
    diagnostics.received += 1;
    diagnostics.lastCommand = message.command;
    diagnostics.lastId = message.id;
    let response;
    try {
      response = await runtime.dispatch(message.command, message.payload ?? {});
    } catch (error) {
      diagnostics.lastError = String(error?.message || error);
      response = failure(diagnostics.lastError);
    }
    const responseMessage = {
      contract: ENTITY_AUTHORING_RESPONSE_CONTRACT,
      source: 'black-sky-bound-v2',
      target: 'axiom',
      id: message.id,
      command: message.command,
      ok: response?.ok !== false,
      result: clone(response?.result ?? response),
      error: response?.ok === false ? response.reason : null
    };
    const deliver = () => {
      if (host.parent && host.parent !== host) host.parent.postMessage(responseMessage, '*');
      else event.source?.postMessage?.(responseMessage, '*');
    };
    deliver();
    diagnostics.responded += 1;
  };
  host.addEventListener?.('message', onMessage);
  if (host.parent && host.parent !== host) {
    host.parent.postMessage({
      contract: ENTITY_AUTHORING_READY_CONTRACT,
      source: 'black-sky-bound-v2',
      target: 'axiom',
      result: runtime.snapshot()
    }, '*');
  }
  return () => host.removeEventListener?.('message', onMessage);
}

function buildRuntimeProjection(actor, resolved, map, cameraVisibilityFocus) {
  const terrain = map?.tiles?.[Math.floor(actor.y)]?.[Math.floor(actor.x)] ?? null;
  const occlusionDensity = nearbyOcclusionDensity(map, actor.x, actor.y);
  return {
    motionState: actor.humanoidProjection?.motionState ?? actor.wyvernProjection?.motionState ?? actor.predatorProjection?.motionState ?? 'idle',
    animationState: actor.humanoidProjection?.animationState ?? actor.predatorProjection?.animationState ?? null,
    supportFoot: actor.raiderPhysicalMotion?.locomotion?.supportFoot ?? null,
    poseEnabled: actor.raiderPhysicalMotion?.poseEnabled ?? null,
    poseActivation: actor.raiderPhysicalMotion?.poseActivation ?? null,
    visualBounds: resolved.visualBounds,
    profileKind: resolved.kind,
    cameraVisibilityFocus: {
      active: cameraVisibilityFocus?.enabled !== false && cameraVisibilityFocus?.targetEntityId === actor.id,
      targetSource: cameraVisibilityFocus?.targetEntityId === actor.id ? cameraVisibilityFocus.source : null,
      mode: 'occlusion_aware_orthographic_sightline_corridor',
      radiusMeters: resolved.profile?.visibilityFocus?.radiusMeters ?? null,
      featherMeters: resolved.profile?.visibilityFocus?.featherMeters ?? null,
      minimumOccluderOpacity: resolved.profile?.visibilityFocus?.minimumOccluderOpacity ?? null,
      readabilityLightPower: resolved.profile?.visibilityFocus?.readabilityLightPower ?? null
    },
    terrain,
    occlusionDensity,
    previewSuitability: ['forest', 'water', 'rock'].includes(terrain) || occlusionDensity > 0.12 ? 'obstructed' : 'clear'
  };
}

function nearbyOcclusionDensity(map, x, y) {
  let blocked = 0;
  let sampled = 0;
  for (let dy = -7; dy <= 7; dy += 1) {
    for (let dx = -7; dx <= 7; dx += 1) {
      const terrain = map?.tiles?.[Math.floor(y + dy)]?.[Math.floor(x + dx)];
      if (!terrain) continue;
      sampled += 1;
      if (['forest', 'water', 'rock'].includes(terrain)) blocked += 1;
    }
  }
  return sampled ? Number((blocked / sampled).toFixed(3)) : 1;
}

function publicCandidate(value) {
  if (!value) return null;
  const { resolvedTuning, ...publicValue } = value;
  return clone(publicValue);
}

function normalizeSource(source) {
  if (source && typeof source === 'object') return clone(source);
  return { kind: 'human', id: String(source || 'axiom_entity_studio') };
}

function normalizedClone(value) {
  return clone(normalizeCreatureTuning(value).tuning);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function failure(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}
