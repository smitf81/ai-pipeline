import { assert, equal } from './assert.mjs';
import { ComponentType } from '../src/constants/componentTypes.js';
import { EntityKind } from '../src/constants/entityKinds.js';
import { createDemoMap } from '../src/world/map.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { getComponent } from '../src/ecs/world.js';
import { query } from '../src/ecs/query.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { buildActorViews } from '../src/game/selectors.js';
import { getCreatureProjectionRecipe, CreatureProjectionId } from '../src/data/creatureProjections.js';

const game = createInitialGameState(createDemoMap());
const wyvernEntities = query(game.world, [ComponentType.WyvernProjection]);
equal(wyvernEntities.length, 1, 'only the player entity should own wyvern projection state');
equal(wyvernEntities[0], game.dragonId, 'wyvern projection should belong to the single player gameplay entity');

equal(query(game.world, [ComponentType.LightEmitter]).some((entity) => entity === game.dragonId), false, 'wyvern projection should not add player light');

const projection = getComponent(game.world, game.dragonId, ComponentType.WyvernProjection);
equal(projection.recipeId, CreatureProjectionId.GROUNDED_WYVERN_HATCHLING, 'player should use grounded hatchling recipe');
const recipe = getCreatureProjectionRecipe(projection.recipeId);
equal(recipe.bodyPlan, 'four_limb_wyvern', 'recipe should preserve the 4-limb wyvern body plan');
equal(recipe.locomotion, 'grounded_crawl', 'recipe should use grounded crawl locomotion, not flight flapping');

equal(recipe.wingAnatomy.limbRole, 'wing_forelimb', 'wing anatomy should classify wings as forelimbs, not separate bonus limbs');
equal(recipe.wingAnatomy.groundedContact, 'wrist_claw', 'wing wrist/claw should be the grounded front contact point');
equal(recipe.wingAnatomy.digitOrigin, 'wrist_claw', 'visible wing digits should originate from the wrist/claw hub, not from the body membrane anchor');
equal(recipe.wingAnatomy.membraneFoldOrigin, 'wrist_claw', 'membrane folds should not masquerade as digit bones rooted from the flank');
equal(recipe.wingAnatomy.bodyAttachmentRole, 'low_flank_hip', 'wing membrane should still attach to the low flank/hip area');
assert(recipe.wingAnatomy.digitLengths.length === 4, 'wing anatomy should expose four visible digit spars so folded wing tips do not collapse into one line');
assert(Math.max(...recipe.wingAnatomy.digitLengths) > recipe.wingAnatomy.forearmLength * 2, 'wing digits should read as long folded wing spars, not short insect legs');

assert(recipe.wingAnatomy.digitOut.length === recipe.wingAnatomy.digitLengths.length, 'each visible wing digit should have its own lateral tip offset');
assert(recipe.wingAnatomy.digitBack.length === recipe.wingAnatomy.digitLengths.length, 'each visible wing digit should have its own backward fold offset');
assert(recipe.wingAnatomy.digitOut[0] > recipe.wingAnatomy.digitOut.at(-1), 'folded digit fan should separate the leading edge from the lower trailing digit');
assert(recipe.wingAnatomy.digitBack.at(-1) > recipe.wingAnatomy.digitBack[0], 'folded digit fan should produce distinct trailing membrane tips');
assert(recipe.wingAnatomy.membraneHipOut > 0 && recipe.wingAnatomy.membraneHipBack >= 0, 'wing membrane should have a low flank/hip body attachment');
assert(recipe.wingAnatomy.wristStride >= 0.48, 'grounded crawl should visibly lead from the wrist/claw contact point with a readable planted reach');
assert(recipe.wingAnatomy.upperArmLength > 0 && recipe.wingAnatomy.forearmLength > 0, 'wing anatomy should define shoulder-elbow-wrist limb lengths for IK-style projection');
assert(recipe.proportionProfile?.focus === 'template_slim_aesthetic_pass', 'recipe should carry the active slim aesthetic wyvern proportion profile');
assert(recipe.proportionProfile.completedPasses.includes('head_neck_shoulders_first_pass'), 'recipe should retain the prior front-body proportion pass contract');
assert(recipe.proportionProfile.completedPasses.includes('rear_hips_tail_counterbalance_pass'), 'recipe should retain the rear/tail proportion pass contract');
assert(recipe.proportionProfile.completedPasses.includes('template_slim_aesthetic_pass'), 'recipe should retain the slim aesthetic pass contract');
assert(recipe.proportionProfile.shoulders.width > recipe.proportionProfile.hips.width, 'proportion profile should bias this pass toward heavier shoulders/chest');

equal(recipe.hindLegAnatomy.limbRole, 'hind_leg', 'hind leg anatomy should classify rear limbs separately from wing-forelimbs');
equal(recipe.hindLegAnatomy.ik, 'two_bone_projection', 'hind legs should use a cheap IK-style projection solve, not a physics simulation');
equal(recipe.hindLegAnatomy.gaitRelationship, 'diagonal_with_opposite_wing_forelimb', 'hind legs should support a diagonal grounded crawl relationship');
assert(recipe.hindLegAnatomy.thighLength > 0 && recipe.hindLegAnatomy.shinLength > 0, 'hind legs should define hip-knee-ankle segment lengths');
assert(recipe.hindLegAnatomy.footStride >= 0.3, 'hind leg step length should be readable enough to avoid tiny anxious shuffles');
assert(recipe.hindLegAnatomy.thighGirth > recipe.hindLegAnatomy.shinGirth, 'hind leg proportions should read as weight-bearing with thicker thighs');
assert(recipe.hindLegAnatomy.ankleOut > recipe.hindLegAnatomy.hipWidth, 'hind feet should spread wider than the hips for grounded weight and stance');

const transform = getComponent(game.world, game.dragonId, ComponentType.Transform);
wyvernProjectionSystem({ game, dt: 1 / 60 });
transform.x += 0.3;
wyvernProjectionSystem({ game, dt: 1 / 60 });
assert(projection.bodyPoints.length === recipe.chain.pointRoles.length, 'projection system should maintain body/tail chain points');
assert(projection.movement01 > 0, 'movement should drive grounded gait phase');

const playerView = buildActorViews(game).find((actor) => actor.id === game.dragonId);
equal(playerView.type, EntityKind.YOUNG_DRAGON, 'existing gameplay kind should remain stable for systems');
assert(playerView.wyvernProjection?.bodyPoints?.length > 0, 'actor view should expose derived wyvern projection data to renderer');
