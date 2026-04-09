const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const {
  DEFAULT_EXTERNAL_QA_PROBE_URL,
  buildQaMcpPreflightCheck,
} = require('./externalQaProbe');

const QA_MCP_HELPER_RELATIVE_PATH = 'qa_mcp_helper.py';
const QA_MCP_LAUNCH_WAIT_MS = 3000;
const QA_MCP_LAUNCH_POLL_INTERVAL_MS = 250;

let latestQaMcpLauncherStatus = null;
let qaMcpLauncherPromise = null;

function normalizeText(value = '') {
  return String(value || '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function buildLauncherSummary({
  status = 'still_unreachable',
  targetUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  helperPath = null,
  detail = null,
} = {}) {
  if (status === 'already_running') {
    return `QA MCP helper was already reachable at ${targetUrl}; no launch was needed.`;
  }
  if (status === 'launch_started') {
    return `QA MCP helper launch started from ${helperPath} and became reachable at ${targetUrl}.`;
  }
  if (status === 'launch_failed') {
    return detail
      ? `QA MCP helper launch failed for ${helperPath}: ${detail}`
      : `QA MCP helper launch failed for ${helperPath}.`;
  }
  return detail
    ? `QA MCP helper launch was attempted from ${helperPath}, but ${targetUrl} is still unreachable. ${detail}`
    : `QA MCP helper launch was attempted from ${helperPath}, but ${targetUrl} is still unreachable.`;
}

function buildQaMcpLauncherStatus({
  helperPath = null,
  targetUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
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
} = {}) {
  return {
    source: 'qa_mcp_launcher',
    helper_path: normalizeText(helperPath) || null,
    target_url: normalizeText(targetUrl) || DEFAULT_EXTERNAL_QA_PROBE_URL,
    launch_attempted: Boolean(launchAttempted),
    already_running: Boolean(alreadyRunning),
    launch_started: Boolean(launchStarted),
    post_launch_reachable: Boolean(postLaunchReachable),
    status: normalizeText(status) || 'still_unreachable',
    summary: normalizeText(summary) || buildLauncherSummary({
      status,
      targetUrl,
      helperPath,
      detail: failureReason,
    }),
    pid: Number.isInteger(Number(pid)) ? Number(pid) : null,
    launch_command: normalizeText(launchCommand) || null,
    failure_reason: normalizeText(failureReason) || null,
    checked_at: normalizeText(checkedAt) || nowIso(),
  };
}

function resolveQaMcpHelperPath(rootPath = null) {
  const repoRoot = path.resolve(rootPath || path.join(__dirname, '..'));
  return path.join(repoRoot, QA_MCP_HELPER_RELATIVE_PATH);
}

function readQaMcpLauncherStatus() {
  return latestQaMcpLauncherStatus ? { ...latestQaMcpLauncherStatus } : null;
}

async function runQaMcpPreflight({
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  timeoutMs = 1500,
  preflightFn = buildQaMcpPreflightCheck,
} = {}) {
  return preflightFn({
    qaState: null,
    probeUrl,
    timeoutMs,
  });
}

function buildPythonLaunchCandidates(helperPath) {
  return [
    {
      command: 'python',
      args: [helperPath],
      label: `python ${helperPath}`,
    },
    {
      command: 'py',
      args: ['-3', helperPath],
      label: `py -3 ${helperPath}`,
    },
  ];
}

function startQaMcpHelperCandidate({
  candidate,
  cwd,
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
        cwd,
        detached,
        windowsHide,
        stdio: 'ignore',
      });
    } catch (error) {
      finalize({
        started: false,
        error,
        command: candidate.command,
        label: candidate.label,
      });
      return;
    }
    child.once('error', (error) => {
      finalize({
        started: false,
        error,
        command: candidate.command,
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
        command: candidate.command,
        label: candidate.label,
      });
    });
  });
}

async function launchQaMcpHelperProcess({
  rootPath = null,
  helperPath = null,
  spawnFn = spawn,
  detached = true,
} = {}) {
  const resolvedRoot = path.resolve(rootPath || path.join(__dirname, '..'));
  const resolvedHelperPath = path.resolve(helperPath || resolveQaMcpHelperPath(resolvedRoot));
  const candidates = buildPythonLaunchCandidates(resolvedHelperPath);
  let lastError = null;
  for (const candidate of candidates) {
    const result = await startQaMcpHelperCandidate({
      candidate,
      cwd: resolvedRoot,
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
    const code = normalizeText(result.error?.code).toUpperCase();
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

async function waitForQaMcpReachable({
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  timeoutMs = QA_MCP_LAUNCH_WAIT_MS,
  pollIntervalMs = QA_MCP_LAUNCH_POLL_INTERVAL_MS,
  preflightFn = buildQaMcpPreflightCheck,
} = {}) {
  const deadline = Date.now() + Math.max(250, Number(timeoutMs) || QA_MCP_LAUNCH_WAIT_MS);
  let latest = null;
  do {
    latest = await runQaMcpPreflight({
      probeUrl,
      timeoutMs: Math.min(1500, Math.max(250, Number(pollIntervalMs) || QA_MCP_LAUNCH_POLL_INTERVAL_MS)),
      preflightFn,
    });
    if (latest?.verdict === 'ok') {
      return latest;
    }
    if (Date.now() >= deadline) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(100, Number(pollIntervalMs) || QA_MCP_LAUNCH_POLL_INTERVAL_MS)));
  } while (Date.now() < deadline);
  return latest;
}

async function ensureQaMcpHelperBootstrapped({
  rootPath = null,
  probeUrl = DEFAULT_EXTERNAL_QA_PROBE_URL,
  helperPath = null,
  timeoutMs = 1500,
  postLaunchWaitMs = QA_MCP_LAUNCH_WAIT_MS,
  pollIntervalMs = QA_MCP_LAUNCH_POLL_INTERVAL_MS,
  preflightFn = buildQaMcpPreflightCheck,
  spawnFn = spawn,
  detached = true,
} = {}) {
  if (qaMcpLauncherPromise) {
    return qaMcpLauncherPromise;
  }

  qaMcpLauncherPromise = (async () => {
    const resolvedRoot = path.resolve(rootPath || path.join(__dirname, '..'));
    const resolvedHelperPath = path.resolve(helperPath || resolveQaMcpHelperPath(resolvedRoot));
    const initialPreflight = await runQaMcpPreflight({
      probeUrl,
      timeoutMs,
      preflightFn,
    });

    if (initialPreflight?.verdict === 'ok') {
      latestQaMcpLauncherStatus = buildQaMcpLauncherStatus({
        helperPath: resolvedHelperPath,
        targetUrl: probeUrl,
        launchAttempted: false,
        alreadyRunning: true,
        launchStarted: false,
        postLaunchReachable: true,
        status: 'already_running',
      });
      return readQaMcpLauncherStatus();
    }

    if (initialPreflight?.transport?.reachable || initialPreflight?.transport?.responded) {
      latestQaMcpLauncherStatus = buildQaMcpLauncherStatus({
        helperPath: resolvedHelperPath,
        targetUrl: probeUrl,
        launchAttempted: false,
        alreadyRunning: false,
        launchStarted: false,
        postLaunchReachable: false,
        status: 'still_unreachable',
        failureReason: normalizeText(initialPreflight?.summary || initialPreflight?.next_action?.summary || '')
          || 'The configured QA MCP target is already occupied by a non-helper response.',
      });
      return readQaMcpLauncherStatus();
    }

    if (!fs.existsSync(resolvedHelperPath)) {
      latestQaMcpLauncherStatus = buildQaMcpLauncherStatus({
        helperPath: resolvedHelperPath,
        targetUrl: probeUrl,
        launchAttempted: true,
        alreadyRunning: false,
        launchStarted: false,
        postLaunchReachable: false,
        status: 'launch_failed',
        failureReason: `Helper file not found at ${resolvedHelperPath}.`,
      });
      return readQaMcpLauncherStatus();
    }

    const launchResult = await launchQaMcpHelperProcess({
      rootPath: resolvedRoot,
      helperPath: resolvedHelperPath,
      spawnFn,
      detached,
    });

    if (!launchResult.started) {
      latestQaMcpLauncherStatus = buildQaMcpLauncherStatus({
        helperPath: resolvedHelperPath,
        targetUrl: probeUrl,
        launchAttempted: true,
        alreadyRunning: false,
        launchStarted: false,
        postLaunchReachable: false,
        status: 'launch_failed',
        launchCommand: launchResult.launchCommand,
        failureReason: normalizeText(launchResult.error?.message || launchResult.error) || 'Python launcher command was not available.',
      });
      return readQaMcpLauncherStatus();
    }

    const postLaunchPreflight = await waitForQaMcpReachable({
      probeUrl,
      timeoutMs: postLaunchWaitMs,
      pollIntervalMs,
      preflightFn,
    });

    latestQaMcpLauncherStatus = buildQaMcpLauncherStatus({
      helperPath: resolvedHelperPath,
      targetUrl: probeUrl,
      launchAttempted: true,
      alreadyRunning: false,
      launchStarted: true,
      postLaunchReachable: postLaunchPreflight?.verdict === 'ok',
      status: postLaunchPreflight?.verdict === 'ok' ? 'launch_started' : 'still_unreachable',
      pid: launchResult.pid,
      launchCommand: launchResult.launchCommand,
      failureReason: postLaunchPreflight?.verdict === 'ok'
        ? null
        : normalizeText(postLaunchPreflight?.summary || postLaunchPreflight?.next_action?.summary || '') || null,
    });
    return readQaMcpLauncherStatus();
  })();

  try {
    return await qaMcpLauncherPromise;
  } finally {
    qaMcpLauncherPromise = null;
  }
}

module.exports = {
  QA_MCP_HELPER_RELATIVE_PATH,
  QA_MCP_LAUNCH_WAIT_MS,
  QA_MCP_LAUNCH_POLL_INTERVAL_MS,
  buildQaMcpLauncherStatus,
  resolveQaMcpHelperPath,
  readQaMcpLauncherStatus,
  ensureQaMcpHelperBootstrapped,
  launchQaMcpHelperProcess,
};
