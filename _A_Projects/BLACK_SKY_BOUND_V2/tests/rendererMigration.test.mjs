import { existsSync, readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { createRenderBackend, RenderBackendId } from '../src/render/backends/renderBackend.js';
import { createRenderLayerState, getRenderLayerStats } from '../src/projection/renderLayerState.js';

equal(RENDER_BUDGETS.renderer.preferredBackend, RenderBackendId.WEBGL, 'renderer should use WebGL as the only default backend');
equal(RENDER_BUDGETS.renderer.candidateBackend, RenderBackendId.WEBGL, 'renderer should keep WebGL as the only candidate backend');
equal(RENDER_BUDGETS.renderer.fallbackBackend, null, 'renderer should not declare a Canvas 2D fallback backend');
equal(RENDER_BUDGETS.renderer.activationPolicy, 'webgl_only_no_renderer_fallback', 'renderer should have no runtime fallback policy');
equal(RENDER_BUDGETS.renderer.migrationPolicy, 'canvas2d_renderer_culled_webgl_only_v1', 'renderer policy should name the Canvas 2D cull');
equal(RENDER_BUDGETS.renderer.unsupportedRendererPolicy, 'explicit_error_no_fallback', 'unsupported renderer requests should fail loudly');
equal(RENDER_BUDGETS.renderer.canvas2dRuntimeAvailable, false, 'Canvas 2D runtime rendering should be unavailable');
equal(RENDER_BUDGETS.renderer.migrationCoverageStatus, 'webgl_only_canvas2d_renderer_culled', 'renderer policy should expose WebGL-only coverage');
equal(
  RENDER_BUDGETS.renderer.terrainCachePolicy,
  'webgl_visible_tile_projection_no_canvas_cache',
  'terrain policy should no longer describe Canvas cache rendering'
);

const renderLayers = createRenderLayerState();
let stats = getRenderLayerStats(renderLayers);
equal(stats.rendererPreferredBackend, RenderBackendId.WEBGL, 'stats should expose WebGL as the default backend');
equal(stats.rendererCandidateBackend, RenderBackendId.WEBGL, 'stats should expose WebGL as the only candidate backend');
equal(stats.rendererRequestedBackend, RenderBackendId.WEBGL, 'stats should expose the requested backend');
equal(stats.rendererActiveBackend, 'uninitialized', 'renderer stats should start uninitialized before runtime');
equal(stats.rendererActivationPolicy, RENDER_BUDGETS.renderer.activationPolicy, 'stats should expose WebGL-only activation policy');
equal(stats.rendererMigrationPolicy, RENDER_BUDGETS.renderer.migrationPolicy, 'stats should expose renderer cull policy');
equal(stats.unsupportedRendererPolicy, RENDER_BUDGETS.renderer.unsupportedRendererPolicy, 'stats should expose unsupported renderer policy');
equal(stats.canvas2dRuntimeAvailable, false, 'stats should expose Canvas 2D runtime cull');
equal(stats.hiddenCanvasRenderLoopActive, false, 'stats should start with no hidden Canvas render loop');
equal(stats.webglMigrationCoverageStatus, RENDER_BUDGETS.renderer.migrationCoverageStatus, 'stats should expose WebGL-only migration coverage status');
equal(stats.webglLayerOrder.length, 0, 'WebGL layer order should start empty before runtime');
equal(stats.rendererFullSceneTextureUploadActive, false, 'stats should default to no full-scene texture upload');
equal(stats.rendererLegacyCompositeActive, false, 'legacy composite should not be active by default');
equal(stats.webglDarknessLayerActive, false, 'WebGL darkness diagnostics should default inactive');
equal(stats.webglLightCount, 0, 'WebGL light diagnostics should default to zero active lights');
equal(stats.webglSceneryLayerActive, false, 'WebGL scenery diagnostics should default inactive');
equal(stats.webglScenerySourceCount, 0, 'WebGL scenery diagnostics should default to zero scene objects');
equal(stats.webglDecalLayerActive, false, 'WebGL decal diagnostics should default inactive');
equal(stats.webglHudLayerActive, false, 'WebGL HUD diagnostics should default inactive');
equal(stats.webglPlayerWyvernSilhouetteActive, false, 'WebGL wyvern silhouette diagnostics should default inactive');
equal(stats.webglPostProcessRenderTargetActive, false, 'WebGL post-process render target should default inactive');
equal(stats.webglFogSmokeLayerActive, false, 'WebGL fog/smoke diagnostics should default inactive');
equal(stats.terrainCachePolicy, RENDER_BUDGETS.renderer.terrainCachePolicy, 'stats should expose terrain policy');

const fakeCanvas = {
  clientWidth: 640,
  clientHeight: 360,
  width: 0,
  height: 0,
  getContext() {
    return null;
  }
};

const originalConsoleError = console.error;
console.error = () => {};
const webglErrorBackend = createRenderBackend(fakeCanvas, RENDER_BUDGETS.renderer);
console.error = originalConsoleError;
equal(webglErrorBackend.id, RenderBackendId.WEBGL, 'default backend should remain WebGL when WebGL initialization fails');
webglErrorBackend.recordDiagnostics(renderLayers.renderer);
stats = getRenderLayerStats(renderLayers);
equal(stats.rendererActiveBackend, RenderBackendId.WEBGL, 'default WebGL failure should not masquerade as another renderer');
equal(stats.rendererBackendStatus, 'error', 'default WebGL failure should be surfaced as a backend error');
equal(stats.rendererFallbackReason, 'webgl_initialization_failed', 'default WebGL failure should preserve the failure reason');
assert(!!stats.rendererInitializationError, 'default WebGL failure should record an initialization error');
equal(stats.canvas2dRuntimeAvailable, false, 'WebGL error path should not expose a Canvas 2D runtime');
equal(stats.webglMigrationCoverageStatus, 'webgl_boot_error_no_renderer_fallback', 'WebGL error status should prove there is no renderer fallback');
equal(stats.rendererPreferenceSource, 'budget_default', 'default backend should identify its preference source');

const originalLocation = globalThis.location;
console.error = () => {};
globalThis.location = { search: '?renderer=canvas2d' };
const unsupportedBackend = createRenderBackend(fakeCanvas, RENDER_BUDGETS.renderer);
globalThis.location = originalLocation;
console.error = originalConsoleError;
const unsupportedLayers = createRenderLayerState();
unsupportedBackend.recordDiagnostics(unsupportedLayers.renderer);
stats = getRenderLayerStats(unsupportedLayers);
equal(unsupportedBackend.id, RenderBackendId.UNSUPPORTED, 'Canvas 2D renderer request should be unsupported after the cull');
equal(stats.rendererRequestedBackend, 'canvas2d', 'unsupported diagnostics should preserve the requested renderer');
equal(stats.rendererActiveBackend, RenderBackendId.UNSUPPORTED, 'unsupported renderer request should not activate WebGL or Canvas 2D');
equal(stats.rendererBackendStatus, 'error', 'unsupported renderer request should surface an error');
equal(stats.rendererFallbackReason, 'unsupported_renderer_backend', 'unsupported renderer request should preserve the failure reason');
assert(stats.rendererInitializationError.includes('Canvas 2D runtime rendering was culled'), 'unsupported renderer error should explain the Canvas 2D cull');
equal(stats.rendererMode, 'unsupported_renderer', 'unsupported renderer should report explicit mode');
equal(stats.canvas2dRuntimeAvailable, false, 'unsupported renderer path should not expose Canvas 2D runtime');
equal(stats.webglMigrationCoverageStatus, 'unsupported_renderer_request_no_canvas2d_runtime', 'unsupported renderer status should prove Canvas was not activated');

const target = unsupportedBackend.beginFrame({ viewportW: 0, viewportH: 0 });
equal(target.viewportW, 640, 'unsupported backend should still size diagnostics viewport');
equal(target.viewportH, 360, 'unsupported backend should still size diagnostics viewport');

const rendererSource = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
assert(rendererSource.includes('createRenderBackend'), 'renderer factory should use the backend seam');
assert(rendererSource.includes('buildRenderProjection'), 'WebGL path should consume renderer-neutral projection packets');
assert(!rendererSource.includes('./layers/'), 'renderer should not import Canvas 2D render layers');
assert(!rendererSource.includes('drawHudOverlay'), 'renderer should not call Canvas HUD rendering');
assert(!rendererSource.includes('getContext'), 'renderer should not request Canvas 2D contexts');

const backendSource = readFileSync(new URL('../src/render/backends/renderBackend.js', import.meta.url), 'utf8');
assert(!backendSource.includes('createCanvas2DBackend'), 'backend factory should not retain Canvas 2D backend registration');
assert(!backendSource.includes('CANVAS_2D'), 'backend ids should not retain Canvas 2D as a runtime backend');
assert(!backendSource.includes("getContext('2d')"), 'backend factory should not request Canvas 2D contexts');
assert(!backendSource.includes('texImage2D'), 'backend factory should no longer own full-scene texture upload');
assert(!backendSource.includes('texSubImage2D'), 'backend factory should no longer upload hidden Canvas scenes');
assert(backendSource.includes('unsupported_renderer'), 'backend diagnostics should expose unsupported renderer requests');
assert(backendSource.includes('canvas2dRuntimeAvailable'), 'backend diagnostics should expose Canvas 2D runtime cull state');
assert(backendSource.includes('webglMigrationCoverageStatus'), 'backend diagnostics should expose WebGL migration coverage status');
assert(backendSource.includes('webglLayerOrder'), 'backend diagnostics should expose WebGL layer order');

assert(!existsSync(new URL('../src/render/layers', import.meta.url)), 'Canvas 2D render layers directory should be removed from live source');
assert(!existsSync(new URL('../src/render/lightSpaceMask.js', import.meta.url)), 'Canvas 2D light-space mask helper should be removed');
assert(!existsSync(new URL('../src/render/uiOverlay.js', import.meta.url)), 'Canvas 2D HUD overlay should be removed');
