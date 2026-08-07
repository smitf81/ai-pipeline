import { assert, equal } from './assert.mjs';
import { buildThreeArenaView } from '../src/render/backends/three/ThreeArenaScreenLayer.js';
import { buildThreeBodyStateView } from '../src/render/backends/three/ThreeBodyStateScreenLayer.js';
import { buildThreePauseView } from '../src/render/backends/three/ThreePauseScreenLayer.js';
import { buildAuthoredTransitionVisual, buildSmokeAwakeningVisual } from '../src/render/backends/three/ThreeTransitionScreenLayer.js';
import { buildThreeTutorialView } from '../src/render/backends/three/ThreeTutorialScreenLayer.js';

const authored = buildAuthoredTransitionVisual({
  screenActive: true,
  phase: 'smoke_cover',
  phaseProgress: .8,
  smoke: { coverage: .99, threshold: .98 },
  landing: { debris: [{ x01: .2, y01: .4, size: 4, rotation: 1, opacity: .8 }] }
});
equal(authored.opacity, 1, 'Three authored-transition consumer should resolve the nested smoke packet to an opaque handoff');
equal(authored.debris.length, 1, 'Three authored-transition consumer should retain authored debris packets');
equal(authored.prompt, null, 'authored phase ids must not become player-facing prompt text');

const held = buildSmokeAwakeningVisual({
  screenActive: true,
  phase: 'blackout_hold',
  smokeCoverage: 1,
  fullSmokeOpacity: .985,
  pocket01: 0,
  acceptedInputCount: 0,
  requiredInputCount: 3,
  phaseProgress: .5,
  prompt: null
});
equal(held.opacity, .985, 'awakening blackout should consume the authored full-smoke opacity');
equal(held.prompt, null, 'awakening must remain silent before the canonical prompt is visible');

const breathing = buildSmokeAwakeningVisual({
  screenActive: true,
  phase: 'exhale',
  smokeCoverage: 1,
  fullSmokeOpacity: .985,
  pocket01: .36,
  acceptedInputCount: 2,
  requiredInputCount: 3,
  phaseProgress: 1,
  exhalePulse: .7,
  prompt: { title: 'EXHALE', bindings: ['RMB'] }
});
equal(breathing.pocket01, .36, 'awakening consumer should carry the progressive reveal pocket');
equal(breathing.acceptedInputCount, 2, 'awakening consumer should carry accepted breath progress');
equal(breathing.prompt.title, 'EXHALE', 'awakening prompt should appear only from the canonical prompt packet');

const movement = buildThreeTutorialView({
  id: 'first_movement',
  presentationType: 'movement_keys',
  title: 'MOVE',
  phase: 'active',
  inputRows: [{ bindings: ['W', 'A', 'S', 'D'] }],
  progress: { pressedLabels: ['W'] }
});
equal(movement.keys.length, 4, 'movement tutorial should retain four distinct keycaps');
equal(movement.keys.filter((key) => key.complete).length, 1, 'movement tutorial should retain key acceptance state');

const charge = buildThreeTutorialView({
  id: 'charge_instinct',
  presentationType: 'dodge_charge_sequence',
  title: 'DODGE · CHARGE',
  supportingText: 'DODGE AGAIN TO COUNTER',
  inputRows: [{ bindings: ['SPACE'] }],
  progress: { pressedLabels: [], dodgeAccepted: true, chargeAccepted: false }
});
equal(charge.keys.length, 2, 'charge instinct should render its two-stage input sequence');
equal(charge.keys[0].complete, true, 'charge instinct should show the accepted first dodge');
equal(charge.keys[1].complete, false, 'charge instinct should keep the follow-up pending');

const pause = buildThreePauseView({
  title: 'CONTROLS & INSTINCTS',
  footer: 'ESC',
  pointerHint: 'CLICK / DRAG / WHEEL',
  selectedSettingIndex: 0,
  learnedCueIds: ['charge_instinct'],
  layout: {
    compact: false,
    controls: [{ abilityId: 'move', label: 'MOVE', bindings: 'W A S D', x: 50, y: 116, labelX: 176, scale: 2 }],
    sections: [{ label: 'SOUND', x: 892, y: 118 }],
    settingsRows: [{ id: 'audio_master', index: 0, section: 'SOUND', kind: 'level', label: 'MASTER', value: '50%', level: .5, x: 892, y: 147, width: 498, height: 35, bounds: { x: 878, y: 144, w: 512, h: 38 }, minusBounds: { x: 892, y: 159, w: 23, h: 19 }, plusBounds: { x: 1367, y: 159, w: 23, h: 19 }, rail: { x: 923, y: 166, w: 436, h: 6 } }],
    footer: { x: 48, y: 858, scale: 2, maxWidth: 1344 }
  }
});
equal(pause.settings[0].rail.x, 923, 'pause presentation should use the exact canonical rail geometry used for hit-testing');
equal(pause.settings[0].minusBounds.x, 892, 'pause presentation should use the exact canonical decrement geometry');

const unlock = buildThreeArenaView({
  phase: 'intermission',
  waveNumber: 1,
  totalWaves: 5,
  banner: 'INSTINCT AWAKENED · DODGE',
  bannerDetail: 'RECOVER · NEXT WAVE IN 8',
  bannerSeconds: 8
});
equal(unlock.kind, 'instinct_unlock', 'arena reward should resolve to the dedicated instinct presentation');
equal(unlock.eyebrow, 'NEW INSTINCT', 'arena instinct presentation should identify the reward without inventing progression truth');

const body = buildThreeBodyStateView({ enabled: true, postProcess: { healthPressure: .6, hitPulse: .8, staminaPressure: .4, breathPulse: .5, desaturation: .3, contrast: .2 } });
assert(body.active, 'body-pressure presentation should activate from the renderer-neutral body-state projection');
assert(Number(body.saturation) < 1 && Number(body.contrast) > 1, 'body-pressure presentation should apply bounded desaturation and contrast');

console.log('threeScreenPresentation.test.mjs passed');
