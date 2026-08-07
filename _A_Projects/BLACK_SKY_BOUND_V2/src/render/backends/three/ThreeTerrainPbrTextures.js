import * as THREE from 'three';
import {
  TERRAIN_MATERIAL_LAYERS,
  TERRAIN_PBR_TEXTURE_CONTRACT
} from '../../../data/terrainMaterialLayers.js';

export const TERRAIN_PBR_TEXTURE_SIZE = 128;
export const TERRAIN_NORMAL_DERIVATIVE_SCALE = 3;

export function createTerrainPbrTextures(options = {}) {
  const size = options.size ?? TERRAIN_PBR_TEXTURE_SIZE;
  const layers = options.layers ?? TERRAIN_MATERIAL_LAYERS;
  const depth = layers.length;
  if (!Number.isInteger(size) || size < 16) throw new Error(`terrain_pbr_texture_size_invalid:${size}`);
  if (!depth) throw new Error('terrain_pbr_texture_layers_missing');
  const pixelCount = size * size * depth;
  const baseData = new Uint8Array(pixelCount * 4);
  const normalData = new Uint8Array(pixelCount * 4);
  const surfaceData = new Uint8Array(pixelCount * 4);
  const heights = new Float32Array(pixelCount);
  const ranges = [];

  layers.forEach((definition, layerIndex) => {
    if (definition.index !== layerIndex) throw new Error(`terrain_pbr_layer_index_invalid:${definition.id}:${definition.index}:${layerIndex}`);
    let minRoughness = 1;
    let maxRoughness = 0;
    let minAo = 1;
    let maxAo = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = x / size;
        const v = y / size;
        const surface = evaluateTerrainSurface(definition, u, v);
        const pixel = layerIndex * size * size + y * size + x;
        const offset = pixel * 4;
        heights[pixel] = surface.height;
        baseData[offset] = byte(surface.baseColour[0]);
        baseData[offset + 1] = byte(surface.baseColour[1]);
        baseData[offset + 2] = byte(surface.baseColour[2]);
        baseData[offset + 3] = 255;
        surfaceData[offset] = byte(surface.roughness * 255);
        surfaceData[offset + 1] = byte(surface.ambientOcclusion * 255);
        surfaceData[offset + 2] = byte(surface.height * 255);
        surfaceData[offset + 3] = 255;
        minRoughness = Math.min(minRoughness, surface.roughness);
        maxRoughness = Math.max(maxRoughness, surface.roughness);
        minAo = Math.min(minAo, surface.ambientOcclusion);
        maxAo = Math.max(maxAo, surface.ambientOcclusion);
      }
    }
    ranges.push({ id: definition.id, minRoughness, maxRoughness, minAo, maxAo });
  });

  layers.forEach((definition, layerIndex) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const left = heightAt(heights, size, layerIndex, x - 1, y);
        const right = heightAt(heights, size, layerIndex, x + 1, y);
        const down = heightAt(heights, size, layerIndex, x, y - 1);
        const up = heightAt(heights, size, layerIndex, x, y + 1);
        const normal = normalize3(
          -(right - left) * definition.normalStrength * TERRAIN_NORMAL_DERIVATIVE_SCALE,
          -(up - down) * definition.normalStrength * TERRAIN_NORMAL_DERIVATIVE_SCALE,
          0.58
        );
        const offset = (layerIndex * size * size + y * size + x) * 4;
        normalData[offset] = byte((normal[0] * 0.5 + 0.5) * 255);
        normalData[offset + 1] = byte((normal[1] * 0.5 + 0.5) * 255);
        normalData[offset + 2] = byte((normal[2] * 0.5 + 0.5) * 255);
        normalData[offset + 3] = 255;
      }
    }
  });

  const anisotropy = Math.max(1, Math.min(8, Number(options.anisotropy) || 1));
  const baseColour = textureArray(baseData, size, depth, 'terrain:pbr:base-colour', anisotropy);
  const normal = textureArray(normalData, size, depth, 'terrain:pbr:normal-open-gl', anisotropy);
  const surface = textureArray(surfaceData, size, depth, 'terrain:pbr:roughness-ao-height', anisotropy);
  return {
    contract: TERRAIN_PBR_TEXTURE_CONTRACT,
    baseColour,
    normal,
    surface,
    size,
    depth,
    ranges,
    normalOrientation: 'open_gl_positive_y_v_maps_to_positive_world_z',
    heightPolicy: 'conservative_detail_channel_no_vertex_displacement',
    source: 'deterministic_periodic_procedural_original',
    licence: 'project_source_same_terms_no_external_asset',
    dispose() { baseColour.dispose(); normal.dispose(); surface.dispose(); }
  };
}

export function evaluateTerrainSurface(definition, u, v) {
  const height = sampleTerrainHeight(definition, u, v);
  const coarse = periodicFbm(u, v, definition.index * 17 + 3);
  const fine = periodicFbm(u * 4, v * 4, definition.index * 29 + 11);
  const feature = materialFeature(definition.terrainType, u, v);
  const colourMix = clamp01(0.42 + coarse * 0.28 + fine * 0.12 + feature.colour * 0.18);
  const baseColour = definition.baseColourSrgb.map((channel, index) => (
    clampByte(channel + (definition.secondaryColourSrgb[index] - channel) * colourMix + feature.channelShift[index])
  ));
  const roughness = clamp(
    definition.roughness + coarse * definition.roughnessVariation * 0.55
      + feature.roughness * definition.roughnessVariation,
    0.68,
    1
  );
  const ambientOcclusion = clamp(
    definition.ambientOcclusion - Math.max(0, 0.52 - height) * 0.24 - feature.cavity * 0.1,
    0.7,
    1
  );
  return { baseColour, roughness, ambientOcclusion, height };
}

export function sampleTerrainHeight(definition, u, v) {
  const type = definition.terrainType;
  const coarse = periodicFbm(u, v, definition.index * 17 + 3);
  const fine = periodicFbm(u * 4, v * 4, definition.index * 29 + 11);
  const feature = materialFeature(type, u, v);
  const base = type === 'grass' ? 0.53 : type === 'dirt' ? 0.49 : 0.43;
  return clamp01(base + coarse * definition.heightStrength + fine * definition.heightStrength * 0.46 + feature.height);
}

function materialFeature(type, u, v) {
  if (type === 'grass') {
    const fibres = periodicValueNoise(u, v, 24, 71) * 2 - 1;
    const soilBreak = periodicValueNoise(u, v, 7, 113) * 2 - 1;
    return { height: fibres * 0.01 + soilBreak * 0.008, colour: fibres * 0.13 - soilBreak * 0.1, roughness: 0.09, cavity: 0, channelShift: [-2, 4, -1] };
  }
  if (type === 'dirt') {
    const compression = periodicValueNoise(u, v, 4, 211) * 2 - 1;
    const grit = periodicValueNoise(u, v, 28, 307) * 2 - 1;
    return { height: compression * 0.01 + grit * 0.004, colour: -compression * 0.16, roughness: -0.14, cavity: 0.06, channelShift: [3, 2, -1] };
  }
  const crackDistance = Math.abs(periodicValueNoise(u, v, 6, 401) - periodicValueNoise(u, v, 9, 503));
  const crack = 1 - smoothstep(0.018, 0.085, crackDistance);
  const ash = periodicValueNoise(u, v, 11, 601) * 2 - 1;
  return { height: ash * 0.011 - crack * 0.045, colour: crack * 0.32 - ash * 0.1, roughness: crack * 0.2, cavity: crack, channelShift: [2, 1, 0] };
}

function periodicFbm(u, v, seed) {
  let value = 0;
  let weight = 0.56;
  let total = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    const cells = 2 << octave;
    value += (periodicValueNoise(u, v, cells, seed + octave * 97) * 2 - 1) * weight;
    total += weight;
    weight *= 0.5;
  }
  return value / total;
}

function periodicValueNoise(u, v, cells, seed) {
  const wrappedU = u - Math.floor(u);
  const wrappedV = v - Math.floor(v);
  const sx = wrappedU * cells;
  const sy = wrappedV * cells;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const tx = smoothstep(0, 1, sx - x0);
  const ty = smoothstep(0, 1, sy - y0);
  const a = latticeHash(x0, y0, cells, seed);
  const b = latticeHash(x0 + 1, y0, cells, seed);
  const c = latticeHash(x0, y0 + 1, cells, seed);
  const d = latticeHash(x0 + 1, y0 + 1, cells, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

function latticeHash(x, y, period, seed) {
  const wrappedX = (x + period) % period;
  const wrappedY = (y + period) % period;
  let hash = Math.imul(wrappedX + 374761393, 668265263) ^ Math.imul(wrappedY + seed * 17, 2246822519);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function textureArray(data, size, depth, name, anisotropy) {
  const texture = new THREE.DataArrayTexture(data, size, size, depth);
  texture.name = name;
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.colorSpace = THREE.NoColorSpace;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function heightAt(values, size, layer, x, y) {
  const wrappedX = (x + size) % size;
  const wrappedY = (y + size) % size;
  return values[layer * size * size + wrappedY * size + wrappedX];
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function byte(value) { return Math.max(0, Math.min(255, Math.round(value))); }
function clampByte(value) { return Math.max(0, Math.min(255, value)); }
function clamp01(value) { return clamp(value, 0, 1); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
