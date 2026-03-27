const state = {
  refreshIntervalMs: 4000,
  refreshTimer: null,
  currentRunId: null,
  currentOutput: '',
  currentStderr: '',
  qaMode: false,
  lastDashboardSignature: '',
  lastRunsSignature: '',
  lastRefreshAt: null,
  lastRefreshError: '',
  connectionState: 'unknown',
  lastCommandSummary: null,
  lastSuccessfulRefreshAt: null,
  taLoading: false,
  projects: [],
  projectLaunching: false,
  projectLaunch: null,
};

function detectQaMode() {
  const { searchParams, pathname } = new URL(window.location.href);
  return searchParams.get('mode') === 'qa' || pathname === '/qa';
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function shortText(value, max = 160) {
  const text = String(value || '').trim();
  if (!text) return '';
  const firstLine = text.split(/\r?\n/).find(Boolean) || text;
  return firstLine.length > max ? `${firstLine.slice(0, max - 1)}…` : firstLine;
}

function canonicalSlicesText(files) {
  return dashboardText(files, 'brain/emergence/slices.md') || dashboardText(files, 'brain/emergence/tasks.md');
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text ?? '';
}

function setVisible(id, visible) {
  const el = document.getElementById(id);
  if (el) el.style.display = visible ? '' : 'none';
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
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

function setModeUi() {
  const modeLabel = state.qaMode ? 'QA VIEWER' : 'OPERATOR';
  const readonlyLabel = state.qaMode ? 'READ ONLY' : 'READ WRITE';
  document.body.classList.toggle('qa-mode', state.qaMode);
  document.documentElement.dataset.uiMode = state.qaMode ? 'qa' : 'operator';
  document.body.dataset.uiMode = state.qaMode ? 'qa' : 'operator';
  setText('mode_badge', modeLabel);
  setText('readonly_badge', readonlyLabel);
  setText('uiModeLabel', state.qaMode ? 'qa viewer' : 'operator');
}

function buildCommandSummary(run = null) {
  if (!run) {
    return {
      name: 'none',
      state: 'idle',
      exitCode: '—',
      timestamp: '—',
      error: 'none',
    };
  }
  const stderr = (run.logs || []).filter((entry) => entry.type === 'stderr').map((entry) => entry.text || '').join('\n');
  const status = String(run.status || '').toLowerCase();
  const exitCode = run.exitCode ?? '—';
  const success = status === 'success' || exitCode === 0;
  return {
    name: run.meta?.command || run.action || run.runId || 'unknown command',
    state: status === 'running' ? 'running' : (success ? 'success' : 'failure'),
    exitCode,
    timestamp: formatTimestamp(run.finishedAt || run.startedAt),
    error: status === 'running' ? 'in progress' : (shortText(stderr) || (success ? 'none' : shortText(run.meta?.summary || run.meta?.error) || 'see console output')),
  };
}

function renderCommandSummary(summary = null) {
  const resolved = summary || {
    name: 'none',
    state: 'idle',
    exitCode: '—',
    timestamp: '—',
    error: 'none',
  };
  setText('pipelineCommandName', resolved.name);
  setText('pipelineCommandState', resolved.state);
  setText('pipelineCommandExit', String(resolved.exitCode ?? '—'));
  setText('pipelineCommandTimestamp', resolved.timestamp);
  setText('pipelineCommandError', resolved.error || 'none');
  setText('uiLastCommandSummary', `${resolved.name} | ${resolved.state} | exit ${resolved.exitCode}`);
}

function updateRefreshStatus({ connected, error = '', refreshedAt = null, runs = null } = {}) {
  state.connectionState = connected ? 'connected' : 'degraded';
  state.lastRefreshError = error || '';
  if (connected && refreshedAt) {
    state.lastSuccessfulRefreshAt = refreshedAt;
  }
  state.lastRefreshAt = refreshedAt || state.lastRefreshAt;
  setText('uiConnectionState', connected ? 'connected' : 'retrying');
  setText('uiLastRefresh', state.lastSuccessfulRefreshAt ? formatTimestamp(state.lastSuccessfulRefreshAt) : 'never');
  setText('uiLastRefreshError', error ? shortText(error, 120) : 'none');
  setText('refreshErrors', error ? `Read error: ${shortText(error, 180)}` : '');
  const badge = document.getElementById('status_badge');
  if (badge) {
    badge.textContent = connected ? (state.qaMode ? 'QA LIVE' : 'LIVE') : 'RETRYING';
    badge.classList.toggle('ok', connected);
    badge.classList.toggle('bad', !connected);
  }
  const latestRun = Array.isArray(runs) && runs.length ? runs[0] : null;
  if (latestRun) {
    state.lastCommandSummary = buildCommandSummary(latestRun);
  }
  renderCommandSummary(state.lastCommandSummary);
}

async function refreshDashboard() {
  try {
    const [dashboard, runs, health] = await Promise.all([
      api('/api/dashboard'),
      api('/api/runs'),
      api('/api/health'),
    ]);
    const data = dashboard || {};
    const s = data.state || {};
    const dashboardSignature = JSON.stringify({
      current_focus: s.current_focus || '',
      next_actions: s.next_actions || [],
      blockers: s.blockers || [],
      files: {
        decisions: dashboardText(data.files, 'brain/emergence/decisions.md'),
        slices: canonicalSlicesText(data.files),
        roadmap: dashboardText(data.files, 'brain/emergence/roadmap.md'),
        plan: dashboardText(data.files, 'brain/emergence/plan.md'),
        brain: dashboardText(data.files, 'brain/emergence/project_brain.md'),
        changelog: dashboardText(data.files, 'brain/emergence/changelog.md'),
      },
    });
    if (dashboardSignature !== state.lastDashboardSignature) {
      state.lastDashboardSignature = dashboardSignature;
      setText('current_focus', s.current_focus || '-');
      renderList('next_actions', s.next_actions || []);
      renderList('blockers', s.blockers || []);

      setText('decisions_text', dashboardText(data.files, 'brain/emergence/decisions.md'));
      setText('tasks_text', canonicalSlicesText(data.files));
      setText('roadmap_text', dashboardText(data.files, 'brain/emergence/roadmap.md'));
      setText('plan_text', dashboardText(data.files, 'brain/emergence/plan.md'));
      setText('brain_text', dashboardText(data.files, 'brain/emergence/project_brain.md'));
      setText('changelog_text', dashboardText(data.files, 'brain/emergence/changelog.md'));
    }

    const refreshError = data.errors?.length ? data.errors.map((e) => `${e.file}: ${e.error}`).join(' | ') : '';
    setText('refreshMeta', `Last refreshed: ${new Date(data.refreshedAt).toLocaleString()} (every ${Math.round((data.refreshIntervalMs || state.refreshIntervalMs) / 1000)}s)`);
    updateRefreshStatus({
      connected: health?.ok !== false,
      error: refreshError,
      refreshedAt: data.refreshedAt,
      runs: runs?.runs || [],
    });
    document.getElementById('error_wrap').style.display = 'none';
    setText('error_box', '');

    const nextInterval = 4000;
    if (nextInterval !== state.refreshIntervalMs) {
      state.refreshIntervalMs = nextInterval;
      startAutoRefresh();
    }
  } catch (err) {
    const message = String(err?.message || err);
    state.lastRefreshError = message;
    updateRefreshStatus({
      connected: false,
      error: message,
      refreshedAt: state.lastRefreshAt,
      runs: [],
    });
    setText('error_box', message);
    document.getElementById('error_wrap').style.display = 'block';
  }
}

function startAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(refreshDashboard, state.refreshIntervalMs);
}

function summarizeRunLogs(run) {
  if (!run) return;
  state.currentStderr = (run.logs || []).filter((entry) => entry.type === 'stderr').map((entry) => entry.text || '').join('\n');
  state.lastCommandSummary = buildCommandSummary(run);
  renderCommandSummary(state.lastCommandSummary);
}

async function loadProjects() {
  const data = await api('/api/projects');
  const select = document.getElementById('projectSelect');
  const currentSelection = String(select?.value || '').trim();
  const projects = Array.isArray(data.projects) ? data.projects : [];
  state.projects = projects;
  select.innerHTML = '';
  projects.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.key;
    opt.textContent = `${p.name} (${p.path})`;
    select.appendChild(opt);
  });
  const topdownSlice = projects.find((project) => project.key === 'topdown-slice');
  const nextSelection = projects.some((project) => project.key === currentSelection)
    ? currentSelection
    : (topdownSlice?.key || projects[0]?.key || '');
  select.value = nextSelection;
  syncProjectRunnerUi();
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
  const success = String(status || '').toLowerCase() === 'success';
  renderCommandSummary({
    name: state.lastCommandSummary?.name || 'current run',
    state: success ? 'success' : (status || 'idle'),
    exitCode: exit,
    timestamp: state.lastCommandSummary?.timestamp || formatTimestamp(Date.now()),
    error: state.currentStderr ? shortText(state.currentStderr) : state.lastCommandSummary?.error || 'none',
  });
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

function selectedProjectRecord() {
  const select = document.getElementById('projectSelect');
  const projectKey = String(select?.value || '').trim();
  return state.projects.find((project) => project.key === projectKey) || null;
}

function setProjectRunUi({ status = 'No project launched.', url = '', supportedOrigin = '', loading = false } = {}) {
  const launchButton = document.getElementById('runProjectBtn');
  const project = selectedProjectRecord();
  if (launchButton) {
    launchButton.disabled = loading || !project?.launchable;
    launchButton.textContent = loading ? 'Launching...' : 'Run Project';
  }
  setText('projectRunStatus', status);
  const link = document.getElementById('projectRunLink');
  if (link) {
    const displayUrl = url || supportedOrigin || '';
    const label = url
      ? `Launched URL: ${displayUrl}`
      : (supportedOrigin ? `Supported URL: ${displayUrl}` : '');
    link.textContent = label;
    link.href = displayUrl || '';
    link.style.display = displayUrl ? 'inline-block' : 'none';
  }
}

function syncProjectRunnerUi() {
  const project = selectedProjectRecord();
  if (!project) {
    setProjectRunUi({ status: 'No project selected.', url: '', supportedOrigin: '', loading: false });
    return;
  }
  if (state.projectLaunch?.project === project.key && state.projectLaunch?.url) {
    setProjectRunUi({
      status: `${project.name} is running locally.`,
      url: state.projectLaunch.url,
      supportedOrigin: project.supportedOrigin || '',
      loading: false,
    });
    return;
  }
  if (!project.launchable) {
    setProjectRunUi({
      status: 'Run Project currently supports the topdown-slice static web prototype only.',
      url: '',
      supportedOrigin: '',
      loading: false,
    });
    return;
  }
  setProjectRunUi({
    status: 'Ready to launch the selected project at the supported origin.',
    url: '',
    supportedOrigin: project.supportedOrigin || '',
    loading: false,
  });
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

async function runSelectedProject() {
  const project = selectedProjectRecord();
  if (!project) {
    setProjectRunUi({ status: 'Select a project before launching.', url: '', supportedOrigin: '', loading: false });
    return;
  }
  if (!project.launchable) {
    setProjectRunUi({
      status: 'Run Project currently supports the topdown-slice static web prototype only.',
      url: '',
      supportedOrigin: '',
      loading: false,
    });
    return;
  }

  state.projectLaunching = true;
  setProjectRunUi({
    status: `Launching ${project.name} at the supported origin...`,
    url: '',
    supportedOrigin: project.supportedOrigin || '',
    loading: true,
  });

  try {
    const response = await api('/api/projects/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: project.key }),
    });
    state.projectLaunch = {
      project: project.key,
      url: response.url || '',
      reused: Boolean(response.reused),
    };
    setProjectRunUi({
      status: response.reused
        ? `${project.name} is already running locally.`
        : `${project.name} launched successfully.`,
      url: response.url || '',
      supportedOrigin: response.supportedOrigin || project.supportedOrigin || '',
      loading: false,
    });
  } catch (error) {
    state.projectLaunch = null;
    setProjectRunUi({
      status: `Project launch failed: ${String(error.message || error)}`,
      url: '',
      supportedOrigin: project.supportedOrigin || '',
      loading: false,
    });
  } finally {
    state.projectLaunching = false;
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
  state.currentStderr = '';
  appendOutput('Starting...\n');
  setRunHeader({ status: 'running' });
  state.lastCommandSummary = {
    name: `${mode} ${taskId || ''}`.trim(),
    state: 'running',
    exitCode: '—',
    timestamp: formatTimestamp(Date.now()),
    error: 'none',
  };
  renderCommandSummary(state.lastCommandSummary);

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
    if (event.type === 'stdout' || event.type === 'stderr') {
      appendOutput(event.text || '');
      if (event.type === 'stderr') {
        state.currentStderr += `${state.currentStderr ? '\n' : ''}${event.text || ''}`;
      }
    }
    if (event.type === 'status') appendOutput(`${event.message}\n`);
    if (event.type === 'done') {
      const duration = event.durationMs ? `${(event.durationMs / 1000).toFixed(2)}s` : '—';
      setRunHeader({ status: event.status, exit: event.exitCode, duration, artifacts: event.artifacts || [] });
      state.lastCommandSummary = {
        ...(state.lastCommandSummary || {}),
        state: event.status,
        exitCode: event.exitCode,
        timestamp: state.lastCommandSummary?.timestamp || formatTimestamp(Date.now()),
        error: state.currentStderr ? shortText(state.currentStderr) : (event.status === 'success' ? 'none' : state.lastCommandSummary?.error || 'see console output'),
      };
      renderCommandSummary(state.lastCommandSummary);
      es.close();
    }
  };
}

async function hydrateRunHistory() {
  const data = await api('/api/runs');
  const latest = data.runs?.[0];
  if (!latest) return;
  state.currentOutput = '';
  state.currentStderr = '';
  latest.logs.forEach((l) => {
    if (l.text) state.currentOutput += l.text;
    else if (l.message) state.currentOutput += `${l.message}\n`;
    if (l.type === 'stderr' && l.text) state.currentStderr += `${state.currentStderr ? '\n' : ''}${l.text}`;
  });
  document.getElementById('commandOutput').textContent = state.currentOutput;
  const duration = latest.durationMs ? `${(latest.durationMs / 1000).toFixed(2)}s` : '—';
  setRunHeader({ status: latest.status, exit: latest.exitCode ?? '—', duration, artifacts: latest.artifacts || [] });
  summarizeRunLogs(latest);
}

async function postAdd(url, payload) {
  const res = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  setText('addMessage', `Success: ${JSON.stringify(res)}`);
  await loadTasks();
  await loadProjects();
}

document.addEventListener('DOMContentLoaded', async () => {
  state.qaMode = detectQaMode();
  setModeUi();
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
  document.getElementById('projectSelect').onchange = syncProjectRunnerUi;
  document.getElementById('taskSelect').onchange = (e) => { document.getElementById('taskIdInput').value = e.target.value; };
  document.getElementById('executeBtn').onclick = () => executeAction().catch((e) => appendOutput(`\nERROR: ${e.message}\n`));
  document.getElementById('runProjectBtn').onclick = () => runSelectedProject();
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

  setText('uiLastRefreshError', 'none');
  setText('uiConnectionState', 'connecting');
  await Promise.all([refreshDashboard(), loadProjects(), loadTasks(), hydrateRunHistory()]);
  syncActionUi();
  startAutoRefresh();
});

window.__ACE_APP_TEST__ = {
  renderTalentCandidates,
  generateTalentCandidates,
  detectQaMode,
  buildCommandSummary,
  loadProjects,
  renderCommandSummary,
  runSelectedProject,
  syncProjectRunnerUi,
  updateRefreshStatus,
  setModeUi,
};
