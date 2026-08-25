import * as THREE from 'three';
import { TERRAIN_WETNESS_GLSL, THREE_TERRAIN_WETNESS_CONTRACT } from './ThreeTerrainWetness.js';

export const THREE_WATER_TERRAIN_MATERIAL_CONTRACT = 'black-sky-bound.three-water-terrain-material.v1';

export function createWaterTerrainMaterial(options = {}) {
  const uniforms = {
    uWaterDebugMode: { value: Number(options.debugMode) || 0 },
    uRainWetness: { value: 0 },
    uRainRenderTime: { value: 0 }
  };
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.1,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.075,
    ior: 1.333
  });
  material.name = 'terrain:water:reflective-physical-material';
  material.userData.waterUniforms = uniforms;
  material.customProgramCacheKey = () => THREE_WATER_TERRAIN_MATERIAL_CONTRACT;
  installWaterShader(material, uniforms);
  const state = {
    contract: THREE_WATER_TERRAIN_MATERIAL_CONTRACT,
    status: 'ready',
    errors: [],
    shaderModel: 'opaque_dielectric_fresnel_reflection_dual_wave_normals_and_rain_ripples',
    projection: 'continuous_world_xz_across_instanced_water_tiles',
    roughnessRange: Object.freeze([0.07, 0.13]),
    wetnessContract: THREE_TERRAIN_WETNESS_CONTRACT,
    rainIntensity: 0,
    renderTime: 0
  };
  return {
    material,
    state,
    setDebugMode(value) { uniforms.uWaterDebugMode.value = Number(value) || 0; },
    setRain(wetness) {
      uniforms.uRainWetness.value = Number(wetness?.rainIntensity) || 0;
      uniforms.uRainRenderTime.value = Number(wetness?.renderTime) || 0;
      state.rainIntensity = uniforms.uRainWetness.value;
      state.renderTime = uniforms.uRainRenderTime.value;
    }
  };
}

function installWaterShader(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWaterWorldPosition;
varying vec3 vWaterWorldNormal;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec3 waterObjectNormal = objectNormal;
#ifdef USE_BATCHING
waterObjectNormal = mat3( batchingMatrix ) * waterObjectNormal;
#endif
#ifdef USE_INSTANCING
waterObjectNormal = mat3( instanceMatrix ) * waterObjectNormal;
#endif
vWaterWorldNormal = normalize( mat3( modelMatrix ) * waterObjectNormal );`)
      .replace('#include <project_vertex>', `vec4 waterWorldPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
waterWorldPosition = batchingMatrix * waterWorldPosition;
#endif
#ifdef USE_INSTANCING
waterWorldPosition = instanceMatrix * waterWorldPosition;
#endif
vWaterWorldPosition = ( modelMatrix * waterWorldPosition ).xyz;
#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform int uWaterDebugMode;
varying vec3 vWaterWorldPosition;
varying vec3 vWaterWorldNormal;
${TERRAIN_WETNESS_GLSL}

vec3 waterSurfaceNormal( vec3 worldPosition, vec3 geometricNormal ) {
  float time = uRainRenderTime;
  float waveA = sin( worldPosition.x * 2.15 + worldPosition.z * 1.31 + time * 0.72 );
  float waveB = cos( worldPosition.x * -1.17 + worldPosition.z * 2.43 - time * 0.54 );
  float ripple = sin( length( fract( worldPosition.xz * 0.73 ) - 0.5 ) * 31.0 - time * 5.4 );
  vec3 waveNormal = normalize( vec3(
    waveA * 0.072 + waveB * 0.04 + ripple * uRainWetness * 0.045,
    1.0,
    waveB * 0.068 - waveA * 0.036 + ripple * uRainWetness * 0.038
  ) );
  float upward = smoothstep( 0.45, 0.88, geometricNormal.y );
  return normalize( mix( geometricNormal, waveNormal, upward ) );
}

float waterRainRing( vec3 worldPosition ) {
  vec2 scaled = worldPosition.xz * 2.2;
  vec2 cell = floor( scaled );
  float seed = fract( sin( dot( cell, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  vec2 offset = ( vec2( fract( seed * 7.13 ), fract( seed * 13.71 ) ) - 0.5 ) * 0.42;
  vec2 local = fract( scaled ) - 0.5 - offset;
  float radius = length( local );
  float ring = sin( radius * 44.0 - uRainRenderTime * 7.4 + seed * 6.28318 );
  float ringActive = step( 0.7, seed );
  return smoothstep( 0.86, 1.0, ring ) * ( 1.0 - smoothstep( 0.1, 0.42, radius ) ) * ringActive * uRainWetness;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
float waterField = terrainWetField( vWaterWorldPosition.xz + vec2( uRainRenderTime * 0.035, 0.0 ) );
vec3 waterDeep = vec3( 0.008, 0.027, 0.043 );
vec3 waterShallow = vec3( 0.018, 0.075, 0.095 );
float waveShade = sin( vWaterWorldPosition.x * 2.15 + vWaterWorldPosition.z * 1.31 + uRainRenderTime * 0.72 ) * 0.035;
diffuseColor.rgb = mix( waterDeep, waterShallow, 0.28 + waterField * 0.32 + waveShade );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix( 0.13, 0.07, clamp( uRainWetness * 0.72 + waterField * 0.18, 0.0, 1.0 ) );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 waterWorldNormal = waterSurfaceNormal( vWaterWorldPosition, normalize( vWaterWorldNormal ) );
normal = normalize( mat3( viewMatrix ) * waterWorldNormal );`)
      .replace('#include <opaque_fragment>', `if ( uWaterDebugMode == 1 ) {
  outgoingLight = vec3( 0.08, 0.42, 0.72 );
} else if ( uWaterDebugMode == 2 ) {
  outgoingLight = waterWorldNormal * 0.5 + 0.5;
} else if ( uWaterDebugMode == 3 ) {
  outgoingLight = vec3( 0.25, 0.72, 1.0 );
} else {
  outgoingLight += terrainRainReflection( vWaterWorldPosition, waterWorldNormal, 1.0 ) * 2.35;
  outgoingLight += vec3( 0.08, 0.14, 0.18 ) * waterRainRing( vWaterWorldPosition ) * 0.14;
}
#include <opaque_fragment>`);
  };
}
