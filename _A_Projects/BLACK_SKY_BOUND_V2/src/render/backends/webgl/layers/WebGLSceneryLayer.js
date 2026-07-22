import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { WEBGL_LIGHT_SPACE_GATE_MODE, lightSpaceAlphaForWorldCircle, lightSpaceGateActive } from '../WebGLLightSpaceGate.js';
import { adaptMaterialToWebGL } from '../WebGLMaterialAdapter.js';
import { appendLayeredFlame } from '../WebGLFlameGeometry.js';
import {
  appendSceneObjectPresenceGeometry,
  resolveSceneObjectVisibility,
  stableSeed,
  WEBGL_SCENE_OBJECT_VISIBILITY_MODE
} from '../WebGLSceneObjectVisibility.js';
import { accumulateProceduralTreeStats, buildTreeGeometry, proceduralTreeStats } from '../scenery/treeGeometry.js';
import {
  accumulateProceduralUndergrowthStats,
  buildUndergrowthGeometry,
  proceduralUndergrowthStats
} from '../scenery/undergrowthGeometry.js';
import {
  accumulateProceduralGeologyStats,
  buildGeologyGeometry,
  proceduralGeologyStats
} from '../scenery/geologyGeometry.js';

export const WEBGL_SCENERY_MODE = 'meter_scaled_scene_objects_v0';

export class WebGLSceneryLayer {
  constructor() {
    this.id = 'scenery';
    this.mode = WEBGL_SCENERY_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.sourceCount = 0;
    this.primitiveCount = 0;
    this.lightSpaceCulledCount = 0;
    this.lightSpaceGateActive = false;
    this.presenceVisibleCount = 0;
    this.litDetailVisibleCount = 0;
    this.visibilityHeldCount = 0;
    this.visibilityFadingCount = 0;
    Object.assign(this, proceduralTreeStats());
    Object.assign(this, proceduralUndergrowthStats());
    Object.assign(this, proceduralGeologyStats());
    this.rects = [];
    this.triangles = [];
  }

  update(projection, context) {
    const built = buildWebGLSceneryDepthItems(projection, context);
    this.rects = built.items.flatMap((item) => item.rects);
    this.triangles = built.items.flatMap((item) => item.triangles);
    this.lightSpaceCulledCount = built.lightSpaceCulledCount;
    this.lightSpaceGateActive = built.lightSpaceGateActive;
    this.presenceVisibleCount = built.presenceVisibleCount;
    this.litDetailVisibleCount = built.litDetailVisibleCount;
    this.visibilityHeldCount = built.visibilityHeldCount;
    this.visibilityFadingCount = built.visibilityFadingCount;
    Object.assign(this, proceduralTreeStats(built));
    Object.assign(this, proceduralUndergrowthStats(built));
    Object.assign(this, proceduralGeologyStats(built));
    this.sourceCount = built.sourceCount;
    this.objectCount = built.sourceCount;
    this.primitiveCount = this.rects.length + this.triangles.length;
    this.status = this.primitiveCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (this.triangles.length) context.scene.drawTriangles(this.triangles, context.camera);
    if (this.rects.length) context.scene.drawRects(this.rects, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      sceneryMode: WEBGL_SCENERY_MODE,
      sourceCount: this.sourceCount,
      primitiveCount: this.primitiveCount,
      rectCount: this.rects.length,
      triangleCount: this.triangles.length,
      lightSpaceMode: WEBGL_LIGHT_SPACE_GATE_MODE,
      lightSpaceCullingActive: this.lightSpaceGateActive,
      lightSpaceCulledCount: this.lightSpaceCulledCount,
      sceneObjectVisibilityMode: WEBGL_SCENE_OBJECT_VISIBILITY_MODE,
      sceneObjectPresenceVisibleCount: this.presenceVisibleCount,
      sceneObjectLitDetailVisibleCount: this.litDetailVisibleCount,
      sceneObjectVisibilityHeldCount: this.visibilityHeldCount,
      sceneObjectVisibilityFadingCount: this.visibilityFadingCount,
      ...proceduralTreeStats(this),
      ...proceduralUndergrowthStats(this),
      ...proceduralGeologyStats(this)
    };
  }
}

export function buildWebGLSceneryDepthItems(projection, context) {
  const bounds = context.camera.visibleWorldBounds(96);
  const result = {
    items: [],
    sourceCount: projection.scenery?.length ?? 0,
    lightSpaceCulledCount: 0,
    lightSpaceGateActive: lightSpaceGateActive(context),
    presenceVisibleCount: 0,
    litDetailVisibleCount: 0,
    visibilityHeldCount: 0,
    visibilityFadingCount: 0,
    treeFireActiveCount: 0,
    treeFireBurntOutCount: 0,
    ...proceduralTreeStats(),
    ...proceduralUndergrowthStats(),
    ...proceduralGeologyStats()
  };
  for (const object of projection.scenery ?? []) {
    const firePhase = object.material?.state?.firePhase;
    if (firePhase === 'burnt_out') result.treeFireBurntOutCount += 1;
    else if (firePhase) result.treeFireActiveCount += 1;
    if (object.worldTileX + object.worldWidth < bounds.left || object.worldTileY + object.worldHeight < bounds.top
      || object.worldTileX > bounds.right || object.worldTileY > bounds.bottom) continue;
    const lightSpaceInfluence = lightSpaceAlphaForWorldCircle(context, object.worldX, object.worldY, object.worldRadius);
    const visibility = resolveSceneObjectVisibility(context, object, lightSpaceInfluence);
    if (!visibility.presenceVisible) {
      result.lightSpaceCulledCount += 1;
      continue;
    }
    result.presenceVisibleCount += 1;
    if (visibility.litDetailVisible) result.litDetailVisibleCount += 1;
    if (visibility.held) result.visibilityHeldCount += 1;
    if (visibility.fading) result.visibilityFadingCount += 1;
    const item = {
      id: object.id,
      source: 'scenery',
      depthY: object.anchorWorldY ?? object.worldTileY + object.worldHeight,
      sortBias: object.render?.sortBias ?? 0,
      rects: [],
      triangles: []
    };
    const renderKind = object.render?.kind ?? object.type;
    if (!visibility.litDetailVisible) appendSceneObjectPresenceGeometry(object, visibility.alpha, item.rects, item.triangles);
    else if (renderKind === 'procedural_geology') {
      const geologyGeometry = buildGeologyGeometry(object, visibility.alpha, item.rects, item.triangles);
      item.proceduralGeology = geologyGeometry;
      accumulateProceduralGeologyStats(result, geologyGeometry);
    }
    else if (renderKind === 'dead_snag') buildDeadSnag(object, visibility.alpha, item.rects, item.triangles);
    else if (renderKind === 'procedural_undergrowth') {
      const undergrowthGeometry = buildUndergrowthGeometry(object, visibility.alpha, item.rects, item.triangles);
      item.proceduralUndergrowth = undergrowthGeometry;
      accumulateProceduralUndergrowthStats(result, undergrowthGeometry);
    }
    else if (renderKind === 'fire_arrow') buildFireArrow(object, visibility.alpha, item.rects, item.triangles);
    else if (renderKind === 'fire_arrow_cluster') buildFireArrowCluster(object, visibility.alpha, item.rects, item.triangles);
    else if (renderKind === 'ground_decal') buildGroundDecal(object, visibility.alpha, item.rects, item.triangles);
    else {
      const treeGeometry = buildTreeGeometry(object, visibility.alpha, item.rects, item.triangles);
      item.proceduralTree = treeGeometry;
      accumulateProceduralTreeStats(result, treeGeometry);
    }
    result.items.push(item);
  }
  return result;
}

function buildDeadSnag(object, alpha, rects, triangles) {
  const r = object.render ?? {};
  const material = adaptMaterialToWebGL(object.material, parseWebGLColor(r.trunkColour, [0.28, 0.2, 0.15, 1]));
  const x = object.worldTileX;
  const y = object.worldTileY;
  const w = object.worldWidth;
  const h = object.worldHeight;
  const cx = object.anchorWorldX ?? x + w * 0.5;
  const baseY = object.anchorWorldY ?? y + h * 0.92;
  const trunkW = Math.max(7, (object.collisionWorldWidth ?? w * 0.34) * 0.42);
  rects.push({
    x: cx - trunkW * 1.5,
    y: baseY - trunkW * 0.16,
    w: trunkW * 3,
    h: trunkW * 0.28,
    color: parseWebGLColor(r.baseShadow, [0, 0, 0, 0.24 * alpha])
  });
  addMaterialTriangle(triangles, cx - trunkW * 0.45, baseY, cx, y + h * 0.06, cx + trunkW * 0.46, baseY, material.baseColor, alpha * 0.96);
  addMaterialTriangle(triangles, cx - trunkW * 0.45, baseY, cx - trunkW * 0.08, y + h * 0.08, cx - trunkW * 0.08, baseY, material.shadowColor, alpha * 0.72);
  addMaterialTriangle(triangles, cx, y + h * 0.2, x + w * 0.08, y + h * 0.36, cx - trunkW * 0.04, y + h * 0.32, material.shadowColor, alpha * 0.72);
  addMaterialTriangle(triangles, cx + trunkW * 0.06, y + h * 0.28, x + w * 0.9, y + h * 0.48, cx + trunkW * 0.08, y + h * 0.42, material.highlightColor, alpha * 0.66);
  addMaterialTriangle(triangles, cx - trunkW * 0.12, y + h * 0.5, x + w * 0.24, y + h * 0.7, cx - trunkW * 0.18, y + h * 0.62, material.baseColor, alpha * 0.58);
}

function buildGroundDecal(object, alpha, rects, triangles) {
  const r = object.render ?? {};
  const material = adaptMaterialToWebGL(object.material, parseWebGLColor(r.bodyColour, [0.28, 0.22, 0.15, 0.74]));
  const x = object.worldTileX;
  const y = object.worldTileY;
  const w = object.worldWidth;
  const h = object.worldHeight;
  const variant = r.decalProfile ?? 'leaf_litter';
  rects.push({
    x: x + w * 0.12,
    y: y + h * 0.34,
    w: w * 0.76,
    h: h * 0.34,
    color: withAlpha(material.baseColor, 0.48 * alpha)
  });
  if (variant === 'root_mat') {
    addMaterialTriangle(triangles, x + w * 0.08, y + h * 0.58, x + w * 0.78, y + h * 0.42, x + w * 0.92, y + h * 0.5, material.shadowColor, alpha * 0.5);
    addMaterialTriangle(triangles, x + w * 0.18, y + h * 0.38, x + w * 0.48, y + h * 0.5, x + w * 0.86, y + h * 0.28, material.highlightColor, alpha * 0.42);
    rects.push({
      x: x + w * 0.2,
      y: y + h * 0.52,
      w: w * 0.62,
      h: Math.max(2, h * 0.08),
      color: withAlpha(material.shadowColor, 0.42 * alpha)
    });
    return;
  }
  addMaterialTriangle(triangles, x + w * 0.16, y + h * 0.6, x + w * 0.34, y + h * 0.28, x + w * 0.46, y + h * 0.66, material.highlightColor, alpha * 0.42);
  addMaterialTriangle(triangles, x + w * 0.44, y + h * 0.58, x + w * 0.62, y + h * 0.24, x + w * 0.74, y + h * 0.62, material.baseColor, alpha * 0.52);
  addMaterialTriangle(triangles, x + w * 0.58, y + h * 0.7, x + w * 0.8, y + h * 0.38, x + w * 0.92, y + h * 0.7, material.shadowColor, alpha * 0.44);
}

function buildFireArrow(object, alpha, rects, triangles) {
  const r = object.render ?? {};
  const material = adaptMaterialToWebGL(object.material, parseWebGLColor(r.shaftColour, [0.36, 0.24, 0.14, 1]));
  const x = object.worldTileX;
  const y = object.worldTileY;
  const w = object.worldWidth;
  const h = object.worldHeight;
  const angle = Number(r.angle ?? 0);
  const shaftLength = Math.max(5.5, Math.max(w, h) * clampRange(r.shaftLengthScale, 0.35, 0.95, 0.84));
  const shaftWidth = Math.max(1.05, Math.min(w, h) * clampRange(r.shaftWidthScale, 0.04, 0.16, 0.12));
  const center = {
    x: (object.anchorWorldX ?? (x + w * 0.5)) + Math.sin(angle) * w * 0.08,
    y: (object.anchorWorldY ?? (y + h * 0.66)) - h * 0.06
  };
  const dir = { x: Math.sin(angle), y: -Math.cos(angle) };
  const side = { x: -dir.y, y: dir.x };
  const half = shaftLength * 0.5;
  const tip = { x: center.x + dir.x * half, y: center.y + dir.y * half };
  const tail = { x: center.x - dir.x * half, y: center.y - dir.y * half };

  rects.push({
    x: center.x - w * 0.22,
    y: center.y + h * 0.14,
    w: w * 0.44,
    h: Math.max(2, h * 0.12),
    color: parseWebGLColor(r.baseShadow, [0, 0, 0, 0.14 * alpha])
  });
  addQuad(triangles, tail, tip, shaftWidth, withAlpha(material.baseColor, 0.94 * alpha));
  addQuad(
    triangles,
    { x: tail.x + dir.x * shaftLength * 0.12, y: tail.y + dir.y * shaftLength * 0.12 },
    { x: tip.x - dir.x * shaftLength * 0.14, y: tip.y - dir.y * shaftLength * 0.14 },
    Math.max(1.4, shaftWidth * 0.42),
    withAlpha(material.highlightColor, 0.48 * alpha)
  );
  addTriangle(
    triangles,
    tip.x,
    tip.y,
    tip.x - dir.x * shaftWidth * 2.1 + side.x * shaftWidth * 0.9,
    tip.y - dir.y * shaftWidth * 2.1 + side.y * shaftWidth * 0.9,
    tip.x - dir.x * shaftWidth * 2.1 - side.x * shaftWidth * 0.9,
    tip.y - dir.y * shaftWidth * 2.1 - side.y * shaftWidth * 0.9,
    r.wrapColour ?? '#7d5a33',
    alpha * 0.86
  );
  addTriangle(
    triangles,
    tail.x,
    tail.y,
    tail.x - dir.x * shaftWidth * 1.4 + side.x * shaftWidth * 1.6,
    tail.y - dir.y * shaftWidth * 1.4 + side.y * shaftWidth * 1.6,
    tail.x - dir.x * shaftWidth * 0.7 + side.x * shaftWidth * 0.38,
    tail.y - dir.y * shaftWidth * 0.7 + side.y * shaftWidth * 0.38,
    r.fletchingColour ?? '#4e3427',
    alpha * 0.82
  );
  addTriangle(
    triangles,
    tail.x,
    tail.y,
    tail.x - dir.x * shaftWidth * 1.4 - side.x * shaftWidth * 1.6,
    tail.y - dir.y * shaftWidth * 1.4 - side.y * shaftWidth * 1.6,
    tail.x - dir.x * shaftWidth * 0.7 - side.x * shaftWidth * 0.38,
    tail.y - dir.y * shaftWidth * 0.7 - side.y * shaftWidth * 0.38,
    r.fletchingColour ?? '#4e3427',
    alpha * 0.82
  );
  const flame = {
    x: tip.x - dir.x * shaftWidth * 0.48,
    y: tip.y - dir.y * shaftWidth * 0.48
  };
  appendLayeredFlame(triangles, {
    x: flame.x,
    y: flame.y,
    radius: Math.max(1.2, shaftWidth * 0.82) * (r.flameScale ?? 1),
    outerColor: parseWebGLColor(r.emberColour, [1, 0.38, 0.08, 1]),
    innerColor: parseWebGLColor(r.emberCoreColour, [1, 0.78, 0.28, 1]),
    alpha,
    seed: stableSeed(object.id ?? object.type)
  });
}

function buildFireArrowCluster(object, alpha, rects, triangles) {
  const cx = object.anchorWorldX ?? object.worldX;
  const cy = object.anchorWorldY ?? object.worldY;
  const spread = clampRange(object.render?.clusterSpreadPx, 2, 7, 6);
  const variants = [
    { angle: -0.72, offsetX: -spread, offsetY: 0.8, scale: 0.9 },
    { angle: 0.08, offsetX: 0, offsetY: -0.8, scale: 1 },
    { angle: 0.76, offsetX: spread, offsetY: 1.2, scale: 0.86 }
  ];
  rects.push({
    x: cx - spread * 1.65,
    y: cy + spread * 0.26,
    w: spread * 3.3,
    h: Math.max(1.6, spread * 0.42),
    color: parseWebGLColor(object.render?.baseShadow, [0, 0, 0, 0.16 * alpha])
  });
  for (const variant of variants) {
    buildFireArrow(
      {
        ...object,
        anchorWorldX: cx + variant.offsetX,
        anchorWorldY: cy + variant.offsetY,
        render: {
          ...(object.render ?? {}),
          kind: 'fire_arrow',
          angle: variant.angle,
          flameScale: (object.render?.flameScale ?? 1) * variant.scale
        }
      },
      alpha,
      rects,
      triangles
    );
  }
}

function clampRange(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function addQuad(triangles, start, end, width, color) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const half = width * 0.5;
  const a = { x: start.x + nx * half, y: start.y + ny * half };
  const b = { x: end.x + nx * half, y: end.y + ny * half };
  const c = { x: end.x - nx * half, y: end.y - ny * half };
  const d = { x: start.x - nx * half, y: start.y - ny * half };
  triangles.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color });
  triangles.push({ ax: a.x, ay: a.y, bx: c.x, by: c.y, cx: d.x, cy: d.y, color });
}

function addTriangle(triangles, ax, ay, bx, by, cx, cy, colour, alpha) {
  triangles.push({
    ax,
    ay,
    bx,
    by,
    cx,
    cy,
    color: withAlpha(parseWebGLColor(colour, [0.25, 0.35, 0.24, 1]), alpha)
  });
}

function addMaterialTriangle(triangles, ax, ay, bx, by, cx, cy, color, alpha) {
  triangles.push({ ax, ay, bx, by, cx, cy, color: withAlpha(color, alpha) });
}
