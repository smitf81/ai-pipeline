import assert from 'node:assert/strict';
import { createEditorState, activateScenario } from '../src/editor/editorState.js';
import { createSeededMap } from '../src/world/mapGenerator.js';
import { CHAPTER_ONE_SCENARIO_ID } from '../src/world/scenarioCatalogue.js';
import {
  buildPlaytestSnapshot,
  capRenderItems,
  createPlaytestSettings,
  createRouteFeedback,
  cycleWeatherQuality,
  deriveEffectiveWeatherQuality,
  getWeatherRenderSettings
} from '../src/game/playtestStabilization.js';

export function run() {
  const defaultSettings = createPlaytestSettings();
  assert.equal(defaultSettings.weatherQuality, 'medium');
  assert.equal(defaultSettings.mapClarityMode, false);
  assert.equal(cycleWeatherQuality('medium'), 'cinematic');
  assert.equal(cycleWeatherQuality('cinematic'), 'off');

  const medium = getWeatherRenderSettings({ weatherQuality: 'medium' });
  assert.equal(medium.enabled, true);
  assert.equal(medium.maxCloudCells, 36);
  assert.ok(medium.opacityScale > 0.5);

  const clarity = getWeatherRenderSettings({ weatherQuality: 'cinematic', mapClarityMode: true });
  assert.equal(clarity.mapClarityMode, true);
  assert.ok(clarity.maxCloudCells < getWeatherRenderSettings({ weatherQuality: 'cinematic' }).maxCloudCells);
  assert.ok(clarity.opacityScale < getWeatherRenderSettings({ weatherQuality: 'cinematic' }).opacityScale);

  const degraded = deriveEffectiveWeatherQuality('cinematic', { averageFrameMs: 26, p95FrameMs: 42, badFrameRatio: 0.02 });
  assert.equal(degraded, 'medium', 'render settings should step cinematic down before gameplay suffers');
  const badBudget = getWeatherRenderSettings({ weatherQuality: 'medium' }, { averageFrameMs: 31, p95FrameMs: 52, badFrameRatio: 0.12 });
  assert.equal(badBudget.effectiveMode, 'low');
  assert.equal(badBudget.degradedForFrameBudget, true);

  const capped = capRenderItems([1, 2, 3, 4], 2);
  assert.deepEqual(capped, [1, 2]);

  const route = createRouteFeedback([{ x: 1, y: 1 }, { x: 4, y: 2 }, { x: 8, y: 7 }]);
  assert.equal(route.preservesPaintedAnchors, true);
  assert.equal(route.anchorCount, 3);
  assert.deepEqual(route.anchors[1], { x: 4, y: 2 });

  const map = createSeededMap({ seed: 'playtest-stability', preset: 'frontier_2k' });
  const state = createEditorState(map);
  const activation = activateScenario(state, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(activation.ok, true);
  assert.equal(state.activeScenarioId, CHAPTER_ONE_SCENARIO_ID);
  state.runtimeStats = { fps: 58, frameMs: 17.2, frameBudget: { averageFrameMs: 17.2, p95FrameMs: 24, badFrameRatio: 0 } };
  state.playtest = createPlaytestSettings({ weatherQuality: 'low', mapClarityMode: true, aiDebug: true });
  const snapshot = buildPlaytestSnapshot(state);
  assert.equal(snapshot.scenario, CHAPTER_ONE_SCENARIO_ID);
  assert.equal(snapshot.weatherMode, 'low');
  assert.equal(snapshot.mapClarityMode, true);
  assert.equal(snapshot.aiDebug, true);
}
