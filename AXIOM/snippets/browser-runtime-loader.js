// AXIOM Runtime Plugin Loader v0
// Browser-side loader. Add after window.EDITOR is created, before boot completes.
(function installAxiomRuntimePluginLoader(){
  if (window.AXIOM_PLUGIN_RUNTIME) return;

  const DEFAULT_BUILDER_URL = 'http://127.0.0.1:4242';
  const active = new Map();

  function log(...args){ console.log('[AXIOM_PLUGIN_RUNTIME]', ...args); }
  function warn(...args){ console.warn('[AXIOM_PLUGIN_RUNTIME]', ...args); }

  function getEditor(){
    if (!window.EDITOR) throw new Error('window.EDITOR is not available');
    return window.EDITOR;
  }

  function requiredRuntimeApis(){
    return [
      'scene.getCamera',
      'scene.getOrbitTarget',
      'scene.getRendererDomElement',
      'scene.getSelected',
      'scene.focusSelected'
    ];
  }

  function checkRuntimeApis(editor){
    const missing = [];
    if (typeof editor?.scene?.getCamera !== 'function') missing.push('scene.getCamera');
    if (typeof editor?.scene?.getOrbitTarget !== 'function') missing.push('scene.getOrbitTarget');
    if (typeof editor?.scene?.getRendererDomElement !== 'function') missing.push('scene.getRendererDomElement');
    if (typeof editor?.scene?.getSelected !== 'function') missing.push('scene.getSelected');
    if (typeof editor?.scene?.focusSelected !== 'function') missing.push('scene.focusSelected');
    return missing;
  }

  function buildContext(pluginId){
    const editor = getEditor();
    return {
      pluginId,
      THREE: window.THREE,
      scene: {
        getCamera: () => editor.scene.getCamera(),
        getOrbitTarget: () => editor.scene.getOrbitTarget(),
        getRendererDomElement: () => editor.scene.getRendererDomElement(),
        getSelected: () => editor.scene.getSelected(),
        focusSelected: () => editor.scene.focusSelected()
      },
      events: editor.events,
      notify: (msg) => editor.notify ? editor.notify('info', msg) : log(msg),
      logger: console,
      log: console
    };
  }

  async function inspectPlugin(pluginId, builderUrl = DEFAULT_BUILDER_URL){
    const res = await fetch(`${builderUrl}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'axiom_plugin_inspect',
        arguments: { plugin_id: pluginId, include_files: true }
      })
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(`Plugin inspect failed: ${JSON.stringify(data.errors || data)}`);
    }
    return data.result;
  }

  async function importPluginSource(pluginId, source){
    if (!source || typeof source !== 'string') throw new Error('Plugin source is missing');
    const blob = new Blob([source], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    try {
      const mod = await import(url + `#${encodeURIComponent(pluginId)}-${Date.now()}`);
      return { mod, url };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  async function activate(pluginId, options = {}){
    const builderUrl = options.builderUrl || DEFAULT_BUILDER_URL;
    if (!pluginId) return { ok: false, status: 'blocked', reason: 'missing_plugin_id' };
    if (active.has(pluginId)) return { ok: true, status: 'already_active', plugin_id: pluginId };

    const editor = getEditor();
    const missing = checkRuntimeApis(editor);
    if (missing.length) {
      return { ok: false, status: 'blocked', reason: 'missing_runtime_api', required_apis: requiredRuntimeApis(), missing_apis: missing };
    }

    let imported = null;
    try {
      const inspected = await inspectPlugin(pluginId, builderUrl);
      const manifest = inspected.manifest;
      if (!manifest) throw new Error('Plugin manifest missing from inspect response');
      if (manifest.validation_status?.passed !== true) throw new Error('Plugin validation_status.passed is not true');
      if (!['registered', 'active'].includes(manifest.lifecycle?.status)) {
        throw new Error(`Plugin must be registered before activation. Current: ${manifest.lifecycle?.status}`);
      }
      if (manifest.safety?.may_modify_core === true) throw new Error('Plugin requests core modification; activation blocked');

      const source = inspected.files?.['src/index.js'];
      imported = await importPluginSource(pluginId, source);
      const ctx = buildContext(pluginId);

      if (typeof imported.mod.onLoad === 'function') await imported.mod.onLoad(ctx);
      let activationResult = { ok: true };
      if (typeof imported.mod.onActivate === 'function') activationResult = await imported.mod.onActivate(ctx);
      if (activationResult && activationResult.ok === false) throw new Error(`Plugin onActivate returned ok:false: ${JSON.stringify(activationResult)}`);

      active.set(pluginId, { pluginId, manifest, module: imported.mod, moduleUrl: imported.url, context: ctx, activatedAt: new Date().toISOString() });
      editor.notify?.('ok', `Plugin active: ${manifest.name || pluginId}`);
      return { ok: true, status: 'active', plugin_id: pluginId, manifest_id: manifest.id, activated_at: active.get(pluginId).activatedAt, activation_result: activationResult };
    } catch (err) {
      try {
        if (imported?.mod?.onDeactivate) await imported.mod.onDeactivate(buildContext(pluginId));
      } catch (rollbackErr) {
        warn('rollback/deactivate after failed activation also failed', rollbackErr);
      }
      if (imported?.url) URL.revokeObjectURL(imported.url);
      return { ok: false, status: 'activation_failed_rolled_back', plugin_id: pluginId, error: String(err) };
    }
  }

  async function deactivate(pluginId){
    const entry = active.get(pluginId);
    if (!entry) return { ok: true, status: 'not_active', plugin_id: pluginId };
    try {
      if (typeof entry.module.onDeactivate === 'function') await entry.module.onDeactivate(entry.context);
      if (typeof entry.module.onUnload === 'function') await entry.module.onUnload(entry.context);
      URL.revokeObjectURL(entry.moduleUrl);
      active.delete(pluginId);
      getEditor().notify?.('ok', `Plugin deactivated: ${pluginId}`);
      return { ok: true, status: 'deactivated', plugin_id: pluginId };
    } catch (err) {
      return { ok: false, status: 'deactivate_failed', plugin_id: pluginId, error: String(err) };
    }
  }

  function status(){
    return { ok: true, active_plugins: [...active.values()].map(p => ({ plugin_id: p.pluginId, name: p.manifest?.name, activated_at: p.activatedAt })) };
  }

  async function applyClientAction(action){
    if (!action || !action.type) return { ok: false, reason: 'missing_client_action' };
    if (action.type === 'activate_plugin') return activate(action.payload?.plugin_id, action.payload || {});
    if (action.type === 'deactivate_plugin') return deactivate(action.payload?.plugin_id);
    if (action.type === 'plugin_runtime_status') return status();
    return { ok: false, reason: 'unknown_plugin_client_action', action_type: action.type };
  }

  window.AXIOM_PLUGIN_RUNTIME = { activate, deactivate, status, applyClientAction };
  log('installed');
})();
