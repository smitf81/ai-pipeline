const fs = require('fs');
const path = require('path');
const {
  appendQaInvestigation,
  createQaInvestigationEvent,
  readOpenQaInvestigations,
} = require('./externalQaProbe');

const UI_BOOT_INTEGRITY_LANE = 'ui_boot_integrity';
const UI_BOOT_MISSING_ASSET_TRIGGER = 'missing_client_asset';
const BROWSER_INTENT_HELPER_ASSET = '/spatial/intentContract.browser.js';
const BROWSER_INTENT_HELPER_IMPORT = './intentContract.browser.js';
const LEGACY_INTENT_IMPORT = '../../intentAnalysis.js';

const UI_BOOT_SCOPED_TARGETS = Object.freeze([
  'ui/public/index.html',
  'ui/public/spatial/boot-manifest.json',
  'ui/public/spatial/spatialBootstrap.js',
  'ui/public/spatial/spatialApp.js',
  'ui/public/spatial/intentContract.browser.js',
  'ui/server.js',
  'ui/tests/bootIntegrity.test.mjs',
  'ui/tests/uiBootIntegrityLane.test.mjs',
  'ui/tests/helpers/browser-module-loader.mjs',
  'ui/tests/spatialApp.smoke.test.mjs',
]);

function normalizeText(value = '') {
  return String(value || '').trim();
}

function toPosix(value = '') {
  return normalizeText(value).replace(/\\/g, '/');
}

function getUiRoot(rootPath = null) {
  return path.join(rootPath || process.cwd(), 'ui');
}

function getPublicRoot(rootPath = null) {
  return path.join(getUiRoot(rootPath), 'public');
}

function getBootManifestPath(rootPath = null) {
  return path.join(getPublicRoot(rootPath), 'spatial', 'boot-manifest.json');
}

function getSpatialAppPath(rootPath = null) {
  return path.join(getPublicRoot(rootPath), 'spatial', 'spatialApp.js');
}

function getBrowserIntentHelperPath(rootPath = null) {
  return path.join(getPublicRoot(rootPath), 'spatial', 'intentContract.browser.js');
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeFileIfChanged(filePath, nextSource = '') {
  const currentSource = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (currentSource === nextSource) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextSource, 'utf8');
  return true;
}

function walkFiles(rootPath = '', results = []) {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return results;
  }
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const targetPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(targetPath, results);
      continue;
    }
    results.push(targetPath);
  }
  return results;
}

function listUiFilesByBasename(rootPath = null, basename = '') {
  const normalizedBasename = normalizeText(basename);
  if (!normalizedBasename) return [];
  return walkFiles(getUiRoot(rootPath))
    .filter((filePath) => path.basename(filePath) === normalizedBasename);
}

function resolveBootAssetPath(rootPath = null, assetPath = '') {
  const normalizedAssetPath = normalizeText(assetPath).replace(/^\/+/, '');
  return normalizedAssetPath ? path.join(getPublicRoot(rootPath), normalizedAssetPath) : null;
}

function getBrowserIntentHelperTemplate() {
  const templatePath = path.join(__dirname, 'public', 'spatial', 'intentContract.browser.js');
  return fs.existsSync(templatePath) ? fs.readFileSync(templatePath, 'utf8') : '';
}

function buildUiBootIntegrityState(rootPath = null, options = {}) {
  const bootHealth = options.bootHealth && typeof options.bootHealth === 'object' ? options.bootHealth : {};
  const investigation = options.investigation && typeof options.investigation === 'object'
    ? options.investigation
    : (options.job?.evidence_bundle?.investigation && typeof options.job.evidence_bundle.investigation === 'object'
        ? options.job.evidence_bundle.investigation
        : {});
  const clientBootContract = options.clientBootContract && typeof options.clientBootContract === 'object'
    ? options.clientBootContract
    : (bootHealth.clientBootContract && typeof bootHealth.clientBootContract === 'object' ? bootHealth.clientBootContract : null);
  const failureClass = normalizeText(
    bootHealth.failureClass
    || bootHealth.failure_class
    || investigation?.evidence?.comparison?.failure_class
    || investigation?.trigger
    || clientBootContract?.failure_class,
  ) || null;
  const failureStage = normalizeText(
    bootHealth.failureStage
    || bootHealth.failure_stage
    || investigation?.evidence?.comparison?.failure_stage
    || clientBootContract?.failure_stage,
  ) || null;
  const asset = normalizeText(
    bootHealth.asset
    || investigation?.evidence?.comparison?.asset
    || investigation?.evidence?.external?.asset
    || clientBootContract?.asset,
  ) || null;
  const httpStatus = Number.isFinite(Number(
    bootHealth.httpStatus
    ?? bootHealth.http_status
    ?? investigation?.evidence?.comparison?.http_status
    ?? investigation?.evidence?.external?.http_status
    ?? clientBootContract?.http_status,
  ))
    ? Number(
      bootHealth.httpStatus
      ?? bootHealth.http_status
      ?? investigation?.evidence?.comparison?.http_status
      ?? investigation?.evidence?.external?.http_status
      ?? clientBootContract?.http_status,
    )
    : null;
  const reason = normalizeText(
    bootHealth.reason
    || investigation?.evidence?.comparison?.notes?.[0]
    || investigation?.evidence?.external?.details
    || clientBootContract?.reason,
  ) || null;
  const checkedAt = normalizeText(bootHealth.checkedAt || bootHealth.checked_at || new Date().toISOString()) || new Date().toISOString();
  const blocking = failureClass === UI_BOOT_MISSING_ASSET_TRIGGER && Boolean(asset);
  return {
    source: UI_BOOT_INTEGRITY_LANE,
    checked_at: checkedAt,
    covered: !blocking,
    status: blocking ? 'blocked' : 'healthy',
    trigger: blocking ? UI_BOOT_MISSING_ASSET_TRIGGER : null,
    failure_class: failureClass,
    failure_stage: failureStage,
    asset,
    http_status: httpStatus,
    reason,
    bootHealth,
    clientBootContract,
    summary: blocking
      ? `UI boot failed because required client asset "${asset}" was missing.`
      : 'UI boot integrity is healthy.',
  };
}

function buildUiBootIntegrityInvestigation(rootPath = null, options = {}) {
  const checkedAt = normalizeText(options.checkedAt) || new Date().toISOString();
  const state = buildUiBootIntegrityState(rootPath, {
    ...options,
    checkedAt,
  });
  if (state.trigger !== UI_BOOT_MISSING_ASSET_TRIGGER || !state.asset) {
    return {
      ok: true,
      created: false,
      investigation: null,
      state,
    };
  }
  const investigationResult = appendQaInvestigation(rootPath, {
    type: 'qa_investigation',
    trigger: UI_BOOT_MISSING_ASSET_TRIGGER,
    severity: 'high',
    createdAt: checkedAt,
    summary: `UI boot missing required asset ${state.asset}`,
    evidence: {
      internal: {
        status: 'fail',
        source: '/api/health boot contract',
        timestamp: checkedAt,
        details: state.reason || state.summary,
      },
      external: {
        status: 'fail',
        source: 'client_boot_contract',
        test_id: 'ui_boot_integrity',
        asset: state.asset,
        http_status: state.http_status,
        details: state.reason || state.summary,
      },
      comparison: {
        status_match: false,
        freshness_known: true,
        trigger: UI_BOOT_MISSING_ASSET_TRIGGER,
        failure_class: state.failure_class,
        failure_stage: state.failure_stage,
        asset: state.asset,
        http_status: state.http_status,
        notes: [state.reason || state.summary].filter(Boolean),
      },
    },
    latest_evidence: createQaInvestigationEvent({
      seenAt: checkedAt,
      trigger: UI_BOOT_MISSING_ASSET_TRIGGER,
      internal: {
        status: 'fail',
      },
      external: {
        status: 'fail',
        test_id: 'ui_boot_integrity',
      },
      comparison: {
        status_match: false,
        freshness_known: true,
        trigger: UI_BOOT_MISSING_ASSET_TRIGGER,
      },
    }),
  });
  return {
    ok: true,
    created: Boolean(investigationResult?.created),
    investigation: investigationResult?.record || null,
    state,
  };
}

function maybeBridgeUiBootIntegrityInvestigations(rootPath = null, options = {}) {
  const result = buildUiBootIntegrityInvestigation(rootPath, options);
  return {
    ...result,
    investigations: readOpenQaInvestigations(rootPath, options.limit || 10),
  };
}

function buildUiBootIntegrityRepairPlan(rootPath = null, options = {}) {
  const state = buildUiBootIntegrityState(rootPath, options);
  if (state.trigger !== UI_BOOT_MISSING_ASSET_TRIGGER || !state.asset) {
    return {
      ok: false,
      blocked: true,
      reason: 'No missing boot asset is available for bounded repair.',
      state,
    };
  }

  const manifestPath = getBootManifestPath(rootPath);
  const spatialAppPath = getSpatialAppPath(rootPath);
  const helperPath = getBrowserIntentHelperPath(rootPath);
  const manifest = readJsonSafe(manifestPath, { assets: [] }) || { assets: [] };
  const spatialSource = fs.existsSync(spatialAppPath) ? fs.readFileSync(spatialAppPath, 'utf8') : '';
  const assetBasename = path.posix.basename(state.asset);
  const repoMatches = listUiFilesByBasename(rootPath, assetBasename).map((filePath) => toPosix(path.relative(rootPath || process.cwd(), filePath)));
  const publicMatches = repoMatches.filter((filePath) => filePath.startsWith('ui/public/'));
  const nonPublicMatches = repoMatches.filter((filePath) => !filePath.startsWith('ui/public/'));
  const assetPath = resolveBootAssetPath(rootPath, state.asset);
  const legacyImportPresent = spatialSource.includes(LEGACY_INTENT_IMPORT);
  const helperImportPresent = spatialSource.includes(BROWSER_INTENT_HELPER_IMPORT);
  const manifestHasLegacyAsset = Array.isArray(manifest.assets)
    && manifest.assets.some((asset) => normalizeText(asset?.path) === state.asset);

  if (assetBasename === 'intentAnalysis.js' && publicMatches.length === 0 && nonPublicMatches.includes('ui/intentAnalysis.js')) {
    return {
      ok: true,
      blocked: false,
      state,
      classification: 'server_only_browser_reference',
      proposed_action: 'replace_with_browser_safe_helper',
      failing_asset: state.asset,
      replacement_asset: BROWSER_INTENT_HELPER_ASSET,
      legacy_import_present: legacyImportPresent,
      helper_import_present: helperImportPresent,
      manifest_has_legacy_asset: manifestHasLegacyAsset,
      asset_exists: Boolean(assetPath && fs.existsSync(assetPath)),
      repo_matches: repoMatches,
      scoped_targets: [...UI_BOOT_SCOPED_TARGETS],
      manifest_path: manifestPath,
      spatial_app_path: spatialAppPath,
      helper_path: helperPath,
    };
  }

  if (publicMatches.length === 1 && manifestHasLegacyAsset) {
    return {
      ok: true,
      blocked: false,
      state,
      classification: 'deterministic_public_path_update',
      proposed_action: 'update_manifest_asset_path',
      failing_asset: state.asset,
      replacement_asset: `/${publicMatches[0].replace(/^ui\/public\//, '')}`,
      repo_matches: repoMatches,
      scoped_targets: [...UI_BOOT_SCOPED_TARGETS],
      manifest_path: manifestPath,
    };
  }

  return {
    ok: false,
    blocked: true,
    state,
    classification: 'ambiguous_boot_asset_failure',
    proposed_action: 'repair_blocked_needs_human_review',
    reason: `Boot asset "${state.asset}" could not be repaired deterministically.`,
    repo_matches: repoMatches,
    scoped_targets: [...UI_BOOT_SCOPED_TARGETS],
  };
}

function updateBootManifestSource(source = '', plan = null) {
  const parsed = readJsonSafe(plan?.manifest_path, null);
  const manifest = parsed && typeof parsed === 'object'
    ? parsed
    : readJsonSafe(getBootManifestPath(path.resolve(plan?.manifest_path || '.')), { version: 'ace/studio-boot-contract.v1', assets: [] });
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const filteredAssets = assets.filter((asset) => normalizeText(asset?.path) !== normalizeText(plan?.failing_asset));
  const replacementAsset = normalizeText(plan?.replacement_asset);
  if (replacementAsset && !filteredAssets.some((asset) => normalizeText(asset?.path) === replacementAsset)) {
    filteredAssets.splice(Math.min(2, filteredAssets.length), 0, {
      path: replacementAsset,
      label: 'Browser intent contract helper',
      kind: 'required_module',
      stage: 'required_modules_loaded',
      blocking: true,
    });
  }
  const nextManifest = {
    ...manifest,
    assets: filteredAssets,
  };
  return `${JSON.stringify(nextManifest, null, 2)}\n`;
}

function applyUiBootIntegrityRepair(rootPath = null, options = {}) {
  const plan = options.plan && typeof options.plan === 'object'
    ? options.plan
    : buildUiBootIntegrityRepairPlan(rootPath, options);
  if (!plan.ok || plan.blocked) {
    return {
      ok: false,
      applied: false,
      blocked: true,
      needs_human_review: true,
      stop_status: 'needs_human_review',
      summary: plan.reason || 'UI boot repair is blocked.',
      reason: plan.reason || 'UI boot repair is blocked.',
      plan,
      appliedFiles: [],
      changedFiles: [],
    };
  }

  const changedFiles = [];
  if (plan.classification === 'server_only_browser_reference') {
    const helperTemplate = getBrowserIntentHelperTemplate();
    if (!helperTemplate) {
      return {
        ok: false,
        applied: false,
        blocked: true,
        needs_human_review: true,
        stop_status: 'needs_human_review',
        summary: 'Browser intent helper template is unavailable.',
        reason: 'Browser intent helper template is unavailable.',
        plan,
        appliedFiles: [],
        changedFiles: [],
      };
    }
    if (writeFileIfChanged(plan.helper_path, helperTemplate)) {
      changedFiles.push('ui/public/spatial/intentContract.browser.js');
    }
    if (fs.existsSync(plan.spatial_app_path)) {
      const currentSource = fs.readFileSync(plan.spatial_app_path, 'utf8');
      const nextSource = currentSource.replaceAll(LEGACY_INTENT_IMPORT, BROWSER_INTENT_HELPER_IMPORT);
      if (nextSource !== currentSource && writeFileIfChanged(plan.spatial_app_path, nextSource)) {
        changedFiles.push('ui/public/spatial/spatialApp.js');
      }
    }
    const nextManifestSource = updateBootManifestSource('', plan);
    if (writeFileIfChanged(plan.manifest_path, nextManifestSource)) {
      changedFiles.push('ui/public/spatial/boot-manifest.json');
    }
    return {
      ok: true,
      applied: true,
      blocked: false,
      summary: `Replaced stale browser asset reference ${plan.failing_asset} with ${plan.replacement_asset}.`,
      reason: `Replaced stale browser asset reference ${plan.failing_asset} with ${plan.replacement_asset}.`,
      proposed_action: plan.proposed_action,
      plan,
      appliedFiles: changedFiles,
      changedFiles,
    };
  }

  if (plan.classification === 'deterministic_public_path_update') {
    const nextManifestSource = updateBootManifestSource('', plan);
    const changed = writeFileIfChanged(plan.manifest_path, nextManifestSource);
    const manifestChanges = changed ? ['ui/public/spatial/boot-manifest.json'] : [];
    return {
      ok: true,
      applied: true,
      blocked: false,
      summary: `Updated boot manifest asset path from ${plan.failing_asset} to ${plan.replacement_asset}.`,
      reason: `Updated boot manifest asset path from ${plan.failing_asset} to ${plan.replacement_asset}.`,
      proposed_action: plan.proposed_action,
      plan,
      appliedFiles: manifestChanges,
      changedFiles: manifestChanges,
    };
  }

  return {
    ok: false,
    applied: false,
    blocked: true,
    needs_human_review: true,
    stop_status: 'needs_human_review',
    summary: 'UI boot repair fell through without a deterministic plan.',
    reason: 'UI boot repair fell through without a deterministic plan.',
    plan,
    appliedFiles: [],
    changedFiles: [],
  };
}

module.exports = {
  BROWSER_INTENT_HELPER_ASSET,
  BROWSER_INTENT_HELPER_IMPORT,
  LEGACY_INTENT_IMPORT,
  UI_BOOT_INTEGRITY_LANE,
  UI_BOOT_MISSING_ASSET_TRIGGER,
  UI_BOOT_SCOPED_TARGETS,
  applyUiBootIntegrityRepair,
  buildUiBootIntegrityInvestigation,
  buildUiBootIntegrityRepairPlan,
  buildUiBootIntegrityState,
  getBootManifestPath,
  getBrowserIntentHelperPath,
  getPublicRoot,
  getSpatialAppPath,
  maybeBridgeUiBootIntegrityInvestigations,
};
