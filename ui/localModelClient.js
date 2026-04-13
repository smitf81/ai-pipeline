const { spawn } = require('child_process');

const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_TIMEOUT_MS = 30000;
const OLLAMA_LAUNCH_WAIT_MS = 4000;
const OLLAMA_LAUNCH_POLL_INTERVAL_MS = 250;

let latestOllamaLauncherStatus = null;
let ollamaLauncherPromise = null;

function stripCodeFence(value = '') {
  return String(value || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonCandidate(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return stripCodeFence(fenceMatch[1]);
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return raw.slice(firstBrace, lastBrace + 1);
  return raw;
}

function parseJsonResponse(text = '') {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    throw new Error('Local model returned an empty response.');
  }
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Local model response was not valid JSON: ${error.message}`);
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function buildOllamaTagsUrl(host = DEFAULT_OLLAMA_HOST) {
  return `${String(host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, '')}/api/tags`;
}

function buildOllamaLauncherSummary({
  status = 'still_unreachable',
  targetUrl = buildOllamaTagsUrl(),
  detail = null,
} = {}) {
  if (status === 'already_running') {
    return `Ollama was already reachable at ${targetUrl}; no launch was needed.`;
  }
  if (status === 'launch_started') {
    return `Ollama launch started and became reachable at ${targetUrl}.`;
  }
  if (status === 'launch_failed') {
    return detail
      ? `Ollama launch failed: ${detail}`
      : 'Ollama launch failed.';
  }
  return detail
    ? `Ollama launch was attempted, but ${targetUrl} is still unreachable. ${detail}`
    : `Ollama launch was attempted, but ${targetUrl} is still unreachable.`;
}

function buildOllamaLauncherStatus({
  host = DEFAULT_OLLAMA_HOST,
  launchAttempted = false,
  alreadyRunning = false,
  launchStarted = false,
  postLaunchReachable = false,
  status = 'still_unreachable',
  summary = null,
  pid = null,
  launchCommand = null,
  failureReason = null,
  checkedAt = null,
  availableModels = [],
} = {}) {
  const targetUrl = buildOllamaTagsUrl(host);
  return {
    source: 'ollama_launcher',
    host: normalizeText(host) || DEFAULT_OLLAMA_HOST,
    target_url: targetUrl,
    launch_attempted: Boolean(launchAttempted),
    already_running: Boolean(alreadyRunning),
    launch_started: Boolean(launchStarted),
    post_launch_reachable: Boolean(postLaunchReachable),
    status: normalizeText(status) || 'still_unreachable',
    summary: normalizeText(summary) || buildOllamaLauncherSummary({
      status,
      targetUrl,
      detail: failureReason,
    }),
    pid: Number.isInteger(Number(pid)) ? Number(pid) : null,
    launch_command: normalizeText(launchCommand) || null,
    failure_reason: normalizeText(failureReason) || null,
    available_models: Array.isArray(availableModels)
      ? availableModels.map((entry) => normalizeText(entry)).filter(Boolean)
      : [],
    checked_at: normalizeText(checkedAt) || nowIso(),
  };
}

function readOllamaLauncherStatus() {
  return latestOllamaLauncherStatus ? { ...latestOllamaLauncherStatus } : null;
}

async function runOllamaTagsProbe({
  host = DEFAULT_OLLAMA_HOST,
  timeoutMs = 1500,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 'offline',
      checkedAt: nowIso(),
      reason: 'No fetch implementation is available for Ollama reachability checks.',
      availableModels: [],
    };
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const checkedAt = nowIso();
  try {
    const response = await fetchImpl(buildOllamaTagsUrl(host), {
      method: 'GET',
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama tags returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    return {
      ok: true,
      status: 'live',
      checkedAt,
      reason: null,
      availableModels: Array.isArray(payload?.models)
        ? payload.models.map((entry) => normalizeText(entry?.name)).filter(Boolean)
        : [],
    };
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? `Ollama reachability check timed out after ${timeoutMs}ms.`
      : normalizeText(error?.message || error) || 'Ollama reachability check failed.';
    return {
      ok: false,
      status: 'offline',
      checkedAt,
      reason,
      availableModels: [],
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildOllamaLaunchCandidates() {
  return process.platform === 'win32'
    ? [
        { command: 'ollama', args: ['serve'], label: 'ollama serve' },
        { command: 'cmd', args: ['/c', 'ollama', 'serve'], label: 'cmd /c ollama serve' },
      ]
    : [
        { command: 'ollama', args: ['serve'], label: 'ollama serve' },
      ];
}

function startOllamaCandidate({
  candidate,
  spawnFn = spawn,
  detached = true,
  windowsHide = true,
} = {}) {
  return new Promise((resolve) => {
    let child = null;
    let settled = false;
    const finalize = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    try {
      child = spawnFn(candidate.command, candidate.args, {
        detached,
        windowsHide,
        stdio: 'ignore',
      });
    } catch (error) {
      finalize({
        started: false,
        error,
        label: candidate.label,
      });
      return;
    }
    child.once('error', (error) => {
      finalize({
        started: false,
        error,
        label: candidate.label,
      });
    });
    child.once('spawn', () => {
      if (detached && typeof child.unref === 'function') {
        child.unref();
      }
      finalize({
        started: true,
        pid: child.pid,
        label: candidate.label,
      });
    });
  });
}

async function launchOllamaProcess({
  spawnFn = spawn,
  detached = true,
} = {}) {
  const candidates = buildOllamaLaunchCandidates();
  let lastError = null;
  for (const candidate of candidates) {
    const result = await startOllamaCandidate({
      candidate,
      spawnFn,
      detached,
    });
    if (result.started) {
      return {
        started: true,
        pid: result.pid,
        launchCommand: result.label,
      };
    }
    lastError = result.error;
    const code = normalizeText(result?.error?.code).toUpperCase();
    if (code && code !== 'ENOENT') {
      break;
    }
  }
  return {
    started: false,
    pid: null,
    launchCommand: null,
    error: lastError,
  };
}

async function waitForOllamaReachable({
  host = DEFAULT_OLLAMA_HOST,
  timeoutMs = OLLAMA_LAUNCH_WAIT_MS,
  pollIntervalMs = OLLAMA_LAUNCH_POLL_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const deadline = Date.now() + Math.max(250, Number(timeoutMs) || OLLAMA_LAUNCH_WAIT_MS);
  let latest = null;
  do {
    latest = await runOllamaTagsProbe({
      host,
      timeoutMs: Math.min(1500, Math.max(250, Number(pollIntervalMs) || OLLAMA_LAUNCH_POLL_INTERVAL_MS)),
      fetchImpl,
    });
    if (latest?.ok) {
      return latest;
    }
    if (Date.now() >= deadline) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(100, Number(pollIntervalMs) || OLLAMA_LAUNCH_POLL_INTERVAL_MS)));
  } while (Date.now() < deadline);
  return latest;
}

async function ensureOllamaBootstrapped({
  host = DEFAULT_OLLAMA_HOST,
  timeoutMs = 1500,
  postLaunchWaitMs = OLLAMA_LAUNCH_WAIT_MS,
  pollIntervalMs = OLLAMA_LAUNCH_POLL_INTERVAL_MS,
  fetchImpl = globalThis.fetch,
  spawnFn = spawn,
  detached = true,
} = {}) {
  if (ollamaLauncherPromise) {
    return ollamaLauncherPromise;
  }

  ollamaLauncherPromise = (async () => {
    const initialProbe = await runOllamaTagsProbe({
      host,
      timeoutMs,
      fetchImpl,
    });

    if (initialProbe?.ok) {
      latestOllamaLauncherStatus = buildOllamaLauncherStatus({
        host,
        launchAttempted: false,
        alreadyRunning: true,
        postLaunchReachable: true,
        status: 'already_running',
        availableModels: initialProbe.availableModels,
        checkedAt: initialProbe.checkedAt,
      });
      return readOllamaLauncherStatus();
    }

    const launchResult = await launchOllamaProcess({
      spawnFn,
      detached,
    });

    if (!launchResult.started) {
      latestOllamaLauncherStatus = buildOllamaLauncherStatus({
        host,
        launchAttempted: true,
        status: 'launch_failed',
        launchCommand: launchResult.launchCommand,
        failureReason: normalizeText(launchResult.error?.message || launchResult.error) || 'Ollama launcher command was not available.',
        checkedAt: initialProbe?.checkedAt,
      });
      return readOllamaLauncherStatus();
    }

    const postLaunchProbe = await waitForOllamaReachable({
      host,
      timeoutMs: postLaunchWaitMs,
      pollIntervalMs,
      fetchImpl,
    });

    latestOllamaLauncherStatus = buildOllamaLauncherStatus({
      host,
      launchAttempted: true,
      launchStarted: true,
      postLaunchReachable: Boolean(postLaunchProbe?.ok),
      status: postLaunchProbe?.ok ? 'launch_started' : 'still_unreachable',
      pid: launchResult.pid,
      launchCommand: launchResult.launchCommand,
      failureReason: postLaunchProbe?.ok ? null : normalizeText(postLaunchProbe?.reason) || 'Ollama never became reachable after launch.',
      availableModels: postLaunchProbe?.availableModels,
      checkedAt: postLaunchProbe?.checkedAt,
    });
    return readOllamaLauncherStatus();
  })();

  try {
    return await ollamaLauncherPromise;
  } finally {
    ollamaLauncherPromise = null;
  }
}

async function requestOllamaJson({
  prompt,
  model = 'mistral:latest',
  host = DEFAULT_OLLAMA_HOST,
  timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available for the local model client.');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(`${String(host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: String(prompt || ''),
        stream: false,
      }),
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    const text = String(payload?.response || '').trim();
    return {
      text,
      json: parseJsonResponse(text),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Local model request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  readOllamaLauncherStatus,
  ensureOllamaBootstrapped,
  parseJsonResponse,
  runOllamaTagsProbe,
  requestOllamaJson,
};
