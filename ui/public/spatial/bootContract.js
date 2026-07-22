const DEFAULT_BOOT_STAGES = [
  'html_loaded',
  'root_dom_found',
  'core_bundle_loaded',
  'required_modules_loaded',
  'app_mounted',
  'first_render_complete',
];

export function normalizeStudioBootManifest(manifest = {}) {
  const source = manifest && typeof manifest === 'object' ? manifest : {};
  const mountMarker = source.mount_marker && typeof source.mount_marker === 'object'
    ? source.mount_marker
    : {};
  const assets = Array.isArray(source.assets) ? source.assets : [];
  return {
    version: String(source.version || 'ace/studio-boot-contract.v1').trim() || 'ace/studio-boot-contract.v1',
    root_id: String(source.root_id || 'spatial-root').trim() || 'spatial-root',
    mount_marker: {
      attribute: String(mountMarker.attribute || 'data-boot').trim() || 'data-boot',
      value: String(mountMarker.value || 'studio-mounted').trim() || 'studio-mounted',
    },
    asset_probe_timeout_ms: Math.max(250, Number(source.asset_probe_timeout_ms) || 2500),
    blank_render_timeout_ms: Math.max(1000, Number(source.blank_render_timeout_ms) || 5000),
    entry_module_import: String(source.entry_module_import || './spatialApp.js').trim() || './spatialApp.js',
    assets: assets.map((asset, index) => ({
      id: String(asset?.id || `boot_asset_${index + 1}`).trim() || `boot_asset_${index + 1}`,
      path: String(asset?.path || '').trim() || '/',
      label: String(asset?.label || asset?.path || `Asset ${index + 1}`).trim() || `Asset ${index + 1}`,
      kind: String(asset?.kind || 'asset').trim() || 'asset',
      stage: String(asset?.stage || 'required_modules_loaded').trim() || 'required_modules_loaded',
      blocking: Boolean(asset?.blocking),
    })),
  };
}

function createStageMap() {
  return DEFAULT_BOOT_STAGES.reduce((accumulator, stage) => {
    accumulator[stage] = {
      status: 'pending',
      ok: false,
      checkedAt: null,
      reason: '',
      asset: null,
      failure_class: null,
      http_status: null,
    };
    return accumulator;
  }, {});
}

export function createStudioBootStatus(manifest = {}) {
  const normalizedManifest = normalizeStudioBootManifest(manifest);
  return {
    version: normalizedManifest.version,
    startedAt: new Date().toISOString(),
    stage: 'initialising',
    ok: false,
    stages: createStageMap(),
    assets: [],
    errors: [],
    warnings: [],
    failure: null,
  };
}

export function updateStudioBootStage(status = null, stage = '', patch = {}) {
  const target = status && typeof status === 'object' ? status : createStudioBootStatus();
  const stageKey = String(stage || '').trim();
  if (!stageKey) return target;
  const current = target.stages?.[stageKey] || {
    status: 'pending',
    ok: false,
    checkedAt: null,
    reason: '',
    asset: null,
    failure_class: null,
    http_status: null,
  };
  target.stage = stageKey;
  target.stages = target.stages || createStageMap();
  target.stages[stageKey] = {
    ...current,
    ...patch,
    status: String(patch.status || current.status || 'pending').trim() || 'pending',
    ok: Boolean(patch.ok),
    checkedAt: String(patch.checkedAt || current.checkedAt || new Date().toISOString()).trim() || new Date().toISOString(),
    reason: String(patch.reason || current.reason || '').trim(),
    asset: patch.asset || current.asset || null,
    failure_class: String(patch.failure_class || current.failure_class || '').trim() || null,
    http_status: Number.isFinite(Number(patch.http_status))
      ? Number(patch.http_status)
      : (Number.isFinite(Number(current.http_status)) ? Number(current.http_status) : null),
  };
  return target;
}

export function recordStudioBootError(status = null, entry = {}) {
  const target = status && typeof status === 'object' ? status : createStudioBootStatus();
  const source = entry && typeof entry === 'object' ? entry : { message: String(entry || '') };
  target.errors = Array.isArray(target.errors) ? target.errors : [];
  target.errors.push({
    type: String(source.type || 'error').trim() || 'error',
    message: String(source.message || 'Unknown boot error.').trim() || 'Unknown boot error.',
    source: String(source.source || '').trim() || null,
    stage: String(source.stage || '').trim() || null,
    at: String(source.at || new Date().toISOString()).trim() || new Date().toISOString(),
  });
  return target;
}

export function buildStudioBootFailure({
  stage = 'required_modules_loaded',
  failure_class = 'boot_failure',
  reason = '',
  asset = null,
  http_status = null,
  effect = 'ui_blank_screen',
} = {}) {
  const resolvedAsset = asset && typeof asset === 'object' ? asset : null;
  return {
    severity: resolvedAsset?.blocking === false ? 'warning' : 'blocking',
    type: String(failure_class || 'boot_failure').trim() || 'boot_failure',
    stage: String(stage || 'required_modules_loaded').trim() || 'required_modules_loaded',
    asset: resolvedAsset?.path || null,
    label: resolvedAsset?.label || null,
    http_status: Number.isFinite(Number(http_status)) ? Number(http_status) : null,
    effect: String(effect || 'ui_blank_screen').trim() || 'ui_blank_screen',
    reason: String(reason || '').trim() || 'Studio boot failed.',
  };
}

export async function probeStudioBootAssets(manifest = {}, { fetchImpl = globalThis.fetch, timeoutMs = null } = {}) {
  const normalizedManifest = normalizeStudioBootManifest(manifest);
  if (typeof fetchImpl !== 'function') {
    throw new Error('Boot asset probe requires a fetch-compatible function.');
  }
  const requestTimeoutMs = Math.max(
    250,
    Number(timeoutMs || normalizedManifest.asset_probe_timeout_ms) || 2500,
  );
  const assets = [];
  let blockingFailure = null;
  for (const asset of normalizedManifest.assets) {
    let status = 0;
    let ok = false;
    let message = '';
    let timeout = null;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    try {
      if (controller) {
        timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
      }
      const response = await fetchImpl(asset.path, {
        cache: 'no-store',
        ...(controller ? { signal: controller.signal } : {}),
      });
      status = Number(response?.status) || 0;
      ok = status >= 200 && status < 300;
      if (!ok) {
        message = `${asset.path} returned ${status || 'no status'}.`;
      }
    } catch (error) {
      const errorMessage = String(error?.message || error || 'Boot asset request failed.');
      message = error?.name === 'AbortError'
        ? `${asset.path} timed out after ${requestTimeoutMs}ms.`
        : errorMessage;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    const assetResult = {
      ...asset,
      status: ok ? 'ok' : 'missing',
      ok,
      http_status: ok ? (status || 200) : (status || 404),
      timeout_ms: requestTimeoutMs,
      reason: ok ? '' : (message || `${asset.path} is unavailable.`),
    };
    assets.push(assetResult);
    if (!ok && asset.blocking && !blockingFailure) {
      blockingFailure = buildStudioBootFailure({
        stage: asset.stage,
        failure_class: 'missing_required_asset',
        reason: `Studio shell mounted, but boot failed because required client asset "${asset.path}" was missing.`,
        asset: assetResult,
        http_status: assetResult.http_status,
      });
    }
  }
  return {
    ok: !blockingFailure,
    assets,
    blockingFailure,
  };
}

export function buildStudioBootFailureMarkup(failure = null, status = null) {
  const resolvedFailure = failure && typeof failure === 'object'
    ? failure
    : buildStudioBootFailure({ reason: 'Studio boot failed.' });
  const resolvedStatus = status && typeof status === 'object' ? status : createStudioBootStatus();
  const errorItems = Array.isArray(resolvedStatus.errors) ? resolvedStatus.errors : [];
  const warningItems = Array.isArray(resolvedStatus.warnings) ? resolvedStatus.warnings : [];
  const errorList = errorItems.length
    ? `<ul>${errorItems.map((entry) => `<li>${escapeHtml(entry.message || 'Unknown boot error.')}</li>`).join('')}</ul>`
    : '<div class="ace-boot-muted">No client error events were captured.</div>';
  const warningList = warningItems.length
    ? `<ul>${warningItems.map((entry) => `<li>${escapeHtml(entry.reason || entry.message || 'Warning')}</li>`).join('')}</ul>`
    : '<div class="ace-boot-muted">No non-blocking asset warnings.</div>';
  return `
    <section class="ace-boot-overlay" data-qa="ace-boot-failure">
      <div class="ace-boot-card">
        <div class="ace-boot-kicker">Boot failed</div>
        <h1>ACE Studio could not finish client boot.</h1>
        <div class="ace-boot-row"><strong>Stage:</strong> ${escapeHtml(resolvedFailure.stage || 'unknown')}</div>
        <div class="ace-boot-row"><strong>Failure:</strong> ${escapeHtml(resolvedFailure.type || 'boot_failure')}</div>
        <div class="ace-boot-row"><strong>Reason:</strong> ${escapeHtml(resolvedFailure.reason || 'Unknown boot failure.')}</div>
        ${resolvedFailure.asset ? `<div class="ace-boot-row"><strong>Asset:</strong> ${escapeHtml(resolvedFailure.asset)}</div>` : ''}
        ${resolvedFailure.http_status ? `<div class="ace-boot-row"><strong>HTTP status:</strong> ${escapeHtml(String(resolvedFailure.http_status))}</div>` : ''}
        <div class="ace-boot-section">
          <div class="ace-boot-section-title">Captured client errors</div>
          ${errorList}
        </div>
        <div class="ace-boot-section">
          <div class="ace-boot-section-title">Non-blocking warnings</div>
          ${warningList}
        </div>
        <div
          class="ace-recovery-shell"
          data-recovery-shell="boot-failure"
          aria-live="polite"
        >
          <div class="ace-boot-section">
            <div class="ace-boot-section-title">Recovery CTO surface</div>
            <div class="ace-boot-muted">Loading boot-safe recovery controls.</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function escapeHtml(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
