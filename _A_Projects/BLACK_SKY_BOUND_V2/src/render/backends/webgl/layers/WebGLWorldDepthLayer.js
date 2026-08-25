import { buildWebGLActorDepthItems } from './WebGLActorLayer.js';
import { buildWebGLSceneryDepthItems, WEBGL_SCENERY_MODE } from './WebGLSceneryLayer.js';
import { WEBGL_LIGHT_SPACE_GATE_MODE, lightSpaceAlphaForWorldCircle, lightSpaceGateActive } from '../WebGLLightSpaceGate.js';
import { WEBGL_PLAYER_WYVERN_MODE } from '../WebGLWyvernSilhouette.js';
import { WEBGL_RAIDER_HUMANOID_MODE } from '../WebGLHumanoidSilhouette.js';
import { WEBGL_PREDATOR_MODE } from '../WebGLPredatorSilhouette.js';
import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { appendLayeredFlame } from '../WebGLFlameGeometry.js';
import { WEBGL_ACTOR_LIGHT_READABILITY_MODE } from '../WebGLActorLightReadability.js';
import { buildWebGLOpeningEggDepthItems, WEBGL_OPENING_EGG_MODE } from '../WebGLOpeningEggGeometry.js';

export const WEBGL_WORLD_DEPTH_MODE = 'y_sorted_world_depth_v0';

export class WebGLWorldDepthLayer {
  constructor() {
    this.id = 'worldDepth';
    this.mode = WEBGL_WORLD_DEPTH_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.items = [];
    this.scenerySourceCount = 0;
    this.actorSourceCount = 0;
    this.unitSpawnerFixtureSourceCount = 0;
    this.groundPropSourceCount = 0;
    this.openingEggSourceCount = 0;
    this.sceneryPrimitiveCount = 0;
    this.actorPrimitiveCount = 0;
    this.unitSpawnerFixturePrimitiveCount = 0;
    this.groundPropPrimitiveCount = 0;
    this.openingEggPrimitiveCount = 0;
    this.openingEggShellPieceCount = 0;
    this.sceneObjectPresenceVisibleCount = 0;
    this.sceneObjectLitDetailVisibleCount = 0;
    this.sceneObjectVisibilityHeldCount = 0;
    this.sceneObjectVisibilityFadingCount = 0;
    this.foliageFireActiveCount = 0;
    this.foliageFireBurntOutCount = 0;
    this.proceduralTreeCount = 0;
    this.proceduralTreeSplineCount = 0;
    this.proceduralTreeFoliageClusterCount = 0;
    this.proceduralUndergrowthCount = 0;
    this.proceduralUndergrowthSplineCount = 0;
    this.proceduralUndergrowthLeafClusterCount = 0;
    this.proceduralUndergrowthEmberNodeCount = 0;
    this.proceduralGeologyCount = 0;
    this.proceduralGeologyHullPointCount = 0;
    this.proceduralGeologyFacetCount = 0;
    this.proceduralGeologyStrataSegmentCount = 0;
    this.proceduralGeologyCrackSegmentCount = 0;
    this.proceduralGeologyMossPatchCount = 0;
    this.lightSpaceCulledCount = 0;
    this.lightSpaceGateActive = false;
    this.playerWyvernSilhouetteActive = false;
    this.playerWyvernPartCount = 0;
    this.raiderHumanoidSilhouetteActive = false;
    this.raiderHumanoidPartCount = 0;
    this.raiderHumanoidTorchSocketCount = 0;
    this.raiderHumanoidSpearSocketCount = 0;
    this.predatorSilhouetteActive = false;
    this.predatorPartCount = 0;
    this.droppedTorchCount = 0;
    this.actorLightReadabilityCount = 0;
    this.actorLightInfluenceCount = 0;
    this.actorRimPrimitiveCount = 0;
    this.actorCatchlightPrimitiveCount = 0;
    this.actorContactShadowPrimitiveCount = 0;
    this.actorCoreOcclusionPrimitiveCount = 0;
    this.actorShadowLodCount = 0;
    this.actorShadowLodPrimitiveCount = 0;
  }

  update(projection, context) {
    const scenery = buildWebGLSceneryDepthItems(projection, context);
    const actors = buildWebGLActorDepthItems(projection, context);
    const unitSpawnerFixtures = buildWebGLUnitSpawnerFixtureDepthItems(projection, context);
    const droppedTorches = buildWebGLDroppedTorchDepthItems(projection, context);
    const openingEgg = buildWebGLOpeningEggDepthItems(projection, context);
    this.items = [...scenery.items, ...openingEgg.items, ...actors.items, ...unitSpawnerFixtures.items, ...droppedTorches.items].sort(compareDepthItems);
    this.scenerySourceCount = scenery.sourceCount;
    this.actorSourceCount = actors.objectCount;
    this.unitSpawnerFixtureSourceCount = unitSpawnerFixtures.sourceCount;
    this.groundPropSourceCount = droppedTorches.sourceCount;
    this.openingEggSourceCount = openingEgg.sourceCount;
    this.objectCount = this.scenerySourceCount + this.actorSourceCount + this.unitSpawnerFixtureSourceCount + this.groundPropSourceCount + this.openingEggSourceCount;
    this.sceneryPrimitiveCount = countPrimitives(scenery.items);
    this.actorPrimitiveCount = countPrimitives(actors.items);
    this.unitSpawnerFixturePrimitiveCount = countPrimitives(unitSpawnerFixtures.items);
    this.groundPropPrimitiveCount = countPrimitives(droppedTorches.items);
    this.openingEggPrimitiveCount = openingEgg.primitiveCount;
    this.openingEggShellPieceCount = openingEgg.shellPieceCount;
    this.sceneObjectPresenceVisibleCount = scenery.presenceVisibleCount;
    this.sceneObjectLitDetailVisibleCount = scenery.litDetailVisibleCount;
    this.sceneObjectVisibilityHeldCount = scenery.visibilityHeldCount;
    this.sceneObjectVisibilityFadingCount = scenery.visibilityFadingCount;
    this.foliageFireActiveCount = scenery.foliageFireActiveCount;
    this.foliageFireBurntOutCount = scenery.foliageFireBurntOutCount;
    this.proceduralTreeCount = scenery.proceduralTreeCount;
    this.proceduralTreeSplineCount = scenery.proceduralTreeSplineCount;
    this.proceduralTreeFoliageClusterCount = scenery.proceduralTreeFoliageClusterCount;
    this.proceduralUndergrowthCount = scenery.proceduralUndergrowthCount;
    this.proceduralUndergrowthSplineCount = scenery.proceduralUndergrowthSplineCount;
    this.proceduralUndergrowthLeafClusterCount = scenery.proceduralUndergrowthLeafClusterCount;
    this.proceduralUndergrowthEmberNodeCount = scenery.proceduralUndergrowthEmberNodeCount;
    this.proceduralGeologyCount = scenery.proceduralGeologyCount;
    this.proceduralGeologyHullPointCount = scenery.proceduralGeologyHullPointCount;
    this.proceduralGeologyFacetCount = scenery.proceduralGeologyFacetCount;
    this.proceduralGeologyStrataSegmentCount = scenery.proceduralGeologyStrataSegmentCount;
    this.proceduralGeologyCrackSegmentCount = scenery.proceduralGeologyCrackSegmentCount;
    this.proceduralGeologyMossPatchCount = scenery.proceduralGeologyMossPatchCount;
    this.lightSpaceCulledCount = scenery.lightSpaceCulledCount + actors.lightSpaceCulledCount + unitSpawnerFixtures.lightSpaceCulledCount + droppedTorches.lightSpaceCulledCount;
    this.lightSpaceGateActive = scenery.lightSpaceGateActive || actors.lightSpaceGateActive || unitSpawnerFixtures.lightSpaceGateActive || droppedTorches.lightSpaceGateActive;
    this.playerWyvernSilhouetteActive = actors.playerWyvernSilhouetteActive;
    this.playerWyvernPartCount = actors.playerWyvernPartCount;
    this.raiderHumanoidSilhouetteActive = actors.raiderHumanoidSilhouetteActive;
    this.raiderHumanoidPartCount = actors.raiderHumanoidPartCount;
    this.raiderHumanoidTorchSocketCount = actors.raiderHumanoidTorchSocketCount;
    this.raiderHumanoidSpearSocketCount = actors.raiderHumanoidSpearSocketCount;
    this.predatorSilhouetteActive = actors.predatorSilhouetteActive;
    this.predatorPartCount = actors.predatorPartCount;
    this.droppedTorchCount = droppedTorches.sourceCount;
    this.actorLightReadabilityCount = actors.actorLightReadabilityCount;
    this.actorLightInfluenceCount = actors.actorLightInfluenceCount;
    this.actorRimPrimitiveCount = actors.actorRimPrimitiveCount;
    this.actorCatchlightPrimitiveCount = actors.actorCatchlightPrimitiveCount;
    this.actorContactShadowPrimitiveCount = actors.actorContactShadowPrimitiveCount;
    this.actorCoreOcclusionPrimitiveCount = actors.actorCoreOcclusionPrimitiveCount;
    this.actorShadowLodCount = actors.actorShadowLodCount;
    this.actorShadowLodPrimitiveCount = actors.actorShadowLodPrimitiveCount;
    this.status = this.items.length ? 'active' : 'inactive';
  }

  render(context) {
    for (const item of this.items) {
      if (item.triangles.length) context.scene.drawTriangles(item.triangles, context.camera);
      if (item.rects.length) context.scene.drawRects(item.rects, context.camera);
    }
  }

  statsFields() {
    return {
      mode: this.mode,
      worldDepthMode: WEBGL_WORLD_DEPTH_MODE,
      sceneryMode: WEBGL_SCENERY_MODE,
      actorMode: WEBGL_PLAYER_WYVERN_MODE,
      raiderHumanoidMode: WEBGL_RAIDER_HUMANOID_MODE,
      predatorMode: WEBGL_PREDATOR_MODE,
      depthSortedItemCount: this.items.length,
      sourceCount: this.objectCount,
      scenerySourceCount: this.scenerySourceCount,
      actorSourceCount: this.actorSourceCount,
      unitSpawnerFixtureSourceCount: this.unitSpawnerFixtureSourceCount,
      groundPropSourceCount: this.groundPropSourceCount,
      openingEggMode: WEBGL_OPENING_EGG_MODE,
      openingEggSourceCount: this.openingEggSourceCount,
      openingEggShellPieceCount: this.openingEggShellPieceCount,
      primitiveCount: this.sceneryPrimitiveCount + this.actorPrimitiveCount + this.unitSpawnerFixturePrimitiveCount + this.groundPropPrimitiveCount + this.openingEggPrimitiveCount,
      sceneryPrimitiveCount: this.sceneryPrimitiveCount,
      actorPrimitiveCount: this.actorPrimitiveCount,
      unitSpawnerFixturePrimitiveCount: this.unitSpawnerFixturePrimitiveCount,
      groundPropPrimitiveCount: this.groundPropPrimitiveCount,
      openingEggPrimitiveCount: this.openingEggPrimitiveCount,
      sceneObjectPresenceVisibleCount: this.sceneObjectPresenceVisibleCount,
      sceneObjectLitDetailVisibleCount: this.sceneObjectLitDetailVisibleCount,
      sceneObjectVisibilityHeldCount: this.sceneObjectVisibilityHeldCount,
      sceneObjectVisibilityFadingCount: this.sceneObjectVisibilityFadingCount,
      foliageFireActiveCount: this.foliageFireActiveCount,
      foliageFireBurntOutCount: this.foliageFireBurntOutCount,
      proceduralTreeCount: this.proceduralTreeCount,
      proceduralTreeSplineCount: this.proceduralTreeSplineCount,
      proceduralTreeFoliageClusterCount: this.proceduralTreeFoliageClusterCount,
      proceduralUndergrowthCount: this.proceduralUndergrowthCount,
      proceduralUndergrowthSplineCount: this.proceduralUndergrowthSplineCount,
      proceduralUndergrowthLeafClusterCount: this.proceduralUndergrowthLeafClusterCount,
      proceduralUndergrowthEmberNodeCount: this.proceduralUndergrowthEmberNodeCount,
      proceduralGeologyCount: this.proceduralGeologyCount,
      proceduralGeologyHullPointCount: this.proceduralGeologyHullPointCount,
      proceduralGeologyFacetCount: this.proceduralGeologyFacetCount,
      proceduralGeologyStrataSegmentCount: this.proceduralGeologyStrataSegmentCount,
      proceduralGeologyCrackSegmentCount: this.proceduralGeologyCrackSegmentCount,
      proceduralGeologyMossPatchCount: this.proceduralGeologyMossPatchCount,
      playerWyvernSilhouetteActive: this.playerWyvernSilhouetteActive,
      playerWyvernPartCount: this.playerWyvernPartCount,
      raiderHumanoidSilhouetteActive: this.raiderHumanoidSilhouetteActive,
      raiderHumanoidPartCount: this.raiderHumanoidPartCount,
      raiderHumanoidTorchSocketCount: this.raiderHumanoidTorchSocketCount,
      raiderHumanoidSpearSocketCount: this.raiderHumanoidSpearSocketCount,
      predatorSilhouetteActive: this.predatorSilhouetteActive,
      predatorPartCount: this.predatorPartCount,
      droppedTorchCount: this.droppedTorchCount,
      actorLightReadabilityMode: WEBGL_ACTOR_LIGHT_READABILITY_MODE,
      actorLightReadabilityCount: this.actorLightReadabilityCount,
      actorLightInfluenceCount: this.actorLightInfluenceCount,
      actorRimPrimitiveCount: this.actorRimPrimitiveCount,
      actorCatchlightPrimitiveCount: this.actorCatchlightPrimitiveCount,
      actorContactShadowPrimitiveCount: this.actorContactShadowPrimitiveCount,
      actorCoreOcclusionPrimitiveCount: this.actorCoreOcclusionPrimitiveCount,
      actorShadowLodCount: this.actorShadowLodCount,
      actorShadowLodPrimitiveCount: this.actorShadowLodPrimitiveCount,
      lightSpaceMode: WEBGL_LIGHT_SPACE_GATE_MODE,
      lightSpaceCullingActive: this.lightSpaceGateActive,
      lightSpaceCulledCount: this.lightSpaceCulledCount
    };
  }
}

function buildWebGLUnitSpawnerFixtureDepthItems(projection, context) {
  const bounds = context.camera.visibleWorldBounds(96);
  const result = {
    items: [],
    sourceCount: projection.unitSpawnerFixtures?.length ?? 0,
    lightSpaceCulledCount: 0,
    lightSpaceGateActive: lightSpaceGateActive(context)
  };
  for (const fixture of projection.unitSpawnerFixtures ?? []) {
    const lightSpaceAlpha = lightSpaceAlphaForWorldCircle(context, fixture.worldX ?? 0, fixture.worldY ?? 0, fixture.worldRadius ?? 6);
    if (lightSpaceAlpha <= 0.015) result.lightSpaceCulledCount += 1;
    const item = buildUnitSpawnerFixtureDepthItem(fixture, bounds, lightSpaceAlpha);
    if (item) result.items.push(item);
  }
  return result;
}

function buildUnitSpawnerFixtureDepthItem(fixture, bounds, lightSpaceAlpha) {
  const worldX = fixture.worldX ?? 0;
  const worldY = fixture.worldY ?? 0;
  const worldRadius = fixture.worldRadius ?? 6;
  if (worldX + worldRadius < bounds.left || worldY + worldRadius < bounds.top
    || worldX - worldRadius > bounds.right || worldY - worldRadius > bounds.bottom) return null;
  const item = {
    id: fixture.id,
    source: 'unit_spawner_fixture',
    depthY: fixture.depthY ?? worldY,
    sortBias: -0.05,
    rects: [],
    triangles: []
  };
  appendUnitSpawnerFixtureGeometry(fixture, item.rects, item.triangles, Math.max(0.16, lightSpaceAlpha));
  return item;
}

function appendUnitSpawnerFixtureGeometry(fixture, rects, triangles, lightAlpha = 1) {
  const cx = fixture.worldX ?? 0;
  const cy = fixture.worldY ?? 0;
  const r = Math.max(4.5, fixture.worldRadius ?? 7);
  const alive = fixture.alive !== false && fixture.destroyed !== true;
  const healthRatio = Math.max(0, Math.min(1, fixture.healthRatio ?? 1));
  const alpha = (alive ? 0.74 : 0.38) * lightAlpha;
  const shadow = parseWebGLColor('rgba(0,0,0,1)', [0, 0, 0, 1]);
  const outer = parseWebGLColor(alive ? '#2a1834' : '#17151a', [0.16, 0.09, 0.2, 1]);
  const body = parseWebGLColor(alive ? '#6f4a8e' : '#3a3340', [0.43, 0.29, 0.56, 1]);
  const rim = parseWebGLColor(alive ? '#b18ad6' : '#6b6172', [0.7, 0.54, 0.84, 1]);
  const wound = parseWebGLColor('#d45d4d', [0.83, 0.36, 0.3, 1]);

  rects.push({
    x: cx - r * 1.06,
    y: cy + r * 0.42,
    w: r * 2.12,
    h: Math.max(2, r * 0.34),
    color: withAlpha(shadow, 0.18 * alpha)
  });
  addDiamond(triangles, cx, cy - r * 0.34, r * 0.58, r * 0.92, outer, alpha * 0.98);
  addDiamond(triangles, cx, cy - r * 0.42, r * 0.34, r * 0.58, body, alpha);
  addSegment(triangles, { worldX: cx - r * 0.78, worldY: cy + r * 0.32 }, { worldX: cx, worldY: cy - r * 0.02 }, r * 0.2, withAlpha(outer, alpha * 0.78), 1);
  addSegment(triangles, { worldX: cx + r * 0.78, worldY: cy + r * 0.32 }, { worldX: cx, worldY: cy - r * 0.02 }, r * 0.2, withAlpha(outer, alpha * 0.78), 1);
  rects.push({
    x: cx - r * 0.42,
    y: cy + r * 0.48,
    w: r * 0.84,
    h: Math.max(2, r * 0.16),
    color: withAlpha(rim, alpha * 0.42)
  });
  rects.push({
    x: cx - r * 0.42,
    y: cy + r * 0.48,
    w: r * 0.84 * healthRatio,
    h: Math.max(2, r * 0.16),
    color: withAlpha(healthRatio < 0.35 ? wound : rim, alpha * 0.72)
  });
}

function addDiamond(triangles, cx, cy, rx, ry, color, alpha) {
  const tint = withAlpha(color, alpha);
  pushTri(triangles, cx, cy - ry, cx + rx, cy, cx, cy + ry, tint);
  pushTri(triangles, cx, cy - ry, cx, cy + ry, cx - rx, cy, tint);
}

function compareDepthItems(a, b) {
  const depth = a.depthY - b.depthY;
  if (Math.abs(depth) > 0.001) return depth;
  return (a.sortBias ?? 0) - (b.sortBias ?? 0);
}

function countPrimitives(items) {
  return items.reduce((sum, item) => sum + item.rects.length + item.triangles.length, 0);
}

function buildWebGLDroppedTorchDepthItems(projection, context) {
  const bounds = context.camera.visibleWorldBounds(96);
  const result = {
    items: [],
    sourceCount: projection.droppedTorches?.length ?? 0,
    lightSpaceCulledCount: 0,
    lightSpaceGateActive: lightSpaceGateActive(context)
  };
  for (const torch of projection.droppedTorches ?? []) {
    const lightSpaceAlpha = lightSpaceAlphaForWorldCircle(context, torch.worldX ?? 0, torch.worldY ?? 0, torch.worldRadius ?? 6);
    if (lightSpaceAlpha <= 0.015) {
      result.lightSpaceCulledCount += 1;
      continue;
    }
    const item = buildDroppedTorchDepthItem(torch, bounds, lightSpaceAlpha);
    if (!item) continue;
    result.items.push(item);
  }
  return result;
}

function buildDroppedTorchDepthItem(torch, bounds, lightSpaceAlpha) {
  const worldX = torch.worldX ?? 0;
  const worldY = torch.worldY ?? 0;
  const worldRadius = torch.worldRadius ?? 6;
  if (worldX + worldRadius < bounds.left || worldY + worldRadius < bounds.top
    || worldX - worldRadius > bounds.right || worldY - worldRadius > bounds.bottom) return null;
  const item = {
    id: torch.id,
    source: 'ground_prop',
    depthY: torch.depthY ?? torch.worldY ?? 0,
    sortBias: -0.15,
    rects: [],
    triangles: []
  };
  appendDroppedTorchGeometry(torch, item.rects, item.triangles, lightSpaceAlpha);
  return item;
}

function appendDroppedTorchGeometry(torch, rects, triangles, alpha = 1) {
  const palette = torch.palette ?? {};
  const render = torch.render ?? {};
  const outline = withAlpha(parseWebGLColor(palette.outline, [0.08, 0.05, 0.04, 1]), Math.max(0.24, render.charAlpha ?? 0.46) * alpha);
  const shaft = withAlpha(parseWebGLColor(palette.torch, [0.42, 0.24, 0.12, 1]), (render.shaftAlpha ?? 0.82) * alpha);
  const char = withAlpha(parseWebGLColor('#2a1a12', [0.16, 0.1, 0.08, 1]), (render.charAlpha ?? 0.62) * alpha);
  const flame = parseWebGLColor(palette.flame, [1, 0.48, 0.12, 0.92]);
  const flameCore = parseWebGLColor(palette.flameCore, [1, 0.86, 0.48, 0.96]);
  const shadowAlpha = 0.12 + Math.max(0, render.shaftAlpha ?? 0.4) * 0.08;
  const grip = { worldX: torch.gripWorldX, worldY: torch.gripWorldY };
  const tip = { worldX: torch.tipWorldX, worldY: torch.tipWorldY };
  const flamePoint = { worldX: torch.flameWorldX, worldY: torch.flameWorldY };
  const previousFlamePoint = { worldX: torch.previousFlameWorldX, worldY: torch.previousFlameWorldY };
  const width = Math.max(2.2, torch.worldWidth ?? 2.2);
  addSegment(triangles, grip, tip, width * 1.8, outline, 1);
  addSegment(triangles, grip, tip, width, shaft, 1);
  addSegment(triangles, tip, flamePoint, Math.max(2, width * 0.92), char, 1);

  const midX = (grip.worldX + tip.worldX) * 0.5;
  const midY = (grip.worldY + tip.worldY) * 0.5;
  const shadowLength = Math.max(8, torch.worldLength ?? 12);
  const shadowWidth = Math.max(4, width * 2.2);
  rects.push({
    x: midX - shadowLength * 0.42,
    y: midY + shadowWidth * 0.24,
    w: shadowLength * 0.84,
    h: shadowWidth * 0.42,
    color: parseWebGLColor('rgba(0,0,0,1)', [0, 0, 0, shadowAlpha * alpha])
  });

  if ((render.flameAlpha ?? 0) > 0.01) {
    if (torch.flameTrailActive && isPoint(previousFlamePoint)) {
      addSegment(triangles, previousFlamePoint, flamePoint, Math.max(2.2, (torch.flameWorldRadius ?? 4.2) * 0.54), withAlpha(flame, (render.flameAlpha ?? 0) * alpha * 0.18), 1);
    }
    appendLayeredFlame(triangles, {
      x: flamePoint.worldX,
      y: flamePoint.worldY,
      radius: Math.max(2.4, (torch.flameWorldRadius ?? 4.2) * 0.62),
      outerColor: flame,
      innerColor: flameCore,
      alpha: (render.flameAlpha ?? 0) * alpha,
      seed: (torch.drop01 ?? 0) * 3.7 + flamePoint.worldX * 0.013,
      lean: torch.flameTrailActive ? -0.18 : 0
    });
  }
}

function addSegment(triangles, a, b, width, color, widthScale = 1) {
  if (!isPoint(a) || !isPoint(b)) return;
  const dx = b.worldX - a.worldX;
  const dy = b.worldY - a.worldY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len * width * widthScale * 0.5;
  const ny = dx / len * width * widthScale * 0.5;
  pushTri(triangles, a.worldX + nx, a.worldY + ny, b.worldX + nx, b.worldY + ny, b.worldX - nx, b.worldY - ny, color);
  pushTri(triangles, a.worldX + nx, a.worldY + ny, b.worldX - nx, b.worldY - ny, a.worldX - nx, a.worldY - ny, color);
}

function pushTri(triangles, x1, y1, x2, y2, x3, y3, color) {
  triangles.push({ ax: x1, ay: y1, bx: x2, by: y2, cx: x3, cy: y3, color });
}

function isPoint(point) {
  return Number.isFinite(point?.worldX) && Number.isFinite(point?.worldY);
}
