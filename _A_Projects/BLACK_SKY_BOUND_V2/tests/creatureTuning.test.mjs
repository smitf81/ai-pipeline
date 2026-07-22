import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, equal } from './assert.mjs';
import { CreatureProjectionId, resolveCreatureProjectionRecipe } from '../src/data/creatureProjections.js';
import {
  createEmptyCreatureTuning,
  listProfileOverridePaths,
  normalizeCreatureTuning,
  setCreatureTuningValue
} from '../src/data/creatures/creatureTuning.js';
import { GroundedWyvernProportionProfileId } from '../src/data/creatures/groundedWyvernProportions.js';
import { readCreatureTuningFile, writeCreatureTuningFile } from '../tools/tuningApi.mjs';

const profileId = GroundedWyvernProportionProfileId.HATCHLING_SKELETAL_GAIT_V0;
let tuning = createEmptyCreatureTuning();
const unknown = setCreatureTuningValue(tuning, profileId, 'tail.unboundedMystery', 2);
equal(unknown.ok, false, 'unknown tuning path should be rejected before persistence');

const clamped = setCreatureTuningValue(tuning, profileId, 'visual.scale', 99);
assert(clamped.ok, 'known tuning path should be accepted');
equal(clamped.value, 2.2, 'visual scale should clamp to manifest max');
tuning = clamped.tuning;
equal(listProfileOverridePaths(tuning, profileId).join(','), 'visual.scale', 'override paths should be observable for AI inspection');

const recipe = resolveCreatureProjectionRecipe(CreatureProjectionId.GROUNDED_WYVERN_HATCHLING, tuning);
equal(recipe.proportionProfile.visual.scale, 2.2, 'resolved profile should consume file-backed override values');
equal(recipe.proportions.headLength, recipe.proportionProfile.head.length, 'legacy proportions should derive from resolved profile');
equal(recipe.hindLegAnatomy.footLength, recipe.proportionProfile.hindLeg.footLength, 'hind anatomy should derive from resolved profile');
equal(recipe.wingAnatomy.shoulderWidth, recipe.proportionProfile.forelimb.shoulderAnchorWidth, 'wing anatomy anchors should derive from resolved profile');

const invalid = normalizeCreatureTuning({ profiles: { [profileId]: { tail: { nope: 1 } } } }, { rejectUnknown: true });
equal(invalid.ok, false, 'normalizer should reject unknown persisted fields when requested');

const tempRoot = await mkdtemp(join(tmpdir(), 'bsb-tuning-'));
try {
  const saved = await writeCreatureTuningFile(tempRoot, tuning);
  equal(saved.profiles[profileId].visual.scale, 2.2, 'API writer should persist normalized tuning');
  const raw = await readFile(join(tempRoot, 'tuning', 'creature-overrides.json'), 'utf8');
  assert(raw.includes('visual'), 'persisted JSON should contain saved override values');
  const loaded = await readCreatureTuningFile(tempRoot);
  equal(loaded.profiles[profileId].visual.scale, 2.2, 'API reader should reload persisted tuning');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
