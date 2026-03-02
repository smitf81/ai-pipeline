const state = {
  refreshIntervalMs: 10000,
  refreshTimer: null,
  presets: [],
  currentRunId: null,
  currentOutput: '',
  pendingApplyPayload: null,
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

    setText('decisions_text', dashboardText(data.files, 'projects/emergence/decisions.md'));
    setText('tasks_text', dashboardText(data.files, 'projects/emergence/tasks.md'));
    setText('roadmap_text', dashboardText(data.files, 'projects/emergence/roadmap.md'));
    setText('plan_text', dashboardText(data.files, 'projects/emergence/plan.md'));
    setText('brain_text', dashboardText(data.files, 'projects/emergence/project_brain.md'));
    setText('changelog_text', dashboardText(data.files, 'projects/emergence/changelog.md'));

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

async function loadPresets() {
  const data = await api('/api/presets');
  state.presets = data.presets || [];
  const select = document.getElementById('presetSelect');
  const help = document.getElementById('presetHelp');
  select.innerHTML = '';
  state.presets.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
  const first = state.presets[0];
  help.textContent = first ? `${first.name}: ${first.description}` : 'No presets configured.';
  select.onchange = () => {
    const preset = state.presets.find((p) => p.name === select.value);
    help.textContent = preset ? `${preset.name}: ${preset.description}` : '';
  };
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
  const isRun = actionMode() === 'run';
  document.getElementById('presetRow').style.display = isRun ? 'block' : 'none';
}

function openReviewModal(text, onConfirm) {
  const modal = document.getElementById('reviewModal');
  setText('reviewBody', text);
  modal.classList.remove('hidden');
  const confirm = document.getElementById('confirmReviewBtn');
  confirm.onclick = () => {
    modal.classList.add('hidden');
    onConfirm();
  };
}

function closeReviewModal() {
  document.getElementById('reviewModal').classList.add('hidden');
}

async function executeAction(forceApply = false) {
  const mode = actionMode();
  const taskId = selectedTaskId();
  const payload = {
    action: mode.includes('apply') ? 'apply' : mode,
    project: document.getElementById('projectSelect').value,
    taskId,
    preset: document.getElementById('presetSelect').value,
    dryRun: mode === 'apply-dry-run',
  };

  if (payload.action === 'apply' && !forceApply) {
    const review = await api('/api/execute', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, previewOnly: true }),
    });
    const reviewText = [
      `Validation: ${review.ok ? 'PASS' : 'FAIL'}`,
      `Branch: ${review.review.branchName}`,
      `Changed files: ${review.review.changedFiles.join(', ') || '(none)'}`,
      `Refusal reasons: ${review.review.refusalReasons.join(' | ') || '(none)'}`,
      `Warnings: ${review.review.warnings.join(' | ') || '(none)'}`,
      payload.dryRun ? 'Dry run will validate without writing git changes.' : 'Apply will create branch + commit.',
    ].join('\n');

    if (payload.dryRun) {
      openReviewModal(reviewText, () => executeAction(true));
      return;
    }

    if (!review.ok) {
      openReviewModal(reviewText, () => {});
      return;
    }

    openReviewModal(reviewText, () => executeAction(true));
    return;
  }

  if (payload.action === 'apply') payload.confirmApply = true;

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
      if (event.meta?.branch || event.meta?.commit) {
        appendOutput(`\nBranch: ${event.meta.branch || 'n/a'}\nCommit: ${event.meta.commit || 'n/a'}\nNext: ${event.meta.nextAction || ''}\n`);
      }
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
  document.getElementById('actionSelect').onchange = syncActionUi;
  document.getElementById('taskSelect').onchange = (e) => { document.getElementById('taskIdInput').value = e.target.value; };
  document.getElementById('presetHelpBtn').onclick = () => document.getElementById('presetHelp').classList.toggle('show-help');
  document.getElementById('executeBtn').onclick = () => executeAction().catch((e) => appendOutput(`\nERROR: ${e.message}\n`));
  document.getElementById('cancelReviewBtn').onclick = closeReviewModal;
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

  await Promise.all([refreshDashboard(), loadProjects(), loadTasks(), loadPresets(), hydrateRunHistory()]);
  syncActionUi();
  startAutoRefresh();
});
