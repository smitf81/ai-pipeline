import * as THREE from 'three';
import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { setCreatureTuningValue } from '../src/data/creatures/creatureTuning.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { setCameraVisibilityFocusTarget } from '../src/game/cameraVisibilityFocus.js';
import { syncGameViews } from '../src/game/selectors.js';
import { createRenderProjection3DCompiler } from '../src/projection/renderProjection3D.js';
import { ThreeCameraVisibilityFocus } from '../src/render/backends/three/ThreeCameraVisibilityFocus.js';
import { createCamera } from '../src/render/camera.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
syncGameViews(game);
const state = { time: 0, map, game, camera: createCamera({ clientWidth: 1280, clientHeight: 720 }, map) };
const compiler = createRenderProjection3DCompiler(CONFIG);
let projection = compiler.compile(state).dynamicWorld.cameraVisibilityFocus;
assert(projection.active, 'the canonical gameplay camera focus should be active by default');
equal(projection.targetEntityId, game.dragonId, 'normal gameplay should focus the exact player entity id');
equal(projection.sourceProfileId, 'grounded_wyvern_hatchling_skeletal_gait_v0', 'focus values should resolve from the selected entity profile');
equal(projection.radiusMeters, 1.15, 'the default traced sightline radius should project into rendering');
equal(projection.mode, 'occlusion_aware_orthographic_sightline_corridor', 'the projection must declare line-of-sight rather than target-sphere semantics');

const raider = game.actors.find((actor) => actor.humanoidProjection?.profileId);
assert(raider, 'camera focus test requires a real humanoid target');
setCameraVisibilityFocusTarget(game.cameraVisibilityFocus, raider.id, 'test_selection');
const tuned = setCreatureTuningValue(game.creatureTuning, raider.humanoidProjection.profileId, 'visibilityFocus.radiusMeters', 2.1);
assert(tuned.ok, tuned.reason);
game.creatureTuning = tuned.tuning;
projection = compiler.compile(state).dynamicWorld.cameraVisibilityFocus;
equal(projection.targetEntityId, raider.id, 'camera focus should follow an explicit editor/runtime selection without kind heuristics');
equal(projection.targetSource, 'test_selection', 'focus projection should preserve target provenance');
equal(projection.radiusMeters, 2.1, 'profile-backed camera focus tuning should reach the renderer-neutral packet');

game.cameraVisibilityFocus.targetEntityId = 'missing_entity';
projection = compiler.compile(state).dynamicWorld.cameraVisibilityFocus;
equal(projection.active, false, 'a missing focus target should fail visibly instead of falling back to the player');
equal(projection.reason, 'camera_visibility_focus_target_missing', 'missing targets should report an explicit reason');
compiler.dispose();

const root = new THREE.Group();
const focus = new ThreeCameraVisibilityFocus(root, CONFIG.tileSize);
let focusOwnedMeshCount = 0;
root.traverse((child) => { if (child.isMesh) focusOwnedMeshCount += 1; });
equal(focusOwnedMeshCount, 0, 'camera focus must not add meshes to the live-world resource budget');
assert(focus.light.isPointLight && focus.light.castShadow === false, 'camera focus readability should use one fixed non-shadowing light');
const material = new THREE.MeshStandardMaterial({ color: 0x234528 });
const object = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.36, 0.5), material);
object.position.set(5.78, 0.58, 15);
equal(focus.registerObject(object, { id: 'canopy_cross_section', role: 'tree_canopy' }), 1, 'a scenery material should be shader-patched exactly once');
equal(focus.registerObject(object), 0, 'shared scenery materials should not accumulate duplicate patches');
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x514b43 });
const ceiling = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), ceilingMaterial);
ceiling.position.set(5, 0.58, 17);
equal(focus.registerObject(ceiling, { id: 'cave_ceiling', role: 'terrain_ceiling' }), 1, 'eligible ceiling surfaces should join the same occluder trace');
const offSightMaterial = new THREE.MeshStandardMaterial({ color: 0x31563b });
const offSight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), offSightMaterial);
offSight.position.set(9, 0.58, 15);
focus.registerObject(offSight, { id: 'off_sight_tree', role: 'tree_canopy' });
const behindMaterial = new THREE.MeshStandardMaterial({ color: 0x61594f });
const behind = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), behindMaterial);
behind.position.set(5, 0.58, 9);
focus.registerObject(behind, { id: 'behind_target', role: 'terrain_ceiling' });
const clone = material.clone();
assert(focus.registerMaterial(clone), 'a dynamically cloned scenery material should receive its own focus patch');

focus.update({
  active: true,
  targetEntityId: 'player',
  targetKind: 'young_dragon',
  targetSource: 'test',
  sourceProfileId: 'test-profile',
  worldX: 320,
  worldY: 640,
  focusHeightMeters: 0.58,
  radiusMeters: 1.15,
  featherMeters: 0.3,
  minimumOccluderOpacity: 0.04,
  readabilityLightPower: 525,
  readabilityLightDistanceMeters: 6.5
}, {
  cameraPosition: new THREE.Vector3(5, 0.58, 20),
  cameraDirection: new THREE.Vector3(0, 0, -1),
  cameraRight: new THREE.Vector3(1, 0, 0),
  cameraUp: new THREE.Vector3(0, 1, 0)
});
const diagnostics = focus.diagnostics();
assert(diagnostics.active, 'renderer focus should activate for a complete packet');
assert(diagnostics.occlusionActive, 'a traced blocker should activate the sightline cut');
equal(diagnostics.blockerObjectCount, 2, 'the cross-section trace should find the off-centre canopy and the centre ceiling only');
assert(diagnostics.blockerIds.includes('canopy_cross_section') && diagnostics.blockerIds.includes('cave_ceiling'), 'trace diagnostics should name exact blockers');
assert(!diagnostics.blockerIds.includes('off_sight_tree') && !diagnostics.blockerIds.includes('behind_target'), 'objects outside or behind the camera-target segment must not be faded');
equal(diagnostics.crossSectionSampleCount, 9, 'the orthographic player cross-section should use the bounded nine-ray trace');
equal(diagnostics.activeMaterialCount, 2, 'only materials belonging to traced blockers should activate');
equal(diagnostics.patchedMaterialCount, 5, 'renderer diagnostics should expose every eligible patched material');
equal(diagnostics.center.x, 5, 'focus X should use the canonical 3D world transform');
equal(diagnostics.center.z, 10, 'focus Z should use the canonical 3D world transform');
equal(diagnostics.readabilityLightPower, 525, 'the fixed readability light should consume the projected profile power');

const shader = {
  uniforms: {},
  vertexShader: '#include <common>\n#include <worldpos_vertex>',
  fragmentShader: '#include <common>\n#include <alphatest_fragment>'
};
material.onBeforeCompile(shader, {});
assert(shader.vertexShader.includes('vCameraVisibilityFocusWorldPosition'), 'scenery vertex shaders should project world position into the focus test');
assert(shader.fragmentShader.includes('cameraVisibilityFocusCorridor'), 'scenery fragment shaders should contain the traced sightline corridor');
assert(shader.fragmentShader.includes('discard'), 'occluder fading should use stable dither discard rather than transparent material sorting');
equal(shader.uniforms.uCameraVisibilityFocusRadius.value, 1.15, 'patched shader uniforms should update without recompilation');
equal(shader.uniforms.uCameraVisibilityFocusSegmentStart.value.z, 20, 'the corridor should begin on the orthographic camera ray through the target');
equal(shader.uniforms.uCameraVisibilityFocusSegmentEnd.value.z, 10, 'the corridor should terminate at the exact target rather than behind it');

const behindShader = { uniforms: {}, vertexShader: '#include <common>\n#include <worldpos_vertex>', fragmentShader: '#include <common>\n#include <alphatest_fragment>' };
behindMaterial.onBeforeCompile(behindShader, {});
equal(behindShader.uniforms.uCameraVisibilityFocusActive.value, 0, 'a surface behind the target must remain fully opaque');

focus.update({ active: false, reason: 'test_disabled', targetEntityId: 'player' });
equal(focus.diagnostics().active, false, 'inactive projection should disable both fade and readability light');
equal(focus.light.visible, false, 'inactive focus should remove the readability light contribution');
focus.dispose();
equal(root.children.length, 0, 'disposing camera focus should remove its fixed light slot');
object.geometry.dispose();
material.dispose();
clone.dispose();
ceiling.geometry.dispose();
ceilingMaterial.dispose();
offSight.geometry.dispose();
offSightMaterial.dispose();
behind.geometry.dispose();
behindMaterial.dispose();
