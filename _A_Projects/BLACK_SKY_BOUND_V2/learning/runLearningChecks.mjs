import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTORS } from '../src/data/actors.js';
import { ABILITIES } from '../src/data/abilities.js';
import { NAPALM_DRIBBLE_RECIPES } from '../src/data/napalmDribble.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { AbilityId } from '../src/constants/abilityIds.js';
import { ComponentType } from '../src/constants/componentTypes.js';
import { ACTION_SYSTEM_NAMES } from '../src/game/systemOrder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const requiredFiles = [
  'docs/LEARN_TO_CODE_WITH_BSB.md',
  'docs/learning/BSB_CODE_MAP.md',
  'docs/learning/QUEST_00_BOOT_AND_READ.md',
  'docs/learning/QUEST_01_DATA_TUNING.md',
  'docs/learning/QUEST_02_COMPONENTS_AND_ECS.md',
  'docs/learning/QUEST_03_STAMINA_FEATURE_CHAIN.md',
  'src/app.js',
  'src/data/actors.js',
  'src/data/abilities.js',
  'src/components/createComponents.js',
  'src/ecs/world.js',
  'src/game/systemOrder.js',
  'src/render/backends/webgl/WebGLGameRenderer.js',
  'tests/runTests.mjs'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

for (const rel of requiredFiles) {
  assert(exists(rel), `Missing expected learning/repo file: ${rel}`);
}

assert(ACTORS[EntityKind.YOUNG_DRAGON], 'Young dragon actor data should be available.');
assert(typeof ACTORS[EntityKind.YOUNG_DRAGON].speed === 'number', 'Young dragon speed should be data-driven.');
assert(ABILITIES[AbilityId.SMOKE_BURST], 'Smoke burst ability data should be available.');
assert(typeof ABILITIES[AbilityId.SMOKE_BURST].duration === 'number', 'Smoke duration should be data-driven.');
assert(Object.keys(NAPALM_DRIBBLE_RECIPES).length >= 1, 'Napalm dribble recipes should be data-driven.');
assert(ComponentType.Transform === 'Transform', 'ComponentType contract should expose Transform.');
assert(ACTION_SYSTEM_NAMES.includes('movementSystem'), 'System order should include movementSystem.');
assert(ACTION_SYSTEM_NAMES.includes('napalmDripSystem'), 'System order should include napalmDripSystem.');

console.log('\nBSB Learning Companion checks passed.');
console.log('');
console.log('Current safe learning route:');
console.log('  00  docs/learning/QUEST_00_BOOT_AND_READ.md');
console.log('  01  docs/learning/QUEST_01_DATA_TUNING.md');
console.log('  02  docs/learning/QUEST_02_COMPONENTS_AND_ECS.md');
console.log('  03  docs/learning/QUEST_03_STAMINA_FEATURE_CHAIN.md');
console.log('');
console.log('Repo facts detected:');
console.log(`  Dragon speed data: ${ACTORS[EntityKind.YOUNG_DRAGON].speed}`);
console.log(`  Smoke duration data: ${ABILITIES[AbilityId.SMOKE_BURST].duration}`);
console.log(`  Action systems: ${ACTION_SYSTEM_NAMES.join(' → ')}`);
console.log('');
console.log('Next move: run npm test, then start Quest 00.');
