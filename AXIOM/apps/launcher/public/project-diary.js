const API_ROOT = '/api/project-diary';
const MODEL_MAX_TOKENS = 520;

const state = {
  entries: [],
  activeProjectId: null,
  activatedProjectId: null,
  spatialAnchor: null,
  steward: null,
  busy: false,
  error: null,
  captureStatus: 'Write freely. Your words are saved before AXIOM interprets them.',
  captureTone: '',
  lastSurfaceSignature: null,
  lastReturnEntryId: null,
  attachments: []
};

function workspaceContext() {
  try { return window.EDITOR?.workspace?.getContext?.() || null; }
  catch { return null; }
}

function activeProjectParams(context = workspaceContext()) {
  const project = context?.project;
  if (!project?.id) throw new Error('project_diary_active_project_missing');
  return { projectId: project.registeredId || project.id, projectRoot: project.root };
}

function isBsbWorkspace(context = workspaceContext()) {
  return context?.project?.workspace?.surfaceId === 'bsb-v2-map-authoring';
}

async function request(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let payload = null;
  try { payload = await response.json(); } catch { payload = { ok: false, error: `HTTP ${response.status}` }; }
  if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `project_diary_http_${response.status}`);
  return payload;
}

function ensureSurface() {
  const tablist = document.querySelector('#left-panel .panel-tabs');
  const leftPanel = document.getElementById('left-panel');
  if (!tablist || !leftPanel) return false;

  let tab = document.querySelector('.ptab[data-panel-id="diary"]');
  if (!tab) {
    tab = document.createElement('div');
    tab.className = 'ptab';
    tab.dataset.panelId = 'diary';
    tab.textContent = 'Diary';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('tabindex', '-1');
    tab.setAttribute('aria-selected', 'false');
    tab.onclick = () => open();
    const forgeTab = tablist.querySelector('[data-panel-id="bsb-map"]');
    tablist.insertBefore(tab, forgeTab || tablist.firstChild);
  }

  let panel = document.getElementById('panel-diary');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'panel-diary';
    panel.className = 'panel-content';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="project-diary-panel">
        <div class="project-diary-head">
          <div><span class="project-diary-eyebrow">Capture first</span><strong>Project Diary</strong></div>
          <span id="project-diary-steward" class="project-diary-steward">quiet · event only</span>
          <small>Keep the thought here. Move into Forge only when you are ready to author.</small>
        </div>
        <div id="project-diary-context" class="project-diary-context"></div>
        <div class="project-diary-capture">
          <label class="project-diary-label" for="project-diary-input">New entry</label>
          <textarea id="project-diary-input" placeholder="Write the messy version — idea, bug, code, decision, or something you noticed..." spellcheck="true"></textarea>
          <div class="project-diary-capture-row">
            <label class="project-diary-attach"><input id="project-diary-attach-context" type="checkbox" checked> Attach current Forge / viewport context</label>
            <input id="project-diary-files" type="file" accept="image/*,.txt,.md,.js,.json" multiple hidden>
            <button id="project-diary-files-button" class="project-diary-button" type="button">Attach</button>
            <button id="project-diary-capture-button" class="project-diary-button primary" type="button">Capture</button>
          </div>
          <div id="project-diary-attachments" class="project-diary-capture-status"></div>
          <div id="project-diary-capture-status" class="project-diary-capture-status"></div>
        </div>
        <div class="project-diary-label">Recent entries</div>
        <div id="project-diary-entries" class="project-diary-entries"></div>
      </div>`;
    const forgePanel = document.getElementById('panel-bsb-map');
    leftPanel.insertBefore(panel, forgePanel || null);
  }

  let dialog = document.getElementById('project-diary-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'project-diary-dialog';
    dialog.className = 'project-diary-dialog';
    dialog.innerHTML = `
      <div class="project-diary-dialog-head">
        <strong id="project-diary-dialog-title">Project Diary</strong>
        <button id="project-diary-dialog-close" class="project-diary-button" type="button">Close</button>
      </div>
      <div id="project-diary-dialog-body" class="project-diary-dialog-body"></div>`;
    document.body.appendChild(dialog);
  }

  bindSurface(panel, dialog);
  window.AxiomUXRuntime?.bindTabs?.();
  const context = workspaceContext();
  if (context) window.AxiomUXRuntime?.applyWorkspaceContext?.(context);
  return true;
}

function bindSurface(panel, dialog) {
  if (panel.dataset.diaryBound === 'true') return;
  panel.dataset.diaryBound = 'true';
  document.getElementById('project-diary-capture-button')?.addEventListener('click', () => capture());
  document.getElementById('project-diary-input')?.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      capture();
    }
  });
  document.getElementById('project-diary-files-button')?.addEventListener('click', () => document.getElementById('project-diary-files')?.click());
  document.getElementById('project-diary-files')?.addEventListener('change', event => {
    state.attachments = [...(event.target.files || [])].slice(0, 8).map(file => ({ name: file.name, type: file.type, size: file.size, reference: null }));
    renderAttachments();
  });
  document.getElementById('project-diary-entries')?.addEventListener('click', event => {
    const button = event.target.closest('[data-diary-action]');
    if (!button) return;
    const id = button.dataset.entryId;
    if (button.dataset.diaryAction === 'forge') openInForge(id);
    if (button.dataset.diaryAction === 'handover') generateHandover(id);
    if (button.dataset.diaryAction === 'completion') showCompletionDialog(id);
  });
  document.getElementById('project-diary-dialog-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

async function load() {
  ensureSurface();
  const context = workspaceContext();
  if (!context?.project?.id) {
    state.entries = [];
    render();
    return { ok: false, error: 'project_diary_active_project_missing' };
  }
  const params = activeProjectParams(context);
  try {
    const query = new URLSearchParams({ ...params, limit: '40' });
    const payload = await request(`?${query}`);
    state.entries = payload.entries || [];
    state.steward = payload.steward || null;
    state.activeProjectId = context.project.id;
    state.error = null;
    render();
    return payload;
  } catch (error) {
    state.error = String(error.message || error);
    state.captureStatus = `Diary could not load: ${state.error}`;
    state.captureTone = 'error';
    render();
    return { ok: false, error: state.error };
  }
}

async function capture() {
  if (state.busy) return { ok: false, error: 'project_diary_capture_busy' };
  const input = document.getElementById('project-diary-input');
  const sourceText = String(input?.value || '').trim();
  if (!sourceText) {
    setCaptureStatus('Write something first — the Diary does not require any other fields.', 'error');
    input?.focus();
    return { ok: false, error: 'project_diary_source_text_required' };
  }
  const context = workspaceContext();
  if (!context?.project?.id) {
    setCaptureStatus('Load a verified project before capturing an entry.', 'error');
    return { ok: false, error: 'project_diary_active_project_missing' };
  }
  state.busy = true;
  setCaptureStatus('Preserving your original entry…');
  renderBusy();
  try {
    const attachContext = document.getElementById('project-diary-attach-context')?.checked !== false;
    const capturedContext = attachContext ? compactWorkspaceContext(context) : { project: context.project };
    const spatialAnchor = attachContext ? (window.BsbV2MapAuthoring?.getDiaryAnchor?.() || state.spatialAnchor) : null;
    const payload = await request('/entries', {
      method: 'POST',
      body: JSON.stringify({
        ...activeProjectParams(context),
        source: { text: sourceText, attachments: state.attachments },
        context: capturedContext,
        spatialAnchor,
        provenance: { sourceSurface: 'project_diary', capturedBy: 'user' }
      })
    });
    state.entries = [payload.entry, ...state.entries.filter(entry => entry.id !== payload.entry.id)];
    if (input) input.value = '';
    state.attachments = [];
    const fileInput = document.getElementById('project-diary-files');
    if (fileInput) fileInput.value = '';
    renderAttachments();
    setCaptureStatus('Original preserved. AXIOM is deriving a concise interpretation from bounded project evidence.', 'good');
    renderEntries();
    const interpreted = await interpretEntry(payload.entry);
    return { ok: true, entry: interpreted || payload.entry };
  } catch (error) {
    setCaptureStatus(`Capture failed before completion: ${String(error.message || error)}`, 'error');
    return { ok: false, error: String(error.message || error) };
  } finally {
    state.busy = false;
    renderBusy();
  }
}

async function interpretEntry(entry) {
  const model = window.EDITOR?.model?.status?.();
  if (!model?.ok) {
    setCaptureStatus('Original preserved with deterministic interpretation. Local model is unavailable; no success was invented.', 'good');
    return entry;
  }
  try {
    const evidence = entry.derived?.evidence || {};
    const promptPayload = {
      source: entry.source.text,
      sourceClassification: entry.source.classification,
      context: {
        project: entry.context.project,
        repository: entry.context.repository,
        scene: entry.context.scene,
        authoring: entry.context.authoring,
        spatialAnchor: entry.context.spatialAnchor
      },
      ownerCandidates: (evidence.ownerCandidates || []).slice(0, 6),
      knowledgeLinks: (evidence.knowledgeLinks || []).slice(0, 5)
    };
    const text = await window.EDITOR.model.complete(
      [{ role: 'user', content: JSON.stringify(promptPayload) }],
      {
        system: 'You interpret one preserved AXIOM Project Diary entry. Return JSON only with keys interpretedIntent (string), affectedSystems (string[]), tasks (string[]), uncertainties (string[]), suggestedValidation (string[]), recommendedAction (local_handling|user_clarification|codex_escalation), confidence (low|medium|high). Treat ownerCandidates and knowledgeLinks as evidence, not certainty. A verified_workspace_authoring_owner is the canonical mutation owner for map, layout, route, terrain, spawn, placement, or encounter intent; runtime files are consumers and validation evidence. Do not import unrelated systems, constraints, or validation work merely because a knowledge link is present. Prefer local_handling when the request is actionable inside the active authoring surface. Use user_clarification only when a missing user choice would materially change the result. Never invent filenames. Keep every array concise. Do not emit markdown.',
        max_tokens: MODEL_MAX_TOKENS,
        num_ctx: 4096,
        timeoutMs: 60000,
        think: false
      }
    );
    const interpretation = parseModelJson(text);
    const params = activeProjectParams();
    const payload = await request(`/entries/${encodeURIComponent(entry.id)}/interpretations`, {
      method: 'POST',
      body: JSON.stringify({
        ...params,
        interpretation,
        provider: model.current?.endpoint || 'local_model',
        model: model.current?.model || 'unknown',
        budget: { maxTokens: MODEL_MAX_TOKENS }
      })
    });
    replaceEntry(payload.entry);
    setCaptureStatus(`Original preserved · interpreted by ${model.current?.model || 'local model'} · ${MODEL_MAX_TOKENS}-token cap.`, 'good');
    return payload.entry;
  } catch (error) {
    setCaptureStatus(`Original preserved with deterministic interpretation. Local-model interpretation failed visibly: ${String(error.message || error)}`, 'error');
    return entry;
  }
}

async function openInForge(entryId) {
  const entry = findEntry(entryId);
  if (!entry) return { ok: false, error: 'project_diary_entry_not_found' };
  state.lastReturnEntryId = entry.id;
  window.AxiomUXRuntime?.showLeftPanel?.('bsb-map', { source: 'project_diary_handoff' });
  const result = await window.BsbV2MapAuthoring?.focusContext?.({
    catalogueMapId: entry.context?.scene?.catalogueMapId,
    selection: entry.context?.scene?.selection,
    spatialAnchor: entry.context?.spatialAnchor
  }, { inputOwner: 'forge', source: 'project_diary_open_in_forge' });
  window.EDITOR?.notify?.('info', 'Forge now owns map input. Diary context remains attached to the entry.');
  return result || { ok: true };
}

function open() {
  ensureSurface();
  window.AxiomUXRuntime?.showLeftPanel?.('diary', { source: 'project_diary_open' });
  window.BsbV2MapAuthoring?.setInputOwner?.('diary', { source: 'project_diary_open', force: true });
  state.spatialAnchor = window.BsbV2MapAuthoring?.getDiaryAnchor?.() || state.spatialAnchor;
  renderContext();
  return status();
}

async function generateHandover(entryId) {
  const entry = findEntry(entryId);
  if (!entry) return { ok: false, error: 'project_diary_entry_not_found' };
  try {
    const payload = await request(`/entries/${encodeURIComponent(entryId)}/handover`, {
      method: 'POST',
      body: JSON.stringify(activeProjectParams())
    });
    showHandoverDialog(payload.handover);
    return payload.handover;
  } catch (error) {
    setCaptureStatus(`Codex handover failed: ${String(error.message || error)}`, 'error');
    return { ok: false, error: String(error.message || error) };
  }
}

function showHandoverDialog(handover) {
  const dialog = document.getElementById('project-diary-dialog');
  const title = document.getElementById('project-diary-dialog-title');
  const body = document.getElementById('project-diary-dialog-body');
  if (!dialog || !body) return;
  if (title) title.textContent = 'Codex handover preview';
  body.innerHTML = `
    <div class="project-diary-capture-status">Preview only · verified facts, user decisions, AXIOM inferences, and uncertainty remain separated.</div>
    <pre id="project-diary-handover-text"></pre>
    <div class="project-diary-dialog-actions"><button id="project-diary-copy-handover" class="project-diary-button primary" type="button">Copy handover</button></div>`;
  document.getElementById('project-diary-handover-text').textContent = handover.prompt;
  document.getElementById('project-diary-copy-handover')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(handover.prompt);
      window.EDITOR?.notify?.('ok', 'Codex handover copied.');
    } catch {
      window.EDITOR?.notify?.('warn', 'Clipboard unavailable; the handover remains visible for manual copying.');
    }
  });
  if (!dialog.open) dialog.showModal();
}

function showCompletionDialog(entryId) {
  const entry = findEntry(entryId);
  if (!entry) return;
  const dialog = document.getElementById('project-diary-dialog');
  const title = document.getElementById('project-diary-dialog-title');
  const body = document.getElementById('project-diary-dialog-body');
  if (!dialog || !body) return;
  if (title) title.textContent = 'Reconcile Codex completion';
  body.innerHTML = `
    <div class="project-diary-capture-status">A completion report is evidence, not canonical truth. AXIOM will verify claimed files and retain discrepancies.</div>
    <textarea id="project-diary-completion-input" placeholder="Paste the Codex completion report here..."></textarea>
    <div class="project-diary-dialog-actions"><button id="project-diary-reconcile-button" class="project-diary-button primary" type="button">Reconcile report</button></div>
    <div id="project-diary-reconcile-result"></div>`;
  document.getElementById('project-diary-reconcile-button')?.addEventListener('click', () => reconcileCompletion(entry.id));
  if (!dialog.open) dialog.showModal();
  document.getElementById('project-diary-completion-input')?.focus();
}

async function reconcileCompletion(entryId, reportOverride = null) {
  const report = String(reportOverride ?? document.getElementById('project-diary-completion-input')?.value ?? '').trim();
  if (!report) return { ok: false, error: 'project_diary_completion_report_required' };
  try {
    const payload = await request(`/entries/${encodeURIComponent(entryId)}/completion-reports`, {
      method: 'POST',
      body: JSON.stringify({ ...activeProjectParams(), report, source: 'codex_completion_report' })
    });
    const result = document.getElementById('project-diary-reconcile-result');
    if (result) result.innerHTML = renderCompletion(payload.completion);
    await load();
    return payload.completion;
  } catch (error) {
    const result = document.getElementById('project-diary-reconcile-result');
    if (result) result.textContent = `Reconciliation failed: ${String(error.message || error)}`;
    return { ok: false, error: String(error.message || error) };
  }
}

async function emitStewardEvent(type, payload = {}) {
  const context = workspaceContext();
  if (!context?.project?.id) return { ok: false, error: 'project_diary_active_project_missing' };
  try {
    const result = await request('/events', {
      method: 'POST',
      body: JSON.stringify({ ...activeProjectParams(context), type, source: 'project_diary_browser_bridge', ...payload })
    });
    state.steward = result.steward;
    renderSteward();
    return result;
  } catch (error) {
    state.error = String(error.message || error);
    renderSteward();
    return { ok: false, error: state.error };
  }
}

function compactWorkspaceContext(context) {
  return {
    schema: context.schema,
    project: context.project,
    scene: context.scene,
    authoring: context.authoring,
    runtimeBake: context.runtimeBake,
    viewport: context.viewport,
    connections: context.connections,
    focus: window.EDITOR?.focus?.current?.() || null
  };
}

function parseModelJson(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('project_diary_model_json_missing');
  return JSON.parse(text.slice(start, end + 1));
}

function replaceEntry(entry) {
  state.entries = state.entries.map(item => item.id === entry.id ? entry : item);
  renderEntries();
}

function findEntry(entryId) {
  return state.entries.find(entry => entry.id === entryId) || null;
}

function activeInterpretation(entry) {
  const interpretations = entry.derived?.interpretations || [];
  return interpretations.find(item => item.id === entry.derived?.activeInterpretationId) || interpretations.at(-1) || null;
}

function render() {
  renderContext();
  renderSteward();
  renderCaptureStatus();
  renderAttachments();
  renderEntries();
  renderBusy();
}

function renderContext() {
  const root = document.getElementById('project-diary-context');
  if (!root) return;
  const context = workspaceContext();
  const mapState = window.BsbV2MapAuthoring?.workspaceState?.() || null;
  const anchor = window.BsbV2MapAuthoring?.getDiaryAnchor?.() || state.spatialAnchor;
  const region = context?.scene?.catalogueMapId || context?.scene?.mapId || 'No active region';
  const selection = context?.scene?.selection;
  const inputOwner = mapState?.inputOwner || 'inspect';
  root.innerHTML = `
    <div class="project-diary-context-grid">
      <b>Project</b><span title="${escapeAttr(context?.project?.root || '')}">${escapeHtml(context?.project?.name || 'No verified project')}</span>
      <b>Region</b><span>${escapeHtml(region)}</span>
      <b>Focus</b><span>${selection ? `${escapeHtml(selection.kind || 'record')} · ${escapeHtml(selection.id || 'unknown')}` : 'No selected Forge record'}</span>
      <b>Map pin</b><span>${anchor?.tile ? `${anchor.tile.x}, ${anchor.tile.y}` : 'Click the map while Diary is active'}</span>
      <b>Input</b><span>${inputOwner === 'diary' ? 'Diary pin — map is read-only' : inputOwner === 'forge' ? 'Forge — map edits enabled' : 'Inspect — map is read-only'}</span>
    </div>
    <div class="project-diary-relationship">
      <b>One surface, explicit ownership</b>
      <span>Diary owns words and context pins · Forge owns authored map changes · the viewport follows the active panel.</span>
    </div>`;
}

function renderSteward() {
  const node = document.getElementById('project-diary-steward');
  if (!node) return;
  const steward = state.steward;
  if (!steward) {
    node.textContent = state.error ? 'steward unavailable' : 'quiet · event only';
    node.classList.toggle('warn', !!state.error);
    return;
  }
  const last = steward.lastRun?.eventType ? steward.lastRun.eventType.replace(/_/g, ' ') : 'no events yet';
  node.textContent = `quiet · ${last} · ${steward.idleModelCalls || 0} idle calls`;
  node.title = `Event-only steward. ${steward.runs || 0} bounded runs; ${steward.deduplicatedEvents || 0} deduplicated; ${steward.modelCalls || 0} model calls.`;
  node.classList.remove('warn');
}

function renderCaptureStatus() {
  const node = document.getElementById('project-diary-capture-status');
  if (!node) return;
  node.textContent = state.captureStatus;
  node.className = `project-diary-capture-status ${state.captureTone}`.trim();
}

function setCaptureStatus(text, tone = '') {
  state.captureStatus = text;
  state.captureTone = tone;
  renderCaptureStatus();
}

function renderBusy() {
  const button = document.getElementById('project-diary-capture-button');
  if (!button) return;
  button.disabled = state.busy;
  button.textContent = state.busy ? 'Capturing…' : 'Capture';
}

function renderAttachments() {
  const node = document.getElementById('project-diary-attachments');
  if (!node) return;
  node.textContent = state.attachments.length ? state.attachments.map(item => item.name).join(' · ') : '';
}

function renderEntries() {
  const root = document.getElementById('project-diary-entries');
  if (!root) return;
  if (!state.entries.length) {
    root.innerHTML = '<div class="project-diary-empty">Nothing recorded yet. A rough sentence is enough; AXIOM will preserve it before deriving structure.</div>';
    return;
  }
  root.innerHTML = state.entries.map(renderEntry).join('');
}

function renderEntry(entry) {
  const interpretation = activeInterpretation(entry);
  const payload = interpretation?.payload || {};
  const owner = entry.derived?.evidence?.ownerCandidates?.[0] || null;
  const constraint = entry.derived?.evidence?.knowledgeLinks?.find(item => ['accepted_constraint', 'accepted_decision'].includes(item.classification)) || entry.derived?.evidence?.knowledgeLinks?.[0] || null;
  const anchor = entry.context?.spatialAnchor;
  const region = entry.context?.scene?.catalogueMapId || entry.context?.scene?.mapId || 'no region';
  const modelLabel = interpretation?.classification === 'model_interpretation' ? (interpretation.model || 'local model') : 'deterministic baseline';
  return `
    <article class="project-diary-entry" data-entry-id="${escapeAttr(entry.id)}">
      <div class="project-diary-entry-head">
        <span class="project-diary-pill source">preserved source</span>
        <span class="project-diary-pill ${interpretation?.classification === 'model_interpretation' ? 'model' : 'warn'}">${escapeHtml(modelLabel)}</span>
        <time>${escapeHtml(formatTime(entry.createdAt))}</time>
      </div>
      <div class="project-diary-source">${escapeHtml(entry.source?.text || '')}</div>
      <div class="project-diary-interpretation"><span class="project-diary-label">What AXIOM understood</span><br>${escapeHtml(payload.interpretedIntent || 'Interpretation pending.')}</div>
      <div class="project-diary-evidence">
        <span><b>Context</b> ${escapeHtml(region)}${anchor?.tile ? ` · tile ${anchor.tile.x},${anchor.tile.y}` : ''}${entry.context?.scene?.selection?.id ? ` · ${escapeHtml(entry.context.scene.selection.id)}` : ''}</span>
        <span><b>Likely mutation owner</b> ${owner ? `${escapeHtml(owner.path)}:${owner.line} · ${escapeHtml(owner.confidence)}` : 'unresolved — inspect before assuming'}</span>
        <span><b>Linked knowledge</b> ${constraint ? `${escapeHtml(constraint.classification.replace(/_/g, ' '))} · ${escapeHtml(constraint.path)}:${constraint.line}` : 'none verified'}</span>
        <span><b>Next</b> ${escapeHtml(payload.recommendedAction?.replace(/_/g, ' ') || 'clarify')}</span>
      </div>
      <div class="project-diary-entry-actions">
        <button class="project-diary-button primary" data-diary-action="forge" data-entry-id="${escapeAttr(entry.id)}" type="button">Open in Forge</button>
        <button class="project-diary-button" data-diary-action="handover" data-entry-id="${escapeAttr(entry.id)}" type="button">Codex handover</button>
        <button class="project-diary-button" data-diary-action="completion" data-entry-id="${escapeAttr(entry.id)}" type="button">Completion report</button>
      </div>
      <details><summary>Evidence and provenance</summary><pre>${escapeHtml(JSON.stringify({ source: entry.source, context: entry.context, evidence: entry.derived?.evidence, interpretation }, null, 2))}</pre></details>
    </article>`;
}

function renderCompletion(completion) {
  const checks = completion.fileChecks || [];
  return `
    <div class="project-diary-entry" style="margin-top:8px">
      <div class="project-diary-entry-head"><span class="project-diary-pill ${completion.status === 'claims_grounded' ? 'good' : 'warn'}">${escapeHtml(completion.status.replace(/_/g, ' '))}</span></div>
      <div class="project-diary-evidence">
        ${checks.map(item => `<span><b>${item.exists ? 'Verified' : 'Unresolved'}</b> ${escapeHtml(item.path)}</span>`).join('') || '<span>No claimed files recognised.</span>'}
        ${(completion.discrepancies || []).map(item => `<span><b>Discrepancy</b> ${escapeHtml(item)}</span>`).join('')}
        ${(completion.documentationImplications || []).map(item => `<span><b>Docs</b> ${escapeHtml(item.path)} · ${escapeHtml(item.reason)}</span>`).join('')}
      </div>
    </div>`;
}

function formatTime(value) {
  try { return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return String(value || ''); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function bindRuntimeEvents() {
  window.EDITOR?.events?.on?.('fileManager:stateChanged', event => activateWorkspace(event));
  window.EDITOR?.events?.on?.('diary:spatialAnchorChanged', event => {
    state.spatialAnchor = event?.anchor || null;
    renderContext();
  });
  window.EDITOR?.events?.on?.('bsb:inputOwnerChanged', () => renderContext());
  window.EDITOR?.events?.on?.('workspace:surfaceStateChanged', event => {
    if (event?.surfaceId !== 'bsb-v2-map-authoring' || !event.state?.active) return;
    const surface = event.state;
    const signature = JSON.stringify({ status: surface.status, dirty: surface.dirty, revision: surface.revision, runtimeStatus: surface.runtimeStatus, selection: surface.selection, inputOwner: surface.inputOwner });
    if (signature === state.lastSurfaceSignature) return;
    state.lastSurfaceSignature = signature;
    renderContext();
    let type = 'axiom_authoring_state_changed';
    let paths = [];
    if (surface.status === 'saved' && surface.saveReceipt) {
      type = 'axiom_authoring_source_saved';
      paths = [surface.authoringPath].filter(Boolean);
    } else if (surface.runtimeStatus === 'current' && surface.bakeReceipt) {
      type = 'bsb_runtime_map_baked';
      paths = [surface.bakedMapPath].filter(Boolean);
    }
    emitStewardEvent(type, { paths, revision: surface.revision, status: surface.status }).catch(() => {});
  });
}

async function activateWorkspace(event = {}) {
  const context = workspaceContext();
  if (!context?.project?.id) return;
  const changed = state.activeProjectId !== context.project.id;
  state.activeProjectId = context.project.id;
  window.AxiomUXRuntime?.applyWorkspaceContext?.(context);
  if (changed) {
    state.entries = [];
    state.spatialAnchor = null;
    await load();
    await emitStewardEvent('active_project_changed', { status: context.status });
  }
  const projectJustLoaded = event?.reason === 'project_loaded';
  if (isBsbWorkspace(context) && (state.activatedProjectId !== context.project.id || projectJustLoaded)) {
    state.activatedProjectId = context.project.id;
    open();
  }
}

function status() {
  return {
    ok: !state.error,
    schema: 'axiom.project-diary.browser-runtime.v0',
    activeProjectId: state.activeProjectId,
    entryCount: state.entries.length,
    activePanel: window.AxiomUXRuntime?.getState?.()?.activeLeftPanel || null,
    inputOwner: window.BsbV2MapAuthoring?.workspaceState?.()?.inputOwner || null,
    spatialAnchor: window.BsbV2MapAuthoring?.getDiaryAnchor?.() || state.spatialAnchor,
    steward: state.steward,
    modelBudget: { trigger: 'capture_only', maxTokens: MODEL_MAX_TOKENS, idleCalls: 0 },
    lastReturnEntryId: state.lastReturnEntryId,
    error: state.error
  };
}

async function init() {
  if (!window.EDITOR) return { ok: false, error: 'project_diary_editor_unavailable' };
  ensureSurface();
  bindRuntimeEvents();
  window.EDITOR.diary = {
    capture,
    list: () => [...state.entries],
    open,
    openInForge,
    generateHandover,
    reconcileCompletion,
    emitStewardEvent,
    status
  };
  await activateWorkspace();
  render();
  return status();
}

const ProjectDiaryRuntime = {
  init,
  load,
  open,
  capture,
  openInForge,
  generateHandover,
  reconcileCompletion,
  emitStewardEvent,
  status,
  entries: () => [...state.entries]
};

window.ProjectDiaryRuntime = ProjectDiaryRuntime;
init().catch(error => {
  state.error = String(error.message || error);
  state.captureStatus = `Diary initialization failed: ${state.error}`;
  state.captureTone = 'error';
  render();
});

export { ProjectDiaryRuntime };
