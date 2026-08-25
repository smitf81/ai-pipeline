import { assert, equal } from './assert.mjs';
import { buildStormCameraProjection, STORM_CAMERA_PROJECTION_CONTRACT } from '../src/projection/stormCameraProjection.js';

const state = {
  paused: false,
  playerProfile: { settings: { reducedMotion: false } },
  audio: {
    lightning: {
      cameraShake: {
        active: true,
        key: 'storm:proof',
        elapsedMs: 80,
        durationMs: 720,
        intensity: 1,
        amplitudeTiles: 0.18,
        frequencyHz: 12.5,
        decayPower: 2.05,
        sourcePolicy: 'delayed_thunder_arrival_only'
      }
    }
  }
};

const early = buildStormCameraProjection(state, 32);
equal(early.contract, STORM_CAMERA_PROJECTION_CONTRACT, 'storm shake should expose a renderer-neutral contract');
assert(early.active, 'active thunder should create a camera impulse');
assert(Math.hypot(early.impulseWorldX, early.impulseWorldY) > 0.1, 'camera impulse should be visibly non-zero');
equal(early.sourcePolicy, 'delayed_thunder_arrival_only', 'camera impulse should retain thunder-arrival ownership');

state.audio.lightning.cameraShake.elapsedMs = 620;
const late = buildStormCameraProjection(state, 32);
assert(late.decay < early.decay, 'camera shake should decay rapidly over its short authored lifetime');

state.playerProfile.settings.reducedMotion = true;
const reduced = buildStormCameraProjection(state, 32);
equal(reduced.active, false, 'reduced-motion players should receive no storm camera displacement');
equal(reduced.suppressedReason, 'reduced_motion', 'suppressed shake should explain the accessibility gate');

state.playerProfile.settings.reducedMotion = false;
state.paused = true;
equal(buildStormCameraProjection(state, 32).suppressedReason, 'paused', 'paused play should freeze storm camera motion');
