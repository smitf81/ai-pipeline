import * as THREE from 'three';
import { TERRAIN_WETNESS_GLSL } from './ThreeTerrainWetness.js';

export const THREE_LAYERED_TERRAIN_MATERIAL_CONTRACT = 'black-sky-bound.three-layered-terrain-material.v2';

export function createLayeredTerrainMaterial(options) {
  const uniforms = {
    uTerrainBaseColour: { value: options.pbrTextures.baseColour },
    uTerrainNormal: { value: options.pbrTextures.normal },
    uTerrainSurface: { value: options.pbrTextures.surface },
    uTerrainBlendMask: { value: options.blendMask.texture },
    uTerrainMapMeters: { value: new THREE.Vector2(options.mapWidthMeters, options.mapHeightMeters) },
    uTerrainMicroScale: { value: 1 / options.textureWorldMeters },
    uTerrainDebugMode: { value: options.debugModeValue },
    uRainWetness: { value: 0 },
    uRainRenderTime: { value: 0 },
    ...options.grassPbrTextures.uniforms,
    ...options.mudPbrTextures.uniforms
  };
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  material.name = 'terrain:layered-pbr-array-material';
  material.userData.terrainUniforms = uniforms;
  material.customProgramCacheKey = () => THREE_LAYERED_TERRAIN_MATERIAL_CONTRACT;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float terrainLayer;
flat varying float vTerrainLayer;
varying vec3 vTerrainWorldPosition;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTerrainLayer = terrainLayer;`)
      .replace('#include <project_vertex>', `vec4 terrainWorldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
terrainWorldPosition = batchingMatrix * terrainWorldPosition;
#endif
#ifdef USE_INSTANCING
terrainWorldPosition = instanceMatrix * terrainWorldPosition;
#endif
vTerrainWorldPosition = ( modelMatrix * terrainWorldPosition ).xyz;
#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
precision highp sampler2DArray;
uniform sampler2DArray uTerrainBaseColour;
uniform sampler2DArray uTerrainNormal;
uniform sampler2DArray uTerrainSurface;
uniform sampler2D uTerrainBlendMask;
uniform sampler2D uGrassBaseColour;
uniform sampler2D uGrassNormal;
uniform sampler2D uGrassOrm;
uniform sampler2D uGrassHeight;
uniform sampler2D uMudBaseColour, uMudNormal, uMudOrm, uMudHeight;
uniform vec2 uTerrainMapMeters;
uniform float uTerrainMicroScale;
uniform int uTerrainDebugMode;
uniform int uGrassTextureFailure;
uniform int uMudTextureFailure;
flat varying float vTerrainLayer;
varying vec3 vTerrainWorldPosition;
${TERRAIN_WETNESS_GLSL}

struct TerrainPbrSample {
  vec3 colour;
  vec3 tangentNormal;
  float roughness;
  float ao;
  float height;
  float wetness;
  vec3 weights;
};

vec4 terrainBaseBlend( vec2 uv, vec3 weights ) {
  return texture( uGrassBaseColour, uv ) * weights.r
    + texture( uMudBaseColour, uv ) * weights.g
    + texture( uTerrainBaseColour, vec3( uv, 2.0 ) ) * weights.b;
}

vec4 terrainNormalBlend( vec2 uv, vec3 weights ) {
  return texture( uGrassNormal, uv ) * weights.r
    + texture( uMudNormal, uv ) * weights.g
    + texture( uTerrainNormal, vec3( uv, 2.0 ) ) * weights.b;
}

vec4 terrainSurfaceBlend( vec2 uv, vec3 weights ) {
  vec4 grassOrm = texture( uGrassOrm, uv );
  vec4 grassSurface = vec4( grassOrm.g, grassOrm.r, texture( uGrassHeight, uv ).r, 1.0 );
  vec4 mudOrm = texture( uMudOrm, uv );
  vec4 mudSurface = vec4( mudOrm.g, mudOrm.r, texture( uMudHeight, uv ).r, 1.0 );
  return grassSurface * weights.r
    + mudSurface * weights.g
    + texture( uTerrainSurface, vec3( uv, 2.0 ) ) * weights.b;
}

vec3 terrainSrgbToLinear( vec3 colour ) {
  bvec3 cutoff = lessThanEqual( colour, vec3( 0.04045 ) );
  vec3 low = colour / 12.92;
  vec3 high = pow( ( colour + 0.055 ) / 1.055, vec3( 2.4 ) );
  return mix( high, low, vec3( cutoff ) );
}

float terrainMacroNoise( vec2 worldPosition ) {
  float broad = sin( worldPosition.x * 0.47 + sin( worldPosition.y * 0.31 ) * 1.6 );
  float cross = cos( worldPosition.y * 0.37 - sin( worldPosition.x * 0.19 ) * 2.0 );
  float diagonal = sin( worldPosition.x * 0.13 + worldPosition.y * 0.17 + cross );
  return clamp( broad * 0.24 + cross * 0.19 + diagonal * 0.13 + 0.5, 0.0, 1.0 );
}

TerrainPbrSample sampleTerrainPbr( vec2 worldPosition ) {
  vec2 maskUv = clamp( worldPosition / uTerrainMapMeters, vec2( 0.0001 ), vec2( 0.9999 ) );
  vec3 weights = texture( uTerrainBlendMask, maskUv ).rgb;
  float weightSum = weights.r + weights.g + weights.b;
  if ( weightSum < 0.001 ) {
    weights = vec3( vTerrainLayer < 0.5 ? 1.0 : 0.0, vTerrainLayer >= 0.5 && vTerrainLayer < 1.5 ? 1.0 : 0.0, vTerrainLayer >= 1.5 ? 1.0 : 0.0 );
  } else {
    weights /= weightSum;
  }
  vec2 microUv = worldPosition * uTerrainMicroScale;
  mat2 rotated = mat2( 0.819152, -0.573576, 0.573576, 0.819152 );
  vec2 secondaryUv = rotated * microUv * 0.537 + vec2( 0.173, 0.419 );
  float macro = terrainMacroNoise( worldPosition );
  vec4 baseA = terrainBaseBlend( microUv, weights );
  vec4 baseB = terrainBaseBlend( secondaryUv, weights );
  vec4 normalA = terrainNormalBlend( microUv, weights );
  vec4 normalB = terrainNormalBlend( secondaryUv, weights );
  vec4 surfaceA = terrainSurfaceBlend( microUv, weights );
  vec4 surfaceB = terrainSurfaceBlend( secondaryUv, weights );
  float secondaryMix = 0.18 + macro * 0.12;
  TerrainPbrSample sampleValue;
  sampleValue.colour = terrainSrgbToLinear( mix( baseA.rgb, baseB.rgb, secondaryMix ) ) * mix( 0.94, 1.09, macro );
  sampleValue.tangentNormal = normalize( mix( normalA.rgb, normalB.rgb, secondaryMix * 0.7 ) * 2.0 - 1.0 );
  vec3 surfaceValue = mix( surfaceA.rgb, surfaceB.rgb, secondaryMix );
  float dryRoughness = clamp( surfaceValue.r + ( 0.5 - macro ) * 0.09, 0.68, 1.0 );
  float response = dot( weights, vec3( 0.32, 0.98, 0.72 ) );
  float wetRoughness = dot( weights, vec3( 0.48, 0.13, 0.20 ) );
  float wetDarken = dot( weights, vec3( 0.90, 0.72, 0.78 ) );
  sampleValue.wetness = terrainRainMask( vTerrainWorldPosition, surfaceValue.b, response );
  sampleValue.colour *= mix( 1.0, wetDarken, sampleValue.wetness );
  sampleValue.roughness = mix( dryRoughness, wetRoughness, sampleValue.wetness );
  sampleValue.ao = clamp( surfaceValue.g, 0.68, 1.0 );
  sampleValue.height = surfaceValue.b;
  sampleValue.weights = weights;
  return sampleValue;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
TerrainPbrSample terrainPbr = sampleTerrainPbr( vTerrainWorldPosition.xz );
diffuseColor.rgb = terrainPbr.colour;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = terrainPbr.roughness;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 terrainWorldNormal = normalize( vec3( terrainPbr.tangentNormal.x, max( 0.08, terrainPbr.tangentNormal.z ), terrainPbr.tangentNormal.y ) );
normal = normalize( mat3( viewMatrix ) * terrainWorldNormal );`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= terrainPbr.ao;
reflectedLight.indirectSpecular *= terrainPbr.ao;`)
      .replace('#include <opaque_fragment>', `float authoredTextureFailureWeight = 0.0;
if ( uGrassTextureFailure == 1 ) authoredTextureFailureWeight = max( authoredTextureFailureWeight, smoothstep( 0.01, 0.7, terrainPbr.weights.r ) );
if ( uMudTextureFailure == 1 ) authoredTextureFailureWeight = max( authoredTextureFailureWeight, smoothstep( 0.01, 0.7, terrainPbr.weights.g ) );
if ( authoredTextureFailureWeight > 0.0 ) {
  outgoingLight = mix( outgoingLight, vec3( 1.0, 0.0, 0.72 ), authoredTextureFailureWeight );
} else if ( uTerrainDebugMode == 1 ) {
  outgoingLight = terrainPbr.weights.r * vec3( 0.08, 0.72, 0.28 ) + terrainPbr.weights.g * vec3( 0.72, 0.31, 0.08 ) + terrainPbr.weights.b * vec3( 0.74, 0.06, 0.28 );
} else if ( uTerrainDebugMode == 2 ) {
  outgoingLight = terrainPbr.tangentNormal * 0.5 + 0.5;
} else if ( uTerrainDebugMode == 3 ) {
  outgoingLight = mix( vec3( 0.015, 0.025, 0.035 ), vec3( 0.25, 0.72, 1.0 ), terrainPbr.wetness );
} else {
  outgoingLight += terrainRainReflection( vTerrainWorldPosition, terrainWorldNormal, terrainPbr.wetness );
}
#include <opaque_fragment>`);
  };
  return material;
}
