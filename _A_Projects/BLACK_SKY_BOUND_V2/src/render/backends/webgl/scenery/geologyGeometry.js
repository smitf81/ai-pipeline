import { resolveProceduralGeologyDefinition } from '../../../../data/proceduralGeology.js';
import { generateProceduralGeologyFormation } from '../../../../world/proceduralGeologyGenerator.js';
import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { adaptMaterialToWebGL } from '../WebGLMaterialAdapter.js';

export const GEOLOGY_GEOMETRY_MODE = 'procedural_geology_dna_hull_geometry_v1';

export function proceduralGeologyStats(source = {}) {
  return {
    proceduralGeologyCount: source.proceduralGeologyCount ?? 0,
    proceduralGeologyHullPointCount: source.proceduralGeologyHullPointCount ?? 0,
    proceduralGeologyFacetCount: source.proceduralGeologyFacetCount ?? 0,
    proceduralGeologyStrataSegmentCount: source.proceduralGeologyStrataSegmentCount ?? 0,
    proceduralGeologyCrackSegmentCount: source.proceduralGeologyCrackSegmentCount ?? 0,
    proceduralGeologyMossPatchCount: source.proceduralGeologyMossPatchCount ?? 0
  };
}

export function accumulateProceduralGeologyStats(target, geometry) {
  target.proceduralGeologyCount += 1;
  target.proceduralGeologyHullPointCount += geometry.hullPointCount;
  target.proceduralGeologyFacetCount += geometry.facetCount;
  target.proceduralGeologyStrataSegmentCount += geometry.strataSegmentCount;
  target.proceduralGeologyCrackSegmentCount += geometry.crackSegmentCount;
  target.proceduralGeologyMossPatchCount += geometry.mossPatchCount;
}

export function buildGeologyGeometry(object, alpha, rects, triangles) {
  const definition = object.geologyDefinition?.contract
    ? object.geologyDefinition
    : resolveProceduralGeologyDefinition({}, { id: object.id, type: object.authoredType ?? object.type, x: object.tileX, y: object.tileY });
  const formation = generateProceduralGeologyFormation(definition);
  const frame = geologyFrame(object);
  const render = object.render ?? {};
  const material = adaptMaterialToWebGL(object.material, parseWebGLColor(definition.bodyColour, [0.38, 0.42, 0.4, 1]));
  const body = mixColour(material.baseColor, definition.bodyColour, 0.34);
  const shade = mixColour(material.shadowColor, definition.shadeColour, 0.48);
  const highlight = mixColour(material.highlightColor, definition.strataColour, 0.36 + definition.wetness * 0.16);
  const outline = mixColour(shade, [0.035, 0.04, 0.045, 1], 0.54);
  const beforeTriangles = triangles.length;
  const beforeRects = rects.length;

  appendEllipseFan(triangles, {
    x: frame.cx,
    y: frame.baseY + frame.h * 0.018,
    radiusX: Math.max(8, frame.w * 0.42),
    radiusY: Math.max(2.4, frame.h * 0.055),
    color: parseWebGLColor(render.baseShadow, [0, 0, 0, 0.3]),
    alpha: alpha * 0.72,
    segments: 12
  });

  const center = toWorld(formation.center, frame);
  for (const facet of formation.facets) {
    const a = toWorld(formation.hull[facet.aIndex], frame);
    const b = toWorld(formation.hull[facet.bIndex], frame);
    const facetColour = facet.shade < 0.45
      ? mixColour(shade, body, facet.shade / 0.45)
      : mixColour(body, highlight, (facet.shade - 0.45) / 0.55);
    addTriangle(triangles, center, a, b, facetColour, alpha * (0.9 + definition.wetness * 0.08));
  }

  appendClosedHullOutline(triangles, formation.hull, frame, Math.max(1.1, frame.w * (0.007 + definition.angularity * 0.004)), outline, alpha * 0.9);
  for (const line of formation.strata) {
    appendPolylineRibbon(triangles, line.points, frame, Math.max(0.8, line.width * frame.w), definition.strataColour, alpha * line.alpha);
  }
  for (const crack of formation.cracks) {
    appendPolylineRibbon(triangles, crack.points, frame, Math.max(0.85, crack.width * frame.w), mixColour(outline, shade, 0.28), alpha * crack.alpha);
  }
  for (const patch of formation.mossPatches) {
    const centerPoint = toWorld(patch, frame);
    appendEllipseFan(triangles, {
      ...centerPoint,
      radiusX: Math.max(1.2, patch.radiusX * frame.w),
      radiusY: Math.max(0.7, patch.radiusY * frame.h),
      rotation: -patch.rotation,
      color: mixColour(definition.mossColour, [0.3, 0.56, 0.3, 1], 0.46 + definition.wetness * 0.08),
      centerColor: mixColour(definition.mossColour, shade, 0.08),
      alpha: alpha * Math.min(1, patch.alpha + 0.12),
      segments: 7
    });
  }
  for (const wetEdge of formation.wetEdges) {
    appendPolylineRibbon(triangles, [formation.hull[wetEdge.aIndex], formation.hull[wetEdge.bIndex]], frame, Math.max(0.7, frame.w * 0.006), mixColour(highlight, [0.62, 0.76, 0.82, 1], 0.38), alpha * wetEdge.alpha);
  }

  return Object.freeze({
    contract: GEOLOGY_GEOMETRY_MODE,
    definitionContract: definition.contract,
    formationContract: formation.contract,
    formation: definition.formation,
    seed: definition.seed,
    hullPointCount: formation.diagnostics.hullPointCount,
    facetCount: formation.diagnostics.facetCount,
    strataSegmentCount: formation.diagnostics.strataSegmentCount,
    crackSegmentCount: formation.diagnostics.crackSegmentCount,
    mossPatchCount: formation.diagnostics.mossPatchCount,
    wetEdgeCount: formation.diagnostics.wetEdgeCount,
    generatedTriangleCount: triangles.length - beforeTriangles,
    generatedRectCount: rects.length - beforeRects
  });
}

function geologyFrame(object) {
  const x = object.worldTileX;
  const y = object.worldTileY;
  const w = object.worldWidth;
  const h = object.worldHeight;
  return { x, y, w, h, cx: object.anchorWorldX ?? x + w * 0.5, baseY: object.anchorWorldY ?? y + h * 0.86 };
}

function appendClosedHullOutline(triangles, hull, frame, width, colour, alpha) {
  for (let index = 0; index < hull.length; index += 1) {
    appendSegmentRibbon(triangles, toWorld(hull[index], frame), toWorld(hull[(index + 1) % hull.length], frame), width, colour, alpha);
  }
}

function appendPolylineRibbon(triangles, points, frame, width, colour, alpha) {
  for (let index = 0; index < points.length - 1; index += 1) {
    appendSegmentRibbon(triangles, toWorld(points[index], frame), toWorld(points[index + 1], frame), width, colour, alpha);
  }
}

function appendSegmentRibbon(triangles, a, b, width, colour, alpha) {
  const length = Math.max(0.0001, Math.hypot(b.x - a.x, b.y - a.y));
  const px = -(b.y - a.y) / length * width * 0.5;
  const py = (b.x - a.x) / length * width * 0.5;
  const aLeft = { x: a.x + px, y: a.y + py };
  const aRight = { x: a.x - px, y: a.y - py };
  const bLeft = { x: b.x + px, y: b.y + py };
  const bRight = { x: b.x - px, y: b.y - py };
  addTriangle(triangles, aLeft, aRight, bRight, colour, alpha);
  addTriangle(triangles, aLeft, bRight, bLeft, colour, alpha);
}

function appendEllipseFan(triangles, options) {
  const segments = Math.max(5, options.segments ?? 7);
  const center = { x: options.x, y: options.y };
  const cos = Math.cos(options.rotation ?? 0);
  const sin = Math.sin(options.rotation ?? 0);
  const points = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const localX = Math.cos(angle) * options.radiusX;
    const localY = Math.sin(angle) * options.radiusY;
    points.push({ x: center.x + localX * cos - localY * sin, y: center.y + localX * sin + localY * cos });
  }
  for (let index = 0; index < points.length; index += 1) {
    addTriangle(triangles, center, points[index], points[(index + 1) % points.length], options.centerColor ?? options.color, options.alpha);
  }
}

function toWorld(point, frame) { return { x: frame.cx + point.x * frame.w, y: frame.baseY - point.y * frame.h }; }
function addTriangle(triangles, a, b, c, colour, alpha) {
  triangles.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, cx: c.x, cy: c.y, color: withAlpha(parseWebGLColor(colour, [0.38, 0.42, 0.4, 1]), clamp01(alpha)) });
}
function mixColour(a, b, amount) {
  const left = parseWebGLColor(a, [0.38, 0.42, 0.4, 1]);
  const right = parseWebGLColor(b, [0.38, 0.42, 0.4, 1]);
  const t = clamp01(amount);
  return [left[0] * (1 - t) + right[0] * t, left[1] * (1 - t) + right[1] * t, left[2] * (1 - t) + right[2] * t, left[3] * (1 - t) + right[3] * t];
}
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
