import * as THREE from 'three';

export const THREE_FIXED_ISOMETRIC_RENDER_ENVELOPE_CONTRACT = 'black-sky-bound.fixed-isometric-render-envelope.v1';
export const RenderEnvelopeClass = Object.freeze({
  VISIBLE: 'visible',
  MARGIN: 'margin',
  CULLED: 'culled'
});

export class ThreeFixedIsometricRenderEnvelope {
  constructor(options = {}) {
    this.options = resolveRenderEnvelopeOptions(options, options.search);
    this.entries = new Map();
    this.scratchPoint = new THREE.Vector3();
    this.projectedBounds = {};
    this.viewDirection = new THREE.Vector3();
    this.visibleGroundPolygon = createPolygon();
    this.marginGroundPolygon = createPolygon();
    this.transitionCount = 0;
    this.stats = emptyStats(this.options);
  }

  register(object, { kind = 'scenery', id = object?.name ?? 'unnamed', bounds = null } = {}) {
    if (!object?.isObject3D) throw new Error(`render_envelope_object_required:${id}`);
    object.updateWorldMatrix(true, true);
    const worldBounds = bounds?.isBox3 ? bounds.clone() : new THREE.Box3().setFromObject(object, true);
    if (worldBounds.isEmpty()) throw new Error(`render_envelope_bounds_empty:${id}`);
    const entry = {
      object,
      id: String(id),
      kind: String(kind),
      bounds: worldBounds,
      ownerVisible: object.visible !== false,
      classification: null
    };
    this.entries.set(object, entry);
    return entry;
  }

  setOwnerVisible(object, visible) {
    const entry = this.entries.get(object);
    if (!entry) return false;
    entry.ownerVisible = !!visible;
    entry.object.visible = entry.ownerVisible && entry.classification !== RenderEnvelopeClass.CULLED;
    return entry.object.visible;
  }

  clear() {
    this.entries.clear();
    this.transitionCount = 0;
    this.stats = emptyStats(this.options);
  }

  update(camera) {
    if (!camera?.isOrthographicCamera) throw new Error('render_envelope_orthographic_camera_required');
    camera.updateMatrixWorld();
    const margin = this.options.enabled ? this.options.safetyMarginMeters : 0;
    const visibleRange = cameraRange(camera, 0);
    const marginRange = cameraRange(camera, margin);
    const counts = createCounts();
    const byKind = {};
    let changed = 0;

    for (const entry of this.entries.values()) {
      const projected = projectBoxToCamera(entry.bounds, camera.matrixWorldInverse, this.scratchPoint, this.projectedBounds);
      const classification = !this.options.enabled || intersectsRange(projected, visibleRange)
        ? RenderEnvelopeClass.VISIBLE
        : intersectsRange(projected, marginRange)
          ? RenderEnvelopeClass.MARGIN
          : RenderEnvelopeClass.CULLED;
      counts.total += 1;
      counts[classification] += 1;
      const kindCounts = byKind[entry.kind] ?? (byKind[entry.kind] = createCounts());
      kindCounts.total += 1;
      kindCounts[classification] += 1;
      if (entry.classification !== classification) {
        entry.classification = classification;
        changed += 1;
        this.transitionCount += 1;
      }
      entry.object.visible = entry.ownerVisible && classification !== RenderEnvelopeClass.CULLED;
    }

    updateGroundPolygon(this.visibleGroundPolygon, camera, 0, this.viewDirection);
    updateGroundPolygon(this.marginGroundPolygon, camera, margin, this.viewDirection);
    this.stats = {
      contract: THREE_FIXED_ISOMETRIC_RENDER_ENVELOPE_CONTRACT,
      classification: 'derived_render_budget_gate',
      enabled: this.options.enabled,
      policy: this.options.policy,
      safetyMarginMeters: this.options.safetyMarginMeters,
      chunkSizeTiles: this.options.chunkSizeTiles,
      totalRenderables: counts.total,
      visible: counts.visible,
      margin: counts.margin,
      culled: counts.culled,
      rendered: counts.visible + counts.margin,
      culledRatio: counts.total ? round(counts.culled / counts.total) : 0,
      changedThisFrame: changed,
      transitionCount: this.transitionCount,
      byKind,
      visibleGroundPolygon: this.visibleGroundPolygon,
      marginGroundPolygon: this.marginGroundPolygon
    };
    return changed;
  }

  diagnostics() {
    return {
      ...this.stats,
      byKind: cloneCountsByKind(this.stats.byKind),
      visibleGroundPolygon: clonePolygon(this.visibleGroundPolygon),
      marginGroundPolygon: clonePolygon(this.marginGroundPolygon)
    };
  }
}

export function resolveRenderEnvelopeOptions(options = {}, search = '') {
  const params = new URLSearchParams(search ?? '');
  const enabledParam = params.get(options.queryToggle ?? 'renderEnvelope');
  const enabled = enabledParam == null
    ? options.enabled !== false
    : !['0', 'off', 'false'].includes(enabledParam.toLowerCase());
  return Object.freeze({
    enabled,
    policy: options.policy ?? 'fixed_isometric_camera_space_inner_plus_safety_envelope_v1',
    safetyMarginMeters: finiteClamped(
      params.get(options.queryMargin ?? 'renderEnvelopeMargin'),
      options.safetyMarginMeters ?? 1.5,
      0,
      12
    ),
    chunkSizeTiles: Math.round(finiteClamped(
      params.get(options.queryChunkSize ?? 'renderEnvelopeChunkTiles'),
      options.chunkSizeTiles ?? 24,
      4,
      256
    ))
  });
}

function projectBoxToCamera(box, matrixWorldInverse, point, target) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let index = 0; index < 8; index += 1) {
    point.set(
      index & 1 ? box.max.x : box.min.x,
      index & 2 ? box.max.y : box.min.y,
      index & 4 ? box.max.z : box.min.z
    ).applyMatrix4(matrixWorldInverse);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }
  target.minX = minX;
  target.minY = minY;
  target.minZ = minZ;
  target.maxX = maxX;
  target.maxY = maxY;
  target.maxZ = maxZ;
  return target;
}

function cameraRange(camera, margin) {
  return {
    left: camera.left - margin,
    right: camera.right + margin,
    bottom: camera.bottom - margin,
    top: camera.top + margin,
    near: -camera.far,
    far: -camera.near
  };
}

function intersectsRange(box, range) {
  return box.maxX >= range.left && box.minX <= range.right
    && box.maxY >= range.bottom && box.minY <= range.top
    && box.maxZ >= range.near && box.minZ <= range.far;
}

function updateGroundPolygon(target, camera, margin, direction) {
  camera.getWorldDirection(direction);
  for (let index = 0; index < 4; index += 1) {
    const x = index === 0 || index === 3 ? camera.left - margin : camera.right + margin;
    const y = index < 2 ? camera.bottom - margin : camera.top + margin;
    const origin = target[index];
    origin.set(x, y, -camera.near).applyMatrix4(camera.matrixWorld);
    const distance = Math.abs(direction.y) > 1e-6 ? -origin.y / direction.y : 0;
    origin.addScaledVector(direction, distance);
    origin.y = 0;
  }
}

function createPolygon() { return Array.from({ length: 4 }, () => new THREE.Vector3()); }
function clonePolygon(points) { return (points ?? []).map((point) => ({ x: round(point.x), z: round(point.z) })); }
function createCounts() { return { total: 0, visible: 0, margin: 0, culled: 0 }; }
function cloneCountsByKind(value = {}) { return Object.fromEntries(Object.entries(value).map(([key, counts]) => [key, { ...counts }])); }
function emptyStats(options) {
  return {
    contract: THREE_FIXED_ISOMETRIC_RENDER_ENVELOPE_CONTRACT,
    classification: 'derived_render_budget_gate',
    enabled: options.enabled,
    policy: options.policy,
    safetyMarginMeters: options.safetyMarginMeters,
    chunkSizeTiles: options.chunkSizeTiles,
    totalRenderables: 0,
    visible: 0,
    margin: 0,
    culled: 0,
    rendered: 0,
    culledRatio: 0,
    changedThisFrame: 0,
    transitionCount: 0,
    byKind: {},
    visibleGroundPolygon: [],
    marginGroundPolygon: []
  };
}
function finiteClamped(value, fallback, min, max) {
  const number = value == null || value === '' ? Number(fallback) : Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : Number(fallback)));
}
function round(value) { return Math.round(Number(value) * 1000) / 1000; }
