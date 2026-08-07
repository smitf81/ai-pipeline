import { equal } from './assert.mjs';
import { createFixedStepLoop } from '../src/core/loop.js';

let updates = 0;
let renders = 0;
const loop = createFixedStepLoop({
  stepMs: 16,
  update: () => { updates += 1; },
  render: () => { renders += 1; },
  now: () => 0,
  raf: () => {}
});
const steps = loop.tickForTest(64);
equal(steps, 4, 'fixed loop should execute expected updates');
equal(updates, 4, 'update count should match steps');
equal(renders, 1, 'render should run once after manual test tick');
