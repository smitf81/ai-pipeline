const RECOVERY_DAEMON_STATE_ROUTE = '/api/spatial/recovery-daemon/state';
const RECOVERY_DAEMON_START_ROUTE = '/api/spatial/recovery-daemon/start';
const RECOVERY_POLL_INTERVAL_MS = 1500;
const RECOVERY_AUTO_RELOAD_DELAY_MS = 1200;

function text(value = '', fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatWhen(value = '') {
  const normalized = text(value);
  if (!normalized) return 'unknown';
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toISOString();
}

async function requestJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(text(body?.reason || body?.error, `Request failed with ${response.status}`));
  }
  return body;
}

export function buildRecoveryViewModel({ failure = null, daemon = null, loadError = '' } = {}) {
  const daemonState = daemon?.daemon || daemon || {};
  const bootHealth = daemonState.boot_health || {};
  const latestAttempt = daemonState.latest_attempt || {};
  return {
    boot: {
      failureClass: text(daemonState.failure_class || bootHealth.failureClass || failure?.type, 'boot_failure'),
      stage: text(daemonState.failure_stage || bootHealth.failureStage || failure?.stage, 'unknown'),
      asset: text(daemonState.asset || bootHealth.asset || failure?.asset, 'none'),
      reason: text(daemonState.reason || bootHealth.reason || failure?.reason, 'No boot reason captured.'),
    },
    daemon: {
      status: text(daemonState.status, 'starting'),
      phase: text(daemonState.phase, 'boot_failed_detected'),
      selectedLane: text(daemonState.selected_lane, 'none'),
      attemptCount: Number(daemonState.attempt_count || 0),
      maxAttempts: Math.max(1, Number(daemonState.max_attempts || 2) || 2),
      blockedReason: text(daemonState.blocked_reason, ''),
      updatedAt: formatWhen(daemonState.updated_at),
      autoReloadReady: Boolean(daemonState.auto_reload_ready),
    },
    latestAttempt: {
      kind: text(latestAttempt.kind, 'none'),
      status: text(latestAttempt.status, 'idle'),
      verdict: text(latestAttempt.verdict, 'unknown'),
      summary: text(latestAttempt.summary, 'No recovery attempt has been recorded yet.'),
      reason: text(latestAttempt.reason, ''),
      when: formatWhen(latestAttempt.at),
    },
    diagnostics: {
      loadError: text(loadError),
    },
  };
}

export function buildRecoveryShellMarkup(model = {}) {
  const boot = model.boot || {};
  const daemon = model.daemon || {};
  const latestAttempt = model.latestAttempt || {};
  const diagnostics = model.diagnostics || {};
  const loadError = diagnostics.loadError
    ? `<div class="ace-recovery-notice ace-recovery-notice-error">${escapeHtml(diagnostics.loadError)}</div>`
    : '';
  const blockedReason = daemon.blockedReason
    ? `<div class="ace-boot-row"><strong>Blocked reason:</strong> ${escapeHtml(daemon.blockedReason)}</div>`
    : '';
  const reloadHint = daemon.autoReloadReady
    ? '<div class="ace-recovery-notice">Recovery passed boot preflight. Reloading Studio automatically.</div>'
    : '';
  return `
    <div class="ace-recovery-panel" data-qa="recovery-cto-surface">
      <div class="ace-recovery-header">
        <div>
          <div class="ace-boot-section-title">Autonomous Boot Recovery Daemon v0</div>
          <div class="ace-boot-muted">Boot-safe runtime active. Recovery is bounded, automatic, and passive here.</div>
        </div>
      </div>
      ${loadError}
      ${reloadHint}
      <div class="ace-recovery-grid">
        <section class="ace-recovery-section">
          <div class="ace-boot-section-title">Boot failure</div>
          <div class="ace-boot-row"><strong>Failure class:</strong> ${escapeHtml(boot.failureClass || 'boot_failure')}</div>
          <div class="ace-boot-row"><strong>Boot stage:</strong> ${escapeHtml(boot.stage || 'unknown')}</div>
          <div class="ace-boot-row"><strong>Asset:</strong> ${escapeHtml(boot.asset || 'none')}</div>
          <div class="ace-boot-row"><strong>Reason:</strong> ${escapeHtml(boot.reason || 'No boot reason captured.')}</div>
        </section>
        <section class="ace-recovery-section">
          <div class="ace-boot-section-title">Daemon state</div>
          <div class="ace-boot-row"><strong>Status:</strong> ${escapeHtml(daemon.status || 'starting')}</div>
          <div class="ace-boot-row"><strong>Current phase:</strong> ${escapeHtml(daemon.phase || 'boot_failed_detected')}</div>
          <div class="ace-boot-row"><strong>Selected lane:</strong> ${escapeHtml(daemon.selectedLane || 'none')}</div>
          <div class="ace-boot-row"><strong>Attempts:</strong> ${escapeHtml(String(daemon.attemptCount || 0))} / ${escapeHtml(String(daemon.maxAttempts || 2))}</div>
          <div class="ace-boot-row"><strong>Updated:</strong> ${escapeHtml(daemon.updatedAt || 'unknown')}</div>
          ${blockedReason}
        </section>
        <section class="ace-recovery-section">
          <div class="ace-boot-section-title">Latest recovery attempt</div>
          <div class="ace-boot-row"><strong>Kind:</strong> ${escapeHtml(latestAttempt.kind || 'none')}</div>
          <div class="ace-boot-row"><strong>Status:</strong> ${escapeHtml(latestAttempt.status || 'idle')}</div>
          <div class="ace-boot-row"><strong>Verdict:</strong> ${escapeHtml(latestAttempt.verdict || 'unknown')}</div>
          <div class="ace-boot-row"><strong>When:</strong> ${escapeHtml(latestAttempt.when || 'unknown')}</div>
          <div class="ace-boot-row"><strong>Summary:</strong> ${escapeHtml(latestAttempt.summary || 'No recovery attempt has been recorded yet.')}</div>
          ${latestAttempt.reason ? `<div class="ace-boot-row"><strong>Reason:</strong> ${escapeHtml(latestAttempt.reason)}</div>` : ''}
        </section>
      </div>
      <pre class="ace-recovery-console" id="ace-recovery-console">Recovery daemon is starting.</pre>
    </div>
  `;
}

function setConsoleText(root, message) {
  const node = root.querySelector('#ace-recovery-console');
  if (!node) return;
  node.textContent = text(message, 'Recovery daemon is idle.');
}

export async function mountRecoveryShell({ root, failure = null, fetchImpl = globalThis.fetch } = {}) {
  if (!root || typeof fetchImpl !== 'function') return null;
  const host = root.querySelector('[data-recovery-shell="boot-failure"]');
  if (!host) return null;

  const state = {
    failure,
    daemon: null,
    loadError: '',
    pollTimer: null,
    reloadScheduled: false,
  };

  const render = () => {
    host.innerHTML = buildRecoveryShellMarkup(buildRecoveryViewModel({
      failure: state.failure,
      daemon: state.daemon,
      loadError: state.loadError,
    }));
  };

  const stopPolling = () => {
    if (state.pollTimer) {
      window.clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  };

  const maybeReloadStudio = () => {
    const daemonState = state.daemon?.daemon || {};
    if (!daemonState.auto_reload_ready || state.reloadScheduled) return;
    state.reloadScheduled = true;
    setConsoleText(host, 'Boot recovery completed. Reloading Studio.');
    window.setTimeout(() => {
      window.location.reload();
    }, RECOVERY_AUTO_RELOAD_DELAY_MS);
  };

  const pollState = async () => {
    try {
      state.daemon = await requestJson(fetchImpl, RECOVERY_DAEMON_STATE_ROUTE);
      state.loadError = '';
      render();
      const daemonState = state.daemon?.daemon || {};
      setConsoleText(host, `Daemon ${text(daemonState.status, 'starting')} in phase ${text(daemonState.phase, 'boot_failed_detected')}.`);
      if (daemonState.status === 'running') {
        state.pollTimer = window.setTimeout(() => {
          pollState().catch(() => {});
        }, RECOVERY_POLL_INTERVAL_MS);
      } else {
        stopPolling();
        maybeReloadStudio();
      }
    } catch (error) {
      state.loadError = String(error?.message || error || 'Recovery daemon state is unavailable.');
      render();
      setConsoleText(host, state.loadError);
    }
  };

  render();
  try {
    state.daemon = await requestJson(fetchImpl, RECOVERY_DAEMON_START_ROUTE, {
      method: 'POST',
      body: JSON.stringify({ source: 'bootstrap-failure' }),
    });
    render();
    setConsoleText(host, 'Recovery daemon started automatically after boot failure.');
    await pollState();
  } catch (error) {
    state.loadError = String(error?.message || error || 'Recovery daemon failed to start.');
    render();
    setConsoleText(host, state.loadError);
  }

  return {
    stop: stopPolling,
  };
}
