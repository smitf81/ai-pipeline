import * as THREE from 'three';
import { renderWorldPointToWorld3D } from '../../three/worldTransform3D.js';

export const THREE_CAMERA_VISIBILITY_FOCUS_CONTRACT = 'black-sky-bound.three-camera-visibility-focus.v1';

const MATERIAL_PATCH = Symbol('three-camera-visibility-focus');
const TRACE_INTERVAL_FRAMES = 3;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CROSS_SECTION_PATTERN = Object.freeze([
  [0, 0], [0.68, 0], [-0.68, 0], [0, 0.68], [0, -0.68],
  [0.48, 0.48], [-0.48, 0.48], [0.48, -0.48], [-0.48, -0.48]
]);

export class ThreeCameraVisibilityFocus {
  constructor(root, tileSize) {
    this.tileSize = tileSize;
    this.materials = new Set();
    this.occluders = [];
    this.raycaster = new THREE.Raycaster();
    this.lastBlockers = [];
    this.lastTraceCandidateCount = 0;
    this.framesSinceTrace = TRACE_INTERVAL_FRAMES;
    this.lastTraceTargetId = null;
    this.lastTraceStart = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
    this.lastTraceEnd = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
    this.scratchBox = new THREE.Box3();
    this.scratchPoint = new THREE.Vector3();
    this.scratchOrigin = new THREE.Vector3();
    this.intersections = [];
    this.viewFrame = {
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3()
    };
    this.light = new THREE.PointLight(0xd8e5d6, 0, 0, 2);
    this.light.name = 'camera-visibility-focus:readability-light';
    this.light.castShadow = false;
    this.light.visible = false;
    root.add(this.light);
    this.state = inactiveState('not_projected');
  }

  registerObject(object, metadata = {}) {
    if (!object || this.occluders.some((entry) => entry.object === object)) return 0;
    let registered = 0;
    object.userData.cameraVisibilityOccluder = true;
    object.updateWorldMatrix?.(true, true);
    object.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) if (this.registerMaterial(material)) registered += 1;
    });
    const bounds = new THREE.Box3().setFromObject(object);
    if (!bounds.isEmpty()) {
      this.occluders.push({
        object,
        bounds,
        id: String(metadata.id ?? object.userData.id ?? object.name ?? `occluder:${this.occluders.length}`),
        role: String(metadata.role ?? object.userData.renderKind ?? 'scenery')
      });
    }
    return registered;
  }

  clearOccluders() {
    this.occluders.length = 0;
    this.lastBlockers.length = 0;
    this.lastTraceTargetId = null;
    this.lastTraceCandidateCount = 0;
    this.framesSinceTrace = TRACE_INTERVAL_FRAMES;
    for (const material of this.materials) material[MATERIAL_PATCH].active.value = 0;
  }

  registerMaterial(material) {
    if (!material?.isMaterial || material[MATERIAL_PATCH]) return false;
    const uniforms = {
      active: { value: 0 },
      segmentStart: { value: new THREE.Vector3() },
      segmentEnd: { value: new THREE.Vector3() },
      radius: { value: 1 },
      feather: { value: 1 },
      minimumOpacity: { value: 1 }
    };
    const previousCompile = material.onBeforeCompile?.bind(material);
    const previousCacheKey = material.customProgramCacheKey?.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile?.(shader, renderer);
      patchShader(shader, uniforms);
    };
    material.customProgramCacheKey = () => `${previousCacheKey?.() ?? material.type}:camera-visibility-focus-v1`;
    material[MATERIAL_PATCH] = uniforms;
    material.userData.cameraVisibilityFocusPatched = true;
    material.needsUpdate = true;
    this.materials.add(material);
    return true;
  }

  update(packet, view = {}) {
    const active = packet?.active === true
      && Number.isFinite(packet.worldX)
      && Number.isFinite(packet.worldY);
    if (!active) {
      this.disableMaterials();
      this.light.visible = false;
      this.light.power = 0;
      this.framesSinceTrace = TRACE_INTERVAL_FRAMES;
      this.state = inactiveState(packet?.reason ?? 'projection_inactive', packet, this);
      return;
    }

    const center = renderWorldPointToWorld3D(packet.worldX, packet.worldY, this.tileSize, packet.focusHeightMeters);
    const radius = positive(packet.radiusMeters, 1.15);
    const feather = positive(packet.featherMeters, 0.3);
    const minimumOpacity = clamp(packet.minimumOccluderOpacity, 0.02, 0.55, 0.04);
    const lightPower = Math.max(0, Number(packet.readabilityLightPower) || 0);
    this.light.position.set(center.x, Math.max(0.35, center.y + 0.25), center.z);
    this.light.distance = positive(packet.readabilityLightDistanceMeters, radius + feather + 1.5);
    this.light.power = lightPower;
    this.light.visible = lightPower > 0;

    const frame = resolveViewFrame(view, center, this);
    if (!frame) {
      this.disableMaterials();
      this.state = {
        ...activeState(packet, center, radius, feather, minimumOpacity, lightPower, this.light.distance, this),
        occlusionActive: false,
        reason: 'camera_visibility_focus_view_missing',
        opacityMode: 'occlusion_trace_unavailable'
      };
      return;
    }

    this.framesSinceTrace += 1;
    const moved = frame.start.distanceToSquared(this.lastTraceStart) > 0.0144
      || frame.end.distanceToSquared(this.lastTraceEnd) > 0.0144;
    if (this.lastTraceTargetId !== packet.targetEntityId || moved || this.framesSinceTrace >= TRACE_INTERVAL_FRAMES) {
      const trace = this.traceBlockers(frame, radius, feather);
      this.lastBlockers = trace.blockers;
      this.lastTraceCandidateCount = trace.candidateCount;
      this.lastTraceTargetId = packet.targetEntityId;
      this.lastTraceStart.copy(frame.start);
      this.lastTraceEnd.copy(frame.end);
      this.framesSinceTrace = 0;
    }

    const activeMaterials = collectMaterials(this.lastBlockers);
    for (const material of this.materials) {
      const uniforms = material[MATERIAL_PATCH];
      uniforms.active.value = activeMaterials.has(material) ? 1 : 0;
      uniforms.segmentStart.value.copy(frame.start);
      uniforms.segmentEnd.value.copy(frame.end);
      uniforms.radius.value = radius;
      uniforms.feather.value = feather;
      uniforms.minimumOpacity.value = minimumOpacity;
    }
    this.state = {
      ...activeState(packet, center, radius, feather, minimumOpacity, lightPower, this.light.distance, this),
      occlusionActive: this.lastBlockers.length > 0,
      reason: this.lastBlockers.length > 0 ? null : 'camera_target_sightline_clear',
      sightlineStart: vectorState(frame.start),
      sightlineEnd: vectorState(frame.end),
      blockerObjectCount: this.lastBlockers.length,
      blockerIds: this.lastBlockers.map((entry) => entry.id),
      blockerRoles: [...new Set(this.lastBlockers.map((entry) => entry.role))],
      activeMaterialCount: activeMaterials.size,
      traceCandidateCount: this.lastTraceCandidateCount,
      crossSectionSampleCount: CROSS_SECTION_PATTERN.length,
      traceCadenceFrames: TRACE_INTERVAL_FRAMES,
      opacityMode: 'traced_orthographic_sightline_corridor_stable_dither'
    };
  }

  traceBlockers(frame, radius, feather) {
    const segmentLength = frame.start.distanceTo(frame.end);
    const targetClearance = Math.max(0.3, radius * 0.82);
    const traceDistance = Math.max(0, segmentLength - targetClearance);
    const broadRadius = radius + feather;
    const candidates = this.occluders.filter((entry) => {
      if (entry.object.visible === false) return false;
      this.scratchBox.copy(entry.bounds).expandByScalar(broadRadius);
      const intersection = this.raycaster.ray
        .set(frame.start, frame.direction)
        .intersectBox(this.scratchBox, this.scratchPoint);
      return intersection && frame.start.distanceToSquared(intersection) <= segmentLength * segmentLength;
    });
    const blockers = new Set();
    for (const [rightScale, upScale] of CROSS_SECTION_PATTERN) {
      this.scratchOrigin.copy(frame.start)
        .addScaledVector(frame.right, rightScale * radius)
        .addScaledVector(frame.up, upScale * radius);
      this.raycaster.set(this.scratchOrigin, frame.direction);
      this.raycaster.near = 0;
      this.raycaster.far = traceDistance;
      for (const entry of candidates) {
        if (blockers.has(entry)) continue;
        this.intersections.length = 0;
        this.raycaster.intersectObject(entry.object, true, this.intersections);
        if (this.intersections.length > 0) blockers.add(entry);
      }
    }
    return { blockers: [...blockers], candidateCount: candidates.length };
  }

  disableMaterials() {
    for (const material of this.materials) material[MATERIAL_PATCH].active.value = 0;
    this.lastBlockers.length = 0;
  }

  diagnostics() {
    return { ...this.state, patchedMaterialCount: this.materials.size, registeredOccluderCount: this.occluders.length };
  }

  dispose() {
    this.disableMaterials();
    this.occluders.length = 0;
    this.light.removeFromParent();
    this.materials.clear();
    this.state = inactiveState('disposed');
  }
}

function resolveViewFrame(view, center, owner) {
  if (!finiteVector(view?.cameraPosition) || !finiteVector(view?.cameraDirection)) return null;
  const frame = owner.viewFrame;
  const direction = frame.direction.copy(view.cameraDirection);
  if (direction.lengthSq() < 0.000001) return null;
  direction.normalize();
  const cameraPosition = view.cameraPosition;
  const depth = owner.scratchPoint.copy(center).sub(cameraPosition).dot(direction);
  if (!Number.isFinite(depth) || depth <= 0.1) return null;
  const right = frame.right;
  if (finiteVector(view.cameraRight) && view.cameraRight.lengthSq() > 0.000001) right.copy(view.cameraRight).normalize();
  else {
    right.crossVectors(direction, WORLD_UP);
    if (right.lengthSq() < 0.000001) right.set(1, 0, 0);
    else right.normalize();
  }
  const up = frame.up;
  if (finiteVector(view.cameraUp) && view.cameraUp.lengthSq() > 0.000001) up.copy(view.cameraUp).normalize();
  else up.crossVectors(right, direction).normalize();
  frame.start.copy(center).addScaledVector(direction, -depth);
  frame.end.copy(center);
  return frame;
}

function collectMaterials(blockers) {
  const result = new Set();
  for (const entry of blockers) {
    entry.object.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) if (material?.isMaterial) result.add(material);
    });
  }
  return result;
}

function patchShader(shader, uniforms) {
  Object.assign(shader.uniforms, {
    uCameraVisibilityFocusActive: uniforms.active,
    uCameraVisibilityFocusSegmentStart: uniforms.segmentStart,
    uCameraVisibilityFocusSegmentEnd: uniforms.segmentEnd,
    uCameraVisibilityFocusRadius: uniforms.radius,
    uCameraVisibilityFocusFeather: uniforms.feather,
    uCameraVisibilityFocusMinimumOpacity: uniforms.minimumOpacity
  });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vCameraVisibilityFocusWorldPosition;`)
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvCameraVisibilityFocusWorldPosition = worldPosition.xyz;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform float uCameraVisibilityFocusActive;
uniform vec3 uCameraVisibilityFocusSegmentStart;
uniform vec3 uCameraVisibilityFocusSegmentEnd;
uniform float uCameraVisibilityFocusRadius;
uniform float uCameraVisibilityFocusFeather;
uniform float uCameraVisibilityFocusMinimumOpacity;
varying vec3 vCameraVisibilityFocusWorldPosition;
float cameraVisibilityFocusNoise(vec2 position) {
  return fract(52.9829189 * fract(dot(position, vec2(0.06711056, 0.00583715))));
}`)
    .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
vec3 cameraVisibilityFocusSegment = uCameraVisibilityFocusSegmentEnd - uCameraVisibilityFocusSegmentStart;
float cameraVisibilityFocusSegmentLengthSq = max(0.0001, dot(cameraVisibilityFocusSegment, cameraVisibilityFocusSegment));
float cameraVisibilityFocusRawT = dot(vCameraVisibilityFocusWorldPosition - uCameraVisibilityFocusSegmentStart, cameraVisibilityFocusSegment) / cameraVisibilityFocusSegmentLengthSq;
float cameraVisibilityFocusT = clamp(cameraVisibilityFocusRawT, 0.0, 1.0);
vec3 cameraVisibilityFocusClosest = uCameraVisibilityFocusSegmentStart + cameraVisibilityFocusSegment * cameraVisibilityFocusT;
float cameraVisibilityFocusDistance = distance(vCameraVisibilityFocusWorldPosition, cameraVisibilityFocusClosest);
float cameraVisibilityFocusCorridor = 1.0 - smoothstep(
  uCameraVisibilityFocusRadius,
  uCameraVisibilityFocusRadius + max(0.001, uCameraVisibilityFocusFeather),
  cameraVisibilityFocusDistance
);
float cameraVisibilityFocusSegmentGate = step(0.0, cameraVisibilityFocusRawT) * step(cameraVisibilityFocusRawT, 1.0);
float cameraVisibilityFocusOpacity = mix(
  1.0,
  uCameraVisibilityFocusMinimumOpacity,
  cameraVisibilityFocusCorridor * cameraVisibilityFocusSegmentGate * uCameraVisibilityFocusActive
);
if (cameraVisibilityFocusNoise(gl_FragCoord.xy) > cameraVisibilityFocusOpacity) discard;`);
}

function activeState(packet, center, radius, feather, minimumOpacity, lightPower, lightDistance, owner) {
  return {
    contract: THREE_CAMERA_VISIBILITY_FOCUS_CONTRACT,
    active: true,
    reason: null,
    targetEntityId: packet.targetEntityId,
    targetKind: packet.targetKind,
    targetSource: packet.targetSource,
    sourceProfileId: packet.sourceProfileId,
    center: vectorState(center),
    radiusMeters: radius,
    featherMeters: feather,
    minimumOccluderOpacity: minimumOpacity,
    readabilityLightPower: lightPower,
    readabilityLightDistanceMeters: lightDistance,
    patchedMaterialCount: owner.materials.size,
    registeredOccluderCount: owner.occluders.length
  };
}

function inactiveState(reason, packet = null, owner = null) {
  return {
    contract: THREE_CAMERA_VISIBILITY_FOCUS_CONTRACT,
    active: false,
    occlusionActive: false,
    reason,
    targetEntityId: packet?.targetEntityId ?? null,
    targetSource: packet?.targetSource ?? null,
    blockerObjectCount: 0,
    blockerIds: [],
    activeMaterialCount: 0,
    patchedMaterialCount: owner?.materials.size ?? 0,
    registeredOccluderCount: owner?.occluders.length ?? 0,
    opacityMode: 'traced_orthographic_sightline_corridor_stable_dither'
  };
}

function finiteVector(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function positive(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function vectorState(value) { return { x: round(value.x), y: round(value.y), z: round(value.z) }; }
function round(value) { return Number(Number(value).toFixed(3)); }
