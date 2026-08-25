import {
  buildMapIntentSystemPrompt,
  createMapIntentPreflight,
  normalizeModelIntent,
  parseMapIntentJson
} from './map-intent-preflight.js';
import {
  deriveTargetedStrokeCenters,
  evaluateMapForgeSpatialQuality,
  MAP_FORGE_SPATIAL_SCORECARD_CONTRACT
} from './level-design-spatial-critic.js';

export const LEVEL_DESIGN_SESSION_CONTRACT = 'axiom.level-design-session.v1';
export const LEVEL_DESIGN_CLIENT_CONTRACT = 'axiom.level-design-session-browser.v1';
export { MAP_FORGE_SPATIAL_SCORECARD_CONTRACT };

const API_ROOT = '/api/level-design-sessions';
const ACTIVE_STATES = new Set(['planning', 'previewing', 'applying', 'evaluating', 'recovering']);
const TERMINAL_STATES = new Set(['completed', 'stopped', 'blocked']);
const REQUIRED_FAMILIES = Object.freeze(['tree', 'undergrowth', 'geology']);
const PLAN_VARIANTS = Object.freeze({
  tree: Object.freeze(['old_pine', 'silver_birch', 'ancient_oak']),
  undergrowth: Object.freeze(['fern_heavy', 'mixed_shrub', 'ember_edge']),
  geology: Object.freeze(['fieldstone', 'fractured_basalt', 'weathered_outcrop'])
});
const ANIMATION_STEP_MS = 260;

const state = {
  session: null,
  clientId: `mapforge_client_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`,
  runToken: 0,
  running: false,
  follow: true,
  expanded: true,
  busy: false,
  error: null,
  messageSink: null,
  journaled: new Set(),
  heartbeatTimer: null,
  lastObservedRevision: null,
  expectedAgentRevision: null
};

export function isLevelDesignGoal(value = '') {
  const text = String(value || '').replace(/^\[Current Journal draft context:[\s\S]*?\]\s*/i, '').toLowerCase();
  const mapWords = /\b(map|map forge|forge|level|biome|environment|corridor|path|road|forest|woodland|landscape)\b/;
  const designWords = /\b(build out|design|dress|author|populate|shape|rework|create|make|develop|improve|work on)\b/;
  return text.length >= 18 && mapWords.test(text) && designWords.test(text);
}

export function normalizeLevelDesignPlan(value, requestedFamily, requestedTarget = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('level_design_plan_object_required');
  const family = String(value.family || '').trim();
  if (family !== requestedFamily || !REQUIRED_FAMILIES.includes(family)) {
    throw new Error(`level_design_plan_family_invalid:${family || 'missing'}:${requestedFamily}`);
  }
  const summary = boundedText(value.summary, 180).trim();
  const rationale = boundedText(value.rationale, 260).trim();
  if (!summary || !rationale) throw new Error('level_design_plan_summary_required');
  if (/^(short visible action|one concise level-design reason)$/i.test(summary)
    || /^(short visible action|one concise level-design reason)$/i.test(rationale)) {
    throw new Error('level_design_plan_placeholder_text_rejected');
  }
  const bandMin = boundedInteger(value.bandMin, 'bandMin', 4, 8);
  const bandMax = boundedInteger(value.bandMax, 'bandMax', bandMin + 1, 11);
  const radiusTiles = boundedInteger(value.radiusTiles, 'radiusTiles', 1, 2);
  const density = boundedNumber(value.density, 'density', .15, .85);
  const falloff = boundedNumber(value.falloff, 'falloff', 0, .9);
  const variant = String(value.variant || '').trim();
  if (!PLAN_VARIANTS[family].includes(variant)) throw new Error(`level_design_plan_variant_invalid:${family}:${variant || 'missing'}`);
  return {
    summary,
    rationale,
    family,
    bandMin,
    bandMax,
    radiusTiles,
    density,
    falloff,
    variant,
    targetZoneId: requestedTarget?.zoneId || null,
    targetZoneKind: requestedTarget?.zoneKind || null,
    targetStartFraction: Number.isFinite(Number(requestedTarget?.startFraction)) ? Number(requestedTarget.startFraction) : 0,
    targetEndFraction: Number.isFinite(Number(requestedTarget?.endFraction)) ? Number(requestedTarget.endFraction) : 1
  };
}

export function derivePathCorridorStrokeCenters(document, plan, options = {}) {
  if (!document?.tiles?.length || !Number.isInteger(document.width) || !Number.isInteger(document.height)) {
    throw new Error('level_design_observation_document_invalid');
  }
  const pathTiles = [];
  for (let y = 0; y < document.height; y += 1) {
    for (let x = 0; x < document.width; x += 1) {
      if (document.tiles[y]?.[x] === 'dirt') pathTiles.push({ x, y });
    }
  }
  if (!pathTiles.length) throw new Error('level_design_path_corridor_missing');
  const footprintPadding = plan.family === 'geology' ? 1 : 0;
  const minimumDistance = plan.bandMin + plan.radiusTiles + footprintPadding;
  const maximumDistance = plan.bandMax + plan.radiusTiles + 2;
  const eligible = [];
  const occupied = new Set([
    ...(document.sceneObjects || []).map(record => `${record.x},${record.y}`),
    ...(document.unitPlacements || []).map(record => `${record.x},${record.y}`),
    ...(document.unitSpawners || []).map(record => `${record.x},${record.y}`)
  ]);
  for (let y = 1; y < document.height - 1; y += 1) {
    for (let x = 1; x < document.width - 1; x += 1) {
      const terrain = document.tiles[y]?.[x];
      if (!['grass', 'forest', 'scorched'].includes(terrain) || occupied.has(`${x},${y}`)) continue;
      if (plan.family === 'geology' && (x >= document.width - 2 || y >= document.height - 2)) continue;
      const distance = distanceToPath(x, y, pathTiles);
      if (distance < minimumDistance || distance > maximumDistance) continue;
      eligible.push({ x, y, distance, score: stableScore(`${options.seed || 'axiom'}:${plan.family}:${x}:${y}`) });
    }
  }
  const targeted = deriveTargetedStrokeCenters(document, plan, eligible);
  targeted.sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x);
  const limit = plan.family === 'tree' ? 6 : plan.family === 'undergrowth' ? 5 : 4;
  const separation = plan.radiusTiles * 2 + (plan.family === 'geology' ? 3 : 2);
  const selected = [];
  for (const candidate of targeted) {
    if (selected.some(point => Math.hypot(candidate.x - point.x, candidate.y - point.y) < separation)) continue;
    selected.push({ x: candidate.x, y: candidate.y });
    if (selected.length >= limit) break;
  }
  if (!selected.length) throw new Error(`level_design_corridor_capacity_exhausted:${plan.family}:${plan.targetZoneId || 'full_route'}`);
  return selected;
}

export function evaluateLevelDesignSession(session, document, pathTiles = null) {
  return evaluateMapForgeSpatialQuality(session, document, { pathTiles });
}

function ensureSurface() {
  let root = document.getElementById('level-design-session-surface');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'level-design-session-surface';
  root.className = 'level-design-session-surface';
  root.hidden = true;
  root.setAttribute('aria-label', 'AXIOM live level-design session');
  root.innerHTML = `
    <div class="level-design-session-head">
      <span class="level-design-session-live" aria-hidden="true"></span>
      <div><span class="level-design-session-kicker">MAP FORGE · LIVE GOAL</span><strong id="level-design-session-title">Level-design session</strong></div>
      <span id="level-design-session-state" class="level-design-session-state">idle</span>
      <button type="button" data-level-action="toggle" class="level-design-session-demote" title="Collapse or expand session detail" aria-expanded="true">▾</button>
    </div>
    <div id="level-design-session-body" class="level-design-session-body">
      <p id="level-design-session-goal" class="level-design-session-goal"></p>
      <div id="level-design-session-preflight" class="level-design-session-preflight"></div>
      <div class="level-design-session-now"><span id="level-design-session-phase">Waiting</span><strong id="level-design-session-action">No active goal.</strong></div>
      <div id="level-design-session-metrics" class="level-design-session-metrics"></div>
      <div id="level-design-session-quality" class="level-design-session-quality"></div>
      <div class="level-design-session-controls">
        <button type="button" data-level-action="start" class="primary">Start goal</button>
        <button type="button" data-level-action="pause">Pause</button>
        <button type="button" data-level-action="resume">Resume</button>
        <button type="button" data-level-action="stop">Stop</button>
        <button type="button" data-level-action="follow" aria-pressed="true">Follow AXIOM</button>
        <button type="button" data-level-action="direction">Add direction</button>
        <button type="button" data-level-action="undo">Undo session</button>
      </div>
      <form id="level-design-session-direction" class="level-design-session-direction" hidden>
        <input id="level-design-session-direction-input" maxlength="2000" placeholder="Change emphasis at the next safe boundary…">
        <button type="submit">Queue</button>
      </form>
      <div id="level-design-session-error" class="level-design-session-error" hidden></div>
      <details class="level-design-session-evidence"><summary>Activity and receipts</summary><div id="level-design-session-events"></div></details>
    </div>`;
  const activity = document.getElementById('agent-activity-surface');
  activity?.parentNode?.insertBefore(root, activity);
  root.addEventListener('click', onActionClick);
  root.querySelector('#level-design-session-direction')?.addEventListener('submit', onDirectionSubmit);
  return root;
}

function render() {
  const root = ensureSurface();
  const session = state.session;
  root.hidden = !session;
  if (!session) return;
  root.dataset.state = session.state;
  root.querySelector('#level-design-session-title').textContent = session.source.prompt;
  root.querySelector('#level-design-session-state').textContent = session.state.replace(/_/g, ' ');
  root.querySelector('#level-design-session-goal').textContent = session.source.prompt;
  root.querySelector('#level-design-session-preflight').innerHTML = renderPreflight(session.preflight);
  root.querySelector('#level-design-session-phase').textContent = `Iteration ${session.iteration} · ${session.phase.replace(/_/g, ' ')}`;
  root.querySelector('#level-design-session-action').textContent = session.currentAction;
  const body = root.querySelector('#level-design-session-body');
  const toggle = root.querySelector('[data-level-action="toggle"]');
  body.hidden = !state.expanded;
  toggle.textContent = state.expanded ? '▾' : '▸';
  toggle.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
  const batches = (session.batches || []).filter(batch => !batch.undoneAt);
  const created = batches.reduce((sum, batch) => sum + Number(batch.receipt?.createdCount || 0), 0);
  const families = [...new Set(batches.map(batch => batch.family))];
  const evaluation = session.latestEvaluation;
  root.querySelector('#level-design-session-metrics').innerHTML = [
    `${created} placed`,
    `${families.length}/3 layers`,
    `rev ${session.map.currentRevision}`,
    evaluation?.integrityGate ? `integrity ${evaluation.integrityGate.pass ? 'pass' : 'open'}` : 'integrity pending',
    evaluation?.designGate ? `design ${Math.round(evaluation.designGate.score)}/100` : 'design pending'
  ].map(value => `<span>${escapeHtml(value)}</span>`).join('');
  root.querySelector('#level-design-session-quality').innerHTML = renderQuality(evaluation);
  const active = ACTIVE_STATES.has(session.state);
  const terminal = TERMINAL_STATES.has(session.state);
  const start = root.querySelector('[data-level-action="start"]');
  start.hidden = session.authority.approved;
  start.textContent = session.preflight?.playableSpace?.requiresPreparation ? 'Approve & prepare' : 'Start goal';
  start.disabled = !(!session.authority.approved && session.state === 'awaiting_user' && session.preflight?.status === 'ready');
  setButton(root, 'pause', active);
  setButton(root, 'resume', session.authority.approved && ['paused', 'awaiting_user'].includes(session.state));
  setButton(root, 'stop', !terminal && session.authority.approved);
  setButton(root, 'direction', !terminal && session.authority.approved);
  setButton(root, 'undo', (batches.length > 0 || session.preflight?.receipt?.applied) && !active && !session.undo);
  const follow = root.querySelector('[data-level-action="follow"]');
  follow.hidden = false;
  follow.disabled = !session.authority.approved;
  follow.setAttribute('aria-pressed', state.follow ? 'true' : 'false');
  follow.textContent = state.follow ? 'Following AXIOM' : 'Follow AXIOM';
  const error = root.querySelector('#level-design-session-error');
  error.hidden = !state.error;
  error.textContent = state.error || '';
  root.querySelector('#level-design-session-events').innerHTML = renderEvidence(session);
}

function renderPreflight(preflight) {
  if (!preflight) return '<div class="level-design-session-empty">Map target has not been resolved.</div>';
  const brief = preflight.playableSpace;
  const target = preflight.target;
  const duration = brief.requestedMinutes == null ? 'duration unchanged' : `${brief.requestedMinutes} min estimate`;
  const dimensions = brief.dimensions?.target ? `${brief.dimensions.target.width}×${brief.dimensions.target.height}` : 'unchanged';
  const change = preflight.action === 'create_new'
    ? `new unsaved draft · ${target.title}`
    : target.changedFromActive
      ? `${preflight.previousMap.title} → ${target.title}`
      : `current · ${target.title}`;
  const beats = (brief.pacingBeats || []).map(beat => `<span>${escapeHtml(beat.kind)} · ${Math.round(beat.atFraction * 100)}%</span>`).join('');
  const routeDesign = brief.route?.topology
    ? `<div class="level-design-session-route-design"><span>${escapeHtml(brief.route.direction)}</span><span>${escapeHtml(brief.route.topology)}</span><span>shortcuts · ${escapeHtml(brief.route.shortcutPolicy)}</span><span>${escapeHtml(brief.route.boundaryStyle)}</span></div>`
    : '';
  return `<div class="level-design-session-preflight-head"><span>MAP PREFLIGHT</span><b>${escapeHtml(change)}</b></div>
    <div class="level-design-session-preflight-route"><strong>${escapeHtml(brief.route.from)} → ${escapeHtml(brief.route.to)}</strong><small>${escapeHtml(brief.biome)} · ${escapeHtml(duration)} · ${escapeHtml(dimensions)}</small></div>
    ${routeDesign}
    ${beats ? `<div class="level-design-session-preflight-beats">${beats}</div>` : ''}
    <p>${escapeHtml(preflight.summary)}${brief.requestedMinutes == null ? '' : ' Planning estimate; runtime playtesting remains the duration authority. Boundary intent is not considered enforced until runtime collision validation passes.'}</p>`;
}

function renderEvidence(session) {
  const events = (session.events || []).slice(-8).reverse();
  const timeline = events.map(event => `<div class="level-design-session-event"><span>${escapeHtml(event.type.replace(/_/g, ' '))}</span><b>${escapeHtml(event.summary)}</b><time>${escapeHtml(formatTime(event.at))}</time></div>`).join('');
  const receipts = (session.batches || []).slice().reverse().map(batch => `
    <details class="level-design-session-receipt"><summary>${escapeHtml(batch.family)} · ${batch.receipt.createdCount} objects · rev ${batch.receipt.afterRevision}</summary><pre>${escapeHtml(JSON.stringify({ plan: batch.plan, receipt: batch.receipt, readback: batch.readback }, null, 2))}</pre></details>`).join('');
  const models = (session.modelInvocations || []).slice(-4).reverse().map(invocation => `<div class="level-design-session-model"><span>${escapeHtml(invocation.ok ? 'model plan' : 'model error')}</span><b>${escapeHtml(invocation.model)}</b><small>${escapeHtml(invocation.responseSummary || invocation.error || '')}</small></div>`).join('');
  return `${timeline}${models}${receipts || '<div class="level-design-session-empty">No batch receipts yet.</div>'}`;
}

function renderQuality(evaluation) {
  if (!evaluation?.designGate || !evaluation?.nextAction) return '';
  const blocked = evaluation.nextAction.kind === 'route_revision_required' || evaluation.nextAction.kind === 'repair_integrity';
  const passed = evaluation.criteriaMet === true;
  const status = passed ? 'PASS' : blocked ? 'BLOCKED' : 'ITERATING';
  const reasons = [...(evaluation.integrityGate?.reasons || []), ...(evaluation.designGate?.reasons || [])].slice(0, 3);
  return `<section class="level-design-quality-card" data-quality-state="${escapeHtml(passed ? 'pass' : blocked ? 'blocked' : 'iterating')}">
    <div class="level-design-quality-head"><span>DESIGN CHECK</span><b>${escapeHtml(status)}</b><strong>${escapeHtml(`${Math.round(evaluation.designGate.score)}/100`)}</strong></div>
    <p>${escapeHtml(evaluation.summary)}</p>
    ${reasons.length ? `<ul>${reasons.map(item => `<li>${escapeHtml(item.label)}</li>`).join('')}</ul>` : ''}
    <div class="level-design-quality-next"><span>NEXT</span><b>${escapeHtml(evaluation.nextAction.summary)}</b></div>
    <details><summary>Spatial scorecard</summary><pre>${escapeHtml(JSON.stringify({ integrityGate: evaluation.integrityGate, designGate: evaluation.designGate, nextAction: evaluation.nextAction }, null, 2))}</pre></details>
  </section>`;
}

function setButton(root, action, enabled) {
  const button = root.querySelector(`[data-level-action="${action}"]`);
  if (button) {
    button.hidden = false;
    button.disabled = !enabled;
  }
}

async function onActionClick(event) {
  const action = event.target.closest('[data-level-action]')?.dataset.levelAction;
  if (!action || state.busy) return;
  if (action === 'toggle') {
    state.expanded = !state.expanded;
    render();
  } else if (action === 'start') await approve();
  else if (action === 'pause') await pause('user_requested');
  else if (action === 'resume') await resume();
  else if (action === 'stop') await stop();
  else if (action === 'follow') {
    state.follow = !state.follow;
    syncMapAgentSession();
    render();
  } else if (action === 'direction') {
    const form = document.getElementById('level-design-session-direction');
    form.hidden = !form.hidden;
    if (!form.hidden) document.getElementById('level-design-session-direction-input')?.focus();
  } else if (action === 'undo') await undoSession();
}

async function onDirectionSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = document.getElementById('level-design-session-direction-input');
  const direction = String(input?.value || '').trim();
  if (!direction) return;
  await addDirection(direction, 'chat');
  input.value = '';
  form.hidden = true;
}

async function request(path = '', options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({ ok: false, error: `http_${response.status}` }));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `level_design_session_http_${response.status}`);
  return payload;
}

async function requirePlayableSpaceProfile(context = {}) {
  const fileManager = window.FileManagerRuntime;
  let workspace = fileManager?.getWorkspaceContext?.();
  if (!workspace?.project?.id || !workspace.project.root) throw new Error('level_design_session_active_project_required');
  const initialProjectId = workspace.project.id;
  const initialProjectRoot = workspace.project.root;
  const manifestCurrent = ['loaded', 'saved'].includes(workspace.project.manifestStatus);
  let profile = workspace.project?.workspace?.playableSpaceProfile;
  if (profile && manifestCurrent) return { workspace, profile, refreshed: false, manifestReceipt: null };
  if (typeof fileManager?.readProjectManifest !== 'function') {
    throw new Error('level_design_playable_space_profile_refresh_unavailable');
  }
  if (context.attemptId) window.AgentActivityRuntime?.stage?.(context.attemptId, 'project_profile', {
    label: 'Refreshing project planning profile',
    status: 'running',
    attemptStatus: 'running',
    summary: 'Reading the complete canonical project manifest before map intent is resolved.'
  });
  const manifestRead = await fileManager.readProjectManifest({ sourceSurface: 'level_design_preflight_profile_refresh' });
  workspace = fileManager.getWorkspaceContext?.();
  if (workspace?.project?.id !== initialProjectId || workspace?.project?.root !== initialProjectRoot) {
    throw new Error(`level_design_workspace_changed_during_profile_refresh:${initialProjectId}:${workspace?.project?.id || 'missing'}`);
  }
  profile = workspace?.project?.workspace?.playableSpaceProfile;
  if (manifestRead?.ok === false || manifestRead?.medium !== 'filesystem' || !profile) {
    const reason = manifestRead?.errors?.[0] || manifestRead?.warnings?.[0] || manifestRead?.error || 'profile_not_declared';
    throw new Error(`level_design_playable_space_profile_missing:${boundedText(reason, 300)}`);
  }
  if (context.attemptId) window.AgentActivityRuntime?.stage?.(context.attemptId, 'project_profile', {
    label: 'Project planning profile refreshed',
    status: 'completed',
    attemptStatus: 'running',
    summary: `Canonical ${profile.contract} loaded from ${initialProjectRoot}/.axiom/project.json.`,
    detail: { receipt: manifestRead.receipt || null, manifestMedium: manifestRead.medium }
  });
  return { workspace, profile, refreshed: true, manifestReceipt: manifestRead.receipt || null };
}

async function resolveMapIntentPreflight(prompt, context = {}) {
  const profileContext = await requirePlayableSpaceProfile(context);
  const workspace = profileContext.workspace;
  let mapStatus = window.BsbV2MapAuthoring?.status?.();
  if (!workspace?.project?.id || !workspace.project.root || !mapStatus?.document || !mapStatus.authoringPath) {
    throw new Error('level_design_session_active_map_required');
  }
  if (!mapStatus.mapLibrary?.maps?.length) {
    await window.BsbV2MapAuthoring.loadMapLibrary();
    mapStatus = window.BsbV2MapAuthoring.status();
  }
  const profile = profileContext.profile;
  const currentMap = mapIntentCurrentMap(mapStatus);
  const catalogue = mapIntentCatalogue(mapStatus, currentMap);
  const model = window.ModelBus?.getCurrent?.();
  if (!model) throw new Error('level_design_local_model_unavailable');
  const modelName = model.model || model.endpoint?.name || 'local_model';
  const system = buildMapIntentSystemPrompt({ catalogue, currentMap });
  const messages = [{ role: 'user', content: `Interpret and bind this Map Forge request before any authoring:\n${cleanPrompt(prompt)}` }];
  const invocationId = `model_preflight_${Date.now()}_${stableScore(prompt)}`;
  let raw = null;
  let parsed = null;
  let repaired = false;
  let firstError = null;
  try {
    raw = await window.ModelBus.complete(messages, { system, max_tokens: 900, timeoutMs: 45000, think: false });
    parsed = parseMapIntentJson(raw);
    normalizeModelIntent(parsed, { catalogue, currentMap });
  } catch (error) {
    firstError = String(error?.message || error);
    repaired = true;
    const repairedRaw = await window.ModelBus.complete([
      ...messages,
      { role: 'assistant', content: String(raw || '') },
      { role: 'user', content: `The response failed validation: ${firstError}. Return only one corrected JSON object. Use an exact supplied catalogue id and do not fall back to the active map.` }
    ], { system, max_tokens: 900, timeoutMs: 45000, think: false });
    parsed = parseMapIntentJson(repairedRaw);
    normalizeModelIntent(parsed, { catalogue, currentMap });
    raw = repairedRaw;
  }
  const interpreted = normalizeModelIntent(parsed, { catalogue, currentMap });
  if (interpreted.action !== 'create_new' && interpreted.targetCatalogueMapId !== mapStatus.activeCatalogueMapId) {
    if (mapStatus.dirty) throw new Error(`level_design_target_switch_unsaved_map_blocked:${mapStatus.activeCatalogueMapId}`);
    const switched = await window.BsbV2MapAuthoring.selectRegion(interpreted.targetCatalogueMapId);
    if (switched?.error) throw new Error(switched.error);
    mapStatus = window.BsbV2MapAuthoring.status();
  }
  if (interpreted.action === 'edit_current' && interpreted.targetCatalogueMapId !== mapStatus.activeCatalogueMapId) {
    throw new Error(`level_design_edit_current_target_mismatch:${interpreted.targetCatalogueMapId}:${mapStatus.activeCatalogueMapId}`);
  }
  const resolvedCatalogue = mapIntentCatalogue(mapStatus, mapIntentCurrentMap(mapStatus));
  const preflight = createMapIntentPreflight({
    prompt: cleanPrompt(prompt),
    catalogue: resolvedCatalogue,
    currentMap,
    profile,
    modelOutput: parsed,
    modelInvocation: {
      id: repaired ? `${invocationId}_repair` : invocationId,
      model: modelName,
      repair: repaired,
      responseSummary: interpreted.summary,
      invokedAt: new Date().toISOString()
    }
  });
  if (preflight.action !== 'create_new') {
    const bound = window.BsbV2MapAuthoring.status();
    if (bound.activeCatalogueMapId !== preflight.target.catalogueMapId || bound.document?.mapId !== preflight.target.mapId || bound.authoringPath !== preflight.target.authoringPath) {
      throw new Error(`level_design_preflight_target_binding_failed:${bound.activeCatalogueMapId}:${bound.document?.mapId}`);
    }
  }
  if (context.attemptId) window.AgentActivityRuntime?.stage?.(context.attemptId, 'preflight', {
    label: 'Map intent and playable-space preflight',
    status: 'completed',
    attemptStatus: 'awaiting_user',
    summary: `${preflight.action.replace(/_/g, ' ')} · ${preflight.previousMap.title} → ${preflight.target.title}`,
    detail: { preflight, rawModelResponse: boundedText(raw, 1200), firstValidationError: firstError }
  });
  return preflight;
}

function mapIntentCurrentMap(mapStatus) {
  const catalogueEntry = mapStatus.mapLibrary?.maps?.find(map => map.id === mapStatus.activeCatalogueMapId);
  return {
    catalogueMapId: mapStatus.activeCatalogueMapId,
    mapId: mapStatus.document.mapId,
    title: catalogueEntry?.title || mapStatus.document.title,
    scenarioId: mapStatus.document.scenarioId,
    authoringPath: mapStatus.authoringPath,
    revision: mapStatus.document.revision,
    width: mapStatus.document.width,
    height: mapStatus.document.height
  };
}

function mapIntentCatalogue(mapStatus, activeMap) {
  return {
    contract: mapStatus.mapLibrary?.contract,
    defaultMapId: mapStatus.mapLibrary?.defaultMapId,
    maps: (mapStatus.mapLibrary?.maps || []).map(map => map.id === activeMap.catalogueMapId
      ? { ...map, width: activeMap.width, height: activeMap.height }
      : { ...map, width: map.width || 4, height: map.height || 4 })
  };
}

async function createGoal(prompt, context = {}) {
  const workspace = window.FileManagerRuntime?.getWorkspaceContext?.();
  const preflight = await resolveMapIntentPreflight(prompt, context);
  const mapStatus = window.BsbV2MapAuthoring?.status?.();
  const targetMap = preflight.action === 'create_new'
    ? {
        mapId: preflight.target.mapId,
        catalogueMapId: preflight.target.catalogueMapId,
        authoringPath: preflight.target.authoringPath,
        revision: 0
      }
    : {
        mapId: mapStatus.document.mapId,
        catalogueMapId: mapStatus.activeCatalogueMapId,
        authoringPath: mapStatus.authoringPath,
        revision: mapStatus.document.revision
      };
  const payload = await request('', {
    method: 'POST',
    body: JSON.stringify({
      prompt: cleanPrompt(prompt),
      source: { surface: context.sourceSurface || 'chat', activityAttemptId: context.attemptId || null },
      project: { id: workspace.project.id, name: workspace.project.name, root: workspace.project.root },
      map: targetMap,
      preflight,
      successCriteria: { minimumCreated: 12, minimumPathClearanceTiles: 1.5 }
    })
  });
  state.session = payload.session;
  state.error = null;
  state.expanded = true;
  render();
  activityStage('goal', {
    label: 'Continuing Map Forge goal framed',
    status: 'awaiting_user',
    attemptStatus: 'awaiting_user',
    summary: `${preflight.previousMap.title} → ${preflight.target.title}. Review once, then AXIOM may prepare and design the resolved map until the criteria are met or you pause it.`,
    detail: { sessionId: state.session.id, preflight, authority: state.session.authority, successCriteria: state.session.successCriteria }
  });
  await writeJournalMilestone(`AXIOM level-design goal framed: ${state.session.source.prompt}\nMap preflight: ${preflight.action} · ${preflight.previousMap.title} → ${preflight.target.title} (${preflight.target.mapId}). No authoring change has been applied yet.`, `goal:${state.session.id}`);
  return state.session;
}

async function approve() {
  if (!state.session) return;
  if (!window.SSEBridge?.isConnected?.()) return failVisible('level_design_session_witness_stream_required');
  state.busy = true;
  try {
    const payload = await request(`/${encodeURIComponent(state.session.id)}/control`, {
      method: 'POST',
      body: JSON.stringify({ action: 'approve', clientId: state.clientId })
    });
    state.session = payload.session;
    state.error = null;
    state.running = true;
    syncMapAgentSession();
    activityStage('authority', {
      label: 'Bounded continuing authority approved',
      status: 'completed',
      attemptStatus: 'running',
      summary: 'AXIOM may prepare the resolved map and then use tree, undergrowth and geology brushes. A newly created region is registered and saved immediately; later edits, bake and publish remain visible actions.'
    });
    const mapBefore = window.BsbV2MapAuthoring?.status?.();
    state.expectedAgentRevision = state.session.preflight.playableSpace.requiresPreparation
      ? state.session.map.currentRevision + 1
      : state.session.map.currentRevision;
    const preparation = window.BsbV2MapAuthoring?.agent?.preparePlayableSpace?.({
      sessionId: state.session.id,
      preflight: state.session.preflight
    });
    if (!preparation) throw new Error('level_design_preflight_mapforge_adapter_missing');
    const mapAfter = window.BsbV2MapAuthoring.status();
    if (
      mapAfter.activeCatalogueMapId !== state.session.preflight.target.catalogueMapId
      || mapAfter.document?.mapId !== state.session.preflight.target.mapId
      || mapAfter.authoringPath !== state.session.preflight.target.authoringPath
      || mapAfter.document?.revision !== preparation.afterRevision
    ) {
      throw new Error(`level_design_preflight_readback_failed:${mapAfter.activeCatalogueMapId}:${mapAfter.document?.mapId}:${mapAfter.document?.revision}`);
    }
    let persistence = null;
    if (state.session.preflight.action === 'create_new') {
      const saved = await window.BsbV2MapAuthoring.save();
      const savedMap = window.BsbV2MapAuthoring.status();
      if (saved?.error || savedMap.dirty || savedMap.mapLibraryDirty || !savedMap.saveReceipt?.manifestReceipt) {
        throw new Error(`level_design_new_region_persistence_failed:${saved?.error || savedMap.error || 'readback_incomplete'}`);
      }
      persistence = {
        contract: 'axiom.map-region-registration-persistence.v1',
        saved: true,
        authoringPath: savedMap.authoringPath,
        catalogueMapId: savedMap.activeCatalogueMapId,
        mapId: savedMap.document.mapId,
        revision: savedMap.document.revision,
        authoringReceipt: savedMap.saveReceipt,
        savedAt: new Date().toISOString()
      };
    }
    const preflightReceipt = persistence ? { ...preparation, persistence } : preparation;
    state.session = await record({ type: 'preflight', receipt: preflightReceipt });
    state.lastObservedRevision = preparation.afterRevision;
    state.expectedAgentRevision = null;
    activityStage('preflight_apply', {
      label: preparation.applied ? 'Playable space prepared' : 'Resolved map verified',
      status: 'completed',
      attemptStatus: 'running',
      summary: preparation.applied
        ? `${preparation.catalogueMapId} · ${preparation.dimensions.before.width}×${preparation.dimensions.before.height} → ${preparation.dimensions.after.width}×${preparation.dimensions.after.height} · route ${preparation.route?.authoredLengthTiles || 0} tiles`
        : `${preparation.catalogueMapId} bound at canonical revision ${preparation.afterRevision}`,
      detail: { preparation, persistence, previousMapRevision: mapBefore?.document?.revision ?? null }
    });
    state.running = false;
    syncMapAgentSession();
    render();
    runLoop();
  } catch (error) {
    state.running = false;
    state.expectedAgentRevision = null;
    if (state.session?.authority?.approved) await recordFailure(error, true);
    else failVisible(error);
  } finally {
    state.busy = false;
  }
}

async function pause(reason = 'user_requested') {
  if (!state.session || TERMINAL_STATES.has(state.session.state)) return;
  state.runToken += 1;
  state.running = false;
  window.BsbV2MapAuthoring?.agent?.clearProjection?.();
  try {
    const payload = await request(`/${encodeURIComponent(state.session.id)}/control`, {
      method: 'POST',
      body: JSON.stringify({ action: 'pause', reason, clientId: state.clientId })
    });
    state.session = payload.session;
    syncMapAgentSession();
    activityStage('pause', { label: 'Level-design goal paused', status: 'awaiting_user', attemptStatus: 'awaiting_user', summary: state.session.currentAction, detail: { reason } });
    render();
  } catch (error) {
    failVisible(error);
  }
}

async function resume() {
  if (!state.session) return;
  const map = window.BsbV2MapAuthoring?.status?.();
  if (!map?.document) return failVisible('level_design_session_active_map_required');
  if (!window.SSEBridge?.isConnected?.()) return failVisible('level_design_session_witness_stream_required');
  try {
    const payload = await request(`/${encodeURIComponent(state.session.id)}/control`, {
      method: 'POST',
      body: JSON.stringify({ action: 'resume', clientId: state.clientId, observedRevision: map.document.revision })
    });
    state.session = payload.session;
    state.error = null;
    syncMapAgentSession();
    activityStage('resume', { label: 'Level-design goal resumed', status: 'completed', attemptStatus: 'running', summary: `Re-observing canonical revision ${map.document.revision} before the next plan.` });
    render();
    runLoop();
  } catch (error) {
    failVisible(error);
  }
}

async function stop() {
  if (!state.session) return;
  state.runToken += 1;
  state.running = false;
  window.BsbV2MapAuthoring?.agent?.clearProjection?.();
  try {
    const payload = await request(`/${encodeURIComponent(state.session.id)}/control`, {
      method: 'POST',
      body: JSON.stringify({ action: 'stop', reason: 'user_requested', clientId: state.clientId })
    });
    state.session = payload.session;
    syncMapAgentSession();
    activityComplete('cancelled', 'Level-design goal stopped. Applied work is retained; Undo session remains available.');
    await writeJournalMilestone(`AXIOM level-design goal stopped at revision ${state.session.map.currentRevision}. Applied work was retained and remains available through Undo session.`, `stop:${state.session.id}`);
    render();
  } catch (error) {
    failVisible(error);
  }
}

async function addDirection(direction, source = 'chat') {
  if (!state.session || TERMINAL_STATES.has(state.session.state)) return null;
  try {
    const payload = await request(`/${encodeURIComponent(state.session.id)}/control`, {
      method: 'POST',
      body: JSON.stringify({ action: 'intervene', direction, source, clientId: state.clientId })
    });
    state.session = payload.session;
    activityStage('intervention', { label: 'Human direction queued', status: ACTIVE_STATES.has(state.session.state) ? 'running' : 'awaiting_user', attemptStatus: state.session.state, summary: direction });
    await writeJournalMilestone(`Direction added to AXIOM level-design session ${state.session.id}: ${direction}`, `direction:${state.session.id}:${stableScore(direction)}`);
    render();
    return state.session;
  } catch (error) {
    failVisible(error);
    return null;
  }
}

async function undoSession() {
  if (!state.session || ACTIVE_STATES.has(state.session.state)) return;
  try {
    const receipt = await window.BsbV2MapAuthoring?.agent?.undoSession?.(state.session.id, state.session.batches || [], state.session.preflight);
    if (!receipt?.applied) throw new Error(receipt?.error || 'level_design_session_undo_apply_failed');
    const payload = await record({ type: 'undo', undo: receipt });
    state.session = payload;
    syncMapAgentSession();
    activityReceipt(receipt, 'Session undo receipt');
    activityComplete('completed', `Session undo verified at canonical revision ${receipt.afterRevision}.`);
    await writeJournalMilestone(`AXIOM level-design session undone: ${receipt.removedCount} objects removed at canonical revision ${receipt.afterRevision}.`, `undo:${state.session.id}`);
    render();
  } catch (error) {
    failVisible(error);
  }
}

async function runLoop() {
  if (!state.session || state.running || !ACTIVE_STATES.has(state.session.state)) return;
  state.running = true;
  const token = ++state.runToken;
  syncMapAgentSession();
  try {
    while (token === state.runToken && state.session && ACTIVE_STATES.has(state.session.state)) {
      await runIteration(token);
      if (token !== state.runToken || !ACTIVE_STATES.has(state.session.state)) break;
      await delay(320);
    }
  } catch (error) {
    if (token === state.runToken) await recordFailure(error, true);
  } finally {
    if (token === state.runToken) state.running = false;
    syncMapAgentSession();
    render();
  }
}

async function runIteration(token) {
  assertToken(token);
  const mapRuntime = window.BsbV2MapAuthoring;
  mapRuntime?.setView?.('author');
  const observed = mapRuntime?.status?.();
  if (!observed?.document || observed.active !== true) throw new Error('level_design_session_active_map_required');
  const target = state.session.preflight?.target;
  if (!target
    || observed.activeCatalogueMapId !== target.catalogueMapId
    || observed.document.mapId !== target.mapId
    || observed.authoringPath !== target.authoringPath) {
    throw new Error(`level_design_session_target_binding_lost:${observed.activeCatalogueMapId}:${observed.document.mapId}:${observed.authoringPath}`);
  }
  if (observed.document.mapId !== state.session.map.mapId) throw new Error('level_design_session_map_changed');
  if (observed.document.revision !== state.session.map.currentRevision) {
    await pause('canonical_revision_changed');
    return;
  }
  state.lastObservedRevision = observed.document.revision;
  const pendingDirections = state.session.interventions?.filter(item => item.status === 'queued').map(item => item.text) || [];
  const baseline = evaluateLevelDesignSession(state.session, observed.document);
  activityStage('observe', {
    label: `Iteration ${state.session.iteration + 1} · observe`,
    status: 'completed',
    attemptStatus: 'running',
    summary: `Read canonical revision ${observed.document.revision}: integrity ${baseline.integrityGate.pass ? 'passes' : 'open'}, design ${Math.round(baseline.designGate.score)}/100.`,
    detail: { metrics: baseline.metrics, integrityGate: baseline.integrityGate, designGate: baseline.designGate, nextAction: baseline.nextAction }
  });
  assertToken(token);
  if (baseline.criteriaMet || ['route_revision_required', 'repair_integrity'].includes(baseline.nextAction.kind)) {
    state.session = await record({ type: 'phase', phase: 'evaluating', summary: 'Running the integrity and spatial-quality precheck before another mutation.' });
    state.session = await record({ type: 'evaluation', evaluation: baseline });
    activityStage('evaluate', {
      label: `Iteration ${state.session.iteration} · quality precheck`,
      status: state.session.state === 'completed' ? 'completed' : 'awaiting_user',
      attemptStatus: state.session.state,
      summary: baseline.summary,
      detail: { integrityGate: baseline.integrityGate, designGate: baseline.designGate, nextAction: baseline.nextAction }
    });
    render();
    if (state.session.state === 'completed') await completeSession(baseline);
    return;
  }
  if (baseline.nextAction.kind === 'boundary_enforcement_required') {
    await runBoundaryEnforcement(token, observed, baseline);
    return;
  }
  const actionTarget = baseline.nextAction;
  const requestedFamily = actionTarget.family;
  if (!REQUIRED_FAMILIES.includes(requestedFamily)) throw new Error(`level_design_quality_target_family_missing:${actionTarget.kind}`);
  state.session = await record({
    type: 'phase',
    phase: 'planning',
    summary: `Planning one ${requestedFamily} revision for ${actionTarget.zoneKind || actionTarget.zoneId || 'the weakest route zone'}.`
  });
  render();
  const plan = await requestModelPlan(requestedFamily, observed.document, baseline, pendingDirections, actionTarget, token);
  assertToken(token);
  activityStage('plan', {
    label: `Iteration ${state.session.iteration} · plan ${requestedFamily} · ${actionTarget.zoneKind || 'target zone'}`,
    status: 'completed',
    attemptStatus: 'running',
    summary: plan.summary,
    detail: { rationale: plan.rationale, target: actionTarget, plan }
  });
  const centers = derivePathCorridorStrokeCenters(observed.document, plan, { seed: `${state.session.id}:${state.session.iteration}` });
  const options = brushOptions(plan, state.session);
  state.session = await record({ type: 'phase', phase: 'previewing', summary: `Projecting ${requestedFamily} candidates through ${actionTarget.zoneKind || actionTarget.zoneId || 'the selected route zone'} at ${centers.length} real brush centres.` });
  render();
  let preview = null;
  for (let count = 1; count <= centers.length; count += 1) {
    assertToken(token);
    preview = mapRuntime.agent.preview({
      sessionId: state.session.id,
      family: requestedFamily,
      strokeCenters: centers.slice(0, count),
      options,
      label: `AXIOM · ${requestedFamily} · stroke ${count}/${centers.length}`
    });
    await delay(ANIMATION_STEP_MS);
  }
  if (!preview?.candidates?.length) throw new Error(`level_design_preview_empty:${requestedFamily}`);
  const previewClearance = preview.candidates.filter(candidate => distanceToPath(candidate.x, candidate.y, collectPathTiles(observed.document)) < state.session.successCriteria.minimumPathClearanceTiles);
  if (previewClearance.length) throw new Error(`level_design_preview_path_clearance:${previewClearance.length}`);
  state.session = await record({
    type: 'projection',
    projection: {
      id: preview.previewId,
      family: requestedFamily,
      sourceRevision: preview.sourceRevision,
      candidateCount: preview.candidates.length,
      blockedCount: preview.diagnostics?.blocked || 0,
      strokeCenters: preview.strokeCenters
    }
  });
  activityStage('preview', {
    label: `Iteration ${state.session.iteration} · preview`,
    status: 'completed',
    attemptStatus: 'running',
    summary: `${preview.candidates.length} real Map Forge candidates visible; ${preview.diagnostics?.blocked || 0} collisions or terrain conflicts rejected.`,
    detail: { previewId: preview.previewId, classification: 'projection', diagnostics: preview.diagnostics }
  });
  assertToken(token);
  state.session = await record({ type: 'phase', phase: 'applying', summary: `Applying one revision-bound ${requestedFamily} batch.` });
  render();
  state.expectedAgentRevision = preview.sourceRevision + 1;
  const receipt = mapRuntime.agent.commit({ sessionId: state.session.id, family: requestedFamily, preview });
  const readback = mapRuntime.status();
  const createdIds = receipt.createdIds || [];
  const readbackIds = createdIds.filter(id => readback.document.sceneObjects.some(record => record.id === id));
  if (readback.document.revision !== receipt.afterRevision || readbackIds.length !== createdIds.length) {
    throw new Error(`level_design_apply_readback_failed:${readbackIds.length}:${createdIds.length}`);
  }
  state.session = await record({
    type: 'batch',
    batch: {
      id: `batch_${state.session.iteration}_${requestedFamily}_${receipt.afterRevision}`,
      family: requestedFamily,
      plan,
      projectionId: preview.previewId,
      receipt,
      readback: { ok: true, revision: readback.document.revision, foundIds: readbackIds }
    }
  });
  state.lastObservedRevision = receipt.afterRevision;
  state.expectedAgentRevision = null;
  activityReceipt(receipt, `Iteration ${state.session.iteration} · apply receipt`, { readback: { revision: readback.document.revision, foundIds: readbackIds } });
  state.session = await record({ type: 'phase', phase: 'evaluating', summary: `Rescoring ${actionTarget.zoneKind || actionTarget.zoneId || 'the route'} after the committed ${requestedFamily} layer.` });
  const evaluation = evaluateLevelDesignSession(state.session, readback.document);
  state.session = await record({ type: 'evaluation', evaluation });
  activityStage('evaluate', {
    label: `Iteration ${state.session.iteration} · evaluate`,
    status: 'completed',
    attemptStatus: state.session.state === 'completed' ? 'completed' : 'running',
    summary: evaluation.summary,
    detail: { metrics: evaluation.metrics, integrityGate: evaluation.integrityGate, designGate: evaluation.designGate, nextAction: evaluation.nextAction }
  });
  render();
  if (state.session.state === 'completed') await completeSession(evaluation);
}

async function runBoundaryEnforcement(token, observed, baseline) {
  const mapRuntime = window.BsbV2MapAuthoring;
  state.session = await record({
    type: 'phase',
    phase: 'planning',
    summary: 'Compiling the authored playable envelope into a visible natural ridge, then testing it against the game collision system.'
  });
  activityStage('boundary_plan', {
    label: `Iteration ${state.session.iteration} · boundary plan`,
    status: 'completed',
    attemptStatus: 'running',
    summary: `${baseline.designGate.boundaryQuality.shortcutPolicy} shortcuts · ${baseline.designGate.boundaryQuality.style.replace(/_/g, ' ')} · runtime evidence required before commit.`,
    detail: { boundaryQuality: baseline.designGate.boundaryQuality, nextAction: baseline.nextAction }
  });
  state.session = await record({ type: 'phase', phase: 'previewing', summary: 'Projecting collision-bearing ridge tiles around the playable envelope.' });
  render();
  let preview = null;
  let audit = null;
  const corridorInsets = [0, 2, 4, 6];
  for (let attemptIndex = 0; attemptIndex < corridorInsets.length; attemptIndex += 1) {
    assertToken(token);
    const corridorInsetTiles = corridorInsets[attemptIndex];
    preview = mapRuntime.agent.previewBoundary({
      sessionId: state.session.id,
      corridorInsetTiles,
      label: `AXIOM · ${baseline.designGate.boundaryQuality.style.replace(/_/g, ' ')} boundary · attempt ${attemptIndex + 1}`
    });
    if (!preview?.candidateCount || !preview.preparedDocument) throw new Error('level_design_boundary_preview_empty');
    state.session = await record({
      type: 'projection',
      projection: {
        id: preview.previewId,
        family: 'boundary',
        sourceRevision: preview.sourceRevision,
        candidateCount: preview.candidateCount,
        blockedCount: 0,
        strokeCenters: preview.candidates.slice(0, 48)
      }
    });
    activityStage(`boundary_preview_${attemptIndex + 1}`, {
      label: `Iteration ${state.session.iteration} · boundary preview ${attemptIndex + 1}/${corridorInsets.length}`,
      status: 'completed',
      attemptStatus: 'running',
      summary: `${preview.candidateCount} proposed ridge tiles are highlighted; corridor inset ${corridorInsetTiles} tiles; nothing committed.`,
      detail: { previewId: preview.previewId, classification: 'projection', boundaryStyle: preview.boundaryStyle, corridorInsetTiles }
    });
    audit = await requestRuntimeTraversalAudit(preview.preparedDocument);
    activityStage(`boundary_audit_${attemptIndex + 1}`, {
      label: `Iteration ${state.session.iteration} · runtime collision audit ${attemptIndex + 1}/${corridorInsets.length}`,
      status: audit.pass ? 'completed' : 'running',
      attemptStatus: 'running',
      summary: audit.pass
        ? `Escape reachable; legal traversal is ${Math.round(audit.shortcutRatio * 100)}% of the authored route (minimum ${Math.round(audit.minimumShortcutRatio * 100)}%).`
        : `Rejected ${audit.failureReason}; tightening the playable envelope and trying again.`,
      detail: audit
    });
    if (audit.pass) break;
  }
  if (!audit?.pass) throw new Error(`level_design_boundary_audit_rejected_after_iteration:${audit?.failureReason || 'unknown'}`);
  assertToken(token);
  state.session = await record({ type: 'phase', phase: 'applying', summary: 'Applying the collision-audited natural ridge in one revision-bound batch.' });
  state.expectedAgentRevision = preview.sourceRevision + 1;
  const receipt = mapRuntime.agent.commitBoundary({ sessionId: state.session.id, preview, audit });
  const readback = mapRuntime.status();
  if (readback.document.revision !== receipt.afterRevision
    || readback.document.playableSpace?.boundaries?.enforcementStatus !== 'runtime_verified') {
    throw new Error('level_design_boundary_apply_readback_failed');
  }
  state.session = await record({
    type: 'batch',
    batch: {
      id: `batch_${state.session.iteration}_boundary_${receipt.afterRevision}`,
      family: 'boundary',
      plan: { kind: 'natural_ridge_boundary', shortcutPolicy: audit.shortcutPolicy, source: 'deterministic_envelope_compiler' },
      projectionId: preview.previewId,
      receipt,
      readback: { ok: true, revision: readback.document.revision, enforcementStatus: 'runtime_verified' }
    }
  });
  state.lastObservedRevision = receipt.afterRevision;
  state.expectedAgentRevision = null;
  activityStage('boundary_apply', {
    label: `Iteration ${state.session.iteration} · boundary receipt`,
    status: 'completed',
    attemptStatus: 'running',
    summary: `${receipt.changedTileCount} collision-bearing ridge tiles committed at canonical revision ${receipt.afterRevision}.`,
    detail: { receipt, readback: { revision: readback.document.revision, enforcementStatus: 'runtime_verified' } }
  });
  state.session = await record({ type: 'phase', phase: 'evaluating', summary: 'Rescoring the playable space after verified shortcut enforcement.' });
  const evaluation = evaluateLevelDesignSession(state.session, readback.document);
  state.session = await record({ type: 'evaluation', evaluation });
  activityStage('evaluate', {
    label: `Iteration ${state.session.iteration} · evaluate boundaries`,
    status: 'completed',
    attemptStatus: state.session.state === 'completed' ? 'completed' : 'running',
    summary: evaluation.summary,
    detail: { designGate: evaluation.designGate, nextAction: evaluation.nextAction, runtimeAudit: audit }
  });
  render();
  if (state.session.state === 'completed') await completeSession(evaluation);
}

async function requestRuntimeTraversalAudit(document) {
  const response = await fetch('/api/mapforge/runtime-traversal-audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: state.session.id, document })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false || !payload.audit) throw new Error(payload.error || `runtime_traversal_audit_http_${response.status}`);
  return payload.audit;
}

async function completeSession(evaluation) {
  window.BsbV2MapAuthoring?.agent?.clearProjection?.();
  syncMapAgentSession();
  activityComplete('completed', `Integrity and design quality passed at canonical revision ${state.session.map.currentRevision}. Save and bake remain yours.`);
  await writeJournalMilestone(`AXIOM level-design goal completed at canonical revision ${state.session.map.currentRevision}: ${evaluation.summary} Source remains unsaved and was not baked or published automatically.`, `complete:${state.session.id}`);
}

async function requestModelPlan(requestedFamily, document, baseline, pendingDirections, target, token) {
  const model = window.ModelBus?.getCurrent?.();
  if (!model) throw new Error('level_design_local_model_unavailable');
  const modelName = model.model || model.endpoint?.name || 'local_model';
  const context = {
    mapId: document.mapId,
    revision: document.revision,
    dimensions: `${document.width}x${document.height}`,
    requiredNextLayer: requestedFamily,
    target: {
      zoneId: target.zoneId,
      zoneKind: target.zoneKind,
      startFraction: target.startFraction,
      endFraction: target.endFraction,
      requiredAction: target.kind,
      summary: target.summary
    },
    spatialScorecard: {
      score: baseline.designGate.score,
      reasons: baseline.designGate.reasons.slice(0, 8),
      zones: baseline.designGate.zones,
      routeQuality: baseline.designGate.routeQuality
    },
    integrityGate: baseline.integrityGate,
    humanDirections: pendingDirections,
    goal: state.session.source.prompt
  };
  const system = `You are AXIOM's environmental level designer working through Map Forge. A deterministic spatial critic has selected the weakest pacing zone and required family. Choose the aesthetic treatment for ONE bounded brush batch in that exact zone. Map Forge, not you, calculates exact coordinates, collision rejection, quality scores and canonical apply receipts. Return one JSON object only, with no markdown and no hidden reasoning.

Required family: ${requestedFamily}
Target zone: ${target.zoneKind || target.zoneId || 'selected zone'} (${Math.round(Number(target.startFraction || 0) * 100)}%-${Math.round(Number(target.endFraction || 1) * 100)}% of the authored route)
Allowed variants: ${PLAN_VARIANTS[requestedFamily].join(', ')}
Safe bounds: bandMin integer 4-8; bandMax integer greater than bandMin and at most 11; radiusTiles integer 1-2; density 0.15-0.85; falloff 0-0.9.

Shape:
{"summary":"Frame the selected pacing zone with an irregular readable edge.","rationale":"The current scorecard shows this zone is the weakest part of the route.","family":"${requestedFamily}","bandMin":4,"bandMax":7,"radiusTiles":2,"density":0.36,"falloff":0.65,"variant":"${PLAN_VARIANTS[requestedFamily][0]}"}

Do not output coordinates or alter the target zone. Do not copy the example wording. Do not claim success. Do not choose another family.`;
  const messages = [{ role: 'user', content: `Plan the next Map Forge batch from this canonical observation:\n${JSON.stringify(context, null, 2)}` }];
  let raw = null;
  let firstError = null;
  const invocationBase = `model_${state.session.id}_${state.session.iteration}_${Date.now()}`;
  try {
    raw = await window.ModelBus.complete(messages, { system, max_tokens: 320, timeoutMs: 30000, think: false });
    assertToken(token);
    const plan = normalizeLevelDesignPlan(parseModelJson(raw), requestedFamily, target);
    state.session = await record({ type: 'model_invocation', invocation: { id: invocationBase, model: modelName, requestedFamily, ok: true, repair: false, responseSummary: plan.summary, plan, invokedAt: new Date().toISOString() } });
    return plan;
  } catch (error) {
    if (String(error?.message || error) === 'level_design_session_interrupted') throw error;
    firstError = String(error?.message || error);
    state.session = await record({ type: 'model_invocation', invocation: { id: invocationBase, model: modelName, requestedFamily, ok: false, repair: false, responseSummary: boundedText(raw, 500), error: firstError, invokedAt: new Date().toISOString() } });
  }
  const repairId = `${invocationBase}_repair`;
  try {
    const repairRaw = await window.ModelBus.complete([
      ...messages,
      { role: 'assistant', content: String(raw || '') },
      { role: 'user', content: `Your previous response failed validation: ${firstError}. Return only a corrected JSON object matching the exact shape and required family.` }
    ], { system, max_tokens: 320, timeoutMs: 30000, think: false });
    assertToken(token);
    const plan = normalizeLevelDesignPlan(parseModelJson(repairRaw), requestedFamily, target);
    state.session = await record({ type: 'model_invocation', invocation: { id: repairId, model: modelName, requestedFamily, ok: true, repair: true, responseSummary: plan.summary, plan, invokedAt: new Date().toISOString() } });
    return plan;
  } catch (error) {
    state.session = await record({ type: 'model_invocation', invocation: { id: repairId, model: modelName, requestedFamily, ok: false, repair: true, error: String(error?.message || error), invokedAt: new Date().toISOString() } });
    throw new Error(`level_design_model_plan_invalid_after_repair:${String(error?.message || error)}`);
  }
}

function brushOptions(plan, session) {
  const seed = Math.max(1, stableScore(`${session.id}:${session.iteration}:${plan.family}:${plan.variant}`) % 2147483647);
  const shared = { radiusTiles: plan.radiusTiles, density: plan.density, falloff: plan.falloff, seed };
  if (plan.family === 'tree') return {
    ...shared,
    family: 'tree',
    treeType: plan.variant === 'silver_birch' ? 'birch_tree' : 'tree',
    treeSpecies: plan.variant
  };
  if (plan.family === 'geology') return { ...shared, family: 'geology', geologyFormation: plan.variant };
  const speciesMix = plan.variant === 'fern_heavy'
    ? { wood_fern: .72, forest_shrub: .22, ember_bramble: .06 }
    : plan.variant === 'ember_edge'
      ? { wood_fern: .36, forest_shrub: .28, ember_bramble: .36 }
      : { wood_fern: .46, forest_shrub: .46, ember_bramble: .08 };
  return { ...shared, woodFernType: 'fern_patch', speciesMix };
}

async function record(payload) {
  const response = await request(`/${encodeURIComponent(state.session.id)}/records`, { method: 'POST', body: JSON.stringify(payload) });
  state.session = response.session;
  render();
  return response.session;
}

async function recordFailure(error, awaitingUser = false) {
  const signature = boundedText(error?.message || error, 300);
  try {
    state.session = await record({ type: 'failure', signature, awaitingUser, summary: `AXIOM paused visibly: ${signature}` });
  } catch (recordError) {
    state.error = `${signature} · evidence write failed: ${String(recordError?.message || recordError)}`;
  }
  state.runToken += 1;
  state.running = false;
  state.expectedAgentRevision = null;
  window.BsbV2MapAuthoring?.agent?.clearProjection?.();
  syncMapAgentSession();
  activityStage('recovering', { label: awaitingUser ? 'Paused for direction' : 'Recovering', status: 'awaiting_user', attemptStatus: 'awaiting_user', summary: signature });
  render();
}

function syncMapAgentSession() {
  if (!state.session || !window.BsbV2MapAuthoring?.agent) return;
  const active = ACTIVE_STATES.has(state.session.state) && state.running !== false;
  window.BsbV2MapAuthoring.agent.setSession({
    sessionId: state.session.id,
    status: state.session.state,
    active,
    follow: state.follow
  });
}

function activityAttemptId() {
  return state.session?.source?.activityAttemptId || null;
}

function activityStage(phase, input) {
  const attemptId = activityAttemptId();
  if (attemptId) window.AgentActivityRuntime?.stage?.(attemptId, phase, input);
}

function activityReceipt(receipt, label, detail = null) {
  const attemptId = activityAttemptId();
  if (!attemptId) return;
  window.AgentActivityRuntime?.receipt?.(attemptId, receipt, {
    phase: 'apply',
    label,
    status: 'completed',
    attemptStatus: 'running',
    summary: `${receipt.createdCount ?? receipt.removedCount ?? 0} records · revision ${receipt.afterRevision}`,
    detail
  });
}

function activityComplete(status, summary) {
  const attemptId = activityAttemptId();
  if (attemptId) window.AgentActivityRuntime?.complete?.(attemptId, { status, summary, detail: { sessionId: state.session?.id, revision: state.session?.map?.currentRevision } });
}

async function writeJournalMilestone(text, key) {
  if (state.journaled.has(key)) return;
  const workspace = window.FileManagerRuntime?.getWorkspaceContext?.();
  if (!workspace?.project?.id || !workspace.project.root) return;
  state.journaled.add(key);
  try {
    const response = await fetch('/api/project-diary/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: workspace.project.id,
        projectRoot: workspace.project.root,
        text,
        source: { text, classification: 'level_design_session_milestone' },
        provenance: { sourceSurface: 'level_design_session', capturedBy: 'AXIOM LevelDesignSessionRuntime' }
      })
    });
    if (!response.ok) throw new Error(`journal_http_${response.status}`);
    window.ProjectDiaryRuntime?.load?.();
  } catch (error) {
    state.error = `Journal milestone not recorded: ${String(error?.message || error)}`;
    render();
  }
}

async function tryHandlePrompt(prompt, context = {}) {
  const clean = cleanPrompt(prompt);
  if (!clean) return { handled: false };
  state.messageSink = typeof context.addMsg === 'function' ? context.addMsg : state.messageSink;
  if (state.session && !TERMINAL_STATES.has(state.session.state) && state.session.authority.approved) {
    await addDirection(clean, context.sourceSurface || 'chat');
    state.messageSink?.('assistant', `Direction queued for the next safe Map Forge boundary: ${clean}`);
    return { handled: true, ok: true, session: state.session, intervention: true };
  }
  if (!isLevelDesignGoal(clean)) return { handled: false };
  return startGoal(clean, context);
}

async function startGoal(prompt, context = {}) {
  const clean = cleanPrompt(prompt);
  if (!clean) return { handled: true, ok: false, error: 'level_design_prompt_required' };
  state.messageSink = typeof context.addMsg === 'function' ? context.addMsg : state.messageSink;
  if (state.session && !TERMINAL_STATES.has(state.session.state)) {
    const error = `level_design_session_already_active:${state.session.id}:${state.session.state}`;
    state.messageSink?.('system', `Level-design goal blocked: ${error}`);
    return { handled: true, ok: false, error };
  }
  try {
    await createGoal(clean, context);
    state.messageSink?.('assistant', `Map preflight resolved ${state.session.preflight.previousMap.title} → ${state.session.preflight.target.title} (${state.session.preflight.action.replace(/_/g, ' ')}). Review the target and playable-space estimate once, then approve; you can watch, pause, redirect, stop, or undo from the live goal strip.`);
    return { handled: true, ok: true, awaitingApproval: true, session: state.session };
  } catch (error) {
    failVisible(error);
    const errorCode = String(error?.message || error);
    const summary = describePreflightFailure(errorCode);
    if (context.attemptId) window.AgentActivityRuntime?.complete?.(context.attemptId, {
      phase: 'preflight',
      status: 'blocked',
      label: 'Map preflight blocked',
      summary,
      detail: { error: errorCode, mapChanged: false }
    });
    state.messageSink?.('system', `Level-design goal blocked: ${summary}`);
    return { handled: true, ok: false, error: String(error?.message || error) };
  }
}

function describePreflightFailure(errorCode) {
  const value = String(errorCode || 'level_design_preflight_failed');
  if (value.startsWith('level_design_playable_space_profile_')) {
    return 'The canonical project planning profile could not be loaded. No map changes were made. Reload AXIOM or reopen the project, then retry.';
  }
  if (value.startsWith('level_design_workspace_changed_during_profile_refresh')) {
    return 'The active project changed while Map Forge was preparing. No map changes were made; retry in the intended project.';
  }
  return `Map preflight stopped before authoring: ${value}`;
}

function bindRuntimeEvents() {
  window.EDITOR?.events?.on?.('bsb:humanAuthoringTakeover', event => {
    if (event?.sessionId !== state.session?.id || !ACTIVE_STATES.has(state.session?.state)) return;
    pause('human_authoring_takeover');
  });
  window.EDITOR?.events?.on?.('sse:connectionChanged', connection => {
    const connected = connection?.connected === true || connection?.state === 'live';
    if (!connected && ACTIVE_STATES.has(state.session?.state)) pause('sse_disconnected');
  });
  window.EDITOR?.events?.on?.('workspace:surfaceStateChanged', event => {
    if (event?.surfaceId !== 'bsb-v2-map-authoring' || !ACTIVE_STATES.has(state.session?.state)) return;
    const revision = event.state?.revision;
    if (Number.isInteger(revision) && revision === state.expectedAgentRevision) return;
    if (Number.isInteger(revision) && Number.isInteger(state.session?.map?.currentRevision) && revision !== state.session.map.currentRevision && revision !== state.lastObservedRevision) {
      pause('canonical_revision_changed');
    }
  });
  window.addEventListener('pagehide', () => {
    if (!state.session || !ACTIVE_STATES.has(state.session.state) || !navigator.sendBeacon) return;
    const body = new Blob([JSON.stringify({ action: 'disconnect', clientId: state.clientId, reason: 'witness_client_pagehide' })], { type: 'application/json' });
    navigator.sendBeacon(`${API_ROOT}/${encodeURIComponent(state.session.id)}/control`, body);
  });
}

async function restoreSessionTarget(session) {
  if (!session?.preflight || session.undo) return;
  // Completed session receipts are history, not authoring state. Replaying an old
  // unsaved create-new preparation here can replace a newer canonical source in
  // memory, which a later explicit Save or region creation would then overwrite.
  if (TERMINAL_STATES.has(session.state)) return;
  let map = window.BsbV2MapAuthoring?.status?.();
  if (!map?.document) return;
  const persistedNewRegion = session.preflight.action === 'create_new' && session.preflight.receipt?.persistence?.saved === true;
  if (persistedNewRegion && map.activeCatalogueMapId !== session.preflight.target.catalogueMapId) {
    if (map.dirty) throw new Error(`level_design_restore_target_unsaved_map_blocked:${map.activeCatalogueMapId}`);
    const switched = await window.BsbV2MapAuthoring.selectRegion(session.preflight.target.catalogueMapId);
    if (switched?.error) throw new Error(switched.error);
    map = window.BsbV2MapAuthoring.status();
  } else if (session.preflight.receipt?.preparedDocument && session.preflight.receipt.applied && !persistedNewRegion) {
    window.BsbV2MapAuthoring.agent.restorePlayableSpace({ sessionId: session.id, preflight: session.preflight });
    map = window.BsbV2MapAuthoring.status();
  } else if (session.preflight.action !== 'create_new' && map.activeCatalogueMapId !== session.preflight.target.catalogueMapId) {
    if (map.dirty) throw new Error(`level_design_restore_target_unsaved_map_blocked:${map.activeCatalogueMapId}`);
    const switched = await window.BsbV2MapAuthoring.selectRegion(session.preflight.target.catalogueMapId);
    if (switched?.error) throw new Error(switched.error);
    map = window.BsbV2MapAuthoring.status();
  }
  if (session.preflight.action !== 'create_new' || session.preflight.receipt) {
    if (map.activeCatalogueMapId !== session.preflight.target.catalogueMapId
      || map.document?.mapId !== session.preflight.target.mapId
      || map.authoringPath !== session.preflight.target.authoringPath) {
      throw new Error(`level_design_restore_target_readback_failed:${map.activeCatalogueMapId}:${map.document?.mapId}:${map.authoringPath}`);
    }
  }
}

async function loadLatest() {
  const workspace = window.FileManagerRuntime?.getWorkspaceContext?.();
  if (!workspace?.project?.id) return null;
  try {
    const payload = await request(`/latest?projectId=${encodeURIComponent(workspace.project.id)}`);
    state.session = payload.session;
    await restoreSessionTarget(state.session);
    if (state.session && ACTIVE_STATES.has(state.session.state)) {
      const paused = await request(`/${encodeURIComponent(state.session.id)}/control`, {
        method: 'POST',
        body: JSON.stringify({ action: 'pause', reason: 'witness_client_reconnected_requires_resume', clientId: state.clientId })
      });
      state.session = paused.session;
    }
    syncMapAgentSession();
    render();
    return state.session;
  } catch (error) {
    state.error = String(error?.message || error);
    render();
    return null;
  }
}

async function init() {
  ensureSurface();
  bindRuntimeEvents();
  state.heartbeatTimer = setInterval(async () => {
    if (!state.session || !ACTIVE_STATES.has(state.session.state)) return;
    try {
      const payload = await request(`/${encodeURIComponent(state.session.id)}/control`, {
        method: 'POST',
        body: JSON.stringify({ action: 'heartbeat', clientId: state.clientId })
      });
      state.session = payload.session;
    } catch (error) {
      await pause(`heartbeat_failed:${String(error?.message || error)}`);
    }
  }, 2500);
  window.EDITOR?.events?.on?.('fileManager:stateChanged', () => loadLatest());
  await delay(0);
  await loadLatest();
  render();
  return status();
}

function status() {
  return {
    contract: LEVEL_DESIGN_CLIENT_CONTRACT,
    clientId: state.clientId,
    running: state.running,
    follow: state.follow,
    session: state.session ? JSON.parse(JSON.stringify(state.session)) : null,
    mapAgent: window.BsbV2MapAuthoring?.agent?.status?.() || null,
    error: state.error
  };
}

function assertToken(token) {
  if (token !== state.runToken || !state.session || !ACTIVE_STATES.has(state.session.state)) throw new Error('level_design_session_interrupted');
}

function failVisible(error) {
  state.error = String(error?.message || error);
  state.expanded = true;
  render();
  return { ok: false, error: state.error };
}

function cleanPrompt(value) {
  return String(value || '').replace(/^\[Current Journal draft context:[\s\S]*?\]\s*/i, '').trim();
}

function parseModelJson(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('level_design_model_json_missing');
  return JSON.parse(text.slice(start, end + 1));
}

function collectPathTiles(document) {
  const result = [];
  for (let y = 0; y < (document?.height || 0); y += 1) {
    for (let x = 0; x < (document?.width || 0); x += 1) if (document.tiles[y]?.[x] === 'dirt') result.push({ x, y });
  }
  return result;
}

function distanceToPath(x, y, pathTiles) {
  let minimum = Number.POSITIVE_INFINITY;
  for (const point of pathTiles) minimum = Math.min(minimum, Math.hypot(x - point.x, y - point.y));
  return minimum;
}

function stableScore(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function boundedText(value, limit) {
  const text = String(value ?? '');
  return text.length > limit ? text.slice(0, limit) : text;
}

function boundedInteger(value, label, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`level_design_plan_integer_invalid:${label}`);
  return number;
}

function boundedNumber(value, label, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`level_design_plan_number_invalid:${label}`);
  return number;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function formatTime(value) {
  try { return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

const LevelDesignSessionRuntime = {
  init,
  status,
  tryHandlePrompt,
  startGoal,
  approve,
  pause,
  resume,
  stop,
  addDirection,
  undoSession,
  loadLatest
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.LevelDesignSessionRuntime = LevelDesignSessionRuntime;
  init().catch(failVisible);
}

export { LevelDesignSessionRuntime };
