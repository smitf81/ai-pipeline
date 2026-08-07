import { assert, equal } from './assert.mjs';
import { createPerformanceDiagnostics, updateFramePerformance } from '../src/debug/performance.js';
import { applyPauseInput } from '../src/game/pause.js';

const perf = createPerformanceDiagnostics();
updateFramePerformance(perf, 1000);
for (let i = 1; i <= 30; i += 1) updateFramePerformance(perf, 1000 + i * 16.6667);
assert(perf.fps > 55 && perf.fps < 65, `fps tracker should settle near 60, got ${perf.fps}`);
assert(perf.frameMs > 16 && perf.frameMs < 17, `frame ms should track latest frame, got ${perf.frameMs}`);

const state = { paused: false, game: {} };
let pressed = 'tab';
const input = { wasPressed: (key) => key === pressed };
equal(applyPauseInput(state, input), true, 'tab should pause');
equal(state.paused, true, 'state should become paused');
equal(state.game.paused, true, 'game mirror should become paused');
pressed = 'escape';
equal(applyPauseInput(state, input), true, 'escape should resume');
equal(state.paused, false, 'state should resume');
equal(state.game.paused, false, 'game mirror should resume');
pressed = 'x';
equal(applyPauseInput(state, input), false, 'unrelated keys should not affect pause');
