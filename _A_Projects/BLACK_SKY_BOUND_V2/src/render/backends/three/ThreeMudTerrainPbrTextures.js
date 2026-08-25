import * as THREE from 'three';

export const MUD_TERRAIN_PBR_CONTRACT = 'black-sky-bound.three-mud-terrain-pbr-textures.v1';
export const MUD_TERRAIN_TEXTURE_SET = Object.freeze({
  contract: 'black-sky-bound.stylized-mud-pbr-texture-set.v1',
  id: 'stylized_mud_trampled_path_v1',
  textureWorldMeters: 1.6,
  size: 1024,
  normalOrientation: 'open_gl_positive_green_v',
  source: 'grass_and_rock_style_reference_guided_openai_generated_albedo_with_deterministic_derived_channels',
  licence: 'project_generated_asset_reference_usage_scope_not_independently_verified',
  albedo: new URL('../../../../assets/textures/terrain/stylized-mud-v1/albedo.png', import.meta.url).href,
  normal: new URL('../../../../assets/textures/terrain/stylized-mud-v1/normal-open-gl.png', import.meta.url).href,
  orm: new URL('../../../../assets/textures/terrain/stylized-mud-v1/orm.png', import.meta.url).href,
  height: new URL('../../../../assets/textures/terrain/stylized-mud-v1/height.png', import.meta.url).href
});

export function createMudTerrainPbrTextures(options = {}) {
  const anisotropy = Math.max(1, Math.min(8, Number(options.anisotropy) || 1));
  const textures = {
    albedo: solidTexture([255, 0, 204, 255], 'mud:pbr:loading-albedo'),
    normal: solidTexture([128, 128, 255, 255], 'mud:pbr:loading-normal'),
    orm: solidTexture([255, 255, 0, 255], 'mud:pbr:loading-orm'),
    height: solidTexture([128, 128, 128, 255], 'mud:pbr:loading-height')
  };
  const uniforms = {
    uMudBaseColour: { value: textures.albedo },
    uMudNormal: { value: textures.normal },
    uMudOrm: { value: textures.orm },
    uMudHeight: { value: textures.height },
    uMudTextureFailure: { value: 1 }
  };
  const state = {
    contract: MUD_TERRAIN_PBR_CONTRACT,
    status: canLoadImages() ? 'loading' : 'headless_descriptor',
    loadedTextureCount: 0,
    textureCount: 4,
    textureSetCount: 1,
    errors: [],
    source: MUD_TERRAIN_TEXTURE_SET.source,
    licence: MUD_TERRAIN_TEXTURE_SET.licence,
    textureSetId: MUD_TERRAIN_TEXTURE_SET.id,
    textureSize: `${MUD_TERRAIN_TEXTURE_SET.size}x${MUD_TERRAIN_TEXTURE_SET.size}`,
    textureWorldMeters: MUD_TERRAIN_TEXTURE_SET.textureWorldMeters,
    projection: 'continuous_world_xz_with_existing_dual_sample_repetition_control',
    normalOrientation: MUD_TERRAIN_TEXTURE_SET.normalOrientation,
    metallicPolicy: 'dielectric_zero_from_orm_blue',
    heightPolicy: 'derived_channel_drives_surface_normal_detail_no_displacement',
    disposed: false
  };
  const ready = canLoadImages()
    ? loadMudTextureSet(textures, uniforms, state, anisotropy)
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

async function loadMudTextureSet(textures, uniforms, state, anisotropy) {
  const loader = new THREE.TextureLoader();
  const entries = [
    ['albedo', MUD_TERRAIN_TEXTURE_SET.albedo, uniforms.uMudBaseColour],
    ['normal', MUD_TERRAIN_TEXTURE_SET.normal, uniforms.uMudNormal],
    ['orm', MUD_TERRAIN_TEXTURE_SET.orm, uniforms.uMudOrm],
    ['height', MUD_TERRAIN_TEXTURE_SET.height, uniforms.uMudHeight]
  ];
  try {
    const loaded = await Promise.all(entries.map(async ([kind, url, uniform]) => {
      const texture = configureTexture(await loader.loadAsync(url), `mud:pbr:${kind}`, anisotropy);
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
      throw new Error(`mud_texture_count_mismatch:${loaded.length}:${entries.length}`);
    }
    uniforms.uMudTextureFailure.value = 0;
    state.status = 'ready';
  } catch (error) {
    if (state.disposed) return state;
    const message = String(error?.message || error);
    state.errors.push(message);
    state.status = 'error_visible_diagnostic';
    uniforms.uMudTextureFailure.value = 1;
    console.error(`[BSB terrain] mud PBR texture failure: ${message}`);
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
