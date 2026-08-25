import * as THREE from 'three';

export const FOLIAGE_PBR_MATERIAL_CONTRACT = 'black-sky-bound.three-foliage-pbr-material.v1';
export const FOLIAGE_PBR_TEXTURE_SET = Object.freeze({
  contract: 'black-sky-bound.stylized-foliage-pbr-texture-set.v1',
  id: 'stylized_foliage_shared_recipe_tinted_v1',
  size: 1024,
  normalOrientation: 'open_gl_positive_green_v',
  source: 'bark_and_grass_style_reference_guided_openai_generated_albedo_with_deterministic_derived_channels',
  licence: 'project_generated_asset_reference_usage_scope_not_independently_verified',
  albedo: new URL('../../../../assets/textures/scenery/stylized-foliage-v1/albedo.png', import.meta.url).href,
  normal: new URL('../../../../assets/textures/scenery/stylized-foliage-v1/normal-open-gl.png', import.meta.url).href,
  orm: new URL('../../../../assets/textures/scenery/stylized-foliage-v1/orm.png', import.meta.url).href,
  height: new URL('../../../../assets/textures/scenery/stylized-foliage-v1/height.png', import.meta.url).href
});

export function createSharedFoliagePbrTextures(options = {}) {
  const anisotropy = Math.max(1, Math.min(8, Number(options.anisotropy) || 1));
  const textures = {
    albedo: solidTexture([255, 0, 204, 255], 'foliage:pbr:loading-albedo'),
    normal: solidTexture([128, 128, 255, 255], 'foliage:pbr:loading-normal'),
    orm: solidTexture([255, 255, 0, 255], 'foliage:pbr:loading-orm'),
    height: solidTexture([128, 128, 128, 255], 'foliage:pbr:loading-height')
  };
  const uniforms = {
    uFoliageAlbedo: { value: textures.albedo },
    uFoliageNormal: { value: textures.normal },
    uFoliageOrm: { value: textures.orm },
    uFoliageHeight: { value: textures.height },
    uFoliageTextureFailure: { value: 1 }
  };
  const state = {
    contract: FOLIAGE_PBR_MATERIAL_CONTRACT,
    status: canLoadImages() ? 'loading' : 'headless_descriptor',
    loadedTextureCount: 0,
    textureCount: 4,
    textureSetCount: 1,
    errors: [],
    source: FOLIAGE_PBR_TEXTURE_SET.source,
    licence: FOLIAGE_PBR_TEXTURE_SET.licence,
    textureSetId: FOLIAGE_PBR_TEXTURE_SET.id,
    textureSize: `${FOLIAGE_PBR_TEXTURE_SET.size}x${FOLIAGE_PBR_TEXTURE_SET.size}`,
    projection: 'tree_space_dominant_axis_triplanar_shared_across_tree_recipes',
    samplePolicy: 'one_albedo_one_normal_one_orm_fetch_per_fragment',
    normalOrientation: FOLIAGE_PBR_TEXTURE_SET.normalOrientation,
    metallicPolicy: 'dielectric_zero_from_orm_blue',
    heightPolicy: 'derived_channel_loaded_for_inspection_no_displacement',
    disposed: false
  };
  const ready = canLoadImages()
    ? loadFoliageTextureSet(textures, uniforms, state, anisotropy)
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

export function createFoliagePbrMaterial(sharedTextures, tuning) {
  if (!sharedTextures?.uniforms || !tuning) throw new Error('foliage_pbr_material_inputs_invalid');
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true
  });
  const recipeUniforms = {
    uFoliageTint: { value: new THREE.Color(tuning.tint) },
    uFoliageSaturation: { value: tuning.saturation },
    uFoliageBrightness: { value: tuning.brightness },
    uFoliageUvScale: { value: 1 / tuning.textureWorldMeters },
    uFoliageNormalStrength: { value: tuning.normalStrength },
    uFoliageRoughnessBias: { value: tuning.roughnessBias }
  };
  const sceneryStateUniforms = createSceneryStateUniforms();
  material.name = `tree:foliage:pbr:${tuning.variantId}`;
  material.userData.foliagePbr = {
    contract: FOLIAGE_PBR_MATERIAL_CONTRACT,
    textureSetId: FOLIAGE_PBR_TEXTURE_SET.id,
    tuning: { ...tuning },
    sharedTextureUniforms: sharedTextures.uniforms,
    recipeUniforms,
    sceneryStateUniforms
  };
  material.customProgramCacheKey = () => FOLIAGE_PBR_MATERIAL_CONTRACT;
  installFoliageShader(material, sharedTextures.uniforms, recipeUniforms, sceneryStateUniforms);
  return material;
}

function installFoliageShader(material, sharedUniforms, recipeUniforms, sceneryStateUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedUniforms, recipeUniforms, sceneryStateUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vFoliageTreePosition;
varying vec3 vFoliageTreeNormal;
varying vec3 vFoliageViewAxisX;
varying vec3 vFoliageViewAxisY;
varying vec3 vFoliageViewAxisZ;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec3 foliageTreeNormal = objectNormal;
#ifdef USE_INSTANCING
  mat3 foliageInstanceBasis = mat3( instanceMatrix );
  foliageTreeNormal /= vec3(
    dot( foliageInstanceBasis[ 0 ], foliageInstanceBasis[ 0 ] ),
    dot( foliageInstanceBasis[ 1 ], foliageInstanceBasis[ 1 ] ),
    dot( foliageInstanceBasis[ 2 ], foliageInstanceBasis[ 2 ] )
  );
  foliageTreeNormal = foliageInstanceBasis * foliageTreeNormal;
#endif
vFoliageTreeNormal = normalize( foliageTreeNormal );
vFoliageViewAxisX = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );
vFoliageViewAxisY = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );
vFoliageViewAxisZ = normalize( normalMatrix * vec3( 0.0, 0.0, 1.0 ) );`)
      .replace('#include <project_vertex>', `vec4 foliageTreePosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  foliageTreePosition = instanceMatrix * foliageTreePosition;
#endif
vFoliageTreePosition = foliageTreePosition.xyz;
#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uFoliageAlbedo;
uniform sampler2D uFoliageNormal;
uniform sampler2D uFoliageOrm;
uniform sampler2D uFoliageHeight;
uniform vec3 uFoliageTint;
uniform float uFoliageSaturation;
uniform float uFoliageBrightness;
uniform float uFoliageUvScale;
uniform float uFoliageNormalStrength;
uniform float uFoliageRoughnessBias;
uniform int uFoliageTextureFailure;
uniform float uSceneryCharAmount;
uniform float uSceneryHeatAmount;
uniform float uSceneryEmberAmount;
varying vec3 vFoliageTreePosition;
varying vec3 vFoliageTreeNormal;
varying vec3 vFoliageViewAxisX;
varying vec3 vFoliageViewAxisY;
varying vec3 vFoliageViewAxisZ;

struct FoliagePbrSample {
  vec3 colour;
  vec3 treeNormal;
  float roughness;
  float ao;
  float metallic;
};

vec3 foliageSrgbToLinear( vec3 colour ) {
  bvec3 cutoff = lessThanEqual( colour, vec3( 0.04045 ) );
  vec3 low = colour / 12.92;
  vec3 high = pow( ( colour + 0.055 ) / 1.055, vec3( 2.4 ) );
  return mix( high, low, vec3( cutoff ) );
}

int foliageDominantAxis( vec3 surfaceNormal ) {
  vec3 axisWeight = abs( surfaceNormal );
  if ( axisWeight.x >= axisWeight.y && axisWeight.x >= axisWeight.z ) return 0;
  if ( axisWeight.y >= axisWeight.z ) return 1;
  return 2;
}

vec2 foliageDominantUv( vec3 treePosition, vec3 surfaceNormal, int axis ) {
  if ( axis == 0 ) return vec2( treePosition.z * sign( surfaceNormal.x ), treePosition.y ) * uFoliageUvScale;
  if ( axis == 1 ) return vec2( treePosition.x * sign( surfaceNormal.y ), treePosition.z ) * uFoliageUvScale;
  return vec2( treePosition.x * sign( surfaceNormal.z ), treePosition.y ) * uFoliageUvScale;
}

vec3 foliageMappedNormal( vec3 tangentNormal, int axis, float axisSign ) {
  tangentNormal.xy *= uFoliageNormalStrength;
  tangentNormal = normalize( tangentNormal );
  if ( axis == 0 ) return normalize( vec3( tangentNormal.z * axisSign, tangentNormal.y, tangentNormal.x ) );
  if ( axis == 1 ) return normalize( vec3( tangentNormal.x, tangentNormal.z * axisSign, tangentNormal.y ) );
  return normalize( vec3( tangentNormal.x, tangentNormal.y, tangentNormal.z * axisSign ) );
}

FoliagePbrSample sampleFoliagePbr( vec3 treePosition, vec3 geometricNormal ) {
  int axis = foliageDominantAxis( geometricNormal );
  float axisSign = axis == 0 ? sign( geometricNormal.x ) : axis == 1 ? sign( geometricNormal.y ) : sign( geometricNormal.z );
  axisSign = axisSign == 0.0 ? 1.0 : axisSign;
  vec2 uv = foliageDominantUv( treePosition, geometricNormal, axis );
  vec3 albedo = foliageSrgbToLinear( texture( uFoliageAlbedo, uv ).rgb );
  vec3 orm = texture( uFoliageOrm, uv ).rgb;
  vec3 mappedNormal = foliageMappedNormal( texture( uFoliageNormal, uv ).xyz * 2.0 - 1.0, axis, axisSign );
  float sourceLuma = dot( albedo, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 sourceColour = mix( vec3( sourceLuma ), albedo, uFoliageSaturation );
  float sourceColourLuma = max( 0.0001, dot( sourceColour, vec3( 0.2126, 0.7152, 0.0722 ) ) );
  vec3 sourceChroma = sourceColour / sourceColourLuma;
  float relief = clamp( pow( max( 0.0001, sourceLuma / 0.055 ), 0.7 ), 0.48, 1.55 );
  float macro = clamp( 0.5 + sin( treePosition.x * 0.73 + treePosition.y * 0.29 ) * 0.17
    + cos( treePosition.z * 0.61 - treePosition.y * 0.21 ) * 0.09, 0.0, 1.0 );
  FoliagePbrSample sampleValue;
  sampleValue.colour = uFoliageTint * relief * uFoliageBrightness
    * mix( vec3( 1.0 ), sourceChroma, 0.22 ) * mix( 0.93, 1.07, macro );
  sampleValue.treeNormal = mappedNormal;
  sampleValue.ao = clamp( orm.r, 0.58, 1.0 );
  sampleValue.roughness = clamp( orm.g + uFoliageRoughnessBias, 0.7, 0.98 );
  sampleValue.metallic = clamp( orm.b, 0.0, 0.02 );
  return sampleValue;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
FoliagePbrSample foliagePbr = sampleFoliagePbr( vFoliageTreePosition, normalize( vFoliageTreeNormal ) );
float foliageCharMix = clamp( uSceneryCharAmount * 0.92, 0.0, 0.92 );
diffuseColor.rgb = mix( foliagePbr.colour, vec3( 0.012, 0.008, 0.006 ), foliageCharMix );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = foliagePbr.roughness;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = foliagePbr.metallic;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(
  vFoliageViewAxisX * foliagePbr.treeNormal.x
  + vFoliageViewAxisY * foliagePbr.treeNormal.y
  + vFoliageViewAxisZ * foliagePbr.treeNormal.z
);`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= foliagePbr.ao;
reflectedLight.indirectSpecular *= foliagePbr.ao;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float foliageFireGlow = clamp( uSceneryHeatAmount * 0.58 + uSceneryEmberAmount * 0.16, 0.0, 0.82 );
totalEmissiveRadiance += vec3( 1.0, 0.055, 0.008 ) * foliageFireGlow;`)
      .replace('#include <opaque_fragment>', `if ( uFoliageTextureFailure == 1 ) {
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

async function loadFoliageTextureSet(textures, uniforms, state, anisotropy) {
  const loader = new THREE.TextureLoader();
  const entries = [
    ['albedo', FOLIAGE_PBR_TEXTURE_SET.albedo, uniforms.uFoliageAlbedo],
    ['normal', FOLIAGE_PBR_TEXTURE_SET.normal, uniforms.uFoliageNormal],
    ['orm', FOLIAGE_PBR_TEXTURE_SET.orm, uniforms.uFoliageOrm],
    ['height', FOLIAGE_PBR_TEXTURE_SET.height, uniforms.uFoliageHeight]
  ];
  try {
    const loaded = await Promise.all(entries.map(async ([kind, url, uniform]) => {
      const texture = configureTexture(await loader.loadAsync(url), `foliage:pbr:${kind}`, anisotropy);
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
      throw new Error(`foliage_texture_count_mismatch:${loaded.length}:${entries.length}`);
    }
    uniforms.uFoliageTextureFailure.value = 0;
    state.status = 'ready';
  } catch (error) {
    if (state.disposed) return state;
    const message = String(error?.message || error);
    state.errors.push(message);
    state.status = 'error_visible_diagnostic';
    uniforms.uFoliageTextureFailure.value = 1;
    console.error(`[BSB scenery] foliage PBR texture failure: ${message}`);
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
