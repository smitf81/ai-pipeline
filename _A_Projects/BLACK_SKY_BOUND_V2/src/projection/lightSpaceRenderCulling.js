import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { worldToScreen } from '../render/camera.js';

export function selectActiveLightViews(lights, maxLights = RENDER_BUDGETS.lightEmitters.maxActive) {
  return (lights ?? [])
    .filter((light) => light?.enabled !== false && (light.intensity ?? 0) > 0 && (light.radius ?? 0) > 0)
    .slice(0, maxLights);
}

export function buildLightSpaceRenderCulling(lights, camera, tileSize, options = RENDER_BUDGETS.lightSpaceCulling) {
  const enabled = options.enabled !== false;
  const activeLights = selectActiveLightViews(lights, RENDER_BUDGETS.lightEmitters.maxActive);
  const viewport = { x: 0, y: 0, w: camera.viewportW, h: camera.viewportH };
  const featherPx = Math.max(0, options.featherPx ?? 0);
  const rawRegions = enabled
    ? activeLights
      .map((light) => lightToScreenRegion(light, camera, tileSize, options.paddingTiles ?? 0, featherPx))
      .filter(Boolean)
    : [];
  const regions = mergeScreenRegions(rawRegions, options.mergePaddingPx ?? 0);
  const viewportArea = Math.max(1, viewport.w * viewport.h);
  const innerArea = regions.reduce((sum, region) => sum + region.innerBounds.w * region.innerBounds.h, 0);
  const featheredArea = regions.reduce((sum, region) => sum + region.outerBounds.w * region.outerBounds.h, 0);
  return {
    classification: 'derived_render_budget_gate',
    enabled,
    policy: options.policy,
    outsideDetailPolicy: options.outsideDetailPolicy,
    actorPolicy: options.actorPolicy,
    paddingTiles: options.paddingTiles ?? 0,
    featherPx,
    softness: Math.max(0, Math.min(1, options.softness ?? 1)),
    activeLightCount: activeLights.length,
    rawRegionCount: rawRegions.length,
    regions,
    coverageRatio: Math.max(0, Math.min(1, innerArea / viewportArea)),
    featheredCoverageRatio: Math.max(0, Math.min(1, featheredArea / viewportArea))
  };
}

export function resetLightSpaceCullingStats(stats, culling) {
  if (!stats) return;
  stats.enabled = culling?.enabled !== false;
  stats.policy = culling?.policy ?? RENDER_BUDGETS.lightSpaceCulling.policy;
  stats.outsideDetailPolicy = culling?.outsideDetailPolicy ?? RENDER_BUDGETS.lightSpaceCulling.outsideDetailPolicy;
  stats.actorPolicy = culling?.actorPolicy ?? RENDER_BUDGETS.lightSpaceCulling.actorPolicy;
  stats.featherPx = culling?.featherPx ?? RENDER_BUDGETS.lightSpaceCulling.featherPx;
  stats.softness = culling?.softness ?? RENDER_BUDGETS.lightSpaceCulling.softness;
  stats.activeLights = culling?.activeLightCount ?? 0;
  stats.rawRegions = culling?.rawRegionCount ?? 0;
  stats.mergedRegions = culling?.regions?.length ?? 0;
  stats.coverageRatio = culling?.coverageRatio ?? 0;
  stats.featheredCoverageRatio = culling?.featheredCoverageRatio ?? 0;
  stats.skippedTerrainTiles = 0;
  stats.clippedDecalRegions = 0;
  stats.skippedActors = 0;
  stats.skippedEffects = 0;
  stats.skippedNapalmPools = 0;
  stats.skippedNapalmDroplets = 0;
  stats.culledSmokeSources = 0;
}

export function screenRectIntersectsLightSpace(culling, rect) {
  if (!culling?.enabled) return true;
  if (!culling.regions?.length) return false;
  return culling.regions.some((region) => rectsIntersect(region.outerBounds ?? region, rect));
}

export function screenCircleIntersectsLightSpace(culling, x, y, radius) {
  return screenRectIntersectsLightSpace(culling, {
    x: x - radius,
    y: y - radius,
    w: radius * 2,
    h: radius * 2
  });
}

export function worldCircleIntersectsLightSpace(culling, camera, tileSize, x, y, radiusTiles) {
  if (!culling?.enabled) return true;
  const pos = worldToScreen(camera, x * tileSize, y * tileSize);
  const radius = Math.max(1, radiusTiles * tileSize * camera.zoom);
  return screenCircleIntersectsLightSpace(culling, pos.x, pos.y, radius);
}

export function getLightSpaceAlphaAtPoint(culling, x, y) {
  if (!culling?.enabled) return 1;
  if (!culling.regions?.length) return 0;
  let alpha = 0;
  for (const region of culling.regions) alpha = Math.max(alpha, getRegionAlpha(region, x, y, culling.softness));
  return alpha;
}

export function getLightSpaceAlphaForCircle(culling, x, y, radius) {
  if (!culling?.enabled) return 1;
  return Math.max(
    getLightSpaceAlphaAtPoint(culling, x, y),
    getLightSpaceAlphaAtPoint(culling, x - radius, y),
    getLightSpaceAlphaAtPoint(culling, x + radius, y),
    getLightSpaceAlphaAtPoint(culling, x, y - radius),
    getLightSpaceAlphaAtPoint(culling, x, y + radius)
  );
}

export function clipToLightSpaceRegions(ctx, culling, scale = 1) {
  if (!culling?.enabled) return false;
  ctx.beginPath();
  for (const region of culling.regions ?? []) {
    const bounds = region.outerBounds ?? region;
    ctx.rect(
      Math.floor(bounds.x * scale),
      Math.floor(bounds.y * scale),
      Math.ceil(bounds.w * scale),
      Math.ceil(bounds.h * scale)
    );
  }
  ctx.clip();
  return true;
}

function lightToScreenRegion(light, camera, tileSize, paddingTiles, featherPx) {
  const pos = worldToScreen(camera, light.x * tileSize, light.y * tileSize);
  const radius = Math.max(2, (light.radius + paddingTiles) * tileSize * camera.zoom);
  const innerBounds = clipScreenRegion(
    {
      x: pos.x - radius,
      y: pos.y - radius,
      w: radius * 2,
      h: radius * 2
    },
    { x: 0, y: 0, w: camera.viewportW, h: camera.viewportH }
  );
  if (!innerBounds) return null;
  const outerBounds = clipScreenRegion(
    expandRect(innerBounds, featherPx),
    { x: 0, y: 0, w: camera.viewportW, h: camera.viewportH }
  );
  return createRegion(innerBounds, outerBounds ?? innerBounds, featherPx);
}

function clipScreenRegion(region, viewport) {
  const x1 = Math.max(viewport.x, region.x);
  const y1 = Math.max(viewport.y, region.y);
  const x2 = Math.min(viewport.x + viewport.w, region.x + region.w);
  const y2 = Math.min(viewport.y + viewport.h, region.y + region.h);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function mergeScreenRegions(regions, mergePaddingPx) {
  const merged = [];
  for (const region of regions) {
    let next = region;
    for (let i = 0; i < merged.length; i += 1) {
      if (!rectsIntersect(expandRect(next.outerBounds, mergePaddingPx), expandRect(merged[i].outerBounds, mergePaddingPx))) continue;
      next = createRegion(
        unionRects(next.innerBounds, merged[i].innerBounds),
        unionRects(next.outerBounds, merged[i].outerBounds),
        Math.max(next.featherPx ?? 0, merged[i].featherPx ?? 0)
      );
      merged.splice(i, 1);
      i = -1;
    }
    merged.push(next);
  }
  return merged;
}

function createRegion(innerBounds, outerBounds, featherPx) {
  return {
    ...outerBounds,
    innerBounds,
    outerBounds,
    featherPx,
    softness: featherPx > 0 ? 'feathered' : 'hard'
  };
}

function expandRect(rect, amount) {
  if (!amount) return rect;
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + amount * 2,
    h: rect.h + amount * 2
  };
}

function unionRects(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function getRegionAlpha(region, x, y, softness = 1) {
  const outer = region.outerBounds ?? region;
  if (x < outer.x || y < outer.y || x > outer.x + outer.w || y > outer.y + outer.h) return 0;
  const inner = region.innerBounds ?? outer;
  if (x >= inner.x && y >= inner.y && x <= inner.x + inner.w && y <= inner.y + inner.h) return 1;
  const featherPx = Math.max(1, region.featherPx ?? 1);
  const dx = x < inner.x ? inner.x - x : x > inner.x + inner.w ? x - (inner.x + inner.w) : 0;
  const dy = y < inner.y ? inner.y - y : y > inner.y + inner.h ? y - (inner.y + inner.h) : 0;
  const t = 1 - Math.max(dx, dy) / featherPx;
  const clamped = Math.max(0, Math.min(1, t));
  const eased = clamped * clamped * (3 - 2 * clamped);
  return eased * Math.max(0, Math.min(1, softness));
}
