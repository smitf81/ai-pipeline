import {
  WEBGL_MAMA_WYVERN_AERIAL_MODE,
  buildWebGLMamaWyvernAerialSilhouette
} from '../WebGLMamaWyvernSilhouette.js';
import { appendLayeredFlame } from '../WebGLFlameGeometry.js';
import {
  compositionSignature,
  createLiquidInfernoComposition,
  createInfernoGeometryStats,
  recordInfernoComposition,
  resetInfernoGeometryStats,
  syncLiquidInfernoComposition
} from '../WebGLInfernoGeometry.js';

export const WEBGL_WORLD_EVENT_MODE = 'directional_aerial_mama_cached_cluster_inferno_world_event_v4';

const SHADOW_CORE = Object.freeze([0.004, 0.006, 0.01, 0.82]);
const SHADOW_PENUMBRA = Object.freeze([0.01, 0.012, 0.018, 0.12]);
const FIRE_OUTER = Object.freeze([1, 0.19, 0.025, 0.92]);
const FIRE_INNER = Object.freeze([1, 0.68, 0.12, 0.96]);

export class WebGLWorldEventLayer {
  constructor() {
    this.id = 'worldEvents';
    this.mode = WEBGL_WORLD_EVENT_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.sourceCount = 0;
    this.primitiveCount = 0;
    this.triangles = [];
    this.radials = [];
    this.shadowSilhouetteCount = 0;
    this.aerialSilhouetteMode = null;
    this.aerialSilhouetteMetrics = null;
    this.deliveryBreathCount = 0;
    this.deliveryBreathPrimitiveCount = 0;
    this.fireWallCount = 0;
    this.flyoverViewportIntersecting = false;
    this.flyoverViewportTriangleCount = 0;
    this.flyoverViewportCoverage = 0;
    this.flyoverWorldBounds = null;
    this.foliageFireOverlayCount = 0;
    this.infernoCompositions = new Map();
    this.activeInfernoCompositions = [];
    this.infernoGeometry = createInfernoGeometryStats();
  }

  update(projection, context = null) {
    this.triangles.length = 0;
    this.radials.length = 0;
    this.activeInfernoCompositions.length = 0;
    this.shadowSilhouetteCount = 0;
    this.aerialSilhouetteMode = null;
    this.aerialSilhouetteMetrics = null;
    this.deliveryBreathCount = 0;
    this.deliveryBreathPrimitiveCount = 0;
    this.flyoverViewportIntersecting = false;
    this.flyoverViewportTriangleCount = 0;
    this.flyoverViewportCoverage = 0;
    this.flyoverWorldBounds = null;
    this.foliageFireOverlayCount = 0;
    resetInfernoGeometryStats(this.infernoGeometry);
    const events = projection.worldEvents ?? {};
    for (const flyover of events.flyovers ?? []) {
      const firstTriangle = this.triangles.length;
      this.appendFlyoverShadow(flyover);
      this.recordFlyoverViewportEvidence(this.triangles.slice(firstTriangle), context);
      this.appendDeliveryBreath(flyover);
    }
    for (const wall of events.fireWalls ?? []) this.appendFireWall(wall);
    this.releaseInactiveInfernoCompositions(events.fireWalls ?? []);
    for (const foliageFire of events.foliageFires ?? []) this.appendFoliageFireOverlay(foliageFire);
    this.fireWallCount = events.fireWalls?.length ?? 0;
    this.foliageFireOverlayCount = events.foliageFires?.length ?? 0;
    this.objectCount = (events.flyovers?.length ?? 0) + this.fireWallCount + this.foliageFireOverlayCount;
    this.sourceCount = this.objectCount;
    this.primitiveCount = this.triangles.length + this.radials.length + this.infernoGeometry.clusterCount;
    this.status = this.primitiveCount > 0 ? 'active' : 'inactive';
  }

  render(context) {
    context.scene.retainWorldInfernoClusterBuffers(this.activeInfernoCompositions.map((composition) => composition.id));
    for (const composition of this.activeInfernoCompositions) context.scene.drawWorldInfernoClusters(composition, context.camera);
    if (this.radials.length) context.scene.drawWorldRadialDiscs(this.radials, context.camera);
    if (this.triangles.length) context.scene.drawTriangles(this.triangles, context.camera);
  }

  statsFields() {
    const infernoGeometry = {
      ...this.infernoGeometry,
      bufferUploadCount: this.activeInfernoCompositions.reduce((sum, composition) => sum + composition.bufferUploadCount, 0),
      bufferReuseCount: this.activeInfernoCompositions.reduce((sum, composition) => sum + composition.bufferReuseCount, 0)
    };
    return {
      mode: this.mode,
      sourceCount: this.sourceCount,
      primitiveCount: this.primitiveCount,
      triangleCount: this.triangles.length,
      radialCount: this.radials.length,
      shadowSilhouetteCount: this.shadowSilhouetteCount,
      aerialSilhouetteMode: this.aerialSilhouetteMode,
      aerialSilhouetteMetrics: this.aerialSilhouetteMetrics,
      deliveryBreathCount: this.deliveryBreathCount,
      deliveryBreathPrimitiveCount: this.deliveryBreathPrimitiveCount,
      fireWallCount: this.fireWallCount,
      flyoverViewportIntersecting: this.flyoverViewportIntersecting,
      flyoverViewportTriangleCount: this.flyoverViewportTriangleCount,
      flyoverViewportCoverage: this.flyoverViewportCoverage,
      flyoverWorldBounds: this.flyoverWorldBounds,
      foliageFireOverlayCount: this.foliageFireOverlayCount,
      infernoGeometry
    };
  }

  appendFlyoverShadow(flyover) {
    if (flyover.opacity <= 0.001) return;
    const penumbra = buildWebGLMamaWyvernAerialSilhouette(flyover, {
      scaleMultiplier: 1.045,
      color: withOpacity(SHADOW_PENUMBRA, flyover.penumbraOpacity)
    });
    const core = buildWebGLMamaWyvernAerialSilhouette(flyover, {
      color: withOpacity(SHADOW_CORE, flyover.opacity)
    });
    if (!core?.triangles?.length) return;
    this.triangles.push(...(penumbra?.triangles ?? []), ...core.triangles);
    this.aerialSilhouetteMode = WEBGL_MAMA_WYVERN_AERIAL_MODE;
    this.aerialSilhouetteMetrics = core.metrics;
    this.shadowSilhouetteCount += 1;
  }

  appendDeliveryBreath(flyover) {
    const breath = flyover.breath;
    if (!breath?.active || breath.opacity <= 0.01) return;
    const firstPrimitive = this.triangles.length + this.radials.length;
    const dx = breath.targetWorldX - breath.originWorldX;
    const dy = breath.targetWorldY - breath.originWorldY;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const roll = Math.sin((breath.phase ?? 0) * Math.PI * 2.4);
    const outerLobes = [
      { t: 0, radius: 0.5, side: 0 },
      { t: 0.18, radius: 0.82, side: -0.1 },
      { t: 0.36, radius: 1, side: 0.12 },
      { t: 0.54, radius: 0.96, side: -0.08 },
      { t: 0.72, radius: 0.8, side: 0.1 },
      { t: 0.9, radius: 0.48, side: -0.04 }
    ];
    for (const [index, lobe] of outerLobes.entries()) {
      const modulation = (lobe.side + roll * 0.025 * (index % 2 ? -1 : 1)) * flyover.worldScale;
      this.radials.push({
        x: lerp(breath.originWorldX, breath.targetWorldX, lobe.t) + normalX * modulation,
        y: lerp(breath.originWorldY, breath.targetWorldY, lobe.t) + normalY * modulation,
        radius: flyover.worldScale * lobe.radius,
        softness: 0.78,
        color: [1, 0.19 + lobe.radius * 0.38, 0.018, breath.opacity * (0.64 + lobe.radius * 0.28)]
      });
    }
    for (const [index, t] of [0.43, 0.57].entries()) {
      const modulation = (index === 0 ? 0.07 : -0.055) * flyover.worldScale;
      this.radials.push({
        x: lerp(breath.originWorldX, breath.targetWorldX, t) + normalX * modulation,
        y: lerp(breath.originWorldY, breath.targetWorldY, t) + normalY * modulation,
        radius: flyover.worldScale * (index === 0 ? 0.38 : 0.34),
        softness: 0.68,
        color: [1, 0.78, 0.16, breath.opacity * 0.92]
      });
    }
    this.deliveryBreathCount += 1;
    this.deliveryBreathPrimitiveCount += this.triangles.length + this.radials.length - firstPrimitive;
  }

  recordFlyoverViewportEvidence(triangles, context) {
    if (!triangles.length || !context?.camera?.visibleWorldBounds) return;
    const viewport = context.camera.visibleWorldBounds(0);
    const bounds = triangleBounds(triangles);
    const intersection = intersectBounds(bounds, viewport);
    this.flyoverWorldBounds = roundBounds(bounds);
    this.flyoverViewportIntersecting = !!intersection;
    this.flyoverViewportTriangleCount += triangles.filter((triangle) => triangleIntersectsBounds(triangle, viewport)).length;
    if (!intersection) return;
    const viewportArea = Math.max(1, (viewport.right - viewport.left) * (viewport.bottom - viewport.top));
    this.flyoverViewportCoverage = Math.max(this.flyoverViewportCoverage, Math.min(1, boundsArea(intersection) / viewportArea));
  }

  appendFireWall(wall) {
    const signature = compositionSignature(wall);
    let composition = this.infernoCompositions.get(wall.id);
    const built = !composition || composition.signature !== signature;
    if (built) {
      composition = createLiquidInfernoComposition(wall);
      if (!composition) return;
      this.infernoCompositions.set(wall.id, composition);
    }
    syncLiquidInfernoComposition(composition, wall);
    this.activeInfernoCompositions.push(composition);
    recordInfernoComposition(this.infernoGeometry, composition, { built });
  }

  releaseInactiveInfernoCompositions(walls) {
    const activeIds = new Set(walls.map((wall) => wall.id));
    for (const id of this.infernoCompositions.keys()) {
      if (!activeIds.has(id)) this.infernoCompositions.delete(id);
    }
  }

  appendFoliageFireOverlay(foliageFire) {
    const heat = Math.max(0, Math.min(1, foliageFire.heatAmount ?? 0));
    const embers = Math.max(0, Math.min(1, foliageFire.emberAmount ?? 0));
    const phase = foliageFire.phase;
    const count = phase === 'burnt_out' ? 0 : foliageFire.family === 'tree' ? 2 : 1;
    const sockets = [[0.28, 0.58], [0.66, 0.62], [0.46, 0.38], [0.18, 0.76], [0.78, 0.78]];
    const seed = stableSeed(foliageFire.id);
    for (let index = 0; index < count; index += 1) {
      const socket = sockets[index];
      const pulse = 0.86 + Math.sin(foliageFire.fireAge * 7.8 + index * 1.9 + seed * 0.01) * 0.14;
      appendLayeredFlame(this.triangles, {
        x: foliageFire.worldTileX + foliageFire.worldWidth * socket[0],
        y: foliageFire.worldTileY + foliageFire.worldHeight * socket[1],
        radius: Math.max(foliageFire.family === 'tree' ? 5 : 3, Math.min(foliageFire.worldWidth, foliageFire.worldHeight) * (0.052 + heat * 0.025)),
        outerColor: FIRE_OUTER,
        innerColor: FIRE_INNER,
        alpha: heat * pulse * 0.84,
        seed: seed * 0.001 + index * 0.7 + foliageFire.fireAge * 2.2,
        lean: Math.sin(seed + index * 2.1 + foliageFire.fireAge * 3.4) * 0.28
      });
    }
    if (foliageFire.family === 'tree' && phase === 'burnt_out' && embers > 0.02) {
      this.radials.push({ x: foliageFire.worldX, y: foliageFire.worldY + foliageFire.worldHeight * 0.18, radius: 8 + embers * 10, softness: 0.9, color: [0.82, 0.08, 0.01, embers * 0.18] });
    }
  }
}

function withOpacity(color, opacity) {
  return [color[0], color[1], color[2], Math.max(0, Math.min(1, opacity))];
}

function triangleBounds(triangles) {
  const xs = triangles.flatMap((triangle) => [triangle.ax, triangle.bx, triangle.cx]);
  const ys = triangles.flatMap((triangle) => [triangle.ay, triangle.by, triangle.cy]);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

function triangleIntersectsBounds(triangle, bounds) {
  const triangleBox = {
    left: Math.min(triangle.ax, triangle.bx, triangle.cx),
    top: Math.min(triangle.ay, triangle.by, triangle.cy),
    right: Math.max(triangle.ax, triangle.bx, triangle.cx),
    bottom: Math.max(triangle.ay, triangle.by, triangle.cy)
  };
  return !!intersectBounds(triangleBox, bounds);
}

function intersectBounds(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

function boundsArea(bounds) {
  return Math.max(0, bounds.right - bounds.left) * Math.max(0, bounds.bottom - bounds.top);
}

function roundBounds(bounds) {
  return Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value * 10) / 10]));
}

function stableSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
