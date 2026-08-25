import * as THREE from 'three';
import { TERRAIN_WETNESS_GLSL, THREE_TERRAIN_WETNESS_CONTRACT } from './ThreeTerrainWetness.js';

export const ROCK_TERRAIN_MATERIAL_CONTRACT = 'black-sky-bound.three-rock-terrain-pbr.v1';
export const ROCK_TERRAIN_TEXTURE_SET = Object.freeze({
  contract: 'black-sky-bound.stylized-rock-pbr-texture-set.v1',
  id: 'stylized_rock_reference_derived_v1',
  textureWorldMeters: 2,
  size: 1024,
  normalOrientation: 'open_gl_positive_green_v',
  source: 'user_reference_guided_openai_generated_albedo_with_deterministic_derived_channels',
  licence: 'user_supplied_reference_usage_scope_not_independently_verified',
  albedo: new URL('../../../../assets/textures/terrain/stylized-rock-v1/albedo.png', import.meta.url).href,
  normal: new URL('../../../../assets/textures/terrain/stylized-rock-v1/normal-open-gl.png', import.meta.url).href,
  orm: new URL('../../../../assets/textures/terrain/stylized-rock-v1/orm.png', import.meta.url).href,
  height: new URL('../../../../assets/textures/terrain/stylized-rock-v1/height.png', import.meta.url).href
});

export function createRockTerrainMaterial(options = {}) {
  const anisotropy = Math.max(1, Math.min(8, Number(options.anisotropy) || 1));
  const textures = {
    albedo: solidTexture([255, 0, 204, 255], 'rock:pbr:loading-albedo'),
    normal: solidTexture([128, 128, 255, 255], 'rock:pbr:loading-normal'),
    orm: solidTexture([255, 255, 0, 255], 'rock:pbr:loading-orm'),
    height: solidTexture([128, 128, 128, 255], 'rock:pbr:loading-height')
  };
  const uniforms = {
    uRockAlbedo: { value: textures.albedo },
    uRockNormal: { value: textures.normal },
    uRockOrm: { value: textures.orm },
    uRockHeight: { value: textures.height },
    uRockUvScale: { value: 1 / ROCK_TERRAIN_TEXTURE_SET.textureWorldMeters },
    uRockDebugMode: { value: Number(options.debugMode) || 0 },
    uRockTextureFailure: { value: 1 },
    uRainWetness: { value: 0 },
    uRainRenderTime: { value: 0 }
  };
  const state = {
    contract: ROCK_TERRAIN_MATERIAL_CONTRACT,
    status: canLoadImages() ? 'loading' : 'headless_descriptor',
    loadedTextureCount: 0,
    textureCount: 4,
    errors: [],
    source: ROCK_TERRAIN_TEXTURE_SET.source,
    licence: ROCK_TERRAIN_TEXTURE_SET.licence,
    textureSetId: ROCK_TERRAIN_TEXTURE_SET.id,
    textureSize: `${ROCK_TERRAIN_TEXTURE_SET.size}x${ROCK_TERRAIN_TEXTURE_SET.size}`,
    textureWorldMeters: ROCK_TERRAIN_TEXTURE_SET.textureWorldMeters,
    projection: 'world_space_dominant_axis_triplanar',
    normalOrientation: ROCK_TERRAIN_TEXTURE_SET.normalOrientation,
    metallicPolicy: 'dielectric_zero_from_orm_blue',
    heightPolicy: 'derived_channel_sampled_for_debug_and_future_parallax_no_displacement',
    wetnessContract: THREE_TERRAIN_WETNESS_CONTRACT,
    rainIntensity: 0,
    disposed: false
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  material.name = 'terrain:rock:triplanar-pbr-material';
  material.userData.rockUniforms = uniforms;
  material.customProgramCacheKey = () => ROCK_TERRAIN_MATERIAL_CONTRACT;
  installRockShader(material, uniforms);

  const ready = canLoadImages()
    ? loadRockTextureSet(textures, uniforms, state, anisotropy)
    : Promise.resolve(state);

  return {
    material,
    state,
    ready,
    setDebugMode(value) { uniforms.uRockDebugMode.value = Number(value) || 0; },
    setRain(wetness) {
      uniforms.uRainWetness.value = Number(wetness?.rainIntensity) || 0;
      uniforms.uRainRenderTime.value = Number(wetness?.renderTime) || 0;
      state.rainIntensity = uniforms.uRainWetness.value;
    },
    disposeTextures() {
      state.disposed = true;
      for (const texture of new Set(Object.values(textures))) texture.dispose();
    }
  };
}

function installRockShader(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vRockWorldPosition;
varying vec3 vRockWorldNormal;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec3 rockObjectNormal = objectNormal;
#ifdef USE_BATCHING
rockObjectNormal = mat3( batchingMatrix ) * rockObjectNormal;
#endif
#ifdef USE_INSTANCING
rockObjectNormal = mat3( instanceMatrix ) * rockObjectNormal;
#endif
vRockWorldNormal = normalize( mat3( modelMatrix ) * rockObjectNormal );`)
      .replace('#include <project_vertex>', `vec4 rockWorldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
rockWorldPosition = batchingMatrix * rockWorldPosition;
#endif
#ifdef USE_INSTANCING
rockWorldPosition = instanceMatrix * rockWorldPosition;
#endif
vRockWorldPosition = ( modelMatrix * rockWorldPosition ).xyz;
#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uRockAlbedo;
uniform sampler2D uRockNormal;
uniform sampler2D uRockOrm;
uniform sampler2D uRockHeight;
uniform float uRockUvScale;
uniform int uRockDebugMode;
uniform int uRockTextureFailure;
varying vec3 vRockWorldPosition;
varying vec3 vRockWorldNormal;
${TERRAIN_WETNESS_GLSL}

struct RockPbrSample {
  vec3 colour;
  vec3 worldNormal;
  float roughness;
  float ao;
  float metallic;
  float height;
  float wetness;
};

vec3 rockSrgbToLinear( vec3 colour ) {
  bvec3 cutoff = lessThanEqual( colour, vec3( 0.04045 ) );
  vec3 low = colour / 12.92;
  vec3 high = pow( ( colour + 0.055 ) / 1.055, vec3( 2.4 ) );
  return mix( high, low, vec3( cutoff ) );
}

vec2 rockDominantUv( vec3 worldPosition, vec3 surfaceNormal ) {
  vec3 axis = abs( surfaceNormal );
  if ( axis.x > axis.y && axis.x > axis.z ) return worldPosition.zy * uRockUvScale;
  if ( axis.y > axis.z ) return worldPosition.xz * uRockUvScale;
  return worldPosition.xy * uRockUvScale;
}

vec3 rockWorldNormal( vec3 tangentNormal, vec3 surfaceNormal ) {
  vec3 axis = abs( surfaceNormal );
  vec3 axisSign = sign( surfaceNormal );
  axisSign = vec3(
    axisSign.x == 0.0 ? 1.0 : axisSign.x,
    axisSign.y == 0.0 ? 1.0 : axisSign.y,
    axisSign.z == 0.0 ? 1.0 : axisSign.z
  );
  if ( axis.x > axis.y && axis.x > axis.z ) return normalize( vec3( tangentNormal.z * axisSign.x, tangentNormal.y, tangentNormal.x ) );
  if ( axis.y > axis.z ) return normalize( vec3( tangentNormal.x, tangentNormal.z * axisSign.y, tangentNormal.y ) );
  return normalize( vec3( tangentNormal.x, tangentNormal.y, tangentNormal.z * axisSign.z ) );
}

RockPbrSample sampleRockPbr( vec3 worldPosition, vec3 geometricNormal ) {
  vec2 uv = rockDominantUv( worldPosition, geometricNormal );
  vec3 tangentNormal = texture( uRockNormal, uv ).xyz * 2.0 - 1.0;
  vec4 albedo = texture( uRockAlbedo, uv );
  vec4 orm = texture( uRockOrm, uv );
  float macro = clamp( 0.5 + sin( worldPosition.x * 0.41 + worldPosition.z * 0.23 ) * 0.16
    + cos( worldPosition.z * 0.37 - worldPosition.x * 0.17 ) * 0.12, 0.0, 1.0 );
  RockPbrSample sampleValue;
  sampleValue.colour = rockSrgbToLinear( albedo.rgb ) * mix( 0.94, 1.055, macro );
  sampleValue.worldNormal = rockWorldNormal( tangentNormal, geometricNormal );
  sampleValue.ao = clamp( orm.r, 0.48, 1.0 );
  sampleValue.roughness = clamp( orm.g + ( 0.5 - macro ) * 0.035, 0.72, 0.99 );
  sampleValue.metallic = clamp( orm.b, 0.0, 0.04 );
  sampleValue.height = texture( uRockHeight, uv ).r;
  float rainResponse = mix( 0.18, 0.86, smoothstep( 0.12, 0.88, geometricNormal.y ) );
  sampleValue.wetness = terrainRainMask( worldPosition, sampleValue.height, rainResponse );
  sampleValue.colour *= mix( 1.0, 0.74, sampleValue.wetness );
  sampleValue.roughness = mix( sampleValue.roughness, 0.16, sampleValue.wetness );
  return sampleValue;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
RockPbrSample rockPbr = sampleRockPbr( vRockWorldPosition, normalize( vRockWorldNormal ) );
diffuseColor.rgb = rockPbr.colour;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = rockPbr.roughness;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = rockPbr.metallic;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize( mat3( viewMatrix ) * rockPbr.worldNormal );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= rockPbr.ao;
reflectedLight.indirectSpecular *= rockPbr.ao;`)
      .replace('#include <opaque_fragment>', `if ( uRockTextureFailure == 1 ) {
  outgoingLight = vec3( 1.0, 0.0, 0.72 );
} else if ( uRockDebugMode == 1 ) {
  outgoingLight = vec3( 0.38, 0.42, 0.49 );
} else if ( uRockDebugMode == 2 ) {
  outgoingLight = rockPbr.worldNormal * 0.5 + 0.5;
} else if ( uRockDebugMode == 3 ) {
  outgoingLight = mix( vec3( 0.015, 0.025, 0.035 ), vec3( 0.25, 0.72, 1.0 ), rockPbr.wetness );
} else {
  outgoingLight += terrainRainReflection( vRockWorldPosition, rockPbr.worldNormal, rockPbr.wetness );
}
#include <opaque_fragment>`);
  };
}

async function loadRockTextureSet(textures, uniforms, state, anisotropy) {
  const loader = new THREE.TextureLoader();
  const entries = [
    ['albedo', ROCK_TERRAIN_TEXTURE_SET.albedo, uniforms.uRockAlbedo],
    ['normal', ROCK_TERRAIN_TEXTURE_SET.normal, uniforms.uRockNormal],
    ['orm', ROCK_TERRAIN_TEXTURE_SET.orm, uniforms.uRockOrm],
    ['height', ROCK_TERRAIN_TEXTURE_SET.height, uniforms.uRockHeight]
  ];
  try {
    const loaded = await Promise.all(entries.map(async ([kind, url, uniform]) => {
      const texture = configureTexture(await loader.loadAsync(url), `rock:pbr:${kind}`, anisotropy);
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
    if (loaded.length !== entries.length || loaded.some((texture) => !texture)) throw new Error(`rock_texture_count_mismatch:${loaded.length}:${entries.length}`);
    uniforms.uRockTextureFailure.value = 0;
    state.status = 'ready';
  } catch (error) {
    if (state.disposed) return state;
    const message = String(error?.message || error);
    state.errors.push(message);
    state.status = 'error_visible_diagnostic';
    uniforms.uRockTextureFailure.value = 1;
    console.error(`[BSB terrain] rock PBR texture failure: ${message}`);
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
