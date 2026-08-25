import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import {
  THREE_MAMA_NAPALM_FIREWALL_CONTRACT,
  ThreeMamaNapalmFirewall,
  isMamaInfernoSmoke
} from '../src/render/backends/three/ThreeMamaNapalmFirewall.js';

const root = new THREE.Group();
const firewall = new ThreeMamaNapalmFirewall(root, 48);
const baseWall = {
  id: 'mama_napalm_visual_test',
  worldAx: 48,
  worldAy: 96,
  worldBx: 768,
  worldBy: 192,
  worldWidth: 72,
  age: 0.5,
  lifetime: 18,
  life01: 0.972,
  seed: 4187
};

equal(root.children.includes(firewall.root), true, 'the canonical Three.js effects root should own the napalm presentation');
equal(isMamaInfernoSmoke({ sourceKind: 'mama_inferno_wall_smoke' }), true, 'authored inferno smoke should route into the dedicated firewall renderer');
equal(isMamaInfernoSmoke({ sourceKind: 'burning_foliage_smoke' }), false, 'foliage smoke should retain its separate canonical renderer');

firewall.update([baseWall], 2.4);
const ignition = firewall.diagnostics();
equal(ignition.contract, THREE_MAMA_NAPALM_FIREWALL_CONTRACT, 'diagnostics should expose the dedicated production VFX contract');
equal(ignition.phaseCounts.ground_ignition, 1, 'newly deposited fuel should report the uneven ground-ignition phase');
equal(ignition.fuelPools, 13, 'one wall should use thirteen connected fuel pools instead of one opaque box');
equal(ignition.scorchMarks, ignition.fuelPools, 'every fuel contact should retain a grounded dark residue underlay');
assert(ignition.flameClusters > 0 && ignition.flameClusters < ignition.fuelPools, 'early ignition should travel unevenly instead of activating a uniform wall at once');
assert(ignition.smokeMasses > 0, 'initial combustion should already feed dedicated soft smoke masses');
assert(ignition.embers > 0, 'initial combustion should shed lifted embers');
equal(ignition.primitiveFallbacks, 0, 'the production path must not revive the old box or orb fallback');
equal(ignition.sharpTriangleSilhouetteFallbacks, 0, 'the production path must not revive sharp fitted flame ribbons');
equal(ignition.smokeRibbons, 0, 'smoke should use soft SDF masses rather than tapered triangle ribbons');
assert(ignition.geometryPolicy.includes('rolling_sdf_metaball'), 'the active Three.js path should report the curved macro-mass silhouette contract');
assert(ignition.flamePalettePolicy.includes('crimson_vermilion_amber'), 'the firewall should report the seeded multi-hue fuel-fire palette');
assert(ignition.smokePolicy.includes('maturing_entwined_charcoal'), 'the firewall should report smoke as a phase-growing co-equal plume layer');
assert(ignition.drawCalls <= ignition.maximumDrawCalls, 'the layered effect should remain inside its global draw-family budget');

firewall.update([{ ...baseWall, age: 4.6, life01: 0.74 }], 6.1);
const sustain = firewall.diagnostics();
equal(sustain.phaseCounts.sustain_firewall, 1, 'mature burning fuel should report the sustain/firewall phase');
equal(sustain.flameClusters, 8, 'the sustained barrier should group the fuel line into eight substantial overlapping macro masses');
equal(sustain.dominantRollingMasses, 3, 'the sustained barrier should contain three large balling anchor masses');
equal(sustain.smokeMasses, 7, 'the sustained barrier should retain the authored seven-node smoke budget as soft masses');
equal(sustain.drawCalls, 5, 'all five bounded presentation families should be active at peak burn');

firewall.update([{ ...baseWall, age: 15.2, life01: 0.156 }], 16.5);
const decay = firewall.diagnostics();
equal(decay.phaseCounts.decay_aftermath, 1, 'late fuel should report decay/aftermath rather than pretending to be peak fire');
assert(decay.flameClusters > 0, 'decay should step down the flame wall instead of popping it off early');
assert(decay.smokeMasses > 0, 'decay should retain smoke while flame intensity falls');
assert(decay.embers < sustain.embers, 'ember density should fall during the aftermath');

firewall.update([], 18.1);
const expired = firewall.diagnostics();
equal(expired.activeWalls, 0, 'expired canonical walls should remove all renderer-local presentation');
equal(expired.drawCalls, 0, 'an inactive firewall should consume no visible draw calls');

const restoreWarmup = firewall.beginScreenWarmup();
assert(firewall.root.children.every((mesh) => mesh.visible && mesh.count === 1 && mesh.material.opacity === 0), 'screen warmup should upload every shader family invisibly');
restoreWarmup();
assert(firewall.root.children.every((mesh) => !mesh.visible && mesh.count === 0 && mesh.material.opacity > 0), 'screen warmup should restore the inactive presentation exactly');

firewall.dispose();
equal(root.children.includes(firewall.root), false, 'dispose should remove the dedicated effect root');
