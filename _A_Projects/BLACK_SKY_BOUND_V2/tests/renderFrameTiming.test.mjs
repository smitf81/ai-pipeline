import { assert, equal } from './assert.mjs';
import { createRenderFrameTiming } from '../src/debug/renderFrameTiming.js';

const timing = createRenderFrameTiming();
for (let frame = 0; frame < 61; frame += 1) timing.record('frameIntervalMs', 16);
const first = timing.diagnostics();
timing.record('projectionMs', 2.5);
equal(timing.diagnostics(), first, 'warm diagnostics should reuse their bounded summary between publish frames');
for (let frame = 0; frame < 4; frame += 1) timing.record('frameIntervalMs', 16 + frame);
const refreshed = timing.diagnostics();
assert(refreshed !== first, 'timing diagnostics should republish after the bounded four-frame interval');
equal(refreshed.current.projectionMs, 2.5, 'republished diagnostics should include the latest phase measurement');
equal(refreshed.frame, 65, 'republished diagnostics should retain every recorded frame');
