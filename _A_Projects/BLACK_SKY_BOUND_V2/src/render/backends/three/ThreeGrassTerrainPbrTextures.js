import * as THREE from 'three';

export const GRASS_TERRAIN_PBR_CONTRACT = 'black-sky-bound.three-grass-terrain-pbr-textures.v1';
export const GRASS_TERRAIN_TEXTURE_SET = Object.freeze({
  contract: 'black-sky-bound.stylized-grass-pbr-texture-set.v1',
  id: 'stylized_grass_reference_derived_v1',
  textureWorldMeters: 1.6,
  size: 1024,
  normalOrientation: 'open_gl_positive_green_v',
  source: 'rock_style_reference_guided_openai_generated_albedo_with_deterministic_derived_channels',
  licence: 'project_generated_asset_reference_usage_scope_not_independently_verified',
  albedo: new URL('../../../../assets/textures/terrain/stylized-grass-v1/albedo.png', import.meta.url).href,
  normal: new URL('../../../../assets/textures/terrain/stylized-grass-v1/normal-open-gl.png', import.meta.url).href,
  orm: new URL('../../../../assets/textures/terrain/stylized-grass-v1/orm.png', import.meta.url).href,
  height: new URL('../../../../assets/textures/terrain/stylized-grass-v1/height.png', import.meta.url).href
});

export function createGrassTerrainPbrTextures(options = {}) {
  const anisotropy = Math.max(1, Math.min(8, Number(options.anisotropy) || 1));
  const textures = {
    albedo: solidTexture([255, 0, 204, 255], 'grass:pbr:loading-albedo'),
    normal: solidTexture([128, 128, 255, 255], 'grass:pbr:loading-normal'),
    orm: solidTexture([255, 255, 0, 255], 'grass:pbr:loading-orm'),
    height: solidTexture([128, 128, 128, 255], 'grass:pbr:loading-height')
  };
  const uniforms = {
    uGrassBaseColour: { value: textures.albedo },
    uGrassNormal: { value: textures.normal },
    uGrassOrm: { value: textures.orm },
    uGrassHeight: { value: textures.height },
    uGrassTextureFailure: { value: 1 }
  };
  const state = {
    contract: GRASS_TERRAIN_PBR_CONTRACT,
    status: canLoadImages() ? 'loading' : 'headless_descriptor',
    loadedTextureCount: 0,
    textureCount: 4,
    errors: [],
    source: GRASS_TERRAIN_TEXTURE_SET.source,
    licence: GRASS_TERRAIN_TEXTURE_SET.licence,
    textureSetId: GRASS_TERRAIN_TEXTURE_SET.id,
    textureSize: `${GRASS_TERRAIN_TEXTURE_SET.size}x${GRASS_TERRAIN_TEXTURE_SET.size}`,
    textureWorldMeters: GRASS_TERRAIN_TEXTURE_SET.textureWorldMeters,
    projection: 'continuous_world_xz_with_existing_dual_sample_repetition_control',
    normalOrientation: GRASS_TERRAIN_TEXTURE_SET.normalOrientation,
    metallicPolicy: 'dielectric_zero_from_orm_blue',
    heightPolicy: 'derived_channel_drives_surface_normal_detail_no_displacement',
    disposed: false
  };
  const ready = canLoadImages()
    ? loadGrassTextureSet(textures, uniforms, state, anisotropy)
    : Promise.resolve(state);
  return {
    uniforms,
    state,
    ready,
    dispose() {
      state.disposed = true;
      for (const texture of new Set(Object.values(textures))) texture.dispose();
    }
  };
}

async function loadGrassTextureSet(textures, uniforms, state, anisotropy) {
  const loader = new THREE.TextureLoader();
  const entries = [
    ['albedo', GRASS_TERRAIN_TEXTURE_SET.albedo, uniforms.uGrassBaseColour],
    ['normal', GRASS_TERRAIN_TEXTURE_SET.normal, uniforms.uGrassNormal],
    ['orm', GRASS_TERRAIN_TEXTURE_SET.orm, uniforms.uGrassOrm],
    ['height', GRASS_TERRAIN_TEXTURE_SET.height, uniforms.uGrassHeight]
  ];
  try {
    const loaded = await Promise.all(entries.map(async ([kind, url, uniform]) => {
      const texture = configureTexture(await loader.loadAsync(url), `grass:pbr:${kind}`, anisotropy);
      if (state.disposed) {
        texture.dispose();
        return null;
      }
      textures[kind].dispose();
      textures[kind] = texture;
      uniform.value = texture;
      state.loadedTextureCount += 1;
      return texture;
    }));
    if (state.disposed) return state;
    if (loaded.length !== entries.length || loaded.some((texture) => !texture)) {
      throw new Error(`grass_texture_count_mismatch:${loaded.length}:${entries.length}`);
    }
    uniforms.uGrassTextureFailure.value = 0;
    state.status = 'ready';
  } catch (error) {
    if (state.disposed) return state;
    const message = String(error?.message || error);
    state.errors.push(message);
    state.status = 'error_visible_diagnostic';
    uniforms.uGrassTextureFailure.value = 1;
    console.error(`[BSB terrain] grass PBR texture failure: ${message}`);
  }
  return state;
}

function configureTexture(texture, name, anisotropy) {
  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function solidTexture(rgba, name) {
  const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function canLoadImages() {
  return typeof document !== 'undefined' && typeof Image !== 'undefined';
}
