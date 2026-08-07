import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import {
  THREE_PHYSICAL_LIGHT_SHADER_BUDGET_CONTRACT,
  ThreePhysicalLightAdapter
} from '../src/render/backends/three/ThreePhysicalLightAdapter.js';
import { ThreeDiagnosticsOverlay } from '../src/render/backends/three/ThreeDiagnosticsOverlay.js';
import { ThreeLiveWorld } from '../src/render/backends/three/ThreeLiveWorld.js';

const root = new THREE.Group();
const adapter = new ThreePhysicalLightAdapter(root, 32);
const capacity = RENDER_BUDGETS.lightEmitters.threeShaderSlotCapacity;

adapter.update(makePackets(capacity), 1);
const complete = adapter.diagnostics();
equal(complete.shaderBudgetContract, THREE_PHYSICAL_LIGHT_SHADER_BUDGET_CONTRACT, 'adapter should expose its fixed shader budget contract');
equal(complete.physicalLocalCapacity, capacity, 'adapter should create only the content-complete fixed shader capacity');
equal(complete.localLightCount, capacity, 'every packet at capacity should own a physical light slot');
equal(complete.droppedLocalCount, 0, 'content at capacity should lose no physical lights');
equal(complete.qualityState, 'native_full', 'content-complete lighting should report native quality');
adapter.consumeShadowInvalidation();
adapter.update(makePackets(capacity), 1.1, null, { x: 40, y: 52 });
assert(adapter.consumeShadowInvalidation(), 'moving live play into a new moon coverage cell should refresh the directional shadow map');
equal(adapter.moon.target.position.x, 20, 'the moon shadow target should follow the player on render X');
equal(adapter.moon.target.position.z, 26, 'the moon shadow target should follow the player on render Z');
adapter.update(makePackets(capacity), 1.2, null, { x: 40.5, y: 52.5 });
assert(!adapter.consumeShadowInvalidation(), 'small movement inside a moon coverage cell should not rebuild static shadows every frame');

adapter.update(makePackets(capacity + 1), 2);
const overflow = adapter.diagnostics();
equal(overflow.localLightCount, capacity, 'shader slots must remain fixed when input exceeds capacity');
equal(overflow.droppedLocalCount, 1, 'overflow must be explicit rather than silently expanding or recompiling');
assert(overflow.overflowActive, 'overflow should enter a visible degraded state');
equal(overflow.qualityState, 'degraded_visible', 'overflow should be surfaced as visible degradation');

const originalDocument = globalThis.document;
const originalAddEventListener = globalThis.addEventListener;
const originalRemoveEventListener = globalThis.removeEventListener;
const overlayElement = { style: {}, textContent: '', remove() {} };
globalThis.document = { createElement: () => overlayElement, body: { appendChild() {} } };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
const overlay = new ThreeDiagnosticsOverlay({ enabled: false });
overlay.update({ liveWorld: { lights: overflow } });
assert(overlay.enabled, 'physical light overflow should automatically reveal F3 diagnostics');
equal(overlayElement.style.display, 'block', 'overflow diagnostics should become visibly rendered');
assert(overlayElement.textContent.includes('degraded_visible'), 'visible diagnostics should name the lighting degradation state');
overlay.dispose();
globalThis.document = originalDocument;
globalThis.addEventListener = originalAddEventListener;
globalThis.removeEventListener = originalRemoveEventListener;

adapter.dispose();
equal(root.children.length, 0, 'disposing the adapter should remove every light and target from the scene');

const candidate = new THREE.Group();
candidate.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
let casterRefreshes = 0;
const liveWorldHarness = {
  shadowCandidates: [candidate], shadowSelectionCell: '', staticSignature: 'test-map', stats: {},
  lights: { requestShadowRefresh() { casterRefreshes += 1; } }
};
ThreeLiveWorld.prototype.updateShadowCasters.call(liveWorldHarness, [{ team: 'player', alive: true, x: 12, y: 14 }]);
assert(candidate.children[0].castShadow, 'the nearest live tree should become a real shadow caster');
equal(casterRefreshes, 1, 'changing the live caster cell should explicitly refresh the frozen shadow maps');
ThreeLiveWorld.prototype.updateShadowCasters.call(liveWorldHarness, [{ team: 'player', alive: true, x: 12.2, y: 14.2 }]);
equal(casterRefreshes, 1, 'movement inside the same caster cell should not refresh shadows every frame');
ThreeLiveWorld.prototype.updateShadowCasters.call(liveWorldHarness, [{ team: 'player', alive: true, x: 16, y: 14 }]);
equal(casterRefreshes, 2, 'entering a new live caster cell should refresh shadow ownership');
candidate.children[0].geometry.dispose();
candidate.children[0].material.dispose();

function makePackets(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `torch:${index}`,
    sourceKind: index % 2 ? 'actor_torch' : 'raid_flame',
    worldX: index * 2,
    worldY: index * 3,
    effectiveIntensity: 0.8,
    enabled: true,
    castsShadows: false,
    illuminationState: 'nearby_static',
    shadowPriority: count - index,
    colour: 'rgba(255,140,70,1)'
  }));
}
