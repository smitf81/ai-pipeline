import { assert } from './assert.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const expectedFiles = [
  'src/data/creatures/groundedWyvernHatchling.js',
  'src/data/creatures/groundedWyvernProportions.js',
  'src/data/creatures/groundedWyvernMotionProfiles.js',
  'src/projection/creatures/creatureKinematics.js',
  'src/projection/creatures/wyvernProceduralPose.js',
  'src/projection/creatures/wyvernCreatureRigPose.js',
  'src/render/backends/webgl/WebGLWyvernSilhouette.js',
  'src/render/backends/webgl/layers/WebGLActorLayer.js'
];

for (const file of expectedFiles) {
  assert(existsSync(join(root, file)), `wyvern projection partition should include ${file}`);
}

const removedCanvasFiles = [
  'src/render/layers/actorLayer.js',
  'src/render/layers/wyvern/wyvernLayer.js',
  'src/render/layers/wyvern/wyvernBodyLayer.js',
  'src/render/layers/wyvern/wyvernHeadLayer.js',
  'src/render/layers/wyvern/wyvernTailLayer.js',
  'src/render/layers/wyvern/wyvernWingLayer.js',
  'src/render/layers/wyvern/wyvernHindLegLayer.js'
];

for (const file of removedCanvasFiles) {
  assert(!existsSync(join(root, file)), `Canvas 2D wyvern renderer should be culled: ${file}`);
}

const actorLayer = readFileSync(join(root, 'src/render/backends/webgl/layers/WebGLActorLayer.js'), 'utf8');
assert(actorLayer.includes('buildWebGLPlayerWyvernSilhouette'), 'WebGL actor layer should own player wyvern silhouette drawing');
assert(actorLayer.includes('WEBGL_PLAYER_WYVERN_MODE'), 'WebGL actor layer should expose the wyvern mode diagnostic');
assert(!actorLayer.includes('drawGroundedWyvern'), 'WebGL actor layer should not call the removed Canvas wyvern renderer');

const silhouette = readFileSync(join(root, 'src/render/backends/webgl/WebGLWyvernSilhouette.js'), 'utf8');
assert(silhouette.includes('player_wyvern_silhouette_v0'), 'WebGL wyvern silhouette should name the active player silhouette mode');
assert(silhouette.includes('actor.wyvernProjection'), 'WebGL wyvern silhouette should consume renderer-neutral wyvern projection packets');
assert(silhouette.includes('proceduralPose'), 'WebGL wyvern silhouette should consume pose packets rather than owning animation truth');
assert(silhouette.includes('rigPose'), 'WebGL wyvern silhouette should consume canonical creature rig packets for anatomy truth');
for (const contractWord of ['wing_forelimb', 'wrist_claw', 'low_flank_hip', 'digitLengths', 'hindLegAnatomy']) {
  assert(silhouette.includes(contractWord), `WebGL wyvern silhouette should preserve ${contractWord}`);
}
assert(!silhouette.includes('canvas'), 'WebGL wyvern silhouette should not use Canvas rendering');

const recipe = readFileSync(join(root, 'src/data/creatures/groundedWyvernHatchling.js'), 'utf8');
assert(recipe.includes('projection_recipe'), 'grounded wyvern anatomy should live as projection recipe data');
assert(recipe.includes('hindLegAnatomy') && recipe.includes('wingAnatomy'), 'limb proportions should remain data-backed, not hidden in renderer glue');
assert(recipe.includes('buildGroundedWyvernProportions'), 'legacy recipe fields should be derived from the active proportion profile');
assert(recipe.includes('proportionProfile'), 'grounded wyvern proportions should be recipe-owned, not hidden in WebGL drawing code');

const proportions = readFileSync(join(root, 'src/data/creatures/groundedWyvernProportions.js'), 'utf8');
for (const word of ['skeleton', 'head', 'jaw', 'neck', 'shoulders', 'haunch', 'forelimb', 'hindLeg', 'tail', 'counterReach', 'constraints']) {
  assert(proportions.includes(word), `wyvern proportion profile should define ${word}`);
}

const motionProfiles = readFileSync(join(root, 'src/data/creatures/groundedWyvernMotionProfiles.js'), 'utf8');
assert(motionProfiles.includes('left_claw_swipe') && motionProfiles.includes('right_claw_swipe') && motionProfiles.includes('bite_attack'), 'wyvern melee action poses should live in lightweight profile data');
assert(motionProfiles.includes('smoke_spit') && motionProfiles.includes('lunge_attack'), 'wyvern smoke/lunge action poses should live in lightweight profile data');
assert(motionProfiles.includes('contactBodyPart') && motionProfiles.includes('activePhaseStart'), 'wyvern action contacts should live in lightweight profile data');

const contactSystem = readFileSync(join(root, 'src/systems/wyvernAttackContactSystem.js'), 'utf8');
assert(contactSystem.includes('applyDamageToEntity'), 'contact system should own wyvern attack hit resolution');
assert(contactSystem.includes('ImpactResponse'), 'contact system should write physics-informed impact response data');
