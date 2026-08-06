import { assert, equal } from './assert.mjs';
import { EntityKind } from '../src/constants/entityKinds.js';
import { setCreatureTuningValue } from '../src/data/creatures/creatureTuning.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { spawnActor } from '../src/game/spawn.js';
import {
  ENTITY_AUTHORING_APPLY_RECEIPT_CONTRACT,
  ENTITY_AUTHORING_CANDIDATE_CONTRACT,
  ENTITY_AUTHORING_TARGET_CONTRACT
} from '../src/tuning/entityAuthoringContracts.js';
import { createEntityAuthoringRuntime } from '../src/tuning/entityAuthoringRuntime.js';
import { createTuningState } from '../src/tuning/tuningRuntime.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
const raiderId = spawnActor(game.world, EntityKind.RAIDER, 10, 10);
spawnActor(game.world, EntityKind.HUSK, 12, 10);
spawnActor(game.world, EntityKind.WEREWOLF, 14, 10);
syncGameViews(game);

let persisted = null;
const app = { state: { game, tuning: createTuningState(), paused: false, camera: { x: 4, y: 5, zoom: 2.75 } } };
const runtime = createEntityAuthoringRuntime(app, {
  persist: async (tuning) => {
    persisted = JSON.parse(JSON.stringify(tuning));
    return { ok: true, tuning: persisted, source: 'test_persistence' };
  }
});

const snapshot = runtime.snapshot();
assert(snapshot.targets.length >= 4, 'entity authoring should discover the player and spawned enemy families');
const wyvern = snapshot.targets.find((target) => target.runtimeIdentity.kind === EntityKind.YOUNG_DRAGON);
const raider = snapshot.targets.find((target) => target.runtimeIdentity.id === raiderId);
const husk = snapshot.targets.find((target) => target.runtimeIdentity.kind === EntityKind.HUSK);
const werewolf = snapshot.targets.find((target) => target.runtimeIdentity.kind === EntityKind.WEREWOLF);
equal(raider.contract, ENTITY_AUTHORING_TARGET_CONTRACT, 'targets should use the shared entity-authoring contract');
equal(wyvern.providerId, raider.providerId, 'wyvern and humanoid tuning should share the provider contract without sharing rig logic');
equal(husk.writeStatus, 'ready', 'husk should reuse the real humanoid field manifest');
equal(werewolf.writeStatus, 'manifest_missing', 'werewolf should fail visibly until a predator tuning manifest exists');
equal(werewolf.fields.length, 0, 'missing manifests must not produce guessed controls');
assert(raider.capabilities.some((capability) => capability.id === 'motion' && capability.status === 'shadow_only'), 'raider should expose the physical-motion promotion hold');
assert(raider.capabilities.some((capability) => capability.id === 'camera_focus' && capability.status === 'ready'), 'animated providers should expose the real camera-focus capability');
const focusField = raider.fields.find((entry) => entry.path === 'visibilityFocus.radiusMeters');
assert(focusField, 'Entity Studio should receive provider-owned camera focus controls');

const cameraBeforeSession = { ...app.state.camera };
const cameraFocusBeforeSession = JSON.stringify(app.state.game.cameraVisibilityFocus);
const focused = runtime.beginSession(raider.targetId);
assert(focused.ok, focused.reason);
equal(app.state.paused, true, 'an entity authoring session should pause simulation while inspecting an actor');
equal(app.state.tuning.active, true, 'an entity authoring session should reuse the runtime tuning hold to bypass cinematic camera ownership');
equal(app.state.camera.x, 11.2 * 32, 'selection focus should offset the runtime camera so the target remains visible beside the inspector');
equal(app.state.camera.y, 8.8 * 32, 'selection focus should offset the runtime camera so the target remains visible beside the inspector');
equal(app.state.game.cameraVisibilityFocus.targetEntityId, raider.runtimeIdentity.id, 'editor selection should drive the canonical runtime focus target');
assert(focused.target.runtimeProjection.cameraVisibilityFocus.active, 'focus response should return truthful live camera-focus state');
const ended = runtime.endSession();
assert(ended.ok && ended.restored, 'ending authoring should restore the prior runtime view');
equal(app.state.paused, false, 'ending authoring should restore the prior pause state');
equal(app.state.tuning.active, false, 'ending authoring should restore the prior tuning hold state');
equal(JSON.stringify(app.state.camera), JSON.stringify(cameraBeforeSession), 'ending authoring should restore the prior camera');
equal(JSON.stringify(app.state.game.cameraVisibilityFocus), cameraFocusBeforeSession, 'ending authoring should restore the gameplay player focus component');

const field = raider.fields.find((entry) => entry.path === 'body.shoulderWidth');
assert(field, 'raider should expose a real validated humanoid field');
const canonicalBefore = JSON.stringify(game.creatureTuning);
const proposed = runtime.createCandidate({
  targetId: raider.targetId,
  path: field.path,
  value: field.value + 0.05,
  source: { kind: 'human', id: 'test' }
});
assert(proposed.ok, proposed.reason);
equal(proposed.candidate.contract, ENTITY_AUTHORING_CANDIDATE_CONTRACT, 'edits should first become non-committed candidates');
equal(JSON.stringify(game.creatureTuning), canonicalBefore, 'candidate creation must not mutate runtime or persistence');

const previewed = runtime.previewCandidate(proposed.candidate.candidateId);
assert(previewed.ok, previewed.reason);
equal(previewed.target.fields.find((entry) => entry.path === field.path).value, proposed.candidate.operations[0].after, 'preview should flow through the real profile resolver');
const reverted = runtime.revertCandidate(proposed.candidate.candidateId);
assert(reverted.ok && reverted.reverted, 'candidate preview should be reversible');
equal(JSON.stringify(game.creatureTuning), canonicalBefore, 'revert should restore the canonical tuning projection');

runtime.beginSession(raider.targetId);
const focusProposal = runtime.createCandidate({ targetId: raider.targetId, path: focusField.path, value: focusField.value + 0.5 });
assert(focusProposal.ok, focusProposal.reason);
const focusPreview = runtime.previewCandidate(focusProposal.candidate.candidateId);
equal(focusPreview.target.runtimeProjection.cameraVisibilityFocus.radiusMeters, focusProposal.candidate.operations[0].after, 'camera focus candidates should change the live runtime projection during Preview');
runtime.revertCandidate(focusProposal.candidate.candidateId);
runtime.endSession();

const applyProposal = runtime.createCandidate({ targetId: raider.targetId, path: field.path, value: field.value + 0.04, source: { kind: 'agent', id: 'test-agent' } });
const applied = await runtime.applyCandidate(applyProposal.candidate.candidateId);
assert(applied.ok, applied.reason);
equal(applied.receipt.contract, ENTITY_AUTHORING_APPLY_RECEIPT_CONTRACT, 'apply should return a versioned receipt');
equal(applied.receipt.readBack.status, 'verified', 'persistence readback should be hash verified');
assert(persisted, 'apply should use the injected persistence authority');

const staleProposal = runtime.createCandidate({ targetId: raider.targetId, path: field.path, value: field.value + 0.03 });
const external = setCreatureTuningValue(game.creatureTuning, raider.profileId, field.path, field.value + 0.02);
assert(external.ok);
runtime.replaceCanonicalTuning(external.tuning, 'stale_candidate_test');
const staleResult = await runtime.applyCandidate(staleProposal.candidate.candidateId);
equal(staleResult.ok, false, 'stale candidates should be rejected');
equal(staleResult.reason, 'entity_authoring_candidate_stale', 'stale rejection should remain explicit');

const dispatched = await runtime.dispatch('state.snapshot');
assert(dispatched.ok && dispatched.result.targets.length >= 4, 'the bridge dispatcher should publish the provider snapshot');
