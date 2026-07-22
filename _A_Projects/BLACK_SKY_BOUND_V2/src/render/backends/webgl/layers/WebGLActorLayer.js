import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { WEBGL_LIGHT_SPACE_GATE_MODE, lightSpaceAlphaForWorldCircle, lightSpaceGateActive } from '../WebGLLightSpaceGate.js';
import { buildWebGLPlayerWyvernSilhouette, WEBGL_PLAYER_WYVERN_MODE } from '../WebGLWyvernSilhouette.js';
import { buildWebGLRaiderHumanoidSilhouette, WEBGL_RAIDER_HUMANOID_MODE } from '../WebGLHumanoidSilhouette.js';
import { buildWebGLPredatorSilhouette, WEBGL_PREDATOR_MODE } from '../WebGLPredatorSilhouette.js';
import { adaptMaterialToWebGL } from '../WebGLMaterialAdapter.js';
import { buildWebGLActorLightReadabilityGeometry, WEBGL_ACTOR_LIGHT_READABILITY_MODE } from '../WebGLActorLightReadability.js';
import { RENDER_BUDGETS } from '../../../../data/renderBudgets.js';

export const WEBGL_ACTOR_SHADOW_LOD_MODE = 'webgl_unlit_actor_black_shadow_lod_v0';

export class WebGLActorLayer {
  constructor() {
    this.id = 'actors';
    this.mode = WEBGL_PLAYER_WYVERN_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.rects = [];
    this.triangles = [];
    this.playerWyvernSilhouetteActive = false;
    this.playerWyvernPartCount = 0;
    this.raiderHumanoidSilhouetteActive = false;
    this.raiderHumanoidPartCount = 0;
    this.raiderHumanoidTorchSocketCount = 0;
    this.raiderHumanoidSpearSocketCount = 0;
    this.predatorSilhouetteActive = false;
    this.predatorPartCount = 0;
    this.lightSpaceCulledCount = 0;
    this.lightSpaceGateActive = false;
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
    const built = buildWebGLActorDepthItems(projection, context);
    this.rects = built.items.flatMap((item) => item.rects);
    this.triangles = built.items.flatMap((item) => item.triangles);
    this.playerWyvernSilhouetteActive = built.playerWyvernSilhouetteActive;
    this.playerWyvernPartCount = built.playerWyvernPartCount;
    this.raiderHumanoidSilhouetteActive = built.raiderHumanoidSilhouetteActive;
    this.raiderHumanoidPartCount = built.raiderHumanoidPartCount;
    this.raiderHumanoidTorchSocketCount = built.raiderHumanoidTorchSocketCount;
    this.raiderHumanoidSpearSocketCount = built.raiderHumanoidSpearSocketCount;
    this.predatorSilhouetteActive = built.predatorSilhouetteActive;
    this.predatorPartCount = built.predatorPartCount;
    this.lightSpaceCulledCount = built.lightSpaceCulledCount;
    this.lightSpaceGateActive = built.lightSpaceGateActive;
    this.actorLightReadabilityCount = built.actorLightReadabilityCount;
    this.actorLightInfluenceCount = built.actorLightInfluenceCount;
    this.actorRimPrimitiveCount = built.actorRimPrimitiveCount;
    this.actorCatchlightPrimitiveCount = built.actorCatchlightPrimitiveCount;
    this.actorContactShadowPrimitiveCount = built.actorContactShadowPrimitiveCount;
    this.actorCoreOcclusionPrimitiveCount = built.actorCoreOcclusionPrimitiveCount;
    this.actorShadowLodCount = built.actorShadowLodCount;
    this.actorShadowLodPrimitiveCount = built.actorShadowLodPrimitiveCount;
    this.objectCount = built.objectCount;
    this.status = this.rects.length > 0 || this.triangles.length > 0 ? 'active' : 'inactive';
  }

  render(context) {
    if (this.triangles.length) context.scene.drawTriangles(this.triangles, context.camera);
    if (this.rects.length) context.scene.drawRects(this.rects, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      actorMode: WEBGL_PLAYER_WYVERN_MODE,
      raiderHumanoidMode: WEBGL_RAIDER_HUMANOID_MODE,
      playerWyvernSilhouetteActive: this.playerWyvernSilhouetteActive,
      playerWyvernPartCount: this.playerWyvernPartCount,
      raiderHumanoidSilhouetteActive: this.raiderHumanoidSilhouetteActive,
      raiderHumanoidPartCount: this.raiderHumanoidPartCount,
      raiderHumanoidTorchSocketCount: this.raiderHumanoidTorchSocketCount,
      raiderHumanoidSpearSocketCount: this.raiderHumanoidSpearSocketCount,
      predatorMode: WEBGL_PREDATOR_MODE,
      predatorSilhouetteActive: this.predatorSilhouetteActive,
      predatorPartCount: this.predatorPartCount,
      triangleCount: this.triangles.length,
      rectCount: this.rects.length,
      lightSpaceMode: WEBGL_LIGHT_SPACE_GATE_MODE,
      lightSpaceCullingActive: this.lightSpaceGateActive,
      lightSpaceCulledCount: this.lightSpaceCulledCount,
      actorLightReadabilityMode: WEBGL_ACTOR_LIGHT_READABILITY_MODE,
      actorLightReadabilityCount: this.actorLightReadabilityCount,
      actorLightInfluenceCount: this.actorLightInfluenceCount,
      actorRimPrimitiveCount: this.actorRimPrimitiveCount,
      actorCatchlightPrimitiveCount: this.actorCatchlightPrimitiveCount,
      actorContactShadowPrimitiveCount: this.actorContactShadowPrimitiveCount,
      actorCoreOcclusionPrimitiveCount: this.actorCoreOcclusionPrimitiveCount,
      actorShadowLodMode: WEBGL_ACTOR_SHADOW_LOD_MODE,
      actorShadowLodPolicy: RENDER_BUDGETS.actorShadowLod.policy,
      actorShadowLodCount: this.actorShadowLodCount,
      actorShadowLodPrimitiveCount: this.actorShadowLodPrimitiveCount
    };
  }
}

export function buildWebGLActorDepthItems(projection, context) {
  const bounds = context.camera.visibleWorldBounds(96);
  const result = {
    items: [],
    objectCount: projection.actors?.length ?? 0,
    playerWyvernSilhouetteActive: false,
    playerWyvernPartCount: 0,
    raiderHumanoidSilhouetteActive: false,
    raiderHumanoidPartCount: 0,
    raiderHumanoidTorchSocketCount: 0,
    raiderHumanoidSpearSocketCount: 0,
    predatorSilhouetteActive: false,
    predatorPartCount: 0,
    lightSpaceCulledCount: 0,
    lightSpaceGateActive: lightSpaceGateActive(context),
    actorLightReadabilityCount: 0,
    actorLightInfluenceCount: 0,
    actorRimPrimitiveCount: 0,
    actorCatchlightPrimitiveCount: 0,
    actorContactShadowPrimitiveCount: 0,
    actorCoreOcclusionPrimitiveCount: 0,
    actorShadowLodCount: 0,
    actorShadowLodPrimitiveCount: 0
  };
  for (const actor of projection.actors ?? []) {
    const item = buildActorDepthItem(actor, context, bounds);
    if (!item) {
      if (item === null) result.lightSpaceCulledCount += 1;
      continue;
    }
    if (item.playerWyvernSilhouetteActive) {
      result.playerWyvernSilhouetteActive = true;
      result.playerWyvernPartCount = item.partCount;
    }
    if (item.raiderHumanoidSilhouetteActive) {
      result.raiderHumanoidSilhouetteActive = true;
      result.raiderHumanoidPartCount += item.partCount;
      result.raiderHumanoidTorchSocketCount += item.torchSocketCount;
      result.raiderHumanoidSpearSocketCount += item.spearSocketCount;
    }
    if (item.predatorSilhouetteActive) {
      result.predatorSilhouetteActive = true;
      result.predatorPartCount += item.partCount;
    }
    result.actorLightReadabilityCount += item.actorLightReadabilityActive ? 1 : 0;
    result.actorLightInfluenceCount += item.actorLightInfluenceCount;
    result.actorRimPrimitiveCount += item.actorRimPrimitiveCount;
    result.actorCatchlightPrimitiveCount += item.actorCatchlightPrimitiveCount;
    result.actorContactShadowPrimitiveCount += item.actorContactShadowPrimitiveCount;
    result.actorCoreOcclusionPrimitiveCount += item.actorCoreOcclusionPrimitiveCount;
    result.actorShadowLodCount += item.actorShadowLodActive ? 1 : 0;
    result.actorShadowLodPrimitiveCount += item.actorShadowLodPrimitiveCount;
    result.items.push(item);
  }
  return result;
}

function buildActorDepthItem(actor, context, bounds) {
  const visualBounds = actor.humanoidProjection?.visualBounds
    ?? actor.predatorProjection?.visualBounds
    ?? actor.wyvernProjection?.rigPose?.visualBounds
    ?? null;
  const visualR = visualBounds ? Math.max(visualBounds.worldWidth ?? 0, visualBounds.worldHeight ?? 0) * 0.5 : 0;
  const r = actor.team === 'player' ? Math.max(18, actor.worldRadius * 4.6) : Math.max(5, actor.worldRadius, visualR);
  if (actor.worldX + r < bounds.left || actor.worldY + r < bounds.top
    || actor.worldX - r > bounds.right || actor.worldY - r > bounds.bottom) return undefined;
  const lightSpaceAlpha = actor.team === 'player' ? 1 : lightSpaceAlphaForWorldCircle(context, actor.worldX, actor.worldY, r);
  const item = {
    id: actor.id,
    source: 'actor',
    depthY: actor.worldY,
    sortBias: 1,
    rects: [],
    triangles: [],
    playerWyvernSilhouetteActive: false,
    raiderHumanoidSilhouetteActive: false,
    predatorSilhouetteActive: false,
    partCount: 0,
    torchSocketCount: 0,
    spearSocketCount: 0,
    actorLightReadabilityActive: false,
    actorLightInfluenceCount: 0,
    actorRimPrimitiveCount: 0,
    actorCatchlightPrimitiveCount: 0,
    actorContactShadowPrimitiveCount: 0,
    actorCoreOcclusionPrimitiveCount: 0,
    actorShadowLodActive: false,
    actorShadowLodPrimitiveCount: 0
  };
  const shadowLodActive = actor.team !== 'player'
    && lightSpaceGateActive(context)
    && lightSpaceAlpha <= RENDER_BUDGETS.actorShadowLod.detailEnter;
  const readability = shadowLodActive
    ? emptyActorReadabilityGeometry()
    : buildWebGLActorLightReadabilityGeometry(actor, context.camera);
  item.triangles.push(...readability.contactTriangles);
  recordReadability(item, readability);
  if (shadowLodActive) {
    const lod = appendActorShadowLodGeometry(actor, item.rects, item.triangles, lightSpaceAlpha);
    item.actorShadowLodActive = true;
    item.actorShadowLodPrimitiveCount = lod.primitiveCount;
    item.partCount = lod.partCount;
    return item;
  }
  if (actor.team === 'player' && actor.silhouette === 'grounded_wyvern') {
    const silhouette = buildWebGLPlayerWyvernSilhouette(actor);
    if (silhouette) {
      item.triangles.push(...silhouette.triangles);
      item.rects.push(...silhouette.rects);
      appendReadabilityOverlays(item, readability);
      item.playerWyvernSilhouetteActive = true;
      item.partCount = silhouette.partCount;
      return item;
    }
  }
  if (actor.silhouette === 'humanoid' && actor.humanoidProjection) {
    const silhouette = buildWebGLRaiderHumanoidSilhouette(actor, lightSpaceAlpha);
    if (silhouette) {
      item.triangles.push(...silhouette.triangles);
      item.rects.push(...silhouette.rects);
      appendReadabilityOverlays(item, readability);
      item.raiderHumanoidSilhouetteActive = true;
      item.partCount = silhouette.partCount;
      item.torchSocketCount = silhouette.torchSocketCount;
      item.spearSocketCount = silhouette.spearSocketCount;
      return item;
    }
  }
  if (actor.silhouette === 'predator' && actor.predatorProjection) {
    const silhouette = buildWebGLPredatorSilhouette(actor, lightSpaceAlpha);
    if (silhouette) {
      item.triangles.push(...silhouette.triangles);
      item.rects.push(...silhouette.rects);
      appendReadabilityOverlays(item, readability);
      item.predatorSilhouetteActive = true;
      item.partCount = silhouette.partCount;
      return item;
    }
  }
  const base = adaptMaterialToWebGL(actor.material, parseWebGLColor(actor.colour, [0.9, 0.42, 0.18, 1])).baseColor;
  const size = Math.max(8, r * 1.75);
  item.rects.push({
    x: actor.worldX - size / 2,
    y: actor.worldY - size / 2,
    w: size,
    h: size,
    color: withAlpha(base, (actor.team === 'player' ? 1 : 0.92) * lightSpaceAlpha)
  });
  appendReadabilityOverlays(item, readability);
  return item;
}

function appendReadabilityOverlays(item, readability) {
  item.triangles.push(
    ...readability.coreTriangles,
    ...readability.rimTriangles,
    ...readability.catchlightTriangles
  );
}

function recordReadability(item, readability) {
  item.actorLightReadabilityActive = readability.active;
  item.actorLightInfluenceCount = readability.contributingLightCount;
  item.actorRimPrimitiveCount = readability.rimPrimitiveCount;
  item.actorCatchlightPrimitiveCount = readability.catchlightPrimitiveCount;
  item.actorContactShadowPrimitiveCount = readability.contactShadowPrimitiveCount;
  item.actorCoreOcclusionPrimitiveCount = readability.coreOcclusionPrimitiveCount;
}

function appendActorShadowLodGeometry(actor, rects, triangles, lightSpaceAlpha = 0) {
  const before = rects.length + triangles.length;
  const budget = RENDER_BUDGETS.actorShadowLod;
  const influence01 = Math.max(0, Math.min(1, lightSpaceAlpha / Math.max(0.001, budget.detailEnter)));
  const alpha = (budget.shadowAlpha ?? 0.58) + ((budget.featheredShadowAlpha ?? 0.68) - (budget.shadowAlpha ?? 0.58)) * influence01;
  const contactAlpha = (budget.contactAlpha ?? 0.24) * (0.8 + influence01 * 0.2);
  const black = parseWebGLColor('rgba(0,0,0,1)', [0, 0, 0, 1]);
  const silhouette = withAlpha(black, alpha);
  const contact = withAlpha(black, contactAlpha);
  const predatorShadowScale = actor.silhouette === 'predator'
    ? (actor.predatorProjection?.profile?.visual?.shadowScale ?? 1)
    : 1;
  const r = Math.max(4, (actor.worldRadius ?? 5) * predatorShadowScale);

  rects.push({
    x: actor.worldX - r * 1.18,
    y: actor.worldY + r * 0.48,
    w: r * 2.36,
    h: Math.max(1.8, r * 0.34),
    color: contact
  });

  if (actor.silhouette === 'humanoid' && actor.humanoidProjection?.points) {
    appendHumanoidShadowLod(actor.humanoidProjection.points, r, silhouette, triangles);
  } else if (actor.silhouette === 'predator' && actor.predatorProjection?.points) {
    appendPredatorShadowLod(actor.predatorProjection.points, r, silhouette, triangles);
  } else {
    addShadowDiamond(triangles, actor.worldX, actor.worldY, r * 0.72, r * 1.08, silhouette);
  }

  return {
    primitiveCount: rects.length + triangles.length - before,
    partCount: Math.min(budget.maxPrimitiveCountPerActor ?? 18, rects.length + triangles.length - before)
  };
}

function appendHumanoidShadowLod(points, radius, color, triangles) {
  addShadowSegment(triangles, points.chest, points.hips, Math.max(4, radius * 0.68), color);
  addShadowSegment(triangles, points.leftShoulder, points.rightShoulder, Math.max(3.2, radius * 0.36), color);
  addShadowSegment(triangles, points.leftHip, points.rightHip, Math.max(2.8, radius * 0.28), color);
  addShadowSegment(triangles, points.leftShoulder, points.leftElbow, Math.max(2.4, radius * 0.24), color);
  addShadowSegment(triangles, points.leftElbow, points.leftHand, Math.max(2.2, radius * 0.2), color);
  addShadowSegment(triangles, points.rightShoulder, points.rightElbow, Math.max(2.4, radius * 0.24), color);
  addShadowSegment(triangles, points.rightElbow, points.rightHand, Math.max(2.2, radius * 0.2), color);
  addShadowSegment(triangles, points.spearButt, points.spearTip, Math.max(1.7, radius * 0.13), color);
  addShadowSegment(triangles, points.torchGrip, points.torchTip, Math.max(1.8, radius * 0.15), color);
  addShadowEllipse(triangles, points.head, Math.max(3.5, points.head?.worldRadius ?? radius * 0.5), Math.max(3.5, points.head?.worldRadius ?? radius * 0.5), color, 6);
}

function appendPredatorShadowLod(points, radius, color, triangles) {
  addShadowSegment(triangles, points.chest, points.hips, Math.max(7, radius * 0.68), color);
  addShadowEllipse(triangles, points.chest, Math.max(5, points.chest?.worldRadius ?? radius * 0.72), Math.max(3.6, (points.chest?.worldRadius ?? radius * 0.72) * 0.72), color, 6);
  addShadowEllipse(triangles, points.head, Math.max(4, points.head?.worldRadius ?? radius * 0.46), Math.max(3.2, (points.head?.worldRadius ?? radius * 0.46) * 0.78), color, 6);
}

function addShadowDiamond(triangles, cx, cy, rx, ry, color) {
  pushShadowTri(triangles, cx, cy - ry, cx + rx, cy, cx, cy + ry, color);
  pushShadowTri(triangles, cx, cy - ry, cx, cy + ry, cx - rx, cy, color);
}

function addShadowSegment(triangles, a, b, width, color) {
  if (!isPoint(a) || !isPoint(b)) return;
  const dx = b.worldX - a.worldX;
  const dy = b.worldY - a.worldY;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width * 0.5;
  const ny = dx / length * width * 0.5;
  pushShadowTri(triangles, a.worldX + nx, a.worldY + ny, b.worldX + nx, b.worldY + ny, b.worldX - nx, b.worldY - ny, color);
  pushShadowTri(triangles, a.worldX + nx, a.worldY + ny, b.worldX - nx, b.worldY - ny, a.worldX - nx, a.worldY - ny, color);
}

function addShadowEllipse(triangles, center, rx, ry, color, segments = 6) {
  if (!isPoint(center)) return;
  const count = Math.max(5, segments);
  for (let index = 0; index < count; index += 1) {
    const a0 = index / count * Math.PI * 2;
    const a1 = (index + 1) / count * Math.PI * 2;
    pushShadowTri(
      triangles,
      center.worldX,
      center.worldY,
      center.worldX + Math.cos(a0) * rx,
      center.worldY + Math.sin(a0) * ry,
      center.worldX + Math.cos(a1) * rx,
      center.worldY + Math.sin(a1) * ry,
      color
    );
  }
}

function pushShadowTri(triangles, ax, ay, bx, by, cx, cy, color) {
  triangles.push({ ax, ay, bx, by, cx, cy, color });
}

function isPoint(point) {
  return Number.isFinite(point?.worldX) && Number.isFinite(point?.worldY);
}

function emptyActorReadabilityGeometry() {
  return {
    active: false,
    contactTriangles: [],
    coreTriangles: [],
    rimTriangles: [],
    catchlightTriangles: [],
    contributingLightCount: 0,
    rimPrimitiveCount: 0,
    catchlightPrimitiveCount: 0,
    contactShadowPrimitiveCount: 0,
    coreOcclusionPrimitiveCount: 0
  };
}
