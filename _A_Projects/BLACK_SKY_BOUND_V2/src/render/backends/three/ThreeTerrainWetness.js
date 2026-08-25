export const THREE_TERRAIN_WETNESS_CONTRACT = 'black-sky-bound.three-rain-terrain-wetness.v1';

export const TERRAIN_WETNESS_RESPONSE = Object.freeze({
  grass: Object.freeze({ response: 0.32, wetRoughness: 0.48, darken: 0.9 }),
  dirt: Object.freeze({ response: 0.98, wetRoughness: 0.13, darken: 0.72 }),
  scorched: Object.freeze({ response: 0.72, wetRoughness: 0.2, darken: 0.78 }),
  rock: Object.freeze({ response: 0.86, wetRoughness: 0.16, darken: 0.74 }),
  forest: Object.freeze({ response: 0.42, wetRoughness: 0.48, darken: 0.83 }),
  water: Object.freeze({ response: 1, wetRoughness: 0.08, darken: 1 })
});

export function resolveTerrainRainWetness(packet, renderTime = 0) {
  const rainEnabled = packet?.enabled !== false && packet?.tuning?.rainEnabled !== false;
  const rainIntensity = rainEnabled ? clamp01(packet?.tuning?.rainDensity) : 0;
  return Object.freeze({
    contract: THREE_TERRAIN_WETNESS_CONTRACT,
    source: 'renderer_neutral_atmospheric_overlay_projection',
    policy: 'visual_only_instant_rain_response_no_gameplay_weather_or_persistence',
    rainEnabled,
    rainIntensity,
    renderTime: finite(renderTime),
    materialResponses: TERRAIN_WETNESS_RESPONSE
  });
}

export const TERRAIN_WETNESS_GLSL = `
uniform float uRainWetness;
uniform float uRainRenderTime;

float terrainWetField( vec2 worldPosition ) {
  float broad = sin( worldPosition.x * 0.61 + sin( worldPosition.y * 0.29 ) * 1.7 );
  float cross = cos( worldPosition.y * 0.53 - sin( worldPosition.x * 0.23 ) * 1.9 );
  float fine = sin( worldPosition.x * 1.37 + worldPosition.y * 1.11 + cross * 1.6 );
  return clamp( 0.5 + broad * 0.24 + cross * 0.18 + fine * 0.08, 0.0, 1.0 );
}

float terrainRainMask( vec3 worldPosition, float surfaceHeight, float response ) {
  float field = terrainWetField( worldPosition.xz );
  float lowPocket = clamp( 1.0 - surfaceHeight, 0.0, 1.0 );
  float pooling = smoothstep( 0.34, 0.82, field * 0.68 + lowPocket * 0.32 );
  return clamp( uRainWetness * response * mix( 0.34, 1.0, pooling ), 0.0, 1.0 );
}

vec3 terrainRainReflection( vec3 worldPosition, vec3 worldNormal, float wetness ) {
  vec3 viewDirection = normalize( cameraPosition - worldPosition );
  vec3 reflectedDirection = reflect( -viewDirection, normalize( worldNormal ) );
  float horizon = smoothstep( -0.2, 0.72, reflectedDirection.y );
  float fresnel = 0.025 + 0.975 * pow( 1.0 - clamp( dot( normalize( worldNormal ), viewDirection ), 0.0, 1.0 ), 4.0 );
  vec3 stormSky = mix( vec3( 0.012, 0.021, 0.034 ), vec3( 0.15, 0.205, 0.27 ), horizon );
  return stormSky * wetness * ( 0.08 + fresnel * 0.42 );
}`;

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
