import * as THREE from 'three';
import { RENDER_BUDGETS } from '../../../data/renderBudgets.js';

export function prewarmThreeAtmosphere(layer) {
  const rain = layer.ensureInstanced('rain', RENDER_BUDGETS.atmosphericCameraOverlay.maxRainStreaks, 'rain-streak', rainGeometry, '#b9ccd4', { transparent: true, depthWrite: false });
  const sparks = createSparkField(layer);
  if (rain) { rain.count = 0; rain.visible = false; }
  sparks.visible = false;
}

export function updateThreeAtmosphericRain(layer, packet, actors, view = {}) {
  const density = packet?.enabled === false || packet?.tuning?.rainEnabled === false ? 0 : clamp01(packet?.tuning?.rainDensity);
  const count = Math.round(RENDER_BUDGETS.atmosphericCameraOverlay.maxRainStreaks * density);
  const player = actors.find((actor) => actor.team === 'player' && actor.alive) ?? actors[0];
  const mesh = layer.ensureInstanced('rain', count, 'rain-streak', rainGeometry, '#b9ccd4', { transparent: true, depthWrite: false });
  const centerX = Number.isFinite(Number(view.cameraTarget?.x)) ? Number(view.cameraTarget.x) : Number(player?.x) * 0.5;
  const centerZ = Number.isFinite(Number(view.cameraTarget?.z)) ? Number(view.cameraTarget.z) : Number(player?.y) * 0.5;
  if (!mesh || !Number.isFinite(centerX) || !Number.isFinite(centerZ) || !count) return 0;
  updateMaterial(mesh.material, '#b9ccd4', { opacity: 0.46 * Number(packet?.tuning?.overlayOpacity ?? 1), transparent: true, depthWrite: false });
  const renderTime = Number(packet.renderTime ?? 0);
  const speed = Math.max(1.1, Number(packet?.tuning?.rainSpeed ?? 1180) / 300);
  const angle = Number(packet?.tuning?.rainAngle ?? 16) * Math.PI / 180;
  layer.quaternion.setFromEuler(new THREE.Euler(0, 0, angle));
  for (let index = 0; index < count; index += 1) {
    const phase = fract(hash01(index, 3) + renderTime * speed / 6);
    layer.scale.set(1, 0.78 + hash01(index, 41) * 0.92, 1);
    layer.position.set(centerX + (hash01(index, 11) - 0.5) * 13, 0.16 + (1 - phase) * 5.8, centerZ + (hash01(index, 23) - 0.5) * 13);
    layer.matrix.compose(layer.position, layer.quaternion, layer.scale);
    mesh.setMatrixAt(index, layer.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return count;
}

export function updateThreeAtmosphericSparks(layer, packet, actors, view = {}) {
  const rate = packet?.enabled === false || packet?.tuning?.sparkEnabled === false ? 0 : Math.max(0, Number(packet?.tuning?.sparkRate ?? 0));
  const player = actors.find((actor) => actor.team === 'player' && actor.alive) ?? actors[0];
  const points = layer.atmosphereSparkField;
  const centerX = Number.isFinite(Number(view.cameraTarget?.x)) ? Number(view.cameraTarget.x) : Number(player?.x) * 0.5;
  const centerZ = Number.isFinite(Number(view.cameraTarget?.z)) ? Number(view.cameraTarget.z) : Number(player?.y) * 0.5;
  if (!points || !Number.isFinite(centerX) || !Number.isFinite(centerZ) || rate <= 0) return hideSparkField(layer, rate);
  const renderTime = Number(packet?.renderTime ?? 0);
  const frustumHeight = Math.max(6, Number(view.frustumHeight ?? 10));
  const frustumWidth = Math.max(frustumHeight, Number(view.camera?.right) - Number(view.camera?.left) || frustumHeight * 1.6);
  const directionX = Number(view.cameraDirection?.x ?? -0.7);
  const directionY = Number(view.cameraDirection?.y ?? -0.7);
  const directionZ = Number(view.cameraDirection?.z ?? -0.7);
  const upX = Number(view.cameraUp?.x ?? -0.54);
  const upY = Number(view.cameraUp?.y ?? 0.64);
  const upZ = Number(view.cameraUp?.z ?? -0.54);
  const rightX = Number(view.cameraRight?.x ?? 0.707);
  const rightY = Number(view.cameraRight?.y ?? 0);
  const rightZ = Number(view.cameraRight?.z ?? -0.707);
  const driftX = Number(packet?.tuning?.sparkDrift?.x ?? -42) / 900 * frustumHeight;
  const riseScale = Math.max(0.6, -Number(packet?.tuning?.sparkDrift?.y ?? -150) / 150);
  const centerY = Number(view.cameraTarget?.y ?? 0);
  const lowerEdge = frustumHeight * 0.5;
  const capacity = RENDER_BUDGETS.atmosphericCameraOverlay.maxSparkPool;
  const cycle = Math.max(1.2, capacity / rate);
  const positions = points.geometry.getAttribute('position');
  const sizes = points.geometry.getAttribute('aSize');
  const alphas = points.geometry.getAttribute('aAlpha');
  const warmth = points.geometry.getAttribute('aWarmth');
  let count = 0;
  let maxPointSizePx = 0;
  for (let index = 0; index < capacity; index += 1) {
    const lifetime = 0.7 + hash01(index, 127) * 0.72;
    const activeWindow = lifetime / cycle;
    const phase = fract((renderTime + hash01(index, 109) * cycle) / cycle);
    if (phase > activeWindow) continue;
    const life = clamp01(phase / activeWindow);
    const fade = Math.pow(Math.sin(life * Math.PI), 1.35);
    if (fade <= 0.01) continue;
    const spread = (hash01(index, 137) - 0.5) * frustumWidth * 0.94 + driftX * life;
    const depth = 0.32 + hash01(index, 149) * 0.18;
    const rise = life * frustumHeight * (0.12 + hash01(index, 181) * 0.07) * riseScale;
    const wobble = Math.sin(life * Math.PI * 2.4 + hash01(index, 191) * 13) * frustumHeight * (0.004 + hash01(index, 197) * 0.008);
    const belowFrame = frustumHeight * (0.012 + hash01(index, 211) * 0.04);
    positions.setXYZ(count,
      centerX - upX * (lowerEdge + belowFrame) + rightX * (spread + wobble) + upX * rise - directionX * depth,
      centerY - upY * (lowerEdge + belowFrame) + rightY * (spread + wobble) + upY * rise - directionY * depth,
      centerZ - upZ * (lowerEdge + belowFrame) + rightZ * (spread + wobble) + upZ * rise - directionZ * depth
    );
    const bright = hash01(index, 223) > 0.86;
    const pointSizePx = (bright ? 5.6 : 3.2 + hash01(index, 227) * 1.6) * (0.78 + fade * 0.22);
    sizes.setX(count, pointSizePx);
    alphas.setX(count, Math.min(0.72, Number(packet?.tuning?.overlayOpacity ?? 1) * fade * (bright ? 0.7 : 0.42 + hash01(index, 229) * 0.12)));
    warmth.setX(count, hash01(index, 233));
    maxPointSizePx = Math.max(maxPointSizePx, pointSizePx);
    count += 1;
  }
  for (const attribute of [positions, sizes, alphas, warmth]) attribute.needsUpdate = true;
  points.geometry.setDrawRange(0, count);
  points.visible = count > 0;
  layer.atmosphereSparkStats = sparkStats(rate, count, maxPointSizePx);
  return count;
}

function rainGeometry() { return new THREE.CylinderGeometry(0.007, 0.013, 0.62, 4, 1); }

function createSparkField(layer) {
  const capacity = RENDER_BUDGETS.atmosphericCameraOverlay.maxSparkPool;
  const geometry = layer.geometry('atmosphere-spark-soft-points', () => {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', dynamicAttribute(capacity, 3));
    result.setAttribute('aSize', dynamicAttribute(capacity, 1));
    result.setAttribute('aAlpha', dynamicAttribute(capacity, 1));
    result.setAttribute('aWarmth', dynamicAttribute(capacity, 1));
    result.setDrawRange(0, 0);
    return result;
  });
  const material = new THREE.ShaderMaterial({
    vertexShader: `attribute float aSize; attribute float aAlpha; attribute float aWarmth; varying float vAlpha; varying float vWarmth; void main() { vAlpha = aAlpha; vWarmth = aWarmth; gl_PointSize = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vAlpha; varying float vWarmth; void main() { float d = length(gl_PointCoord - vec2(0.5)) * 2.0; float halo = 1.0 - smoothstep(0.16, 1.0, d); float core = 1.0 - smoothstep(0.04, 0.34, d); float alpha = vAlpha * (halo * 0.28 + core * 0.88); if (alpha < 0.012) discard; vec3 ember = mix(vec3(1.0, 0.34, 0.08), vec3(1.0, 0.58, 0.18), vWarmth); vec3 colour = mix(ember, vec3(1.0, 0.9, 0.62), core); gl_FragColor = vec4(colour, alpha); }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'effects:atmosphere-sparks:soft-motes';
  points.frustumCulled = false;
  points.renderOrder = 4;
  layer.root.add(points);
  layer.ownedMaterials.add(material);
  layer.allocations += 1;
  layer.atmosphereSparkField = points;
  layer.atmosphereSparkStats = sparkStats(0, 0, 0);
  return points;
}

function dynamicAttribute(count, itemSize) {
  return new THREE.BufferAttribute(new Float32Array(count * itemSize), itemSize).setUsage(THREE.DynamicDrawUsage);
}

function hideSparkField(layer, rate) {
  const points = layer.atmosphereSparkField;
  if (points) {
    points.geometry.setDrawRange(0, 0);
    points.visible = false;
  }
  layer.atmosphereSparkStats = sparkStats(rate, 0, 0);
  return 0;
}

function sparkStats(rate, count, maxPointSizePx) {
  return {
    activeCount: count,
    spawnRate: Number(rate.toFixed(3)),
    poolCapacity: RENDER_BUDGETS.atmosphericCameraOverlay.maxSparkPool,
    cadencePolicy: 'pre_3d_spawn_rate_lifetime_window_v0',
    primitive: 'soft_round_glowing_point_mote',
    motion: 'short_lived_lazy_upward_drift',
    maxPointSizePx: Number(maxPointSizePx.toFixed(3)),
    triangleFallbacks: 0
  };
}
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function fract(value) { return value - Math.floor(value); }
function hash01(index, salt) { return fract(Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453); }

function updateMaterial(material, colour, options = {}) {
  const opacity = options.opacity ?? 1;
  const transparent = options.transparent ?? opacity < 0.999;
  const depthWrite = options.depthWrite ?? !transparent;
  const depthTest = options.depthTest ?? material.depthTest;
  const renderStateChanged = material.transparent !== transparent
    || material.depthWrite !== depthWrite
    || material.depthTest !== depthTest;
  material.color.set(colour);
  material.emissive.set(options.emissive ?? 0x000000);
  material.emissiveIntensity = options.emissive ? 4 : 0;
  material.opacity = opacity;
  material.transparent = transparent;
  material.depthWrite = depthWrite;
  material.depthTest = depthTest;
  if (renderStateChanged) material.needsUpdate = true;
}
