import { CONFIG } from '../config.js';
import { createApp } from '../app.js';
import { renderGameToText } from '../debug/runtimeText.js';
import { loadAudioTuningFromServer } from '../tuning/audioTuningClient.js';
import { loadCreatureTuningFromServer } from '../tuning/creatureTuningClient.js';
import { loadStandaloneRuntimeMap, logRuntimeMapLoad } from '../world/runtimeMapBootstrap.js';
import { applyWorldEventDebugQuery } from '../game/worldEventControls.js';
import { createEmptyCreatureTuning } from '../data/creatures/creatureTuning.js';
import { createEmptyAudioTuning } from '../data/audio/audioTuning.js';
import { attachEntityAuthoringWindowBridge, createEntityAuthoringRuntime } from '../tuning/entityAuthoringRuntime.js';

const canvas = document.getElementById('game');
if (canvas) bootBrowserApp(canvas);

export async function bootBrowserApp(canvas) {
  const search = globalThis.location?.search ?? '';
  const runtimeResult = await loadStandaloneRuntimeMap(search);
  logRuntimeMapLoad(runtimeResult);
  window.BSB_V2_MAP_LOAD = runtimeResult.load;
  if (!runtimeResult.ok) {
    window.BSB_V2_BOOT_ERROR = runtimeResult.load;
    renderBootError(canvas, runtimeResult.load.reason);
    return null;
  }
  const bundledPlaytest = import.meta.env?.PROD === true;
  const [loaded, loadedAudio] = bundledPlaytest
    ? [
        { ok: true, tuning: createEmptyCreatureTuning(), source: 'bundled_defaults' },
        { ok: true, tuning: createEmptyAudioTuning(), source: 'bundled_defaults' }
      ]
    : await Promise.all([loadCreatureTuningFromServer(), loadAudioTuningFromServer()]);
  const app = createApp(canvas, {
    map: runtimeResult.map,
    runtimeMapLoad: runtimeResult.load,
    creatureTuning: loaded.tuning,
    audioTuning: loadedAudio.tuning,
    tuningSource: loaded.source,
    tuningLoadStatus: loaded.ok ? 'loaded' : 'blocked',
    tuningLoadError: loaded.ok ? null : loaded.reason,
    audioTuningSource: loadedAudio.source,
    audioTuningLoadStatus: loadedAudio.ok ? 'loaded' : 'blocked',
    audioTuningLoadError: loadedAudio.ok ? null : loadedAudio.reason,
    openingEnabled: !queryFlag(search, 'skipHatch'),
    openingSource: queryFlag(search, 'skipHatch') ? 'debug_query_skip_hatch' : 'fresh_launch'
  });
  window.BSB_V2_DEMO = app;
  const entityAuthoring = createEntityAuthoringRuntime(app, {
    writable: !bundledPlaytest,
    onSessionChange: ({ active }) => document.documentElement.classList.toggle('bsb-entity-authoring', active)
  });
  const detachEntityAuthoring = attachEntityAuthoringWindowBridge(entityAuthoring);
  window.BSB_ENTITY_AUTHORING = entityAuthoring;
  applyWorldEventDebugQuery(app.worldEvents, search);
  window.advanceTime = (ms = CONFIG.fixedStepMs) => app.loop.tickForTest(Math.max(0, Number(ms) || 0));
  window.render_game_to_text = () => renderGameToText(app);
  globalThis.addEventListener?.('pagehide', () => { detachEntityAuthoring(); app.dispose(); }, { once: true });
  app.start();
  return app;
}

function queryFlag(search, key) {
  const value = new URLSearchParams(search).get(key);
  return ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
}

function renderBootError(canvas, reason) {
  const dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
  const width = Math.max(1, Math.floor((canvas.clientWidth || 1280) * dpr));
  const height = Math.max(1, Math.floor((canvas.clientHeight || 720) * dpr));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#08090b';
  ctx.fillRect(0, 0, width / dpr, height / dpr);
  ctx.fillStyle = '#ff8f8f';
  ctx.font = '600 18px ui-monospace, monospace';
  ctx.fillText('BLACK SKY BOUND V2 — MAP LOAD BLOCKED', 32, 52);
  ctx.fillStyle = '#c8ccd4';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(String(reason).slice(0, 120), 32, 82);
}
