import * as THREE from 'three';

export const BARK_PBR_MATERIAL_CONTRACT = 'black-sky-bound.three-bark-pbr-material.v1';
export const BARK_PBR_TEXTURE_SET = Object.freeze({
  contract: 'black-sky-bound.stylized-bark-pbr-texture-set.v1',
  id: 'stylized_bark_shared_recipe_tinted_v1',
  size: 1024,
  normalOrientation: 'open_gl_positive_green_v',
  source: 'terrain_style_reference_guided_openai_generated_albedo_with_deterministic_derived_channels',
  licence: 'project_generated_asset_reference_usage_scope_not_independently_verified',
  albedo: new URL('../../../../assets/textures/scenery/stylized-bark-v1/albedo.png', import.meta.url).href,
  normal: new URL('../../../../assets/textures/scenery/stylized-bark-v1/normal-open-gl.png', import.meta.url).href,
  orm: new URL('../../../../assets/textures/scenery/stylized-bark-v1/orm.png', import.meta.url).href,
  height: new URL('../../../../assets/textures/scenery/stylized-bark-v1/height.png', import.meta.url).href
});

export function createSharedBarkPbrTextures(options = {}) {
  const anisotropy = Math.max(1, Math.min(8, Number(options.anisotropy) || 1));
  const textures = {
    albedo: solidTexture([255, 0, 204, 255], 'bark:pbr:loading-albedo'),
    normal: solidTexture([128, 128, 255, 255], 'bark:pbr:loading-normal'),
    orm: solidTexture([255, 255, 0, 255], 'bark:pbr:loading-orm'),
    height: solidTexture([128, 128, 128, 255], 'bark:pbr:loading-height')
  };
  const uniforms = {
    uBarkAlbedo: { value: textures.albedo },
    uBarkNormal: { value: textures.normal },
    uBarkOrm: { value: textures.orm },
    uBarkHeight: { value: textures.height },
    uBarkTextureFailure: { value: 1 }
  };
  const state = {
    contract: BARK_PBR_MATERIAL_CONTRACT,
    status: canLoadImages() ? 'loading' : 'headless_descriptor',
    loadedTextureCount: 0,
    textureCount: 4,
    textureSetCount: 1,
    errors: [],
    source: BARK_PBR_TEXTURE_SET.source,
    licence: BARK_PBR_TEXTURE_SET.licence,
    textureSetId: BARK_PBR_TEXTURE_SET.id,
    textureSize: `${BARK_PBR_TEXTURE_SET.size}x${BARK_PBR_TEXTURE_SET.size}`,
    projection: 'object_space_weighted_triplanar_shared_across_tree_recipes',
    normalOrientation: BARK_PBR_TEXTURE_SET.normalOrientation,
    metallicPolicy: 'dielectric_zero_from_orm_blue',
    heightPolicy: 'derived_channel_loaded_for_inspection_no_displacement',
    disposed: false
  };
  const ready = canLoadImages()
    ? loadBarkTextureSet(textures, uniforms, state, anisotropy)
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

export function createBarkPbrMaterial(sharedTextures, tuning) {
  if (!sharedTextures?.uniforms || !tuning) throw new Error('bark_pbr_material_inputs_invalid');
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: false
  });
  const recipeUniforms = {
    uBarkTint: { value: new THREE.Color(tuning.tint) },
    uBarkSaturation: { value: tuning.saturation },
    uBarkBrightness: { value: tuning.brightness },
    uBarkUvScale: { value: 1 / tuning.textureWorldMeters },
    uBarkNormalStrength: { value: tuning.normalStrength },
    uBarkRoughnessBias: { value: tuning.roughnessBias }
  };
  const sceneryStateUniforms = createSceneryStateUniforms();
  material.name = `tree:bark:pbr:${tuning.variantId}`;
  material.userData.barkPbr = {
    contract: BARK_PBR_MATERIAL_CONTRACT,
    textureSetId: BARK_PBR_TEXTURE_SET.id,
    tuning: { ...tuning },
    sharedTextureUniforms: sharedTextures.uniforms,
    recipeUniforms,
    sceneryStateUniforms
  };
  material.customProgramCacheKey = () => BARK_PBR_MATERIAL_CONTRACT;
  installBarkShader(material, sharedTextures.uniforms, recipeUniforms, sceneryStateUniforms);
  return material;
}

function installBarkShader(material, sharedUniforms, recipeUniforms, sceneryStateUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms, recipeUniforms, sceneryStateUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vBarkObjectPosition;
varying vec3 vBarkObjectNormal;
varying vec3 vBarkViewAxisX;
varying vec3 vBarkViewAxisY;
varying vec3 vBarkViewAxisZ;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vBarkObjectNormal = normalize( objectNormal );
vBarkViewAxisX = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );
vBarkViewAxisY = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );
vBarkViewAxisZ = normalize( normalMatrix * vec3( 0.0, 0.0, 1.0 ) );`)
      .replace('#include <project_vertex>', `vBarkObjectPosition = transformed;
#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uBarkAlbedo;
uniform sampler2D uBarkNormal;
uniform sampler2D uBarkOrm;
uniform sampler2D uBarkHeight;
uniform vec3 uBarkTint;
uniform float uBarkSaturation;
uniform float uBarkBrightness;
uniform float uBarkUvScale;
uniform float uBarkNormalStrength;
uniform float uBarkRoughnessBias;
uniform int uBarkTextureFailure;
uniform float uSceneryCharAmount;
uniform float uSceneryHeatAmount;
uniform float uSceneryEmberAmount;
varying vec3 vBarkObjectPosition;
varying vec3 vBarkObjectNormal;
varying vec3 vBarkViewAxisX;
varying vec3 vBarkViewAxisY;
varying vec3 vBarkViewAxisZ;

struct BarkPbrSample {
  vec3 colour;
  vec3 objectNormal;
  float roughness;
  float ao;
  float metallic;
};

vec3 barkSrgbToLinear( vec3 colour ) {
  bvec3 cutoff = lessThanEqual( colour, vec3( 0.04045 ) );
  vec3 low = colour / 12.92;
  vec3 high = pow( ( colour + 0.055 ) / 1.055, vec3( 2.4 ) );
  return mix( high, low, vec3( cutoff ) );
}

vec3 barkTriplanarWeights( vec3 surfaceNormal ) {
  vec3 weights = pow( abs( surfaceNormal ), vec3( 6.0 ) );
  return weights / max( 0.0001, weights.x + weights.y + weights.z );
}

vec3 barkMappedNormal( vec3 tangentNormal, int axis, float axisSign ) {
  tangentNormal.xy *= uBarkNormalStrength;
  tangentNormal = normalize( tangentNormal );
  if ( axis == 0 ) return normalize( vec3( tangentNormal.z * axisSign, tangentNormal.y, tangentNormal.x ) );
  if ( axis == 1 ) return normalize( vec3( tangentNormal.x, tangentNormal.z * axisSign, tangentNormal.y ) );
  return normalize( vec3( tangentNormal.x, tangentNormal.y, tangentNormal.z * axisSign ) );
}

BarkPbrSample sampleBarkPbr( vec3 objectPosition, vec3 geometricNormal ) {
  vec3 weights = barkTriplanarWeights( geometricNormal );
  vec3 axisSign = sign( geometricNormal );
  axisSign = vec3(
    axisSign.x == 0.0 ? 1.0 : axisSign.x,
    axisSign.y == 0.0 ? 1.0 : axisSign.y,
    axisSign.z == 0.0 ? 1.0 : axisSign.z
  );
  vec2 uvX = objectPosition.zy * uBarkUvScale;
  vec2 uvY = objectPosition.xz * uBarkUvScale;
  vec2 uvZ = objectPosition.xy * uBarkUvScale;
  vec3 albedo = barkSrgbToLinear(
    texture( uBarkAlbedo, uvX ).rgb * weights.x
    + texture( uBarkAlbedo, uvY ).rgb * weights.y
    + texture( uBarkAlbedo, uvZ ).rgb * weights.z
  );
  vec3 orm = texture( uBarkOrm, uvX ).rgb * weights.x
    + texture( uBarkOrm, uvY ).rgb * weights.y
    + texture( uBarkOrm, uvZ ).rgb * weights.z;
  vec3 normalX = barkMappedNormal( texture( uBarkNormal, uvX ).xyz * 2.0 - 1.0, 0, axisSign.x );
  vec3 normalY = barkMappedNormal( texture( uBarkNormal, uvY ).xyz * 2.0 - 1.0, 1, axisSign.y );
  vec3 normalZ = barkMappedNormal( texture( uBarkNormal, uvZ ).xyz * 2.0 - 1.0, 2, axisSign.z );
  float sourceLuma = dot( albedo, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 sourceColour = mix( vec3( sourceLuma ), albedo, uBarkSaturation );
  float sourceColourLuma = max( 0.0001, dot( sourceColour, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  vec3 sourceChroma = sourceColour / sourceColourLuma;
  float relief = clamp( pow( max( 0.0001, sourceLuma / 0.055 ), 0.72 ), 0.42, 1.55 );
  float macro = clamp( 0.5 + sin( objectPosition.y * 0.39 + objectPosition.x * 0.23 ) * 0.18
    + cos( objectPosition.z * 0.31 - objectPosition.y * 0.09 ) * 0.1, 0.0, 1.0 );
  BarkPbrSample sampleValue;
  sampleValue.colour = uBarkTint * relief * uBarkBrightness
    * mix( vec3( 1.0 ), sourceChroma, 0.16 ) * mix( 0.94, 1.055, macro );
  sampleValue.objectNormal = normalize( normalX * weights.x + normalY * weights.y + normalZ * weights.z );
  sampleValue.ao = clamp( orm.r, 0.5, 1.0 );
  sampleValue.roughness = clamp( orm.g + uBarkRoughnessBias, 0.72, 0.99 );
  sampleValue.metallic = clamp( orm.b, 0.0, 0.02 );
  return sampleValue;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
BarkPbrSample barkPbr = sampleBarkPbr( vBarkObjectPosition, normalize( vBarkObjectNormal ) );
float barkCharMix = clamp( uSceneryCharAmount * 0.78, 0.0, 0.78 );
diffuseColor.rgb = mix( barkPbr.colour, vec3( 0.018, 0.01, 0.006 ), barkCharMix );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = barkPbr.roughness;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = barkPbr.metallic;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(
  vBarkViewAxisX * barkPbr.objectNormal.x
  + vBarkViewAxisY * barkPbr.objectNormal.y
  + vBarkViewAxisZ * barkPbr.objectNormal.z
);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= barkPbr.ao;
reflectedLight.indirectSpecular *= barkPbr.ao;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float barkFireGlow = clamp( uSceneryHeatAmount * 0.46 + uSceneryEmberAmount * 0.22, 0.0, 0.72 );
totalEmissiveRadiance += vec3( 1.0, 0.045, 0.006 ) * barkFireGlow;`)
      .replace('#include <opaque_fragment>', `if ( uBarkTextureFailure == 1 ) {
  outgoingLight = vec3( 1.0, 0.0, 0.72 );
}
#include <opaque_fragment>`);
  };
}

function createSceneryStateUniforms() {
  return {
    uSceneryCharAmount: { value: 0 },
    uSceneryHeatAmount: { value: 0 },
    uSceneryEmberAmount: { value: 0 }
  };
}

async function loadBarkTextureSet(textures, uniforms, state, anisotropy) {
  const loader = new THREE.TextureLoader();
  const entries = [
    ['albedo', BARK_PBR_TEXTURE_SET.albedo, uniforms.uBarkAlbedo],
    ['normal', BARK_PBR_TEXTURE_SET.normal, uniforms.uBarkNormal],
    ['orm', BARK_PBR_TEXTURE_SET.orm, uniforms.uBarkOrm],
    ['height', BARK_PBR_TEXTURE_SET.height, uniforms.uBarkHeight]
  ];
  try {
    const loaded = await Promise.all(entries.map(async ([kind, url, uniform]) => {
      const texture = configureTexture(await loader.loadAsync(url), `bark:pbr:${kind}`, anisotropy);
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
      throw new Error(`bark_texture_count_mismatch:${loaded.length}:${entries.length}`);
    }
    uniforms.uBarkTextureFailure.value = 0;
    state.status = 'ready';
  } catch (error) {
    if (state.disposed) return state;
    const message = String(error?.message || error);
    state.errors.push(message);
    state.status = 'error_visible_diagnostic';
    uniforms.uBarkTextureFailure.value = 1;
    console.error(`[BSB scenery] bark PBR texture failure: ${message}`);
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
