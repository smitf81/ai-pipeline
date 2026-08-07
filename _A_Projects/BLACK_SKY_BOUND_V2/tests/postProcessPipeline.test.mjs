import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { ATMOSPHERIC_POST_PROCESS_POLISH_MODE, POST_PROCESS_POLISH_TUNING, resolvePostProcessPolishTuning } from '../src/data/postProcessPolish.js';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import { createRenderLayerState, getRenderLayerStats } from '../src/projection/renderLayerState.js';
import { WebGLPostProcessLayer } from '../src/render/backends/webgl/layers/WebGLPostProcessLayer.js';

equal(RENDER_BUDGETS.postProcess.enabled, true, 'post-process pipeline should be enabled by budget policy');
equal(RENDER_BUDGETS.postProcess.policy, 'centralized_post_process_pipeline_v1', 'post-process work should have one declared owner');
equal(POST_PROCESS_POLISH_TUNING.postEnabled, true, 'atmospheric polish should default on');
equal(POST_PROCESS_POLISH_TUNING.debugToggleParam, 'post', 'post polish should have an instant query toggle');
equal(resolvePostProcessPolishTuning({ grainStrength: 9 }).grainStrength, 0.06, 'post polish tuning should clamp noisy grain');
equal(RENDER_BUDGETS.atmosphericScatter.bloomPolicy, 'delegated_to_post_process_pipeline', 'atmosphere should delegate bloom');
equal(RENDER_BUDGETS.atmosphericScatter.smoothingPolicy, 'delegated_to_post_process_pipeline', 'atmosphere should delegate smoothing');

const renderLayers = createRenderLayerState();
const stats = getRenderLayerStats(renderLayers);
equal(stats.postProcessPolicy, 'centralized_post_process_pipeline_v1', 'stats should expose post-process owner policy');
equal(stats.postProcessQualityProfile, 'balanced', 'stats should expose post-process quality profile');
equal(stats.postProcessBloomPolicy, 'single_pass_warm_luma_glow_proxy_no_blur_chain', 'stats should expose the cheap glow proxy policy');
equal(stats.postProcessSmoothingPolicy, 'disabled_no_full_screen_blur_chain', 'stats should expose disabled smoothing policy');
equal(stats.postProcessDitherPolicy, 'single_shader_temporally_controlled_grain', 'stats should expose shader grain policy');
equal(stats.postProcessBloomPasses, 0, 'post-process pass counts start at zero before rendering');

const postLayer = new WebGLPostProcessLayer();
const oldLocation = globalThis.location;
globalThis.location = { search: '?post=0' };
postLayer.update({ postProcess: { enabled: true, tuning: resolvePostProcessPolishTuning() }, bodyState: null });
equal(postLayer.statsFields().postEnabled, false, 'post polish should support an instant query disable');
globalThis.location = oldLocation;

const rendererSource = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
assert(rendererSource.includes('createRenderProjection3DCompiler'), 'live renderer should own the lifecycle-scoped 3D projection compiler');
assert(rendererSource.includes('backend.renderProjection(projection)'), 'renderer should hand compiled projection packets to the Three.js backend');
assert(!rendererSource.includes("from '../projection/renderProjection.js'"), 'live renderer must not import the broad legacy projection builder');
assert(!rendererSource.includes('drawSmokeFieldLayer'), 'renderer should not call the removed Canvas smoke layer');
assert(!rendererSource.includes('drawPostProcessLayer'), 'renderer should not call the removed Canvas post-process layer');
assert(!rendererSource.includes('drawHudOverlay'), 'renderer should not call the removed Canvas HUD layer');

const gameRendererSource = readFileSync(new URL('../src/render/backends/webgl/WebGLGameRenderer.js', import.meta.url), 'utf8');
assert(gameRendererSource.includes('new WebGLPostProcessPipeline'), 'WebGLGameRenderer should own the post-process pipeline');
assert(gameRendererSource.includes('postProcess.beginScene'), 'WebGLGameRenderer should render into its owned target before compositing');
assert(gameRendererSource.indexOf('new WebGLFogSmokeLayer()') < gameRendererSource.indexOf('new WebGLPostProcessLayer()'), 'WebGL post-process should run after fog/smoke');
assert(gameRendererSource.indexOf('new WebGLPostProcessLayer()') < gameRendererSource.indexOf('new WebGLAtmosphericOverlayLayer()'), 'camera atmosphere should run after post-process');
assert(gameRendererSource.indexOf('new WebGLAtmosphericOverlayLayer()') < gameRendererSource.indexOf('new WebGLGameplayOverlayLayer()'), 'gameplay screen overlays should run after camera atmosphere');
assert(gameRendererSource.indexOf('new WebGLGameplayOverlayLayer()') < gameRendererSource.indexOf('new WebGLHudDebugLayer()'), 'WebGL HUD/debug should run after gameplay screen overlays');

const postProcessSource = readFileSync(new URL('../src/render/backends/webgl/WebGLPostProcessPipeline.js', import.meta.url), 'utf8');
assert(postProcessSource.includes('ATMOSPHERIC_POST_PROCESS_POLISH_MODE'), 'WebGL post-process pipeline should expose the atmospheric polish mode');
assert(postProcessSource.includes('u_shadowCoolStrength'), 'WebGL post-process shader should expose cold shadow grading');
assert(postProcessSource.includes('u_fireWarmStrength'), 'WebGL post-process shader should preserve warm emitters');
assert(postProcessSource.includes('u_grainStrength'), 'WebGL post-process shader should expose subtle screen grain');
assert(postProcessSource.includes('createFramebuffer'), 'WebGL post-process pipeline should allocate an owned framebuffer');
assert(postProcessSource.includes('framebufferTexture2D'), 'WebGL post-process pipeline should attach a render-target texture');
assert(postProcessSource.includes('texture2D'), 'WebGL post-process pipeline should composite through a shader texture sample');
assert(!postProcessSource.includes('drawImage'), 'WebGL post-process pipeline should not use Canvas image compositing');
assert(!postProcessSource.includes('Canvas'), 'WebGL post-process pipeline should not depend on Canvas rendering');

const postProcessLayerSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLPostProcessLayer.js', import.meta.url), 'utf8');
const gameplayOverlayLayerSource = readFileSync(new URL('../src/render/backends/webgl/layers/WebGLGameplayOverlayLayer.js', import.meta.url), 'utf8');
assert(!postProcessLayerSource.includes('lifecycleOverlayColor'), 'post-process layer should not own death/wake overlay fades');
assert(gameplayOverlayLayerSource.includes('projection.playerLifecycle'), 'gameplay overlay layer should consume lifecycle projection ownership');
