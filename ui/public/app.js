const state = {
  refreshIntervalMs: 10000,
  refreshTimer: null,
  currentRunId: null,
  currentOutput: '',
  taLoading: false,
};

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? '';
}

function renderList(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  (items && items.length ? items : ['None']).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    el.appendChild(li);
  });
}

function dashboardText(files, rel) {
  return files?.[rel]?.content?.trim() || '(missing)';
}

async function refreshDashboard() {
  try {
    const data = await api('/api/dashboard');
    const s = data.state || {};
    setText('current_focus', s.current_focus || '-');
    renderList('next_actions', s.next_actions || []);
    renderList('blockers', s.blockers || []);

    setText('decisions_text', dashboardText(data.files, 'brain/emergence/decisions.md'));
    setText('tasks_text', dashboardText(data.files, 'brain/emergence/tasks.md'));
    setText('roadmap_text', dashboardText(data.files, 'brain/emergence/roadmap.md'));
    setText('plan_text', dashboardText(data.files, 'brain/emergence/plan.md'));
    setText('brain_text', dashboardText(data.files, 'brain/emergence/project_brain.md'));
    setText('changelog_text', dashboardText(data.files, 'brain/emergence/changelog.md'));

    setText('refreshMeta', `Last refreshed: ${new Date(data.refreshedAt).toLocaleString()} (every ${Math.round((data.refreshIntervalMs || 10000) / 1000)}s)`);
    setText('refreshErrors', data.errors?.length ? `Read errors: ${data.errors.map((e) => `${e.file}: ${e.error}`).join(' | ')}` : '');

    const badge = document.getElementById('status_badge');
    if (badge) {
      badge.textContent = 'LIVE';
      badge.classList.remove('bad');
      badge.classList.add('ok');
    }

    const nextInterval = Number(data.refreshIntervalMs) || 10000;
    if (nextInterval !== state.refreshIntervalMs) {
      state.refreshIntervalMs = nextInterval;
      startAutoRefresh();
    }
  } catch (err) {
    const badge = document.getElementById('status_badge');
    if (badge) {
      badge.textContent = 'ERROR';
      badge.classList.remove('ok');
      badge.classList.add('bad');
    }
    setText('error_box', String(err));
    document.getElementById('error_wrap').style.display = 'block';
  }
}

function startAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(refreshDashboard, state.refreshIntervalMs);
}

async function loadProjects() {
  const data = await api('/api/projects');
  const select = document.getElementById('projectSelect');
  select.innerHTML = '';
  data.projects.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.key;
    opt.textContent = `${p.name} (${p.path})`;
    select.appendChild(opt);
  });
}

async function loadTasks() {
  const data = await api('/api/tasks');
  const select = document.getElementById('taskSelect');
  select.innerHTML = '';
  data.tasks.forEach((task) => {
    const opt = document.createElement('option');
    opt.value = task;
    opt.textContent = task;
    select.appendChild(opt);
  });
  if (data.tasks[0]) document.getElementById('taskIdInput').value = data.tasks[0];
}

function selectedTaskId() {
  return (document.getElementById('taskIdInput').value || document.getElementById('taskSelect').value || '').trim();
}

function setRunHeader({ status = 'idle', exit = '—', duration = '—', artifacts = [] }) {
  setText('runStatus', status);
  setText('runExit', exit);
  setText('runDuration', duration);
  setText('artifactPath', artifacts.length ? `Logs/artifacts: ${artifacts.join(', ')}` : 'No artifacts yet.');
}

function appendOutput(text) {
  state.currentOutput += text;
  const out = document.getElementById('commandOutput');
  out.textContent = state.currentOutput;
  out.scrollTop = out.scrollHeight;
}

function actionMode() {
  return document.getElementById('actionSelect').value;
}

function syncActionUi() {
  const mode = actionMode();
  const executeButton = document.getElementById('executeBtn');
  if (executeButton) executeButton.textContent = `Execute ${mode}`;
}

function setTalentUiState({ status = '', error = '', loading = false } = {}) {
  const statusEl = document.getElementById('taCandidateStatus');
  const errorEl = document.getElementById('taCandidateError');
  const buttonEl = document.getElementById('generateCandidatesBtn');
  if (statusEl) statusEl.textContent = status;
  if (errorEl) {
    errorEl.textContent = error;
    errorEl.classList.toggle('hidden', !error);
  }
  if (buttonEl) {
    buttonEl.disabled = loading;
    buttonEl.textContent = loading ? 'Generating...' : 'Generate Candidates';
  }
}

function createSectionList(title, items = [], emptyLabel = 'None') {
  const wrapper = document.createElement('div');
  wrapper.className = 'ta-candidate-section';

  const heading = document.createElement('div');
  heading.className = 'card-title';
  heading.textContent = title;
  wrapper.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'list compact-list';
  (items.length ? items : [emptyLabel]).forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    list.appendChild(li);
  });
  wrapper.appendChild(list);

  return wrapper;
}

function renderTalentCandidates(candidates = []) {
  const root = document.getElementById('taCandidateResults');
  if (!root) return;

  root.innerHTML = '';

  candidates.forEach((candidate) => {
    const card = document.createElement('article');
    card.className = 'card ta-candidate-card';

    const header = document.createElement('div');
    header.className = 'ta-candidate-header';

    const identity = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'ta-candidate-name';
    name.textContent = candidate.name || 'Unnamed Candidate';
    const role = document.createElement('div');
    role.className = 'ta-candidate-role';
    role.textContent = candidate.role || 'Unknown Role';
    const department = document.createElement('div');
    department.className = 'ta-candidate-role';
    department.textContent = `Department: ${candidate.department || 'Unknown Department'}`;
    identity.appendChild(name);
    identity.appendChild(role);
    identity.appendChild(department);

    const confidence = document.createElement('div');
    confidence.className = 'ta-candidate-confidence';
    const confidenceValue = Number(candidate.confidence);
    confidence.textContent = `Confidence ${Number.isFinite(confidenceValue) ? Math.round(confidenceValue * 100) : 0}%`;

    header.appendChild(identity);
    header.appendChild(confidence);
    card.appendChild(header);

    const summary = document.createElement('p');
    summary.className = 'signal-summary';
    summary.textContent = candidate.summary || 'No summary provided.';
    card.appendChild(summary);

    const modelPolicy = document.createElement('div');
    modelPolicy.className = 'ta-candidate-policy';
    modelPolicy.textContent = `Model policy: ${candidate.model_policy?.preferred || 'n/a'} - ${candidate.model_policy?.reason || 'No reason provided.'}`;
    card.appendChild(modelPolicy);

    const why = document.createElement('div');
    why.className = 'ta-candidate-why';
    why.textContent = candidate.why_this_role || 'No fit rationale provided.';
    card.appendChild(why);

    const sectionGrid = document.createElement('div');
    sectionGrid.className = 'ta-candidate-section-grid';
    sectionGrid.appendChild(createSectionList('Strengths', candidate.strengths || []));
    sectionGrid.appendChild(createSectionList('Weaknesses', candidate.weaknesses || []));
    sectionGrid.appendChild(createSectionList('Recommended Tools', candidate.recommended_tools || []));
    sectionGrid.appendChild(createSectionList('Recommended Skills', candidate.recommended_skills || []));
    sectionGrid.appendChild(createSectionList('Risk Notes', candidate.risk_notes || []));
    card.appendChild(sectionGrid);

    root.appendChild(card);
  });
}

async function generateTalentCandidates() {
  const gapInput = document.getElementById('talentGapInput');
  const description = String(gapInput?.value || '').trim();
  if (!description) {
    setTalentUiState({
      status: 'Enter a gap description to generate candidate profiles.',
      error: 'Gap description is required.',
      loading: false,
    });
    renderTalentCandidates([]);
    return;
  }

  state.taLoading = true;
  setTalentUiState({
    status: 'Generating candidate profiles...',
    error: '',
    loading: true,
  });

  try {
    const response = await api('/api/ta/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gap: {
          description,
        },
      }),
    });

    const candidates = Array.isArray(response.candidates) ? response.candidates : [];
    renderTalentCandidates(candidates);
    setTalentUiState({
      status: candidates.length
        ? `Generated ${candidates.length} candidate profile${candidates.length === 1 ? '' : 's'}.`
        : 'No candidates were returned.',
      error: candidates.length ? '' : 'The generator returned no candidates.',
      loading: false,
    });
  } catch (error) {
    renderTalentCandidates([]);
    setTalentUiState({
      status: 'Candidate generation failed.',
      error: String(error.message || error),
      loading: false,
    });
  } finally {
    state.taLoading = false;
  }
}

async function runStructuredQa() {
  const statusEl = document.getElementById('qaStatus');
  const reportEl = document.getElementById('qaReport');

  if (statusEl) statusEl.textContent = 'Running structured QA...';
  if (reportEl) reportEl.textContent = '';

  try {
    const report = await api('/api/qa/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (statusEl) statusEl.textContent = `${String(report.status || 'unknown').toUpperCase()}: ${report.summary || ''}`;
    if (reportEl) reportEl.textContent = JSON.stringify(report, null, 2);
  } catch (error) {
    if (statusEl) statusEl.textContent = `FAIL: ${String(error.message || error)}`;
    if (reportEl) reportEl.textContent = '';
  }
}

async function executeAction() {
  const mode = actionMode();
  const taskId = selectedTaskId();
  const payload = {
    action: mode,
    project: document.getElementById('projectSelect').value,
    taskId,
  };

  state.currentOutput = '';
  appendOutput('Starting...\n');
  setRunHeader({ status: 'running' });

  const response = await api('/api/execute', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  state.currentRunId = response.runId;
  streamRun(response.runId);
}

function streamRun(runId) {
  const es = new EventSource(`/api/stream/${runId}`);
  es.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    if (event.type === 'stdout' || event.type === 'stderr') appendOutput(event.text || '');
    if (event.type === 'status') appendOutput(`${event.message}\n`);
    if (event.type === 'done') {
      const duration = event.durationMs ? `${(event.durationMs / 1000).toFixed(2)}s` : '—';
      setRunHeader({ status: event.status, exit: event.exitCode, duration, artifacts: event.artifacts || [] });
      es.close();
    }
  };
}

async function hydrateRunHistory() {
  const data = await api('/api/runs');
  const latest = data.runs?.[0];
  if (!latest) return;
  state.currentOutput = '';
  latest.logs.forEach((l) => {
    if (l.text) state.currentOutput += l.text;
    else if (l.message) state.currentOutput += `${l.message}\n`;
  });
  document.getElementById('commandOutput').textContent = state.currentOutput;
  const duration = latest.durationMs ? `${(latest.durationMs / 1000).toFixed(2)}s` : '—';
  setRunHeader({ status: latest.status, exit: latest.exitCode ?? '—', duration, artifacts: latest.artifacts || [] });
}

async function postAdd(url, payload) {
  const res = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  setText('addMessage', `Success: ${JSON.stringify(res)}`);
  await loadTasks();
  await loadProjects();
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('refreshBtn').onclick = refreshDashboard;

  const legacyBtn = document.getElementById('toggleLegacyBtn');
  const legacyUi = document.getElementById('legacy-ui');
  if (legacyBtn && legacyUi) {
    legacyBtn.onclick = () => {
      legacyUi.classList.toggle('legacy-hidden');
      legacyBtn.textContent = legacyUi.classList.contains('legacy-hidden') ? 'Show Legacy Controls' : 'Hide Legacy Controls';
    };
  }

  document.getElementById('actionSelect').onchange = syncActionUi;
  document.getElementById('taskSelect').onchange = (e) => { document.getElementById('taskIdInput').value = e.target.value; };
  document.getElementById('executeBtn').onclick = () => executeAction().catch((e) => appendOutput(`\nERROR: ${e.message}\n`));
  document.getElementById('generateCandidatesBtn').onclick = () => generateTalentCandidates();
  document.getElementById('runQaBtn').onclick = () => runStructuredQa();
  document.getElementById('copyOutputBtn').onclick = () => navigator.clipboard.writeText(state.currentOutput || '');
  document.getElementById('openTaskFolderBtn').onclick = async () => {
    try {
      await postAdd('/api/open-task-folder', { taskId: selectedTaskId() });
    } catch (e) {
      appendOutput(`\nERROR: ${e.message}\n`);
    }
  };

  document.getElementById('addIdeaBtn').onclick = async () => {
    const text = window.prompt('Idea text:');
    if (text) await postAdd('/api/add/idea', { text });
  };
  document.getElementById('addTaskBtn').onclick = async () => {
    const title = window.prompt('Task title:');
    if (title) await postAdd('/api/add/task', { title });
  };
  document.getElementById('addProjectBtn').onclick = async () => {
    const name = window.prompt('Project key/name:');
    const projectPath = window.prompt('Project path (must exist):');
    if (name && projectPath) await postAdd('/api/add/project', { name, path: projectPath });
  };

  await Promise.all([refreshDashboard(), loadProjects(), loadTasks(), hydrateRunHistory()]);
  syncActionUi();
  startAutoRefresh();
});

window.__ACE_APP_TEST__ = {
  renderTalentCandidates,
  generateTalentCandidates,
};
