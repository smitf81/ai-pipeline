import {
  buildStudioBootFailure,
  buildStudioBootFailureMarkup,
  createStudioBootStatus,
  normalizeStudioBootManifest,
  probeStudioBootAssets,
  recordStudioBootError,
  updateStudioBootStage,
} from './bootContract.js';

function writeBootStatus(status) {
  window.__aceBootStatus = status;
  return status;
}

function finishBoot(status) {
  writeBootStatus(status);
  window.dispatchEvent(new CustomEvent('ace:spatial-boot-complete', {
    detail: status,
  }));
  return status;
}

async function loadBootManifest(url = '/spatial/boot-manifest.json') {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Boot manifest request failed with ${response.status}.`);
  }
  return normalizeStudioBootManifest(await response.json());
}

function installBootWatchdog(status) {
  window.addEventListener('error', (event) => {
    recordStudioBootError(status, {
      type: 'error',
      message: event?.message || 'Unknown boot error.',
      source: event?.filename || null,
      stage: status.stage,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordStudioBootError(status, {
      type: 'unhandledrejection',
      message: String(event?.reason?.message || event?.reason || 'Unhandled boot rejection.'),
      stage: status.stage,
    });
  });
}

async function mountRecoveryShell(root, status, failure) {
  try {
    const module = await import('./recoveryShell.js');
    if (typeof module.mountRecoveryShell === 'function') {
      await module.mountRecoveryShell({
        root,
        status,
        failure,
        fetchImpl: window.fetch.bind(window),
      });
    }
  } catch (error) {
    recordStudioBootError(status, {
      type: 'recovery_shell_mount_failure',
      message: String(error?.message || error || 'Recovery shell failed to mount.'),
      source: './recoveryShell.js',
      stage: status.stage,
    });
    writeBootStatus(status);
  }
}

async function renderBootFailure(root, status, failure) {
  status.ok = false;
  status.failure = failure;
  writeBootStatus(status);
  if (!root) return finishBoot(status);
  root.setAttribute('data-boot', 'boot-failed');
  root.innerHTML = buildStudioBootFailureMarkup(failure, status);
  await mountRecoveryShell(root, status, failure);
  return finishBoot(status);
}

function renderBootWarning(status, warning) {
  status.warnings = Array.isArray(status.warnings) ? status.warnings : [];
  status.warnings.push(warning);
  return status;
}

async function waitForStudioMount(root, manifest, status) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < manifest.blank_render_timeout_ms) {
    const markerValue = root.getAttribute(manifest.mount_marker.attribute);
    const hasMarker = markerValue === manifest.mount_marker.value;
    const hasChildren = Number(root.childNodes?.length || 0) > 0;
    if (hasMarker) {
      updateStudioBootStage(status, 'app_mounted', {
        status: 'ok',
        ok: true,
        reason: '',
      });
      if (hasChildren) {
        updateStudioBootStage(status, 'first_render_complete', {
          status: 'ok',
          ok: true,
          reason: '',
        });
        status.ok = true;
        writeBootStatus(status);
        return true;
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  return false;
}

async function bootSpatialStudio() {
  const status = writeBootStatus(createStudioBootStatus());
  installBootWatchdog(status);
  updateStudioBootStage(status, 'html_loaded', {
    status: 'ok',
    ok: true,
    reason: '',
  });

  let manifest;
  try {
    manifest = await loadBootManifest();
  } catch (error) {
    const root = document.getElementById('spatial-root');
    return renderBootFailure(root, status, buildStudioBootFailure({
      stage: 'html_loaded',
      failure_class: 'missing_boot_manifest',
      reason: String(error.message || error),
      effect: 'ui_blank_screen',
    }));
  }

  const root = document.getElementById(manifest.root_id);
  if (!root) {
    return renderBootFailure(root, status, buildStudioBootFailure({
      stage: 'root_dom_found',
      failure_class: 'missing_root_dom',
      reason: `Studio boot root "${manifest.root_id}" was not found.`,
      effect: 'ui_blank_screen',
    }));
  }
  updateStudioBootStage(status, 'root_dom_found', {
    status: 'ok',
    ok: true,
    reason: '',
  });
  root.setAttribute('data-boot', 'shell-ready');

  let assetProbe;
  try {
    assetProbe = await probeStudioBootAssets(manifest, {
      fetchImpl: window.fetch.bind(window),
      timeoutMs: manifest.asset_probe_timeout_ms,
    });
    status.assets = assetProbe.assets;
  } catch (error) {
    return renderBootFailure(root, status, buildStudioBootFailure({
      stage: 'required_modules_loaded',
      failure_class: 'boot_asset_probe_failed',
      reason: String(error.message || error),
      effect: 'ui_blank_screen',
    }));
  }

  const coreAssets = assetProbe.assets.filter((asset) => asset.stage === 'core_bundle_loaded');
  const requiredAssets = assetProbe.assets.filter((asset) => asset.stage === 'required_modules_loaded');
  const coreBlockingFailure = coreAssets.find((asset) => !asset.ok && asset.blocking) || null;
  const requiredBlockingFailure = requiredAssets.find((asset) => !asset.ok && asset.blocking) || null;

  if (coreBlockingFailure) {
    return renderBootFailure(root, status, buildStudioBootFailure({
      stage: 'core_bundle_loaded',
      failure_class: 'missing_required_asset',
      reason: `Studio shell mounted, but boot failed because required client asset "${coreBlockingFailure.path}" was missing.`,
      asset: coreBlockingFailure,
      http_status: coreBlockingFailure.http_status,
      effect: 'ui_blank_screen',
    }));
  }
  updateStudioBootStage(status, 'core_bundle_loaded', {
    status: 'ok',
    ok: true,
    reason: '',
  });

  requiredAssets
    .filter((asset) => !asset.ok && !asset.blocking)
    .forEach((asset) => {
      renderBootWarning(status, {
        path: asset.path,
        reason: `${asset.label || asset.path} is unavailable but non-blocking.`,
        http_status: asset.http_status,
      });
    });

  if (requiredBlockingFailure) {
    return renderBootFailure(root, status, buildStudioBootFailure({
      stage: 'required_modules_loaded',
      failure_class: 'missing_required_asset',
      reason: `Studio shell mounted, but boot failed because required client asset "${requiredBlockingFailure.path}" was missing.`,
      asset: requiredBlockingFailure,
      http_status: requiredBlockingFailure.http_status,
      effect: 'ui_blank_screen',
    }));
  }
  updateStudioBootStage(status, 'required_modules_loaded', {
    status: 'ok',
    ok: true,
    reason: '',
  });
  writeBootStatus(status);

  try {
    await import(manifest.entry_module_import);
  } catch (error) {
    recordStudioBootError(status, {
      type: 'module_load_failure',
      message: String(error.message || error),
      source: manifest.entry_module_import,
      stage: 'required_modules_loaded',
    });
    return renderBootFailure(root, status, buildStudioBootFailure({
      stage: 'required_modules_loaded',
      failure_class: 'module_load_failure',
      reason: String(error.message || error),
      asset: { path: manifest.entry_module_import, label: 'Spatial app entry', blocking: true },
      effect: 'ui_blank_screen',
    }));
  }

  const mounted = await waitForStudioMount(root, manifest, status);
  if (!mounted) {
    return renderBootFailure(root, status, buildStudioBootFailure({
      stage: 'first_render_complete',
      failure_class: 'blank_screen_boot_failure',
      reason: `Studio shell mounted, but the application never produced the ${manifest.mount_marker.attribute}="${manifest.mount_marker.value}" marker before timeout.`,
      effect: 'ui_blank_screen',
    }));
  }
  return finishBoot(status);
}

bootSpatialStudio();
