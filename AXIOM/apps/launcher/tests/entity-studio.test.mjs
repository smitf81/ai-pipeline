import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BSB_V2_GEOLOGY_DNA_CONTRACT,
  applyBsbV2GeologyOperation,
  createBsbV2GeologyDefinition
} from '../public/bsb-v2-geology-authoring.js';

const [studioSource, editorSource, serverSource, mapSource] = await Promise.all([
  readFile(new URL('../public/entity-studio.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/axiom-editor.html', import.meta.url), 'utf8'),
  readFile(new URL('../server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/bsb-v2-map-authoring.js', import.meta.url), 'utf8')
]);

assert.match(editorSource, /entity-studio\.css/);
assert.match(editorSource, /entity-studio\.js/);
assert.match(studioSource, /axiom\.entity-authoring\.command\.v0/);
assert.match(studioSource, /non_committed_entity_authoring_candidate/);
assert.match(studioSource, /entity_authoring_candidate_stale/);
assert.match(studioSource, /runtimeRefresh: 'baked_and_loaded'/);
assert.match(studioSource, /No editable manifest exists/);
assert.match(studioSource, /entity-studio-camera-focus/);
assert.match(studioSource, /Camera focus ·/);
assert.match(studioSource, /runtime_profile/);
assert.match(studioSource, /entity-studio-audio-perspective/);
assert.match(studioSource, /transform-owned emitters/);
assert.match(studioSource, /live HRTF voices/);
assert.match(studioSource, /function isRuntimeTarget/);
assert.match(mapSource, /list\(\) \{[\s\S]*filter\(isBsbV2GeologyRecord\)/);

assert.match(serverSource, /name: "axiom_entity_tuning_propose"/);
assert.match(serverSource, /type: "entity_authoring_candidate"/);
assert.match(serverSource, /classification: "non_committed_entity_authoring_candidate"/);
assert.match(serverSource, /applied: false/);
assert.match(editorSource, /action\.type === 'entity_authoring_candidate'/);
assert.match(editorSource, /candidateCreated/);
assert.match(editorSource, /not applied/);

const geology = {
  id: 'studio_geology_probe', type: 'boulder', x: 2, y: 3,
  geology: createBsbV2GeologyDefinition({ formation: 'fieldstone', seed: 44, scale: 1 })
};
const candidate = applyBsbV2GeologyOperation(geology, { op: 'patch', patch: { erosion: .73 } });
assert.equal(geology.geology.contract, BSB_V2_GEOLOGY_DNA_CONTRACT);
assert.notEqual(candidate, geology, 'stationary preview validation must not mutate canonical input');
assert.equal(geology.geology.erosion === .73, false, 'candidate calculation must leave source geology unchanged');
assert.equal(candidate.geology.erosion, .73);

console.log('AXIOM Entity Studio foundation contract tests passed.');
