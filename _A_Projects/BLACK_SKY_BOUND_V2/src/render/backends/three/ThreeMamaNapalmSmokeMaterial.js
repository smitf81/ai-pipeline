import * as THREE from 'three';

export function createMamaNapalmSmokeMaterial() {
  const material = new THREE.ShaderMaterial({
    name: 'mama-napalm:entwined-charcoal-smoke',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uMaterialOpacity: { value: 1 }
    },
    vertexShader: `
      attribute vec4 aSmokeParams;
      varying vec2 vUv;
      varying vec4 vEffectParams;
      void main() {
        vUv = uv;
        vEffectParams = aSmokeParams;
        vec4 instancePosition = instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * instancePosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uMaterialOpacity;
      varying vec2 vUv;
      varying vec4 vEffectParams;

      float hash11(float value) {
        return fract(sin(value * 83.173 + 11.719) * 43758.5453);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float seed = dot(cell, vec2(127.1, 311.7));
        return mix(
          mix(hash11(seed), hash11(seed + 127.1), local.x),
          mix(hash11(seed + 311.7), hash11(seed + 438.8), local.x),
          local.y
        );
      }

      float fbm(vec2 point) {
        float value = 0.0;
        float amplitude = 0.58;
        for (int octave = 0; octave < 3; octave++) {
          value += valueNoise(point) * amplitude;
          point = point * 2.07 + vec2(8.7, 17.3);
          amplitude *= 0.46;
        }
        return value;
      }

      float ellipseSdf(vec2 point, vec2 center, vec2 radii) {
        return (length((point - center) / max(radii, vec2(0.001))) - 1.0) * min(radii.x, radii.y);
      }

      float smoothUnion(float a, float b, float radius) {
        float h = clamp(0.5 + 0.5 * (b - a) / radius, 0.0, 1.0);
        return mix(b, a, h) - radius * h * (1.0 - h);
      }

      void main() {
        float seed = vEffectParams.x * 29.0;
        float strength = clamp(vEffectParams.y, 0.0, 1.0);
        float decay = clamp(vEffectParams.z, 0.0, 1.0);
        float maturity = clamp(vEffectParams.w, 0.0, 1.0);
        vec2 point = vec2(mix(-1.24, 1.24, vUv.x), mix(-0.72, 1.16, vUv.y));
        float rollA = sin(uTime * 0.7 + seed);
        float rollB = sin(uTime * 0.52 + seed * 1.3 + 2.1);
        vec2 warped = point;
        warped.x += (fbm(vec2(point.y * 2.8 + seed, uTime * 0.18)) - 0.5) * 0.2 + rollA * point.y * 0.035;
        warped.y += (fbm(vec2(point.x * 2.2 + seed, -uTime * 0.13)) - 0.5) * 0.07;
        float curlSide = hash11(seed + 8.4) > 0.5 ? 1.0 : -1.0;
        float lower = ellipseSdf(warped, vec2(-0.25 + rollA * 0.025, 0.24), vec2(0.58, 0.22));
        float middle = ellipseSdf(warped, vec2(0.18 + rollB * 0.055, 0.49), vec2(0.52, 0.29));
        float upper = ellipseSdf(warped, vec2(-0.08 + rollA * 0.065, 0.73), vec2(0.42, 0.25));
        float curl = ellipseSdf(warped, vec2(curlSide * (0.32 + rollB * 0.04), 0.72 + rollA * 0.025), vec2(0.3, 0.18));
        float crown = ellipseSdf(warped, vec2(-curlSide * 0.18 + rollA * 0.045, 0.93), vec2(0.28, 0.2));
        float shape = smoothUnion(lower, middle, 0.16);
        shape = smoothUnion(shape, upper, 0.14);
        shape = mix(shape, smoothUnion(shape, curl, 0.12), maturity);
        shape = mix(shape, smoothUnion(shape, crown, 0.1), maturity);
        float turbulentEdge = fbm(vec2(warped.x * 3.3 + seed, warped.y * 3.8 - uTime * 0.22)) - 0.5;
        float tornEdge = valueNoise(vec2(warped.x * 8.4 + seed * 1.4, warped.y * 9.2 + uTime * 0.3)) - 0.5;
        shape += turbulentEdge * (0.1 + maturity * 0.035) + tornEdge * 0.026;
        float cloud = 1.0 - smoothstep(-0.018, 0.058, shape);
        float smokeNoise = fbm(vec2(warped.x * 4.2 - uTime * 0.16, warped.y * 5.1 + seed));
        float breakup = 0.54 + smokeNoise * 0.46;
        float verticalFade = smoothstep(0.015, 0.14, point.y) * (1.0 - smoothstep(0.94, 1.14, point.y));
        float sootDensity = smoothstep(0.44, 0.83, smokeNoise) * (0.72 + maturity * 0.28);
        float smokeOpacity = mix(0.08, 0.54, maturity) + decay * 0.095;
        float densityOpacity = mix(0.72, 1.16, sootDensity);
        float alpha = cloud * breakup * verticalFade * strength * smokeOpacity * densityOpacity * uMaterialOpacity;
        vec3 warmSmoke = mix(vec3(0.07, 0.028, 0.014), vec3(0.145, 0.07, 0.035), turbulentEdge + 0.5);
        vec3 blackSmoke = mix(vec3(0.004, 0.004, 0.004), vec3(0.03, 0.029, 0.028), clamp(point.y * 0.7, 0.0, 1.0));
        vec3 colour = mix(warmSmoke, blackSmoke, clamp(maturity * 0.82 + sootDensity * 0.38, 0.0, 1.0));
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(colour, alpha);
      }
    `
  });
  material.opacity = 1;
  material.forceSinglePass = true;
  return material;
}
