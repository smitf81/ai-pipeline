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
  attachments: [],
  annotations: [],
  view: 'chat',
  filesBusy: false
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
  const chatPanel = document.getElementById('chat-panel');
  const chatHeader = document.getElementById('chat-header');
  const chatMessages = document.getElementById('chat-messages');
  const chatInputArea = document.getElementById('chat-input-area');
  if (!chatPanel || !chatHeader || !chatMessages || !chatInputArea) return false;

  document.querySelector('.ptab[data-panel-id="diary"]')?.remove();
  document.getElementById('panel-diary')?.remove();

  let tabs = document.getElementById('copilot-surface-tabs');
  if (!tabs) {
    tabs = document.createElement('div');
    tabs.id = 'copilot-surface-tabs';
    tabs.className = 'copilot-surface-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Co-pilot surfaces');
    tabs.innerHTML = `
      <button class="copilot-surface-tab active" data-copilot-surface="chat" type="button" role="tab">Chat</button>
      <button class="copilot-surface-tab" data-copilot-surface="journal" type="button" role="tab">Journal <span id="project-diary-count">0</span></button>`;
    chatHeader.insertBefore(tabs, document.getElementById('chat-model-badge'));
  }

  let journal = document.getElementById('project-diary-view');
  if (!journal) {
    journal = document.createElement('div');
    journal.id = 'project-diary-view';
    journal.className = 'project-diary-view';
    journal.hidden = true;
    journal.innerHTML = `
      <div class="project-diary-head">
        <div><span class="project-diary-eyebrow">Preserved intent</span><strong>Project Journal</strong></div>
        <span id="project-diary-steward" class="project-diary-steward">quiet · event only</span>
        <small>Original notes, marks, and sources stay separate from AXIOM's interpretation.</small>
      </div>
      <div id="project-diary-context" class="project-diary-context"></div>
      <div class="project-diary-section-head"><span>Recent entries</span><button id="project-diary-new-button" class="project-diary-button" type="button">New entry</button></div>
      <div id="project-diary-entries" class="project-diary-entries"></div>`;
    chatPanel.insertBefore(journal, chatMessages);
  }

  let draft = document.getElementById('project-diary-draft');
  if (!draft) {
    draft = document.createElement('div');
    draft.id = 'project-diary-draft';
    draft.className = 'project-diary-draft';
    draft.hidden = true;
    draft.innerHTML = `
      <div class="project-diary-draft-head"><span>Journal entry draft</span><span id="project-diary-draft-state">context ready</span></div>
      <div id="project-diary-draft-context" class="project-diary-context-chips"></div>
      <div id="project-diary-attachments" class="project-diary-source-list"></div>
      <input id="project-diary-files" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.js,.json,.css,.html" multiple hidden>
      <div class="project-diary-draft-actions">
        <button id="project-diary-files-button" class="project-diary-button" type="button">Add image/file</button>
        <button id="project-diary-snapshot-button" class="project-diary-button" type="button">Snapshot</button>
        <button id="project-diary-clear-marks" class="project-diary-button" type="button">Clear marks</button>
      </div>
      <div id="project-diary-capture-status" class="project-diary-capture-status"></div>`;
    chatInputArea.insertBefore(draft, document.getElementById('chat-input'));
  }

  let addEntry = document.getElementById('project-diary-capture-button');
  if (!addEntry) {
    addEntry = document.createElement('button');
    addEntry.id = 'project-diary-capture-button';
    addEntry.className = 'project-diary-button primary project-diary-add-entry';
    addEntry.type = 'button';
    addEntry.textContent = 'Add entry';
    document.querySelector('.chat-send-row')?.insertBefore(addEntry, document.getElementById('send-btn'));
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

  bindSurface(journal, dialog);
  const context = workspaceContext();
  if (context) window.AxiomUXRuntime?.applyWorkspaceContext?.(context);
  switchView(state.view, { focus: false });
  return true;
}

function bindSurface(journal, dialog) {
  if (journal.dataset.diaryBound === 'true') return;
  journal.dataset.diaryBound = 'true';
  document.getElementById('project-diary-capture-button')?.addEventListener('click', () => capture());
  document.getElementById('chat-input')?.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      capture();
    }
  });
  document.getElementById('project-diary-files-button')?.addEventListener('click', () => document.getElementById('project-diary-files')?.click());
  document.getElementById('project-diary-files')?.addEventListener('change', event => prepareFiles(event.target.files));
  document.getElementById('project-diary-snapshot-button')?.addEventListener('click', () => addViewportSnapshot());
  document.getElementById('project-diary-clear-marks')?.addEventListener('click', () => window.InteractionModeRuntime?.clearAnnotations?.());
  document.getElementById('project-diary-new-button')?.addEventListener('click', () => { switchView('journal'); document.getElementById('chat-input')?.focus(); });
  document.getElementById('copilot-surface-tabs')?.addEventListener('click', event => {
    const button = event.target.closest('[data-copilot-surface]');
    if (button) switchView(button.dataset.copilotSurface);
  });
  document.getElementById('project-diary-attachments')?.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-attachment]');
    if (!button) return;
    state.attachments.splice(Number(button.dataset.removeAttachment), 1);
    renderAttachments();
    renderDraft();
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

function switchView(view, options = {}) {
  state.view = view === 'journal' ? 'journal' : 'chat';
  const journal = document.getElementById('project-diary-view');
  const messages = document.getElementById('chat-messages');
  const draft = document.getElementById('project-diary-draft');
  const chatPanel = document.getElementById('chat-panel');
  if (journal) journal.hidden = state.view !== 'journal';
  if (messages) messages.hidden = state.view === 'journal';
  if (draft) draft.hidden = state.view !== 'journal';
  if (chatPanel) chatPanel.dataset.surface = state.view;
  document.querySelectorAll('[data-copilot-surface]').forEach(button => {
    const active = button.dataset.copilotSurface === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const input = document.getElementById('chat-input');
  if (input) input.placeholder = state.view === 'journal'
    ? 'Add a thought to the marked view — text is optional when a doodle or source is present…'
    : 'Ask AXIOM anything — input stays live during processing...';
  const send = document.getElementById('send-btn');
  if (send) send.textContent = state.view === 'journal' ? 'Ask Co-Pilot' : 'Send ↵';
  const addEntry = document.getElementById('project-diary-capture-button');
  if (addEntry) addEntry.hidden = state.view !== 'journal';
  renderDraft();
  if (options.focus !== false) input?.focus();
  try { window.EDITOR?.events?.emit?.('projectDiary:viewChanged', { view: state.view, source: options.source || 'ProjectDiaryRuntime' }); } catch (_) { }
  return status();
}

async function prepareFiles(fileList) {
  const files = [...(fileList || [])].slice(0, Math.max(0, 4 - state.attachments.length));
  if (!files.length) return;
  state.filesBusy = true;
  setCaptureStatus('Reading source files locally…');
  renderBusy();
  try {
    for (const file of files) {
      if (file.size > 1000000) throw new Error(`Source is larger than 1 MB: ${file.name}`);
      const type = file.type || attachmentTypeFromName(file.name);
      if (type.startsWith('image/')) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) throw new Error(`Unsupported image type: ${type}`);
        state.attachments.push({ name: file.name, type, size: file.size, dataUrl: await readFileDataUrl(file), source: 'file_picker' });
      } else {
        if (!['text/plain', 'text/markdown', 'application/json', 'text/javascript', 'text/css', 'text/html'].includes(type)) throw new Error(`Unsupported source type: ${type}`);
        state.attachments.push({ name: file.name, type, size: file.size, content: await file.text(), source: 'file_picker' });
      }
    }
    setCaptureStatus(`${files.length} source${files.length === 1 ? '' : 's'} ready. Content will be preserved with the entry.`, 'good');
  } catch (error) {
    setCaptureStatus(String(error?.message || error), 'error');
  } finally {
    state.filesBusy = false;
    const input = document.getElementById('project-diary-files');
    if (input) input.value = '';
    renderAttachments();
    renderDraft();
    renderBusy();
  }
}

async function addViewportSnapshot() {
  const snapshot = window.BsbV2MapAuthoring?.captureViewportSnapshot?.();
  if (!snapshot?.ok) {
    setCaptureStatus(snapshot?.classification === 'runtime_only_reference'
      ? 'Runtime view is recorded as an anchored reference; pixel capture is unavailable on that surface.'
      : `Snapshot unavailable: ${snapshot?.error || 'no capturable viewport'}`, 'error');
    return snapshot || { ok: false };
  }
  if (state.attachments.length >= 4) {
    setCaptureStatus('The entry already has the maximum of four sources.', 'error');
    return { ok: false, error: 'project_diary_attachment_limit' };
  }
  state.attachments.push({ ...snapshot, size: Math.round(snapshot.dataUrl.length * .75), source: 'viewport_snapshot' });
  renderAttachments();
  renderDraft();
  setCaptureStatus('Current Forge view is ready as a preserved Snapshot.', 'good');
  return snapshot;
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('project_diary_file_read_failed'));
    reader.readAsDataURL(file);
  });
}

function attachmentTypeFromName(name) {
  const extension = String(name || '').toLowerCase().split('.').pop();
  if (extension === 'md') return 'text/markdown';
  if (extension === 'json') return 'application/json';
  if (['js', 'mjs', 'cjs', 'ts'].includes(extension)) return 'text/javascript';
  if (extension === 'css') return 'text/css';
  if (extension === 'html') return 'text/html';
  return 'text/plain';
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
  const input = document.getElementById('chat-input');
  const sourceText = String(input?.value || '').trim();
  const annotations = window.InteractionModeRuntime?.status?.()?.annotations || state.annotations || [];
  if (!sourceText && !annotations.length && !state.attachments.length) {
    setCaptureStatus('Write, annotate, add a source, or take a Snapshot before adding an entry.', 'error');
    input?.focus();
    return { ok: false, error: 'project_diary_source_material_required' };
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
    const capturedContext = compactWorkspaceContext(context);
    const annotationAnchor = annotations.find(item => item.surface?.tile)?.surface || null;
    const spatialAnchor = annotationAnchor ? {
      surfaceId: annotationAnchor.surfaceId,
      catalogueMapId: annotationAnchor.catalogueMapId,
      mapId: annotationAnchor.mapId,
      tile: annotationAnchor.tile,
      selection: context.scene?.selection || null,
      capturedAt: new Date().toISOString()
    } : (window.BsbV2MapAuthoring?.getDiaryAnchor?.() || state.spatialAnchor);
    const rawAttachments = [...state.attachments];
    const preview = annotations.length ? window.InteractionModeRuntime?.exportPreviewPng?.() : null;
    if (preview && rawAttachments.length < 4 && !rawAttachments.some(item => item.generatedFrom === 'annotation_session')) {
      rawAttachments.push({ name: 'annotation-preview.png', type: 'image/png', size: Math.round(preview.length * .75), dataUrl: preview, generatedFrom: 'annotation_session' });
    }
    const payload = await request('/entries', {
      method: 'POST',
      body: JSON.stringify({
        ...activeProjectParams(context),
        source: { text: sourceText, annotations, attachments: rawAttachments, classification: !sourceText && annotations.length ? 'visual_annotation' : undefined },
        context: capturedContext,
        spatialAnchor,
        provenance: { sourceSurface: annotations[0]?.surface?.surfaceId || 'project_journal', capturedBy: 'user' }
      })
    });
    state.entries = [payload.entry, ...state.entries.filter(entry => entry.id !== payload.entry.id)];
    if (input) input.value = '';
    state.attachments = [];
    state.annotations = [];
    window.InteractionModeRuntime?.clearAnnotations?.();
    window.InteractionModeRuntime?.setMode?.('inspect', { notify: false });
    const fileInput = document.getElementById('project-diary-files');
    if (fileInput) fileInput.value = '';
    renderAttachments();
    setCaptureStatus('Original preserved. AXIOM is deriving a concise interpretation from bounded project evidence.', 'good');
    renderEntries();
    const interpreted = await interpretEntry(payload.entry, rawAttachments);
    return { ok: true, entry: interpreted || payload.entry };
  } catch (error) {
    setCaptureStatus(`Capture failed before completion: ${String(error.message || error)}`, 'error');
    return { ok: false, error: String(error.message || error) };
  } finally {
    state.busy = false;
    renderBusy();
  }
}

async function interpretEntry(entry, rawAttachments = []) {
  const visualOnly = !String(entry.source?.text || '').trim() && ((entry.source?.annotations || []).length || (entry.source?.attachments || []).length);
  if (visualOnly) {
    setCaptureStatus('Original visual source preserved. Semantic interpretation awaits a note or the vision proposal slice.', 'good');
    return entry;
  }
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
      visualContext: {
        annotations: (entry.source.annotations || []).map(item => ({ kind: item.kind, surface: item.surface, pointCount: item.path?.length || 0 })),
        attachments: rawAttachments.map(item => ({ name: item.name, type: item.type, textExcerpt: typeof item.content === 'string' ? item.content.slice(0, 1600) : null, visualPixelsInterpreted: false }))
      },
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
    setCaptureStatus(`Original preserved. Local-model enhancement unavailable (${String(error.message || error)}); deterministic interpretation retained.`, 'fallback');
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
  window.InteractionModeRuntime?.loadAnnotations?.(entry.source?.annotations || [], { source: 'project_journal_open_in_forge' });
  window.EDITOR?.notify?.('info', 'Forge now owns map input. Diary context remains attached to the entry.');
  return result || { ok: true };
}

function open(options = {}) {
  ensureSurface();
  switchView('journal', { focus: options.focus !== false });
  const activeLeft = window.AxiomUXRuntime?.getState?.()?.activeLeftPanel;
  if (isBsbWorkspace() && (activeLeft === 'diary' || !document.getElementById(`panel-${activeLeft}`))) {
    window.AxiomUXRuntime?.showLeftPanel?.('bsb-map', { source: 'project_journal_open' });
  }
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
  renderDraft();
  renderBusy();
}

function renderContext() {
  const root = document.getElementById('project-diary-context');
  if (!root) return;
  const context = workspaceContext();
  const mapState = window.BsbV2MapAuthoring?.workspaceState?.() || null;
  const anchor = window.BsbV2MapAuthoring?.getDiaryAnchor?.() || state.spatialAnchor;
  const annotationState = window.InteractionModeRuntime?.status?.() || { annotations: state.annotations };
  const region = context?.scene?.catalogueMapId || context?.scene?.mapId || 'No active region';
  const selection = context?.scene?.selection;
  root.innerHTML = `
    <div class="project-diary-context-grid">
      <b>Project</b><span title="${escapeAttr(context?.project?.root || '')}">${escapeHtml(context?.project?.name || 'No verified project')}</span>
      <b>Region</b><span>${escapeHtml(region)}</span>
      <b>Surface</b><span>${escapeHtml(mapState?.view === 'runtime' ? 'Runtime preview' : mapState?.active ? 'Forge authoring' : 'AXIOM viewport')}</span>
      <b>Focus</b><span>${selection ? `${escapeHtml(selection.kind || 'record')} · ${escapeHtml(selection.id || 'unknown')}` : 'No selected record'}</span>
      <b>Anchor</b><span>${anchor?.tile ? `tile ${anchor.tile.x}, ${anchor.tile.y}` : `${annotationState.annotations?.length || 0} viewport mark${annotationState.annotations?.length === 1 ? '' : 's'}`}</span>
    </div>
    <div class="project-diary-relationship">
      <b>Original first, interpretation second</b>
      <span>Journal preserves your words and marks · AXIOM interpretations remain derived · Forge alone owns authored map changes.</span>
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
  button.disabled = state.busy || state.filesBusy;
  button.textContent = state.busy ? 'Adding…' : state.filesBusy ? 'Reading…' : 'Add entry';
}

function renderAttachments() {
  const node = document.getElementById('project-diary-attachments');
  if (!node) return;
  node.innerHTML = state.attachments.map((item, index) => `
    <span class="project-diary-source-chip" title="${escapeAttr(item.type || '')}">
      <span>${item.type?.startsWith('image/') ? 'image' : 'file'}</span>
      ${escapeHtml(item.name)}
      <button type="button" data-remove-attachment="${index}" aria-label="Remove ${escapeAttr(item.name)}">×</button>
    </span>`).join('');
}

function renderDraft() {
  const draft = document.getElementById('project-diary-draft');
  const chips = document.getElementById('project-diary-draft-context');
  const draftState = document.getElementById('project-diary-draft-state');
  if (!draft || !chips) return;
  const context = workspaceContext();
  const map = window.BsbV2MapAuthoring?.workspaceState?.() || null;
  const interaction = window.InteractionModeRuntime?.status?.() || { annotations: state.annotations || [] };
  state.annotations = interaction.annotations || [];
  const firstSurface = state.annotations[0]?.surface || null;
  const region = context?.scene?.catalogueMapId || context?.scene?.mapId || 'no region';
  const selection = context?.scene?.selection;
  const surface = firstSurface?.surfaceId || (map?.view === 'runtime' ? 'runtime preview' : map?.active ? 'Forge authoring' : 'AXIOM viewport');
  const anchor = firstSurface?.tile ? `tile ${firstSurface.tile.x},${firstSurface.tile.y}` : firstSurface?.classification === 'runtime_only_reference' ? 'runtime-only reference' : null;
  chips.innerHTML = [
    context?.project?.name,
    region,
    surface,
    anchor,
    selection?.id ? `${selection.kind || 'record'} · ${selection.id}` : null,
    state.annotations.length ? `${state.annotations.length} mark${state.annotations.length === 1 ? '' : 's'}` : null
  ].filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join('');
  if (draftState) draftState.textContent = state.annotations.length || state.attachments.length ? 'visual source ready' : 'current context auto';
  const clearMarks = document.getElementById('project-diary-clear-marks');
  if (clearMarks) clearMarks.disabled = !state.annotations.length;
}

function renderEntries() {
  const root = document.getElementById('project-diary-entries');
  if (!root) return;
  const count = document.getElementById('project-diary-count');
  if (count) count.textContent = String(state.entries.length);
  if (!state.entries.length) {
    root.innerHTML = '<div class="project-diary-empty">Nothing recorded yet. Write, point, circle, highlight, doodle, or add a source; the original will be preserved before AXIOM derives anything.</div>';
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
  const annotationCount = entry.source?.annotations?.length || 0;
  const attachmentCount = entry.source?.attachments?.length || 0;
  const original = String(entry.source?.text || '').trim() || `Visual entry · ${annotationCount} mark${annotationCount === 1 ? '' : 's'} · ${attachmentCount} source${attachmentCount === 1 ? '' : 's'}`;
  return `
    <article class="project-diary-entry" data-entry-id="${escapeAttr(entry.id)}">
      <div class="project-diary-entry-head">
        <span class="project-diary-pill source">preserved source</span>
        <span class="project-diary-pill ${interpretation?.classification === 'model_interpretation' ? 'model' : 'warn'}">${escapeHtml(modelLabel)}</span>
        <time>${escapeHtml(formatTime(entry.createdAt))}</time>
      </div>
      ${renderEntrySources(entry)}
      <div class="project-diary-source">${escapeHtml(original)}</div>
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

function renderEntrySources(entry) {
  const image = (entry.source?.attachments || []).find(item => item.type?.startsWith('image/') && item.id);
  const annotations = entry.source?.annotations || [];
  if (!image && !annotations.length) return '';
  const marks = annotations.length ? `<span>${annotations.map(item => item.kind).join(' · ')}</span>` : '';
  if (!image) return `<div class="project-diary-visual-source"><div class="project-diary-visual-placeholder">${escapeHtml(`${annotations.length} preserved viewport mark${annotations.length === 1 ? '' : 's'}`)}</div>${marks}</div>`;
  let params = null;
  try { params = new URLSearchParams(activeProjectParams()).toString(); } catch { params = ''; }
  const url = `${API_ROOT}/entries/${encodeURIComponent(entry.id)}/attachments/${encodeURIComponent(image.id)}${params ? `?${params}` : ''}`;
  return `<div class="project-diary-visual-source"><img src="${escapeAttr(url)}" alt="Preserved visual source for this Journal entry"><span>${escapeHtml(image.name)}${annotations.length ? ` · ${annotations.length} mark${annotations.length === 1 ? '' : 's'}` : ''}</span></div>`;
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
  window.EDITOR?.events?.on?.('annotation:created', event => {
    state.annotations = event?.status?.annotations || [];
    switchView('journal', { focus: false, source: 'annotation_created' });
    renderDraft();
    renderContext();
  });
  window.EDITOR?.events?.on?.('annotation:loaded', event => {
    state.annotations = event?.status?.annotations || [];
    renderDraft();
    renderContext();
  });
  window.EDITOR?.events?.on?.('annotation:cleared', () => {
    state.annotations = [];
    renderDraft();
    renderContext();
  });
  window.EDITOR?.events?.on?.('interaction:modeChanged', event => {
    if (event?.activeMode === 'annotate') switchView('journal', { focus: false, source: 'annotate_mode' });
    renderDraft();
  });
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
    activePanel: state.view === 'journal' ? 'journal' : 'chat',
    activeView: state.view,
    activeLeftPanel: window.AxiomUXRuntime?.getState?.()?.activeLeftPanel || null,
    inputOwner: window.BsbV2MapAuthoring?.workspaceState?.()?.inputOwner || null,
    spatialAnchor: window.BsbV2MapAuthoring?.getDiaryAnchor?.() || state.spatialAnchor,
    steward: state.steward,
    modelBudget: { trigger: 'capture_only', maxTokens: MODEL_MAX_TOKENS, idleCalls: 0 },
    lastReturnEntryId: state.lastReturnEntryId,
    draft: { annotations: state.annotations.length, attachments: state.attachments.length },
    error: state.error
  };
}

function prepareChatPrompt(text = '') {
  const userText = String(text || '').trim();
  if (state.view !== 'journal') return userText;
  const interaction = window.InteractionModeRuntime?.status?.() || { annotations: state.annotations };
  const annotations = interaction.annotations || [];
  const context = workspaceContext();
  if (!userText && !annotations.length && !state.attachments.length) return '';
  const visual = [
    `surface=${annotations[0]?.surface?.surfaceId || context?.authoring?.surfaceId || 'current viewport'}`,
    `marks=${annotations.map(item => item.kind).join(', ') || 'none'}`,
    `sources=${state.attachments.map(item => item.name).join(', ') || 'none'}`,
    'classification=journal_draft_projection',
    'note=image pixels are preserved sources but are not supplied to the text-only chat adapter in this slice'
  ].join('; ');
  return `[Current Journal draft context: ${visual}]\n${userText || 'Describe what can be inferred safely from the marked viewport context, and state what remains uncertain.'}`;
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
    switchView,
    prepareChatPrompt,
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
  switchView,
  prepareChatPrompt,
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
