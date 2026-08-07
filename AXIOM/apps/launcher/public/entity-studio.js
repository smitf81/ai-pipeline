import {
  BSB_V2_GEOLOGY_RECIPE_OPTIONS,
  applyBsbV2GeologyOperation as projectGeologyCandidate
} from './bsb-v2-geology-authoring.js';

export const ENTITY_STUDIO_CONTRACTS = Object.freeze({
  command: 'axiom.entity-authoring.command.v0',
  response: 'axiom.entity-authoring.response.v0',
  ready: 'axiom.entity-authoring.ready.v0',
  target: 'axiom.entity-authoring-target.v0',
  candidate: 'axiom.entity-authoring-candidate.v0',
  receipt: 'axiom.entity-authoring-apply-receipt.v0'
});

const GEOLOGY_FIELDS = Object.freeze([
  { path: 'geology.formation', group: 'Formation', label: 'Formation', type: 'select', options: BSB_V2_GEOLOGY_RECIPE_OPTIONS },
  { path: 'geology.seed', group: 'Formation', label: 'Seed', min: 1, max: 2147483647, step: 1 },
  { path: 'geology.scale', group: 'Shape', label: 'Scale', min: .45, max: 2.4, step: .01 },
  { path: 'geology.heightMeters', group: 'Shape', label: 'Height', min: .3, max: 4.2, step: .01 },
  { path: 'geology.angularity', group: 'Shape', label: 'Angularity', min: 0, max: 1, step: .01 },
  { path: 'geology.strataDensity', group: 'Surface', label: 'Strata', min: 0, max: 1, step: .01 },
  { path: 'geology.erosion', group: 'Surface', label: 'Erosion', min: 0, max: 1, step: .01 },
  { path: 'geology.crackDensity', group: 'Surface', label: 'Cracks', min: 0, max: 1, step: .01 },
  { path: 'geology.fracture', group: 'Surface', label: 'Fracture', min: 0, max: 1, step: .01 },
  { path: 'geology.moss', group: 'Weathering', label: 'Moss', min: 0, max: 1, step: .01 },
  { path: 'geology.wetness', group: 'Weathering', label: 'Wetness', min: 0, max: 1, step: .01 }
]);

const state = {
  open: false,
  connection: 'connecting',
  connectionLabel: 'Waiting for BSB runtime',
  targets: [],
  selectedId: null,
  selectionExplicit: false,
  candidate: null,
  lastReceipt: null,
  error: null,
  query: '',
  requestSequence: 0,
  refreshSequence: 0,
  diagnostics: { responseCount: 0, lastResponseId: null, lastResponseContract: null, lastResponseAccepted: false, pendingAtResponse: [] },
  pending: new Map()
};

let root = null;
let launchButton = null;
let activeRefresh = null;
let refreshTimer = null;

function mount() {
  const previewBody = document.querySelector('#project-preview-panel .project-preview-body');
  const previewHead = document.querySelector('#project-preview-panel .project-preview-head');
  if (!previewBody || !previewHead || document.getElementById('entity-studio')) return false;
  launchButton = document.createElement('button');
  launchButton.type = 'button';
  launchButton.className = 'project-preview-btn entity-studio-launch';
  launchButton.textContent = 'Entities';
  launchButton.title = 'Open Entity Studio';
  launchButton.dataset.testid = 'entity-studio-launch';
  launchButton.addEventListener('click', () => toggle());
  previewHead.insertBefore(launchButton, previewHead.querySelector('.project-preview-btn'));

  root = document.createElement('aside');
  root.id = 'entity-studio';
  root.className = 'entity-studio';
  root.hidden = true;
  root.setAttribute('aria-label', 'Entity Studio');
  root.dataset.testid = 'entity-studio';
  previewBody.appendChild(root);
  window.addEventListener('message', onRuntimeMessage);
  document.getElementById('project-preview-frame')?.addEventListener('load', () => {
    resetRuntimeConnection('iframe_loaded');
    if (state.open) scheduleRefresh(650);
  });
  window.EDITOR?.events?.on?.('workspace:surfaceStateChanged', () => {
    if (state.open) {
      mergeTargets(state.targets.filter(isRuntimeTarget), stationaryTargets());
      render();
    }
  });
  render();
  return true;
}

async function toggle(force = !state.open) {
  state.open = Boolean(force);
  root.hidden = !state.open;
  launchButton.dataset.active = String(state.open);
  launchButton.setAttribute('aria-pressed', String(state.open));
  if (state.open) {
    if (window.BsbV2MapAuthoring?.workspaceState?.().active) window.BsbV2MapAuthoring.setView('runtime');
    window.clearTimeout(refreshTimer);
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    await refresh();
  } else if (state.connection === 'ready') {
    await runtimeCommand('session.end').catch(() => {});
  }
  return status();
}

async function refresh() {
  if (activeRefresh) return activeRefresh;
  activeRefresh = performRefresh();
  try { return await activeRefresh; }
  finally { activeRefresh = null; }
}

async function performRefresh() {
  const refreshId = ++state.refreshSequence;
  state.connection = 'connecting';
  state.connectionLabel = 'Reading provider manifests';
  state.error = null;
  mergeTargets(state.targets.filter(isRuntimeTarget), stationaryTargets());
  render();
  try {
    const snapshot = await runtimeCommand('state.snapshot');
    if (refreshId !== state.refreshSequence) return status();
    acceptRuntimeSnapshot(snapshot);
    if (!state.selectionExplicit) state.selectedId = preferredTarget(state.targets)?.targetId ?? state.selectedId;
    const selected = state.targets.find((target) => target.targetId === state.selectedId);
    if (isRuntimeTarget(selected)) {
      const focused = await runtimeCommand('session.begin', { targetId: selected.targetId });
      replaceTarget(focused?.target);
    }
    state.connection = 'ready';
    state.connectionLabel = 'Runtime bridge ready';
  } catch (error) {
    if (refreshId !== state.refreshSequence) return status();
    state.connection = state.targets.length ? 'degraded' : 'error';
    state.connectionLabel = state.targets.length ? 'Runtime unavailable · authoring providers remain' : 'BSB runtime unavailable';
    state.error = String(error?.message || error);
  }
  render();
  return status();
}

function scheduleRefresh(delay) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => refresh(), delay);
}

function onRuntimeMessage(event) {
  const message = event?.data;
  if (message?.contract === ENTITY_STUDIO_CONTRACTS.ready && message.source === 'black-sky-bound-v2') {
    acceptRuntimeSnapshot(message.result);
    state.connection = 'connecting';
    state.connectionLabel = 'Runtime announced · verifying command channel';
    render();
    return;
  }
  acceptRuntimeResponse(message);
}

function acceptRuntimeResponse(message) {
  state.diagnostics.responseCount += 1;
  state.diagnostics.lastResponseId = message?.id ?? null;
  state.diagnostics.lastResponseContract = message?.contract ?? null;
  state.diagnostics.pendingAtResponse = [...state.pending.keys()];
  state.diagnostics.lastResponseAccepted = false;
  if (message?.contract !== ENTITY_STUDIO_CONTRACTS.response || message.target !== 'axiom') return false;
  const pending = state.pending.get(message.id);
  if (!pending) return false;
  state.diagnostics.lastResponseAccepted = true;
  state.pending.delete(message.id);
  window.clearTimeout(pending.timer);
  if (message.ok === false) pending.reject(new Error(message.error || 'entity_authoring_runtime_rejected'));
  else pending.resolve(message.result);
  return true;
}

function runtimeCommand(command, payload = {}) {
  const frame = document.getElementById('project-preview-frame');
  if (!frame?.contentWindow || !frame.src) return Promise.reject(new Error('entity_authoring_runtime_iframe_unavailable'));
  const id = `axiom_entity_${Date.now()}_${++state.requestSequence}`;
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      state.pending.delete(id);
      reject(new Error(`entity_authoring_runtime_timeout:${command}`));
    }, 30000);
    state.pending.set(id, { resolve, reject, timer });
    frame.contentWindow.postMessage(commandMessage(id, command, payload), '*');
  });
}

function commandMessage(id, command, payload) {
  return {
    contract: ENTITY_STUDIO_CONTRACTS.command,
    source: 'axiom',
    target: 'black-sky-bound-v2',
    id,
    command,
    payload
  };
}

function resetRuntimeConnection(reason) {
  for (const [id, pending] of state.pending) {
    window.clearTimeout(pending.timer);
    pending.reject(new Error(`entity_authoring_runtime_reset:${reason}`));
    state.pending.delete(id);
  }
}

function acceptRuntimeSnapshot(snapshot) {
  const animated = Array.isArray(snapshot?.targets) ? snapshot.targets : [];
  mergeTargets(animated, stationaryTargets());
  if (snapshot?.candidate) state.candidate = snapshot.candidate;
  if (snapshot?.lastReceipt) state.lastReceipt = snapshot.lastReceipt;
}

function stationaryTargets() {
  const mapApi = window.BsbV2MapAuthoring;
  const geologyApi = mapApi?.geology;
  const surface = mapApi?.workspaceState?.();
  if (!surface?.active || !geologyApi?.list) return [];
  return geologyApi.list().map((record) => ({
    contract: ENTITY_STUDIO_CONTRACTS.target,
    classification: 'canonical_target_projection',
    targetId: `geology:${record.id}`,
    targetClass: 'stationary_entity',
    providerId: 'bsb.procedural-geology-authoring',
    runtimeIdentity: { id: record.id, authoredId: record.id, kind: 'boulder', team: null },
    label: record.label || record.id,
    profileId: record.geology?.formation || null,
    recipeId: record.geology?.recipe || null,
    canonicalSource: {
      owner: 'AXIOM BSB V2 map authoring document',
      path: surface.authoringPath,
      hash: `revision:${surface.revision}`
    },
    writeStatus: 'ready',
    capabilities: [
      { id: 'seed', status: 'ready' }, { id: 'geometry', status: 'ready' },
      { id: 'materials', status: 'runtime_projected' }, { id: 'weathering', status: 'ready' },
      { id: 'occlusion', status: 'runtime_projected' }
    ],
    fields: GEOLOGY_FIELDS.map((field) => ({ ...field, value: pathValue(record, field.path) })),
    runtimeProjection: { profileKind: 'procedural_geology', motionState: 'stationary', revision: surface.revision }
  }));
}

function mergeTargets(animated, stationary) {
  state.targets = [...animated, ...stationary];
  if (!state.targets.some((target) => target.targetId === state.selectedId)) {
    state.selectedId = preferredTarget(state.targets)?.targetId ?? null;
  }
}

function preferredTarget(targets) {
  const raiders = targets
    .filter((target) => target.recipeId && target.runtimeIdentity?.kind === 'raider')
    .sort((left, right) => Number(left.runtimeProjection?.occlusionDensity ?? 1) - Number(right.runtimeProjection?.occlusionDensity ?? 1));
  return raiders[0]
    ?? targets.find((target) => target.writeStatus === 'ready')
    ?? targets[0];
}

async function propose(payload = {}, options = {}) {
  const targetId = payload.targetId || state.selectedId;
  const target = state.targets.find((entry) => entry.targetId === targetId);
  if (!target) throw new Error(`entity_studio_target_unknown:${targetId || 'missing'}`);
  if (target.writeStatus !== 'ready') throw new Error(`entity_studio_target_${target.writeStatus}`);
  if (!target.fields.some((field) => field.path === payload.path)) throw new Error(`entity_studio_field_unknown:${payload.path || 'missing'}`);
  state.error = null;
  if (state.candidate) await revertCandidate();
  const source = payload.source || options.source || { kind: 'human', id: 'axiom_entity_studio' };
  if (isRuntimeTarget(target)) {
    const result = await runtimeCommand('candidate.create', { targetId, path: payload.path, value: payload.value, source });
    if (result?.ok === false) throw new Error(result.reason);
    state.candidate = result.candidate;
  } else {
    state.candidate = buildGeologyCandidate(target, payload.path, payload.value, source);
  }
  state.selectedId = targetId;
  state.selectionExplicit = true;
  await focusTargetSurface(target);
  render();
  return { ok: true, classification: 'candidate', candidate: clone(state.candidate), applied: false };
}

function buildGeologyCandidate(target, path, value, source) {
  const geologyApi = window.BsbV2MapAuthoring?.geology;
  const record = geologyApi?.get?.(target.runtimeIdentity.id);
  if (!record) throw new Error('entity_studio_geology_record_unavailable');
  const field = target.fields.find((entry) => entry.path === path);
  const nextValue = normalizeFieldValue(field, value);
  const key = path.replace(/^geology\./, '');
  const predicted = projectGeologyCandidate(record, { op: 'patch', patch: { [key]: nextValue } });
  const after = pathValue(predicted, path);
  return {
    contract: ENTITY_STUDIO_CONTRACTS.candidate,
    classification: 'non_committed_entity_authoring_candidate',
    candidateId: `geology_candidate_${Date.now()}`,
    providerId: target.providerId,
    targetId: target.targetId,
    targetClass: target.targetClass,
    baseHash: target.canonicalSource.hash,
    status: 'candidate',
    source: clone(source),
    operations: [{ path, before: field.value, after }],
    validation: { status: 'ready', errors: [] },
    blockers: [],
    previewScope: 'details_projection',
    createdAt: new Date().toISOString()
  };
}

async function previewCandidate() {
  if (!state.candidate) return null;
  if (isRuntimeTarget(state.candidate)) {
    const result = await runtimeCommand('candidate.preview', { candidateId: state.candidate.candidateId });
    if (result?.ok === false) return blockCandidate(result.reason);
    state.candidate = result.candidate;
    replaceTarget(result.target);
  } else {
    state.candidate.status = 'previewing';
    state.candidate.previewScope = 'details_projection';
  }
  render();
  return { ok: true, candidate: clone(state.candidate) };
}

async function applyCandidate() {
  if (!state.candidate) return null;
  state.error = null;
  try {
    if (isRuntimeTarget(state.candidate)) {
      const result = await runtimeCommand('candidate.apply', { candidateId: state.candidate.candidateId });
      if (result?.ok === false) return blockCandidate(result.reason);
      state.lastReceipt = result.receipt;
      state.candidate = null;
      replaceTarget(result.target);
    } else {
      state.lastReceipt = await applyGeologyCandidate(state.candidate);
      state.candidate = null;
      mergeTargets(state.targets.filter(isRuntimeTarget), stationaryTargets());
    }
    render();
    return { ok: true, applied: true, receipt: clone(state.lastReceipt) };
  } catch (error) {
    state.error = String(error?.message || error);
    blockCandidate(state.error);
    throw error;
  }
}

async function applyGeologyCandidate(candidate) {
  const mapApi = window.BsbV2MapAuthoring;
  const surface = mapApi?.workspaceState?.();
  if (`revision:${surface?.revision}` !== candidate.baseHash) throw new Error('entity_authoring_candidate_stale');
  const operation = candidate.operations[0];
  const key = operation.path.replace(/^geology\./, '');
  const beforeHash = candidate.baseHash;
  const applied = mapApi.geology.applyOperation({
    op: 'patch',
    geologyId: candidate.targetId.replace(/^geology:/, ''),
    patch: { [key]: operation.after }
  });
  const bake = await mapApi.bakeAndPreview();
  if (bake?.error) throw new Error(bake.error);
  const readBack = mapApi.geology.get(candidate.targetId.replace(/^geology:/, ''));
  if (pathValue(readBack, operation.path) !== operation.after) throw new Error('entity_authoring_readback_mismatch');
  return {
    contract: ENTITY_STUDIO_CONTRACTS.receipt,
    classification: 'applied_entity_authoring_change',
    applied: true,
    candidateId: candidate.candidateId,
    providerId: candidate.providerId,
    targetId: candidate.targetId,
    beforeHash,
    afterHash: `revision:${mapApi.workspaceState().revision}`,
    persistedDestination: mapApi.workspaceState().authoringPath,
    runtimeRefresh: 'baked_and_loaded',
    readBack: { status: 'verified' },
    providerReceipt: applied,
    source: candidate.source,
    appliedAt: new Date().toISOString()
  };
}

async function revertCandidate() {
  if (!state.candidate) return { ok: true, reverted: false };
  if (isRuntimeTarget(state.candidate)) {
    const result = await runtimeCommand('candidate.revert', { candidateId: state.candidate.candidateId });
    if (result?.ok === false) throw new Error(result.reason);
  }
  const candidateId = state.candidate.candidateId;
  state.candidate = null;
  state.error = null;
  render();
  return { ok: true, reverted: true, candidateId };
}

function blockCandidate(reason) {
  if (state.candidate) {
    state.candidate.status = 'blocked';
    state.candidate.validation = { status: 'blocked', errors: [reason] };
    state.candidate.blockers = [reason];
  }
  state.error = reason;
  render();
  return { ok: false, reason, candidate: clone(state.candidate) };
}

function replaceTarget(target) {
  if (!target) return;
  const index = state.targets.findIndex((entry) => entry.targetId === target.targetId);
  if (index >= 0) state.targets.splice(index, 1, target);
}

function render() {
  if (!root) return;
  root.replaceChildren();
  root.append(renderHead(), renderScroll(), renderCandidateDock(), renderFoot());
  queueMicrotask(frameSelectedTarget);
}

function frameSelectedTarget() {
  const list = root?.querySelector('[data-testid="entity-studio-targets"]');
  const selected = list?.querySelector('[aria-selected="true"]');
  if (!list || !selected) return;
  const top = selected.offsetTop - list.offsetTop;
  list.scrollTop = Math.max(0, top - (list.clientHeight - selected.offsetHeight) * 0.5);
}

function renderHead() {
  const head = element('header', 'entity-studio__head');
  const copy = element('div');
  copy.append(element('div', 'entity-studio__eyebrow', 'AXIOM · Provider workspace'), element('div', 'entity-studio__title', 'Entity Studio'));
  const actions = element('div', 'entity-studio__head-actions');
  actions.append(actionButton('↻', 'Refresh providers', () => refresh(), 'entity-studio__icon'), actionButton('×', 'Close Entity Studio', () => toggle(false), 'entity-studio__icon'));
  head.append(copy, actions);
  return head;
}

function renderScroll() {
  const scroll = element('div', 'entity-studio__scroll');
  scroll.append(renderOutliner(), renderDetails());
  if (state.error) {
    const notice = element('div', 'entity-studio__notice', state.error);
    notice.dataset.tone = 'bad';
    notice.style.margin = '14px 16px';
    scroll.append(notice);
  }
  return scroll;
}

function renderCandidateDock() {
  const dock = element('div', 'entity-studio__candidate-dock');
  dock.hidden = !state.candidate;
  if (state.candidate) dock.append(renderCandidate());
  return dock;
}

function renderOutliner() {
  const section = element('section', 'entity-studio__section');
  const sectionHead = element('div', 'entity-studio__section-head');
  sectionHead.append(element('div', 'entity-studio__section-title', 'Outliner'), element('span', 'entity-studio__target-kind', `${state.targets.length} targets`));
  const search = element('input', 'entity-studio__search');
  search.type = 'search';
  search.placeholder = 'Filter runtime and authored entities';
  search.value = state.query;
  search.setAttribute('aria-label', 'Filter Entity Studio targets');
  search.addEventListener('input', () => { state.query = search.value; render(); });
  const list = element('div', 'entity-studio__targets');
  list.dataset.testid = 'entity-studio-targets';
  const query = state.query.trim().toLowerCase();
  const targets = state.targets.filter((target) => !query || `${target.label} ${target.runtimeIdentity?.kind} ${target.targetId}`.toLowerCase().includes(query));
  for (const target of targets) list.append(renderTarget(target));
  if (!targets.length) list.append(element('div', 'entity-studio__blank', state.connection === 'connecting' ? 'Discovering provider-backed targets…' : 'No targets match this filter.'));
  section.append(sectionHead, search, list);
  return section;
}

function renderTarget(target) {
  const button = element('button', 'entity-studio__target');
  button.type = 'button';
  button.setAttribute('aria-selected', String(target.targetId === state.selectedId));
  button.dataset.targetId = target.targetId;
  button.dataset.testid = `entity-target-${target.targetId}`;
  button.title = target.runtimeIdentity?.id || target.targetId;
  const dot = element('span', 'entity-studio__target-dot');
  dot.dataset.state = target.writeStatus === 'ready' ? 'ready' : 'blocked';
  const name = element('span', 'entity-studio__target-name', target.label || target.targetId);
  const kind = element('span', 'entity-studio__target-kind', targetClassLabel(target));
  button.append(dot, name, kind);
  button.addEventListener('click', async () => {
    if (state.candidate && state.candidate.targetId !== target.targetId) await revertCandidate();
    state.selectedId = target.targetId;
    state.selectionExplicit = true;
    render();
    await focusTargetSurface(target);
  });
  return button;
}

async function focusTargetSurface(target) {
  if (target.targetClass === 'stationary_entity') {
    window.BsbV2MapAuthoring?.setView?.('author');
    window.BsbV2MapAuthoring?.selectRecord?.('sceneObject', target.runtimeIdentity.id);
    return;
  }
  window.BsbV2MapAuthoring?.setView?.('runtime');
  if (state.connection === 'ready') {
    const focused = await runtimeCommand('target.focus', { targetId: target.targetId });
    replaceTarget(focused?.target);
    render();
  }
}

function shortIdentity(target) {
  const identity = String(target.runtimeIdentity?.authoredId || target.runtimeIdentity?.id || 'actor');
  const suffix = identity.split(':').at(-1)?.replace(/[^a-z0-9_-]/gi, '') || 'actor';
  return `#${suffix.slice(-8)}`;
}

function isRuntimeTarget(target) {
  return target?.targetClass === 'animated_entity' || target?.targetClass === 'runtime_profile';
}

function targetClassLabel(target) {
  if (target?.targetClass === 'runtime_profile') return 'Audio';
  if (target?.targetClass === 'animated_entity') return shortIdentity(target);
  return 'Static';
}

function renderDetails() {
  const section = element('section', 'entity-studio__section');
  section.dataset.testid = 'entity-studio-details';
  const target = state.targets.find((entry) => entry.targetId === state.selectedId);
  if (!target) {
    section.append(element('div', 'entity-studio__blank', 'Select a provider-backed target to inspect its real capabilities.'));
    return section;
  }
  const selection = element('div', 'entity-studio__selection');
  const title = element('div', 'entity-studio__selection-title');
  title.append(element('h3', '', target.label || target.targetId), element('span', 'entity-studio__target-kind', target.runtimeIdentity?.kind || target.targetClass));
  selection.append(title, element('div', 'entity-studio__source', target.canonicalSource?.path || target.providerId), renderCapabilities(target));
  if (target.runtimeProjection) {
    const projection = target.runtimeProjection;
    selection.append(element('div', 'entity-studio__notice', `Projection · ${projection.profileKind || 'entity'} · ${projection.motionState || 'idle'}${projection.supportFoot ? ` · support ${projection.supportFoot}` : ''}`));
    if (projection.cameraVisibilityFocus?.radiusMeters != null) {
      const focus = projection.cameraVisibilityFocus;
      const notice = element('div', 'entity-studio__notice', `Camera focus · ${focus.active ? 'live on selection' : 'available'} · ${formatValue(focus.radiusMeters)} m traced sightline · ${Math.round(Number(focus.minimumOccluderOpacity) * 100)}% blockers · ${formatValue(focus.readabilityLightPower)} lm`);
      notice.dataset.testid = 'entity-studio-camera-focus';
      selection.append(notice);
    }
    if (projection.audioPerspective) {
      const audio = projection.audioPerspective;
      const notice = element(
        'div',
        'entity-studio__notice',
        `Opening audio · authored distance · non-positional · ${Math.round(Number(audio.effective?.cutoffHz || audio.tuning?.sealedCutoffHz || 0))} Hz shell · ${Math.round(Number(audio.effective?.exteriorGain || audio.tuning?.sealedExteriorGain || 0) * 100)}% exterior level · 3D falloff not active`
      );
      notice.dataset.testid = 'entity-studio-audio-perspective';
      notice.dataset.tone = 'warn';
      selection.append(notice);
    }
  }
  if (target.writeStatus !== 'ready') {
    const notice = element('div', 'entity-studio__notice', `No editable manifest exists for this provider (${target.writeStatus}). AXIOM will not invent controls.`);
    notice.dataset.tone = 'warn';
    selection.append(notice);
  } else {
    selection.append(renderFieldGroups(target));
  }
  section.append(selection);
  return section;
}

function renderCapabilities(target) {
  const chips = element('div', 'entity-studio__chips');
  for (const capability of target.capabilities || []) {
    const chip = element('span', 'entity-studio__chip', capability.id.replaceAll('_', ' '));
    chip.dataset.status = capability.status;
    chip.title = capability.status;
    chips.append(chip);
  }
  return chips;
}

function renderFieldGroups(target) {
  const wrap = element('div');
  const grouped = new Map();
  for (const field of target.fields || []) {
    const group = field.group || 'Parameters';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(field);
  }
  let index = 0;
  const orderedGroups = [...grouped.entries()].sort(([left], [right]) => {
    if (left === 'Camera focus') return -1;
    if (right === 'Camera focus') return 1;
    return 0;
  });
  for (const [group, fields] of orderedGroups) {
    const details = element('details', 'entity-studio__group');
    details.open = index++ < 2;
    details.append(element('summary', '', group));
    const body = element('div', 'entity-studio__fields');
    for (const field of fields) body.append(renderField(target, field));
    details.append(body);
    wrap.append(details);
  }
  return wrap;
}

function renderField(target, field) {
  const wrap = element('label', 'entity-studio__field');
  const head = element('div', 'entity-studio__field-head');
  head.append(element('span', 'entity-studio__field-label', field.label || field.path));
  if (field.type === 'select') {
    const select = element('select');
    for (const optionValue of field.options || []) {
      const [value, label] = Array.isArray(optionValue) ? optionValue : [optionValue.value, optionValue.label];
      const option = element('option', '', label);
      option.value = value;
      option.selected = value === field.value;
      select.append(option);
    }
    select.dataset.path = field.path;
    select.addEventListener('change', () => submitField(target, field, select.value));
    wrap.append(head, select);
    return wrap;
  }
  const numeric = element('input', 'entity-studio__field-value');
  numeric.type = 'number';
  numeric.min = field.min;
  numeric.max = field.max;
  numeric.step = field.step;
  numeric.value = field.value;
  numeric.dataset.path = field.path;
  const range = element('input');
  range.type = 'range';
  range.min = field.min;
  range.max = field.max;
  range.step = field.step;
  range.value = field.value;
  range.dataset.path = field.path;
  range.addEventListener('input', () => { numeric.value = range.value; });
  range.addEventListener('change', () => submitField(target, field, range.value));
  numeric.addEventListener('change', () => submitField(target, field, numeric.value));
  head.append(numeric);
  wrap.append(head, range);
  return wrap;
}

async function submitField(target, field, value) {
  try {
    await propose({ targetId: target.targetId, path: field.path, value: normalizeFieldValue(field, value) });
  } catch (error) {
    state.error = String(error?.message || error);
    render();
  }
}

function renderCandidate() {
  const card = element('section', 'entity-studio__candidate');
  card.dataset.testid = 'entity-studio-candidate';
  const title = element('div', 'entity-studio__candidate-title');
  title.append(element('span', '', 'Candidate change'), element('span', 'entity-studio__candidate-state', state.candidate.status));
  card.append(title);
  for (const operation of state.candidate.operations || []) {
    card.append(element('div', 'entity-studio__diff', `${operation.path}\n${formatValue(operation.before)} → ${formatValue(operation.after)}`));
  }
  if (state.candidate.previewScope === 'details_projection') {
    card.append(element('div', 'entity-studio__notice', 'Stationary preview is validated in Details; Apply bakes it into the live runtime.'));
  }
  if (state.candidate.blockers?.length) {
    const blocked = element('div', 'entity-studio__notice', state.candidate.blockers.join(' · '));
    blocked.dataset.tone = 'bad';
    card.append(blocked);
  }
  const actions = element('div', 'entity-studio__candidate-actions');
  actions.append(
    actionButton('Preview', 'Preview without persisting', () => previewCandidate(), 'entity-studio__button', state.candidate.status === 'blocked'),
    actionButton('Apply', 'Persist, refresh and verify readback', () => applyCandidate(), 'entity-studio__button entity-studio__button--primary', state.candidate.status === 'blocked'),
    actionButton('Revert', 'Discard candidate', () => revertCandidate(), 'entity-studio__button entity-studio__button--quiet')
  );
  card.append(actions);
  return card;
}

function renderFoot() {
  const foot = element('footer', 'entity-studio__foot');
  const dot = element('span', 'entity-studio__connection');
  dot.dataset.state = state.connection;
  foot.append(dot, element('span', '', state.connectionLabel));
  if (state.lastReceipt?.readBack?.status === 'verified') foot.append(element('code', '', `verified ${state.lastReceipt.afterHash}`));
  return foot;
}

function actionButton(label, title, handler, className, disabled = false) {
  const button = element('button', className, label);
  button.type = 'button';
  button.title = title;
  button.disabled = disabled;
  button.addEventListener('click', () => Promise.resolve(handler()).catch((error) => {
    state.error = String(error?.message || error);
    render();
  }));
  return button;
}

function normalizeFieldValue(field, value) {
  if (field.type === 'select') return String(value);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new Error(`entity_studio_number_invalid:${field.path}`);
  return numeric;
}

function pathValue(source, path) {
  return String(path).split('.').reduce((value, key) => value?.[key], source);
}

function formatValue(value) {
  return typeof value === 'number' ? Number(value.toFixed(4)).toString() : String(value);
}

function element(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function status() {
  return {
    contract: 'axiom.entity-studio.v0',
    open: state.open,
    connection: state.connection,
    targetCount: state.targets.length,
    selectedId: state.selectedId,
    candidate: clone(state.candidate),
    lastReceipt: clone(state.lastReceipt),
    error: state.error,
    diagnostics: { ...clone(state.diagnostics), pendingNow: [...state.pending.keys()] }
  };
}

export const EntityStudioRuntime = Object.freeze({
  contract: 'axiom.entity-studio.v0',
  mount,
  toggle,
  open: () => toggle(true),
  close: () => toggle(false),
  refresh,
  status,
  targets: () => clone(state.targets),
  getTarget: (targetId = state.selectedId) => clone(state.targets.find((target) => target.targetId === targetId) ?? null),
  propose,
  previewCandidate,
  applyCandidate,
  revertCandidate
});

window.EntityStudioRuntime = EntityStudioRuntime;
window.EDITOR = window.EDITOR || {};
window.EDITOR.entities = EntityStudioRuntime;

if (!mount()) window.addEventListener('DOMContentLoaded', mount, { once: true });
