export const AGENT_ACTIVITY_CONTRACT = 'axiom.agent-activity.v1';
export const AGENT_ACTIVITY_STORAGE_KEY = 'axiom.agent.activity.v1';

const MAX_ATTEMPTS = 24;
const MAX_STAGES = 40;
const MAX_DETAIL_TEXT = 1200;

function now() {
  return new Date().toISOString();
}

function identifier(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${uuid || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

function boundedText(value, limit = MAX_DETAIL_TEXT) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function safeDetail(value) {
  if (value == null) return null;
  try {
    const serialized = JSON.stringify(value, (key, item) => {
      if (typeof item !== 'string') return item;
      if (['content', 'snapshot', 'sourceText'].includes(key) && item.length > 220) return `[omitted ${item.length} chars]`;
      return boundedText(item);
    });
    return JSON.parse(serialized);
  } catch {
    return { summary: boundedText(value) };
  }
}

function normalizeStatus(value, fallback = 'running') {
  const status = String(value || fallback);
  return ['queued', 'running', 'awaiting_user', 'completed', 'degraded', 'blocked', 'failed', 'cancelled'].includes(status)
    ? status
    : fallback;
}

export function createAgentActivityAttempt(input = {}) {
  const startedAt = input.startedAt || now();
  return {
    contract: AGENT_ACTIVITY_CONTRACT,
    id: input.id || identifier('attempt'),
    sourceSurface: input.sourceSurface === 'journal' ? 'journal' : 'chat',
    displayText: boundedText(input.displayText || input.userText || 'Co-Pilot request', 500),
    status: normalizeStatus(input.status),
    summary: boundedText(input.summary || 'Request received.'),
    workspace: safeDetail(input.workspace),
    stages: [],
    startedAt,
    updatedAt: startedAt,
    completedAt: null
  };
}

export function appendAgentActivityStage(attempt, input = {}) {
  if (!attempt || attempt.contract !== AGENT_ACTIVITY_CONTRACT) throw new Error('agent_activity_attempt_invalid');
  const at = input.at || now();
  const stage = {
    id: input.id || identifier('stage'),
    phase: boundedText(input.phase || 'activity', 80),
    label: boundedText(input.label || input.phase || 'Activity', 160),
    status: normalizeStatus(input.status),
    summary: boundedText(input.summary || '', 600),
    detail: safeDetail(input.detail),
    receipt: safeDetail(input.receipt),
    at
  };
  const next = {
    ...attempt,
    status: normalizeStatus(input.attemptStatus || stage.status, attempt.status),
    summary: stage.summary || attempt.summary,
    updatedAt: at,
    stages: [...(attempt.stages || []), stage].slice(-MAX_STAGES)
  };
  if (['completed', 'blocked', 'failed', 'cancelled'].includes(next.status)) next.completedAt = at;
  return next;
}

export function summarizeActivityReceipt(receipt = {}) {
  const result = receipt?.result || receipt || {};
  const client = result.clientApplyReceipt || receipt?.clientApplyReceipt || null;
  const applied = client?.applied === true || result.applied === true || receipt.applied === true;
  const failed = receipt?.ok === false || result?.ok === false || client?.ok === false;
  const revision = client?.afterRevision ?? result?.afterRevision ?? null;
  const target = receipt?.tool || result?.tool || receipt?.actionType || client?.actionType || 'tool';
  if (failed) return `${target} failed${receipt?.error ? `: ${receipt.error}` : client?.reason ? `: ${client.reason}` : ''}`;
  if (applied) return `${target} applied${revision != null ? ` · revision ${revision}` : ''}`;
  return `${target} completed`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}

function formatTime(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderDetail(stage) {
  const payload = stage.receipt || stage.detail;
  if (!payload) return '';
  const label = stage.receipt ? 'Receipt' : 'Details';
  return `<details class="agent-activity-detail"><summary>${label}</summary><pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre></details>`;
}

function renderAttempt(attempt, index) {
  const stages = (attempt.stages || []).map(stage => `
    <li class="agent-activity-stage" data-status="${escapeHtml(stage.status)}">
      <span class="agent-activity-stage-dot" aria-hidden="true"></span>
      <div><b>${escapeHtml(stage.label)}</b>${stage.summary ? `<span>${escapeHtml(stage.summary)}</span>` : ''}${renderDetail(stage)}</div>
      <time>${escapeHtml(formatTime(stage.at))}</time>
    </li>`).join('');
  return `<details class="agent-activity-attempt" data-status="${escapeHtml(attempt.status)}" ${index === 0 ? 'open' : ''}>
    <summary>
      <span class="agent-activity-attempt-state">${escapeHtml(attempt.status.replace(/_/g, ' '))}</span>
      <span class="agent-activity-attempt-title">${escapeHtml(attempt.displayText)}</span>
      <span>${escapeHtml(attempt.sourceSurface)} · ${escapeHtml(formatTime(attempt.startedAt))}</span>
    </summary>
    <ol>${stages || '<li class="agent-activity-empty">Waiting for the first recorded stage.</li>'}</ol>
  </details>`;
}

export function createAgentActivityRuntime(options = {}) {
  const storage = options.storage || globalThis.localStorage || null;
  let attempts = [];
  let expanded = false;

  function load() {
    if (!storage) return attempts;
    try {
      const parsed = JSON.parse(storage.getItem(AGENT_ACTIVITY_STORAGE_KEY) || '[]');
      let reconciled = false;
      attempts = Array.isArray(parsed)
        ? parsed.filter(item => item?.contract === AGENT_ACTIVITY_CONTRACT).slice(0, MAX_ATTEMPTS).map(item => {
            if (item.status !== 'running') return item;
            reconciled = true;
            return appendAgentActivityStage(item, {
              phase: 'recovery',
              label: 'Previous activity interrupted',
              status: 'blocked',
              attemptStatus: 'blocked',
              summary: 'This request did not reach a terminal receipt before AXIOM reloaded. Nothing is still running.',
              detail: { reason: 'browser_runtime_reloaded', mapChanged: 'unknown; inspect Map Forge before retrying' }
            });
          })
        : [];
      if (reconciled) persist();
    } catch {
      attempts = [];
    }
    return attempts;
  }

  function persist() {
    try { storage?.setItem?.(AGENT_ACTIVITY_STORAGE_KEY, JSON.stringify(attempts.slice(0, MAX_ATTEMPTS))); } catch { }
  }

  function emit(reason, attempt = null) {
    try { globalThis.EDITOR?.events?.emit?.('agentActivity:changed', { reason, attempt, status: status() }); } catch { }
  }

  function render() {
    const root = globalThis.document?.getElementById?.('agent-activity-surface');
    if (!root) return;
    const latest = attempts[0] || null;
    root.hidden = !latest;
    if (!latest) return;
    root.dataset.status = latest.status;
    const summary = root.querySelector('#agent-activity-summary-text');
    const meta = root.querySelector('#agent-activity-summary-meta');
    const body = root.querySelector('#agent-activity-body');
    const list = root.querySelector('#agent-activity-list');
    const toggle = root.querySelector('#agent-activity-toggle');
    if (summary) summary.textContent = latest.summary || latest.displayText;
    if (meta) meta.textContent = `${latest.sourceSurface} · ${latest.status.replace(/_/g, ' ')}`;
    if (body) body.hidden = !expanded;
    if (list) list.innerHTML = attempts.slice(0, 8).map(renderAttempt).join('');
    if (toggle) toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function replace(attempt) {
    attempts = [attempt, ...attempts.filter(item => item.id !== attempt.id)].slice(0, MAX_ATTEMPTS);
    persist();
    render();
    emit('attempt_updated', attempt);
    return attempt;
  }

  function begin(input = {}) {
    const attempt = createAgentActivityAttempt(input);
    replace(appendAgentActivityStage(attempt, {
      phase: 'intake',
      label: input.sourceSurface === 'journal' ? 'Journal request received' : 'Chat request received',
      status: 'running',
      summary: input.summary || 'Binding the active workspace and available capabilities.'
    }));
    return attempt.id;
  }

  function stage(attemptId, phase, input = {}) {
    const attempt = attempts.find(item => item.id === attemptId);
    if (!attempt) return null;
    const next = appendAgentActivityStage(attempt, { ...input, phase });
    if (['blocked', 'failed'].includes(next.status)) expanded = true;
    return replace(next);
  }

  function receipt(attemptId, receiptValue, input = {}) {
    const statusValue = receiptValue?.ok === false ? 'failed' : input.status || 'completed';
    return stage(attemptId, input.phase || 'receipt', {
      label: input.label || 'Tool receipt',
      status: statusValue,
      attemptStatus: input.attemptStatus || (statusValue === 'failed' ? 'failed' : undefined),
      summary: input.summary || summarizeActivityReceipt(receiptValue),
      receipt: receiptValue
    });
  }

  function complete(attemptId, input = {}) {
    const finalStatus = normalizeStatus(input.status || 'completed', 'completed');
    return stage(attemptId, input.phase || 'complete', {
      label: input.label || (finalStatus === 'completed' ? 'Request complete' : 'Request closed'),
      status: finalStatus,
      attemptStatus: finalStatus,
      summary: input.summary || (finalStatus === 'completed' ? 'Co-Pilot completed this request.' : `Request ${finalStatus}.`),
      detail: input.detail
    });
  }

  function toggle(force) {
    expanded = typeof force === 'boolean' ? force : !expanded;
    render();
    return expanded;
  }

  function clear() {
    attempts = [];
    persist();
    render();
    emit('history_cleared');
    return { ok: true };
  }

  function status() {
    return {
      contract: AGENT_ACTIVITY_CONTRACT,
      attemptCount: attempts.length,
      expanded,
      latest: attempts[0] || null,
      attempts: attempts.map(item => ({ ...item }))
    };
  }

  function init() {
    load();
    const root = globalThis.document?.getElementById?.('agent-activity-surface');
    root?.querySelector?.('#agent-activity-toggle')?.addEventListener('click', () => toggle());
    root?.querySelector?.('#agent-activity-clear')?.addEventListener('click', event => {
      event.stopPropagation();
      clear();
    });
    render();
    return status();
  }

  return { init, begin, stage, receipt, complete, toggle, clear, status, render };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const runtime = createAgentActivityRuntime();
  window.AgentActivityRuntime = runtime;
  runtime.init();
}
