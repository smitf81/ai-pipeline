import { assert, deepEqual, equal } from './assert.mjs';
import { MAMA_WYVERN_WORLD_EVENT } from '../src/data/mamaWyvernWorldEvents.js';
import {
  INFERNO_CLUSTER_MAX,
  INFERNO_CLUSTER_MIN,
  WEBGL_LIQUID_INFERNO_MODE,
  compositionSignature,
  createInfernoGeometryStats,
  createLiquidInfernoComposition,
  recordInfernoComposition,
  syncLiquidInfernoComposition
} from '../src/render/backends/webgl/WebGLInfernoGeometry.js';

const wall = Object.freeze({
  id: 'visual-test-inferno',
  worldAx: 40,
  worldAy: 80,
  worldBx: 560,
  worldBy: 224,
  worldWidth: 49,
  age: 4.2,
  lifetime: 18,
  life01: 0.76,
  lightScale: 0.92,
  seed: 34871
});

const first = createLiquidInfernoComposition(wall);
equal(first.mode, WEBGL_LIQUID_INFERNO_MODE, 'inferno diagnostics should name the retained rolling-cluster SDF mode');
assert(first.clusterCount >= INFERNO_CLUSTER_MIN && first.clusterCount <= INFERNO_CLUSTER_MAX, 'the wall should use six to ten substantial rolling clusters');
equal(first.dominantMassCount, 3, 'a standard wall should group its cached samples into three dominant rolling masses');
equal(first.secondaryMassCount, 3, 'a standard wall should tuck several secondary masses into the dominant groups');
equal(first.bridgeMassCount, 2, 'low cached combustion should bridge the three macro groups');
equal(first.fuelPoolCount, first.clusterCount, 'every rolling cluster should retain one grounded pooled-fuel contact');
equal(first.tallAccentCount, 2, 'only two cached clusters should carry taller flame accents');
assert(first.apparentCombustionLobeCount >= first.clusterCount * 5, 'the role-aware shader should retain substantial rolling lobe density without making every instance identical');
assert(first.estimatedCoveredAreaWorld > first.boundingAreaWorld * 0.4, 'rolling masses should occupy a substantial share of their tightly bounded quads');
assert(first.estimatedCoveredAreaWorld < first.boundingAreaWorld * 0.6, 'coverage diagnostics should not pretend transparent quad bounds are fully opaque');
assert(first.maxClusterBoundingAreaWorld < first.boundingAreaWorld * 0.26, 'no dominant mass should become a full-wall transparent slab');
assert(first.clusters.every((cluster) => [
  cluster.worldX,
  cluster.worldY,
  cluster.halfWidth,
  cluster.halfHeight,
  cluster.tangentLocalX,
  cluster.tangentLocalY,
  cluster.seed01,
  cluster.phase,
  cluster.role,
  cluster.macroIndex
].every(Number.isFinite)), 'all cached instance data should be finite');
assert(new Set(first.clusters.map((cluster) => cluster.halfWidth.toFixed(2))).size > first.clusterCount * 0.7, 'seeded cluster scale should avoid repeated tiles');
assert(new Set(first.clusters.map((cluster) => cluster.phase.toFixed(3))).size === first.clusterCount, 'every retained cluster should have a distinct rolling phase');
assert(first.clusters.reduce((sum, cluster) => sum + cluster.halfWidth * 2, 0) > Math.hypot(
  wall.worldBx - wall.worldAx,
  wall.worldBy - wall.worldAy
) * 1.5, 'large cluster footprints should overlap enough to form one connected burning deposit');
const dominantClusters = first.clusters.filter((cluster) => cluster.role === 2);
const secondaryClusters = first.clusters.filter((cluster) => cluster.role === 1);
const bridgeClusters = first.clusters.filter((cluster) => cluster.role === 0);
assert(dominantClusters.every((dominant) => secondaryClusters.some((secondary) => secondary.macroIndex === dominant.macroIndex && Math.hypot(
  secondary.worldX - dominant.worldX,
  secondary.worldY - dominant.worldY
) < dominant.halfWidth)), 'secondary masses should merge deeply into a nearby dominant mass rather than forming an even necklace');
assert(bridgeClusters.every((bridge) => bridge.halfHeight < bridge.halfWidth * 0.8), 'bridge instances should remain low connected combustion instead of another full fireball');
assert(averageArea(dominantClusters) > averageArea(secondaryClusters) * 1.8, 'the three dominant masses should own the macro silhouette');

const repeated = createLiquidInfernoComposition(wall);
deepEqual(repeated.clusters, first.clusters, 'the same wall seed should reproduce identical cached placement and variation');
equal(repeated.signature, first.signature, 'stable geometry inputs should retain one composition signature');
equal(compositionSignature({ ...wall, age: 8.2, lightScale: 0.4 }), first.signature, 'age and lifecycle opacity must not invalidate static instance buffers');

const clusterReference = first.clusters;
syncLiquidInfernoComposition(first, { ...wall, age: 6.4, lightScale: 0.58 });
equal(first.clusters, clusterReference, 'runtime animation must retain the static cluster instance array');
equal(first.age, 6.4, 'runtime sync should update only bounded animation age');
equal(first.lifeScale, 0.58, 'runtime sync should update lifecycle opacity without rebuilding placement');

const stats = createInfernoGeometryStats();
recordInfernoComposition(stats, first, { built: true });
equal(stats.compositionBuildCount, 1, 'first encounter should record one composition build');
recordInfernoComposition(stats, first, { built: false });
equal(stats.compositionReuseCount, 1, 'subsequent frames should record retained composition reuse');
equal(stats.continuousFlameSheetCount, 0, 'inferno should explicitly report no full-length flame sheet');
equal(stats.triangleCount, 0, 'rolling clusters should not reintroduce fitted polygon flame sections');
equal(stats.radialCount, 0, 'cluster visuals should not rebuild the generic radial list every frame');

equal(MAMA_WYVERN_WORLD_EVENT.fire.damagePerTick, 7, 'visual refinement must preserve authored inferno damage');
equal(MAMA_WYVERN_WORLD_EVENT.fire.slowMultiplierStart, 0.48, 'visual refinement must preserve authored opening slow');
equal(MAMA_WYVERN_WORLD_EVENT.fire.lifetimeSeconds, 18, 'visual refinement must preserve authored wall duration');
equal(MAMA_WYVERN_WORLD_EVENT.fire.lightNodeCount, 8, 'visual refinement must preserve the accepted light count');
equal(MAMA_WYVERN_WORLD_EVENT.fire.smokeNodeCount, 7, 'visual refinement must preserve the accepted smoke-source count');

function averageArea(clusters) {
  return clusters.reduce((sum, cluster) => sum + cluster.halfWidth * cluster.halfHeight * 4, 0) / Math.max(1, clusters.length);
}
