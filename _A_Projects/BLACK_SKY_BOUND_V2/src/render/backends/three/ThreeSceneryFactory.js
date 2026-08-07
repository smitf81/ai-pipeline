import * as THREE from 'three';
import { renderWorldPointToWorld3D } from '../../three/worldTransform3D.js';

const SUPPORTED_KINDS = new Set([
  'tree', 'procedural_tree', 'dead_snag', 'procedural_geology', 'procedural_undergrowth', 'fern_patch', 'forest_shrub',
  'ground_decal', 'fire_arrow', 'fire_arrow_cluster', 'smouldering_fern', 'smouldering_bramble'
]);

export class ThreeSceneryFactory {
  constructor(treeFactory, tileSize) {
    this.treeFactory = treeFactory;
    this.tileSize = tileSize;
    this.geometries = new Map();
    this.materials = new Map();
    this.unsupportedKinds = new Set();
  }

  create(packet) {
    const kind = packet.render?.kind ?? packet.type;
    let object;
    if ((kind === 'tree' || kind === 'procedural_tree') && packet.treeDefinition) object = this.treeFactory.create(packet.treeDefinition);
    else if (kind === 'dead_snag') object = this.createSnag(packet);
    else if (kind === 'procedural_geology') object = this.createGeology(packet);
    else if (kind === 'procedural_undergrowth') object = /shrub|bramble/.test(packet.undergrowthDefinition?.species ?? '')
      ? this.createShrub(packet, /ember|smoulder/.test(packet.undergrowthDefinition?.species ?? packet.authoredType ?? ''))
      : this.createFern(packet, /ember|smoulder/.test(packet.undergrowthDefinition?.species ?? packet.authoredType ?? ''));
    else if (kind === 'fern_patch' || kind === 'smouldering_fern') object = this.createFern(packet, kind.startsWith('smouldering'));
    else if (kind === 'forest_shrub' || kind === 'smouldering_bramble') object = this.createShrub(packet, kind.startsWith('smouldering'));
    else if (kind === 'ground_decal') object = this.createGroundDecal(packet);
    else if (kind === 'fire_arrow' || kind === 'fire_arrow_cluster') object = this.createFireArrows(packet, kind === 'fire_arrow_cluster' ? 3 : 1);
    else object = this.createUnsupported(packet, kind);
    const point = renderWorldPointToWorld3D(packet.anchorWorldX, packet.anchorWorldY, this.tileSize, 0);
    object.position.set(point.x, 0, point.z);
    object.name = `scenery:${packet.id}`;
    object.userData.packetId = packet.id;
    object.userData.renderKind = kind;
    return object;
  }

  createSnag(packet) {
    const height = Number(packet.physical?.heightMeters ?? 4.6);
    const radius = Number(packet.physical?.trunkBaseMeters ?? 0.7) * 0.5;
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(this.geometry(`snag:${radius}:${height}`, () => new THREE.ConeGeometry(radius * 0.45, radius, height, 6, 4)), this.material(packet, packet.render?.trunkColour ?? '#4a3326'));
    trunk.position.y = height * 0.5;
    trunk.castShadow = trunk.receiveShadow = true;
    group.add(trunk);
    for (let index = 0; index < 4; index += 1) {
      const limb = new THREE.Mesh(this.geometry('snag-limb', () => new THREE.ConeGeometry(0.035, 0.12, 1, 5)), trunk.material);
      limb.position.set(Math.cos(index * 1.8) * 0.16, height * (0.38 + index * 0.11), Math.sin(index * 1.8) * 0.16);
      limb.rotation.z = Math.PI * (0.35 + index * 0.04);
      limb.rotation.y = index * 1.8;
      limb.castShadow = true;
      group.add(limb);
    }
    return group;
  }

  createGeology(packet) {
    const width = Number(packet.physical?.widthMeters ?? 1);
    const depth = Number(packet.physical?.depthMeters ?? 1);
    const height = Number(packet.physical?.heightMeters ?? 0.8);
    const mesh = new THREE.Mesh(this.geometry('geology:dodeca', () => new THREE.DodecahedronGeometry(0.5, 0)), this.material(packet, packet.render?.bodyColour ?? '#626a66'));
    mesh.scale.set(width, height, depth);
    mesh.position.y = height * 0.42;
    mesh.rotation.y = hash01(packet.id) * Math.PI;
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  createFern(packet, burning) {
    const group = new THREE.Group();
    const width = Number(packet.physical?.widthMeters ?? 1.4);
    const height = Number(packet.physical?.heightMeters ?? 0.45);
    const material = this.material(packet, packet.render?.frondColour ?? '#24482f');
    for (let index = 0; index < 7; index += 1) {
      const leaf = new THREE.Mesh(this.geometry('fern-leaf', () => new THREE.ConeGeometry(0.08, 0.52, 3, 1)), material);
      leaf.scale.set(width * 0.34, height, 0.72);
      leaf.position.y = height * 0.38;
      leaf.rotation.z = (index % 2 ? -1 : 1) * (0.45 + index * 0.035);
      leaf.rotation.y = index / 7 * Math.PI * 2;
      leaf.castShadow = burning;
      group.add(leaf);
    }
    if (burning) group.add(this.ember(packet, height * 0.24));
    return group;
  }

  createShrub(packet, burning) {
    const group = new THREE.Group();
    const width = Number(packet.physical?.widthMeters ?? 1.6);
    const depth = Number(packet.physical?.depthMeters ?? 1.05);
    const height = Number(packet.physical?.heightMeters ?? 0.7);
    const material = this.material(packet, packet.render?.bodyColour ?? '#2d4d2d');
    for (let index = 0; index < 5; index += 1) {
      const mesh = new THREE.Mesh(this.geometry('shrub-cluster', () => new THREE.IcosahedronGeometry(0.5, 1)), material);
      mesh.scale.set(width * (0.26 + (index % 2) * 0.08), height * 0.46, depth * 0.38);
      mesh.position.set((index - 2) * width * 0.16, height * (0.3 + (index % 2) * 0.12), Math.sin(index * 2.1) * depth * 0.18);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (burning) group.add(this.ember(packet, height * 0.48));
    return group;
  }

  createGroundDecal(packet) {
    const geometry = this.geometry('ground-decal', () => new THREE.CircleGeometry(0.5, 12));
    const material = this.material(packet, packet.render?.bodyColour ?? '#4b3826', { polygonOffset: true, polygonOffsetFactor: -1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(Number(packet.physical?.widthMeters ?? 1.5), Number(packet.physical?.depthMeters ?? 0.9), 1);
    mesh.position.y = 0.008;
    mesh.receiveShadow = true;
    return mesh;
  }

  createFireArrows(packet, count) {
    const group = new THREE.Group();
    const material = this.material(packet, packet.render?.shaftColour ?? '#5f4126');
    for (let index = 0; index < count; index += 1) {
      const shaft = new THREE.Mesh(this.geometry('arrow-shaft', () => new THREE.CylinderGeometry(0.012, 0.018, 0.34, 5)), material);
      shaft.position.set((index - (count - 1) * 0.5) * 0.12, 0.13, index * 0.025);
      shaft.rotation.z = Number(packet.render?.angle ?? 0.3) + (index - 1) * 0.16;
      shaft.castShadow = true;
      group.add(shaft);
      const flame = this.ember(packet, 0.28);
      flame.position.x = shaft.position.x;
      group.add(flame);
    }
    return group;
  }

  ember(packet, y) {
    const colour = cssColour(packet.render?.emberColour ?? '#ff792d');
    const mesh = new THREE.Mesh(this.geometry('ember', () => new THREE.IcosahedronGeometry(0.045, 1)), this.cachedMaterial(`ember:${colour}`, () => new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 5, roughness: 0.35 })));
    mesh.position.y = y;
    return mesh;
  }

  createUnsupported(packet, kind) {
    this.unsupportedKinds.add(kind ?? 'missing');
    const mesh = new THREE.Mesh(this.geometry('unsupported', () => new THREE.OctahedronGeometry(0.3, 0)), this.cachedMaterial('unsupported', () => new THREE.MeshStandardMaterial({ color: 0xff00cc, emissive: 0xff00cc, emissiveIntensity: 2 })));
    mesh.position.y = 0.42;
    mesh.userData.diagnostic = `unsupported_scenery_kind:${kind ?? 'missing'}:${packet.id}`;
    return mesh;
  }

  material(packet, fallback, extra = {}) {
    const colour = cssColour(packet.material?.uniforms?.baseColour ?? fallback);
    const roughness = Number(packet.material?.uniforms?.roughness ?? 0.9);
    return this.cachedMaterial(`standard:${colour}:${roughness}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0, flatShading: true, ...extra }));
  }

  geometry(key, factory) {
    if (!this.geometries.has(key)) this.geometries.set(key, factory());
    return this.geometries.get(key);
  }

  cachedMaterial(key, factory) {
    if (!this.materials.has(key)) this.materials.set(key, factory());
    return this.materials.get(key);
  }

  diagnostics() {
    return { supportedKinds: [...SUPPORTED_KINDS], unsupportedKinds: [...this.unsupportedKinds], geometryCacheEntries: this.geometries.size, materialCacheEntries: this.materials.size };
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.clear();
    this.materials.clear();
  }
}

function cssColour(value) {
  const text = String(value ?? '#ffffff');
  const match = text.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) return (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]);
  return text;
}

function hash01(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
