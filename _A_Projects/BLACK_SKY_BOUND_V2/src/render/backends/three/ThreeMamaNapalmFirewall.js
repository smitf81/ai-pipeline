import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';
import { createMamaNapalmSmokeMaterial } from './ThreeMamaNapalmSmokeMaterial.js';

export const THREE_MAMA_NAPALM_FIREWALL_CONTRACT = 'black-sky-bound.three-mama-napalm-firewall.v2';

const WALL_CAPACITY = 4;
const FUEL_NODES_PER_WALL = 13;
const FLAME_MASSES_PER_WALL = 8;
const SMOKE_NODES_PER_WALL = 7;
const EMBERS_PER_WALL = 28;
const IDENTITY = new THREE.Quaternion();
const LOCAL_Z = new THREE.Vector3(0, 0, 1);
const FLAME_LAYOUT = Object.freeze([
  Object.freeze({ t: 0.1, role: 2 }),
  Object.freeze({ t: 0.23, role: 1 }),
  Object.freeze({ t: 0.35, role: 0 }),
  Object.freeze({ t: 0.43, role: 2 }),
  Object.freeze({ t: 0.58, role: 1 }),
  Object.freeze({ t: 0.67, role: 0 }),
  Object.freeze({ t: 0.78, role: 2 }),
  Object.freeze({ t: 0.91, role: 1 })
]);

export function isMamaInfernoSmoke(packet) {
  return packet?.sourceKind === 'mama_inferno_wall_smoke';
}

export class ThreeMamaNapalmFirewall {
  constructor(root, tileSize) {
    this.root = new THREE.Group();
    this.root.name = 'three:mama-liquid-napalm-firewall';
    this.root.userData.contract = THREE_MAMA_NAPALM_FIREWALL_CONTRACT;
    root.add(this.root);
    this.tileSize = tileSize;
    this.matrix = new THREE.Matrix4();
    this.position = new THREE.Vector3();
    this.scale = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.billboardQuaternion = new THREE.Quaternion();
    this.leanQuaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.start = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.tangent = new THREE.Vector3();
    this.lateral = new THREE.Vector3();

    const flameCapacity = WALL_CAPACITY * FLAME_MASSES_PER_WALL;
    const smokeCapacity = WALL_CAPACITY * SMOKE_NODES_PER_WALL;
    this.geometries = [
      createGroundPoolGeometry(22),
      createBillboardGeometry('aFlameParams', flameCapacity),
      createBillboardGeometry('aSmokeParams', smokeCapacity),
      new THREE.IcosahedronGeometry(1, 0)
    ];
    this.materials = createMaterials();
    this.scorch = this.batch('scorch-residue', this.geometries[0], this.materials.scorch, WALL_CAPACITY * FUEL_NODES_PER_WALL, 1);
    this.fuel = this.batch('liquid-fuel-pools', this.geometries[0], this.materials.fuel, WALL_CAPACITY * FUEL_NODES_PER_WALL, 2);
    this.flames = this.batch('rolling-sdf-flame-masses', this.geometries[1], this.materials.flame, flameCapacity, 5);
    this.smoke = this.batch('entwined-fuel-smoke-plumes', this.geometries[2], this.materials.smoke, smokeCapacity, 6);
    this.embers = this.batch('lifted-embers', this.geometries[3], this.materials.ember, WALL_CAPACITY * EMBERS_PER_WALL, 7);
    this.flameParams = this.geometries[1].getAttribute('aFlameParams');
    this.smokeParams = this.geometries[2].getAttribute('aSmokeParams');
    this.stats = emptyStats();
  }

  update(walls = [], renderTime = 0, view = {}) {
    const counts = { scorch: 0, fuel: 0, flame: 0, smoke: 0, ember: 0 };
    const phases = { ground_ignition: 0, sustain_firewall: 0, decay_aftermath: 0 };
    this.materials.flame.uniforms.uTime.value = renderTime;
    this.materials.smoke.uniforms.uTime.value = renderTime;
    if (view.camera?.quaternion) this.billboardQuaternion.copy(view.camera.quaternion);
    else this.billboardQuaternion.identity();

    for (const wall of walls.slice(0, WALL_CAPACITY)) {
      const phase = firewallPhase(wall);
      phases[phase] += 1;
      this.writeWall(wall, renderTime, counts);
    }
    this.flush(this.scorch, counts.scorch);
    this.flush(this.fuel, counts.fuel);
    this.flush(this.flames, counts.flame);
    this.flush(this.smoke, counts.smoke);
    this.flush(this.embers, counts.ember);
    this.flameParams.needsUpdate = true;
    this.smokeParams.needsUpdate = true;
    this.stats = buildStats(walls, counts, phases);
  }

  writeWall(wall, renderTime, counts) {
    this.worldPoint(this.start, wall.worldAx, wall.worldAy, 0);
    this.worldPoint(this.end, wall.worldBx, wall.worldBy, 0);
    this.tangent.subVectors(this.end, this.start);
    const length = Math.max(0.001, this.tangent.length());
    this.tangent.multiplyScalar(1 / length);
    this.lateral.set(-this.tangent.z, 0, this.tangent.x);
    const heading = -Math.atan2(this.tangent.z, this.tangent.x);
    const fuelSpacing = length / FUEL_NODES_PER_WALL;
    const flameSpacing = length / FLAME_MASSES_PER_WALL;
    const halfWidth = Math.max(0.18, pixelsToMeters(wall.worldWidth, this.tileSize) * 0.52);
    const age = Math.max(0, Number(wall.age) || 0);
    const life = clamp01(wall.life01 ?? 1 - age / Math.max(0.001, Number(wall.lifetime) || 18));
    const lifecycleFade = smoothstep(0.025, 0.24, life);
    const decay = 1 - smoothstep(0.08, 0.34, life);
    const spread = 0.7 + smoothstep(0, 1.05, age) * 0.3;

    for (let index = 0; index < FUEL_NODES_PER_WALL; index += 1) {
      const seed = numericSeed(`${wall.id}:fuel:${index}`);
      const t = (index + 0.5) / FUEL_NODES_PER_WALL;
      const lateralOffset = (seed - 0.5) * halfWidth * 0.72;
      this.position.copy(this.start).lerp(this.end, t).addScaledVector(this.lateral, lateralOffset);
      const poolLength = fuelSpacing * (0.72 + seed * 0.5) * spread;
      const poolWidth = halfWidth * (0.56 + fract(seed * 8.37) * 0.55) * spread;
      this.quaternion.setFromEuler(this.euler.set(0, heading + (seed - 0.5) * 0.22, 0));

      this.position.y = 0.018;
      this.scale.set(poolLength * 1.13, 1, poolWidth * 1.14);
      this.write(this.scorch, counts.scorch, this.position, this.quaternion, this.scale);
      counts.scorch += 1;

      const activationStart = 0.04 + t * 0.58 + fract(seed * 13.7) * 0.19;
      const ignition = smoothstep(activationStart, activationStart + 0.34, age);
      const surge = 0.78 + Math.sin(renderTime * (5.4 + seed * 1.8) + seed * 41) * 0.22;
      const heat = clamp01(ignition * lifecycleFade * surge);
      this.position.y = 0.028;
      this.scale.set(poolLength, 1, poolWidth * (0.86 + heat * 0.2));
      this.write(this.fuel, counts.fuel, this.position, this.quaternion, this.scale);
      counts.fuel += 1;
    }

    for (let index = 0; index < FLAME_LAYOUT.length; index += 1) {
      const layout = FLAME_LAYOUT[index];
      const seed = numericSeed(`${wall.id}:rolling-flame:${index}`);
      const t = clamp01(layout.t + (seed - 0.5) * 0.028);
      const ignitionStart = 0.05 + t * 0.6 + fract(seed * 17.3) * 0.17;
      const ignition = smoothstep(ignitionStart, ignitionStart + 0.4, age);
      const surge = 0.82 + Math.sin(renderTime * (2.35 + seed * 0.72) + seed * 31) * 0.18;
      const heat = clamp01(ignition * lifecycleFade * surge) * (1 - decay * 0.52);
      if (heat <= 0.035) continue;

      const roleWidth = layout.role === 2 ? 0.98 : layout.role === 1 ? 0.82 : 0.76;
      const roleHeight = layout.role === 2 ? 1.68 : layout.role === 1 ? 1.28 : 0.92;
      const halfSpan = Math.max(halfWidth * (layout.role === 2 ? 1.7 : 1.32), flameSpacing * roleWidth);
      const height = (roleHeight + seed * (layout.role === 2 ? 0.46 : 0.34)) * (0.72 + heat * 0.3);
      const lateralOffset = (seed - 0.5) * halfWidth * 0.55;
      const lean = Math.sin(renderTime * (1.55 + seed * 0.55) + seed * 23) * (layout.role === 2 ? 0.095 : 0.065);
      this.position.copy(this.start).lerp(this.end, t).addScaledVector(this.lateral, lateralOffset);
      this.position.y = 0.035;
      this.quaternion.copy(this.billboardQuaternion);
      this.leanQuaternion.setFromAxisAngle(LOCAL_Z, lean);
      this.quaternion.multiply(this.leanQuaternion);
      this.scale.set(halfSpan, Math.max(0.12, height), 1);
      this.write(this.flames, counts.flame, this.position, this.quaternion, this.scale);
      this.flameParams.setXYZW(counts.flame, seed, layout.role, heat, layout.role === 2 && (index === 0 || index === 6) ? 1 : 0);
      counts.flame += 1;
    }

    for (let index = 0; index < SMOKE_NODES_PER_WALL; index += 1) {
      const seed = numericSeed(`${wall.id}:smoke:${index}`);
      const t = (index + 0.45) / SMOKE_NODES_PER_WALL;
      const ignition = smoothstep(0.28 + t * 0.34, 0.94 + t * 0.28, age);
      const smokeMaturity = smoothstep(0.7, 3.4, age);
      const smokeStrength = clamp01(ignition * lifecycleFade * (0.64 + smokeMaturity * 0.36));
      if (smokeStrength <= 0.035) continue;
      const sway = Math.sin(renderTime * (0.58 + seed * 0.24) + seed * 35);
      const lift = fract(renderTime * 0.08 + seed * 3.7);
      this.position.copy(this.start).lerp(this.end, t)
        .addScaledVector(this.lateral, (seed - 0.5) * halfWidth * 0.65 + sway * 0.08);
      this.position.y = 0.24 + lift * (0.22 + decay * 0.22);
      this.quaternion.copy(this.billboardQuaternion);
      this.leanQuaternion.setFromAxisAngle(LOCAL_Z, sway * 0.055);
      this.quaternion.multiply(this.leanQuaternion);
      const smokeHalfSpan = Math.max(length / SMOKE_NODES_PER_WALL * (0.78 + smokeMaturity * 0.18), halfWidth * (1.24 + seed * 0.38));
      const smokeHeight = (1.62 + seed * 0.88) * (0.76 + smokeMaturity * 0.4 + decay * 0.3);
      this.scale.set(smokeHalfSpan, smokeHeight, 1);
      this.write(this.smoke, counts.smoke, this.position, this.quaternion, this.scale);
      this.smokeParams.setXYZW(counts.smoke, seed, smokeStrength, decay, smokeMaturity);
      counts.smoke += 1;
    }

    const emberLimit = Math.round(EMBERS_PER_WALL * lifecycleFade * (0.62 + (1 - decay) * 0.38));
    for (let index = 0; index < emberLimit; index += 1) {
      const seed = numericSeed(`${wall.id}:ember:${index}`);
      const t = fract(seed * 19.31 + index / EMBERS_PER_WALL * 0.73);
      const lift = fract(renderTime * (0.28 + seed * 0.22) + seed * 7.1);
      this.position.copy(this.start).lerp(this.end, t)
        .addScaledVector(this.lateral, (seed - 0.5) * halfWidth * (1.2 + lift));
      this.position.y = 0.12 + lift * (0.62 + seed * 0.74);
      this.scale.setScalar((0.012 + fract(seed * 31.9) * 0.022) * (1 - lift * 0.55));
      this.matrix.compose(this.position, IDENTITY, this.scale);
      this.embers.setMatrixAt(counts.ember, this.matrix);
      counts.ember += 1;
    }
  }

  beginScreenWarmup() {
    const restores = [];
    for (const mesh of [this.scorch, this.fuel, this.flames, this.smoke, this.embers]) {
      const count = mesh.count;
      const visible = mesh.visible;
      const opacity = mesh.material.opacity;
      const materialOpacity = mesh.material.uniforms?.uMaterialOpacity?.value;
      mesh.setMatrixAt(0, this.matrix.identity());
      mesh.count = 1;
      mesh.visible = true;
      mesh.material.opacity = 0;
      if (mesh.material.uniforms?.uMaterialOpacity) mesh.material.uniforms.uMaterialOpacity.value = 0;
      mesh.instanceMatrix.needsUpdate = true;
      restores.push(() => {
        mesh.count = count;
        mesh.visible = visible;
        mesh.material.opacity = opacity;
        if (mesh.material.uniforms?.uMaterialOpacity) mesh.material.uniforms.uMaterialOpacity.value = materialOpacity;
      });
    }
    return () => { for (const restore of restores.reverse()) restore(); };
  }

  write(mesh, index, position, quaternion, scale) {
    this.matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, this.matrix);
  }

  flush(mesh, count) {
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.needsUpdate = true;
  }

  batch(name, geometry, material, capacity, renderOrder) {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `mama-napalm:${name}`;
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(mesh);
    return mesh;
  }

  worldPoint(target, worldX, worldY, height) {
    return target.set(
      Number(worldX) / this.tileSize * WORLD_SCALE.tileMeters,
      Number(height) || 0,
      Number(worldY) / this.tileSize * WORLD_SCALE.tileMeters
    );
  }

  diagnostics() { return { ...this.stats, phaseCounts: { ...this.stats.phaseCounts } }; }

  dispose() {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}

function createGroundPoolGeometry(segments) {
  const positions = [0, 0, 0];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const radius = 0.82 + Math.sin(index * 4.17) * 0.12 + Math.cos(index * 2.31) * 0.06;
    positions.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    if (index > 0) indices.push(0, index, index + 1);
  }
  return finishGeometry(positions, indices);
}

function createBillboardGeometry(attributeName, capacity) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1.24, -0.72, 0,
    1.24, -0.72, 0,
    -1.24, 1.16, 0,
    1.24, 1.16, 0
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0, 1,
    1, 1
  ], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  const params = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  params.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(attributeName, params);
  geometry.computeBoundingSphere();
  return geometry;
}

function finishGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function createMaterials() {
  return {
    scorch: basicMaterial('#090504', { opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -1 }),
    fuel: basicMaterial('#4a0d08', { opacity: 0.92, polygonOffset: true, polygonOffsetFactor: -2 }),
    flame: flameMaterial(),
    smoke: createMamaNapalmSmokeMaterial(),
    ember: basicMaterial('#ff7a24', { opacity: 0.9, blending: THREE.AdditiveBlending })
  };
}

function basicMaterial(colour, options) {
  return new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    ...options
  });
}

function shaderMaterial({ name, instanceAttribute, fragmentShader }) {
  const material = new THREE.ShaderMaterial({
    name,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uMaterialOpacity: { value: 1 }
    },
    vertexShader: `
      attribute vec4 ${instanceAttribute};
      varying vec2 vUv;
      varying vec4 vEffectParams;
      void main() {
        vUv = uv;
        vEffectParams = ${instanceAttribute};
        vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * instancePosition;
      }
    `,
    fragmentShader
  });
  material.opacity = 1;
  material.forceSinglePass = true;
  return material;
}

function flameMaterial() {
  return shaderMaterial({
    name: 'mama-napalm:rolling-sdf-metaball-flame',
    instanceAttribute: 'aFlameParams',
    fragmentShader: `
      uniform float uTime;
      uniform float uMaterialOpacity;
      varying vec2 vUv;
      varying vec4 vEffectParams;

      float hash11(float value) {
        return fract(sin(value * 91.173 + 17.719) * 43758.5453);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float seed = dot(cell, vec2(127.1, 311.7));
        float a = hash11(seed);
        float b = hash11(seed + 127.1);
        float c = hash11(seed + 311.7);
        float d = hash11(seed + 438.8);
        return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
      }

      float fbm(vec2 point) {
        float value = 0.0;
        float amplitude = 0.56;
        for (int octave = 0; octave < 4; octave++) {
          value += valueNoise(point) * amplitude;
          point = point * 2.03 + vec2(13.7, 7.9);
          amplitude *= 0.48;
        }
        return value;
      }

      float ellipseSdf(vec2 point, vec2 center, vec2 radii) {
        return (length((point - center) / max(radii, vec2(0.001))) - 1.0) * min(radii.x, radii.y);
      }

      float smoothUnion(float a, float b, float radius) {
        float h = clamp(0.5 + 0.5 * (b - a) / radius, 0.0, 1.0);
        return mix(b, a, h) - radius * h * (1.0 - h);
      }

      void main() {
        float seed = vEffectParams.x * 37.0;
        float role = vEffectParams.y;
        float heat = clamp(vEffectParams.z, 0.0, 1.0);
        float accent = vEffectParams.w;
        float bridge = 1.0 - step(0.5, role);
        float secondary = step(0.5, role) * (1.0 - step(1.5, role));
        float dominant = step(1.5, role);
        float fullMass = secondary + dominant;
        vec2 point = vec2(mix(-1.24, 1.24, vUv.x), mix(-0.72, 1.16, vUv.y));
        float rollA = sin(uTime * 1.83 + seed * 0.71);
        float rollB = sin(uTime * 1.29 + seed * 1.17 + 1.9);
        float seedShift = (hash11(seed + 4.2) - 0.5) * 0.18;
        float broadNoise = fbm(vec2(point.y * 3.1 + seed, uTime * 0.32 + seed * 0.2)) - 0.5;
        vec2 warped = point;
        warped.x += broadNoise * (0.16 + dominant * 0.05) + sin(point.y * 8.0 + seed + uTime * 1.7) * 0.026;
        warped.y += (fbm(vec2(point.x * 2.7 + seed * 0.4, uTime * -0.24 + seed)) - 0.5) * 0.055;

        float baseA = ellipseSdf(warped, vec2(-0.31 + seedShift, 0.18 + rollB * 0.012), vec2(0.58 + dominant * 0.11, 0.25 + fullMass * 0.035));
        float baseB = ellipseSdf(warped, vec2(0.29 - seedShift * 0.45, 0.2 + rollA * 0.014), vec2(0.59 + bridge * 0.08, 0.27 + fullMass * 0.028));
        float bridgeBank = ellipseSdf(warped, vec2(0.0, 0.12), vec2(0.76, 0.18));
        float lowMass = smoothUnion(baseA, baseB, 0.16);
        lowMass = smoothUnion(lowMass, bridgeBank, 0.12);

        float midA = ellipseSdf(warped, vec2(-0.21 + seedShift * 0.5 + rollA * 0.025, 0.43), vec2(0.47 + dominant * 0.08, 0.3 + dominant * 0.055));
        float midB = ellipseSdf(warped, vec2(0.27 - seedShift * 0.4 + rollB * 0.022, 0.46), vec2(0.39 + dominant * 0.07, 0.29 + secondary * 0.03));
        float fullShape = smoothUnion(lowMass, midA, 0.145);
        fullShape = smoothUnion(fullShape, midB, 0.13);
        float shape = mix(lowMass, fullShape, fullMass);

        float crown = ellipseSdf(warped, vec2(-0.13 + seedShift + rollB * 0.035, 0.69), vec2(0.33 + dominant * 0.065, 0.22 + dominant * 0.035));
        shape = mix(shape, smoothUnion(shape, crown, 0.12), fullMass);
        float tongue = ellipseSdf(warped, vec2(0.18 - seedShift * 0.4 + rollA * 0.045, 0.79), vec2(0.17 + accent * 0.045, 0.17 + accent * 0.075));
        shape = mix(shape, smoothUnion(shape, tongue, 0.095), dominant);

        float edgeNoise = fbm(vec2(warped.x * 3.4 + seed * 0.31, warped.y * 4.2 - uTime * 0.48 + seed)) - 0.5;
        float edgeDetail = valueNoise(vec2(warped.x * 9.2 - uTime * 0.72, warped.y * 10.4 + seed * 1.7)) - 0.5;
        shape += edgeNoise * (0.088 + warped.y * 0.04) + edgeDetail * 0.022;
        float body = 1.0 - smoothstep(-0.012, 0.032, shape);
        float groundVariation = (fbm(vec2(point.x * 4.6 + seed * 0.7, uTime * 0.21 + seed)) - 0.5) * 0.13;
        float groundContact = smoothstep(-0.015, 0.105, point.y + groundVariation);
        body *= groundContact;

        float coreA = ellipseSdf(warped, vec2(-0.22 + seedShift * 0.3, 0.2), vec2(0.31 + dominant * 0.04, 0.135));
        float coreB = ellipseSdf(warped, vec2(0.2 - seedShift * 0.2, 0.24), vec2(0.3, 0.16));
        float coreMid = ellipseSdf(warped, vec2(-0.04 + rollA * 0.02, 0.42), vec2(0.22 + dominant * 0.045, 0.19));
        float coreShape = smoothUnion(coreA, coreB, 0.095);
        coreShape = smoothUnion(coreShape, coreMid, 0.08);
        float hot = 1.0 - smoothstep(-0.015, 0.045, coreShape);
        hot *= body;
        float whiteCore = 1.0 - smoothstep(-0.09, -0.01, coreShape);
        whiteCore *= body * (0.38 + dominant * 0.32);
        float interior = 1.0 - smoothstep(-0.18, -0.025, shape);

        float paletteSeed = hash11(seed + 19.7);
        float colourRoll = fbm(vec2(warped.x * 2.7 + seed * 0.43, warped.y * 3.6 - uTime * 0.31));
        vec3 deepFuel = mix(vec3(0.13, 0.004, 0.001), vec3(0.27, 0.012, 0.001), paletteSeed);
        vec3 outerOrange = mix(vec3(0.52, 0.018, 0.002), vec3(0.88, 0.072, 0.002), colourRoll);
        vec3 rollingOrange = mix(vec3(0.96, 0.105, 0.005), vec3(1.0, 0.36, 0.024), clamp(colourRoll * 0.85 + paletteSeed * 0.28, 0.0, 1.0));
        vec3 hotYellow = mix(vec3(1.0, 0.43, 0.035), vec3(1.0, 0.7, 0.14), hash11(seed + 27.3));
        vec3 colour = mix(deepFuel, outerOrange, clamp(body * 1.24, 0.0, 1.0));
        colour = mix(colour, rollingOrange, interior * 0.82);
        colour = mix(colour, hotYellow, hot * (0.72 + dominant * 0.18));
        colour = mix(colour, mix(vec3(1.0, 0.78, 0.25), vec3(1.0, 0.94, 0.58), colourRoll), whiteCore * 0.72);

        float fold = smoothstep(0.57, 0.84, fbm(vec2(warped.x * 5.1 - uTime * 0.37, warped.y * 6.4 + seed)));
        fold *= body * (0.18 + warped.y * 0.82) * (1.0 - hot * 0.7);
        colour = mix(colour, vec3(0.14, 0.025, 0.008), fold * 0.42);
        float alpha = body * heat * (0.86 + dominant * 0.08) * uMaterialOpacity;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(colour, alpha);
      }
    `
  });
}

function firewallPhase(wall) {
  const age = Math.max(0, Number(wall.age) || 0);
  const life = clamp01(wall.life01 ?? 1 - age / Math.max(0.001, Number(wall.lifetime) || 18));
  if (age < 1.25) return 'ground_ignition';
  return life > 0.28 ? 'sustain_firewall' : 'decay_aftermath';
}

function buildStats(walls, counts, phases) {
  return {
    contract: THREE_MAMA_NAPALM_FIREWALL_CONTRACT,
    activeWalls: Math.min(WALL_CAPACITY, walls.length),
    phaseCounts: phases,
    fuelPools: counts.fuel,
    flameClusters: counts.flame,
    dominantRollingMasses: Math.min(WALL_CAPACITY, walls.length) * 3,
    smokeRibbons: 0,
    smokeMasses: counts.smoke,
    embers: counts.ember,
    scorchMarks: counts.scorch,
    drawCalls: [counts.scorch, counts.fuel, counts.flame, counts.smoke, counts.ember].filter((count) => count > 0).length,
    maximumDrawCalls: 5,
    maximumInstances: WALL_CAPACITY * (FUEL_NODES_PER_WALL * 2 + FLAME_MASSES_PER_WALL + SMOKE_NODES_PER_WALL + EMBERS_PER_WALL),
    primitiveFallbacks: 0,
    sharpTriangleSilhouetteFallbacks: 0,
    geometryPolicy: 'eight_overlapping_macro_rolling_sdf_metaball_flame_masses_v2',
    flameEdgePolicy: 'animated_low_frequency_fbm_distorted_curved_sdf_v1',
    flamePalettePolicy: 'seeded_crimson_vermilion_amber_yellow_white_with_soot_folds_v1',
    smokePolicy: 'phase_maturing_entwined_charcoal_sdf_plumes_without_ribbon_silhouettes_v2',
    ignitionPolicy: 'seeded_directional_uneven_ignition_and_fuel_surge_v1',
    lifecyclePolicy: 'ground_ignition_sustain_firewall_decay_aftermath_v1',
    batchingPolicy: 'five_global_instanced_families_up_to_four_firewalls_v2'
  };
}

function numericSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function pixelsToMeters(value, tileSize) { return Math.max(0, Number(value ?? 0)) / tileSize * WORLD_SCALE.tileMeters; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}
function fract(value) { return value - Math.floor(value); }

function emptyStats() {
  return buildStats([], { scorch: 0, fuel: 0, flame: 0, smoke: 0, ember: 0 }, {
    ground_ignition: 0,
    sustain_firewall: 0,
    decay_aftermath: 0
  });
}
