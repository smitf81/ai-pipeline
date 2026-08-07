const INFERNO_CLUSTER_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_local;
attribute vec2 a_tangent;
attribute vec4 a_params;
uniform vec4 u_camera;
uniform vec2 u_viewport;
varying vec2 v_local;
varying vec2 v_tangent;
varying vec4 v_params;
void main() {
  vec2 screen = (a_position - u_camera.xy) * u_camera.z + u_viewport * 0.5;
  vec2 clip = vec2((screen.x / u_viewport.x) * 2.0 - 1.0, 1.0 - (screen.y / u_viewport.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_local = a_local;
  v_tangent = a_tangent;
  v_params = a_params;
}
`;

const INFERNO_CLUSTER_FRAGMENT_SHADER = `
precision mediump float;
uniform float u_age;
uniform float u_life_scale;
varying vec2 v_local;
varying vec2 v_tangent;
varying vec4 v_params;

float hash(float value) {
  return fract(sin(value * 91.173 + 17.719) * 43758.5453);
}

float ellipseDistance(vec2 point, vec2 center, vec2 radii) {
  return length((point - center) / max(radii, vec2(0.001)));
}

float lobe(vec2 point, vec2 center, vec2 radii, float softness) {
  float distanceToEdge = ellipseDistance(point, center, radii);
  return 1.0 - smoothstep(1.0 - softness, 1.0, distanceToEdge);
}

vec4 over(vec4 under, vec4 top) {
  float alpha = top.a + under.a * (1.0 - top.a);
  if (alpha <= 0.0001) return vec4(0.0);
  vec3 rgb = (top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / alpha;
  return vec4(rgb, alpha);
}

void main() {
  vec2 point = v_local;
  float phase = v_params.y;
  float role = floor(v_params.z / 4.0);
  float variant = mod(v_params.z, 4.0);
  float seed = v_params.x * 31.0 + variant * 7.0 + role * 13.0;
  float accent = step(0.5, v_params.w);
  float bridgeRole = 1.0 - step(0.5, role);
  float secondaryRole = step(0.5, role) * (1.0 - step(1.5, role));
  float dominantRole = step(1.5, role);
  float fullMassRole = secondaryRole + dominantRole;
  float rollA = sin(u_age * 2.15 + phase);
  float rollB = sin(u_age * 1.73 + phase * 1.47 + 1.4);
  float boil = sin(u_age * 3.2 + phase * 0.83);
  float ignitionBloom = smoothstep(0.0, 1.1, u_age);
  float massBloom = mix(0.74, 1.0, ignitionBloom);
  float foldA = massBloom * (1.0 + fullMassRole * (rollA * 0.045 + dominantRole * rollB * 0.025));
  float foldB = massBloom * (1.0 - fullMassRole * rollA * 0.04 + dominantRole * rollB * 0.035);
  float foldC = massBloom * (1.0 + fullMassRole * rollB * 0.04);
  float upwardFold = fullMassRole * (0.03 + dominantRole * 0.035) * (0.5 + rollA * 0.5);
  float side = hash(seed + 3.1) > 0.5 ? 1.0 : -1.0;
  float topologySide = mod(variant, 2.0) < 0.5 ? -1.0 : 1.0;
  float upperBias = step(1.5, variant);
  float variantShift = (hash(seed + 5.7) - 0.5) * 0.24 + topologySide * 0.055;
  float widthJitter = 0.88 + hash(seed + 6.4) * 0.24;
  float heightJitter = 0.86 + hash(seed + 6.9) * 0.27;
  float liftA = (hash(seed + 8.1) - 0.5) * 0.16;
  float liftB = (hash(seed + 8.7) - 0.5) * 0.18;
  float reachA = 0.48 + hash(seed + 9.3) * 0.17;
  float reachB = 0.49 + hash(seed + 9.9) * 0.18;
  float reachC = 0.39 + hash(seed + 10.4) * 0.14;
  vec2 combustionPoint = point + vec2(
    sin(point.y * 10.5 + seed * 1.7 + rollB) * 0.04 + sin(point.y * 18.0 - seed) * 0.016,
    sin(point.x * 8.5 + seed * 1.3 + rollA) * 0.043 + upwardFold
  );
  vec2 tangent = normalize(v_tangent);
  vec2 normal = vec2(-tangent.y, tangent.x);

  vec2 fuelPoint = point - vec2(variantShift * 0.2, 0.3 + boil * 0.008);
  vec2 fuelLocal = vec2(dot(fuelPoint, tangent), dot(fuelPoint, normal));
  float fuel = lobe(fuelLocal, vec2(0.0), vec2(0.67 * widthJitter, 0.065 + hash(seed + 7.2) * 0.03), 0.7);
  float contact = lobe(fuelLocal, vec2(side * 0.06, -0.04), vec2(0.61 * widthJitter, 0.16), 0.62);
  float bankShift = (hash(seed + 7.7) - 0.5) * 0.1;
  float baseBankA = lobe(fuelLocal, vec2(-0.34 + bankShift, -0.09), vec2(0.53 * widthJitter, 0.3), 0.6);
  float baseBankB = lobe(fuelLocal, vec2(0.16 - bankShift * 0.5, -0.12), vec2(0.58 * widthJitter, 0.35), 0.58);
  float baseBankC = lobe(fuelLocal, vec2(0.5 + bankShift * 0.4, -0.065), vec2(0.36 * widthJitter, 0.25), 0.62);

  float smokeA = lobe(combustionPoint, vec2(-side * 0.28 + rollB * 0.045, -0.11 + rollA * 0.035), vec2(0.58 * widthJitter * foldA, 0.48 * heightJitter * foldB), 0.52);
  float smokeB = lobe(combustionPoint, vec2(side * 0.22 - rollA * 0.035, -0.39 + rollB * 0.04), vec2(0.52 * foldC, 0.42 * heightJitter * foldA), 0.55);
  float smoke = max(smokeA, smokeB * (0.62 + fullMassRole * 0.24));

  float outerA = lobe(combustionPoint, vec2(-0.34 + variantShift + rollA * 0.05, 0.02 + liftA + rollB * 0.035), vec2(reachA * widthJitter * foldA, (0.37 + hash(seed + 11.2) * 0.13) * heightJitter * foldB), 0.4);
  float outerB = lobe(combustionPoint, vec2(0.04 - variantShift * 0.45 + rollB * 0.045, -0.19 - upperBias * 0.07 + liftB + rollA * 0.05), vec2(reachB * foldB, (0.46 + hash(seed + 11.8) * 0.14) * heightJitter * foldC), 0.38);
  float outerC = lobe(combustionPoint, vec2(0.38 + variantShift * 0.7 + topologySide * 0.04 - rollA * 0.04, -0.03 - upperBias * 0.05 - liftA * 0.55 + rollB * 0.035), vec2(reachC * widthJitter * foldC, (0.34 + hash(seed + 12.4) * 0.11) * foldA), 0.42);

  float hotDrift = (hash(seed + 13.2) - 0.5) * 0.18;
  float orangeA = lobe(combustionPoint, vec2(-0.3 + variantShift + hotDrift + rollA * 0.06, 0.015 + liftA * 0.7 + rollB * 0.035), vec2((0.32 + hash(seed + 13.8) * 0.1) * widthJitter * foldA, (0.25 + hash(seed + 14.4) * 0.09) * heightJitter * foldB), 0.48);
  float orangeB = lobe(combustionPoint, vec2(0.04 - variantShift * 0.5 - hotDrift * 0.65 + rollB * 0.055, -0.18 - upperBias * 0.05 + liftB * 0.65 + rollA * 0.06), vec2((0.36 + hash(seed + 15.1) * 0.12) * foldB, (0.34 + hash(seed + 15.7) * 0.1) * heightJitter * foldC), 0.46);
  float orangeC = lobe(combustionPoint, vec2(0.34 + variantShift * 0.55 + hotDrift * 0.5 - rollA * 0.045, -0.03 - liftA * 0.45 + rollB * 0.04), vec2((0.25 + hash(seed + 16.4) * 0.1) * widthJitter * foldC, (0.23 + hash(seed + 16.9) * 0.08) * foldA), 0.5);
  float innerA = lobe(combustionPoint, vec2(-0.16 + variantShift * 0.35 + rollB * 0.035, -0.06 + rollA * 0.03), vec2(0.22 * foldA, 0.19 * heightJitter * foldB), 0.5);
  float innerB = lobe(combustionPoint, vec2(0.17 - variantShift * 0.25 - rollA * 0.03, -0.15 + rollB * 0.035), vec2(0.2 * foldB, 0.23 * heightJitter * foldC), 0.52);
  float secondaryThirdLobe = step(0.46, hash(seed + 17.0));
  float thirdLobeRole = dominantRole + secondaryRole * secondaryThirdLobe;
  float coreEnabled = accent * dominantRole;
  vec2 coreCenter = vec2(-0.08 + variantShift * 0.7 + side * hash(seed + 18.1) * 0.12, -0.08 - hash(seed + 18.8) * 0.16 + boil * 0.012);
  vec2 coreRadii = vec2(0.065 + hash(seed + 19.3) * 0.038, 0.085 + hash(seed + 19.9) * 0.045);
  float core = lobe(combustionPoint, coreCenter, coreRadii, 0.54) * coreEnabled;

  float lean = side * (0.1 + hash(seed + 11.0) * 0.08) + rollA * 0.035;
  float tongueOuter = lobe(point, vec2(lean * 0.35, -0.39 + rollB * 0.03), vec2(0.18, 0.42), 0.44);
  tongueOuter = max(tongueOuter, lobe(point, vec2(lean, -0.68 + rollA * 0.035), vec2(0.105, 0.27), 0.5));
  float tongueInner = lobe(point, vec2(lean * 0.45, -0.37 + rollB * 0.02), vec2(0.095, 0.29), 0.48);
  tongueOuter *= accent;
  tongueInner *= accent;

  float life = clamp(u_life_scale, 0.0, 1.0);
  float hotStrengthA = 0.46 + hash(seed + 27.1) * 0.2;
  float hotStrengthB = 0.48 + hash(seed + 27.7) * 0.2;
  float hotStrengthC = 0.4 + hash(seed + 28.3) * 0.18;
  float bankRole = 0.72 + bridgeRole * 0.28;
  float smokeFoldA = lobe(combustionPoint, vec2(side * 0.27 + rollB * 0.02, -0.27 + rollA * 0.025), vec2(0.3, 0.25), 0.58);
  float smokeFoldB = lobe(combustionPoint, vec2(-side * 0.43, -0.02 + rollB * 0.018), vec2(0.24, 0.19), 0.6);
  float smokeFold = max(smokeFoldA, smokeFoldB * 0.8);
  vec4 color = vec4(0.0);
  color = over(color, vec4(0.025, 0.004, 0.003, fuel * life * (0.08 + bridgeRole * 0.06)));
  color = over(color, vec4(0.08, 0.035, 0.026, smoke * life * (0.26 + fullMassRole * 0.12)));
  color = over(color, vec4(0.36, 0.016, 0.003, contact * life * (0.18 + bridgeRole * 0.15)));
  color = over(color, vec4(0.31, 0.01, 0.003, baseBankA * life * 0.58 * bankRole));
  color = over(color, vec4(0.4, 0.016, 0.003, baseBankB * life * 0.64 * bankRole));
  color = over(color, vec4(0.28, 0.009, 0.003, baseBankC * life * 0.56 * bankRole));
  color = over(color, vec4(0.4, 0.015, 0.003, outerA * life * (0.58 + bridgeRole * 0.12)));
  color = over(color, vec4(0.52, 0.024, 0.004, outerB * life * (0.34 + fullMassRole * 0.2 + bridgeRole * 0.18)));
  color = over(color, vec4(0.31, 0.009, 0.003, outerC * life * 0.56 * thirdLobeRole));
  color = over(color, vec4(0.42, 0.014, 0.003, tongueOuter * life * 0.64));
  color = over(color, vec4(0.96, 0.075, 0.003, orangeA * life * hotStrengthA * (0.58 + fullMassRole * 0.42)));
  color = over(color, vec4(1.0, 0.16, 0.006, orangeB * life * hotStrengthB * (0.42 + secondaryRole * 0.46 + dominantRole * 0.58)));
  color = over(color, vec4(0.82, 0.045, 0.002, orangeC * life * hotStrengthC * thirdLobeRole));
  color = over(color, vec4(1.0, 0.22, 0.008, tongueInner * life * 0.46));
  color = over(color, vec4(1.0, 0.36, 0.02, innerA * life * 0.56 * (fullMassRole + bridgeRole * 0.24)));
  color = over(color, vec4(1.0, 0.25, 0.01, innerB * life * 0.5 * (dominantRole + secondaryRole * secondaryThirdLobe)));
  color = over(color, vec4(0.045, 0.016, 0.011, smokeFold * life * 0.42 * (0.24 + fullMassRole * 0.76)));
  color = over(color, vec4(1.0, 0.82, 0.32, core * life * 0.8));
  if (color.a <= 0.002) discard;
  gl_FragColor = color;
}
`;

export class WebGLInfernoClusterRenderer {
  constructor(gl) {
    this.gl = gl;
    this.resources = createResources(gl);
    this.buffers = new Map();
  }

  draw(composition, camera) {
    if (!composition?.clusters?.length) return 0;
    const entry = this.ensureBuffer(composition);
    const gl = this.gl;
    const resources = this.resources;
    const stride = 10 * 4;
    gl.useProgram(resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, entry.buffer);
    enableAttribute(gl, resources.positionLocation, 2, stride, 0);
    enableAttribute(gl, resources.localLocation, 2, stride, 8);
    enableAttribute(gl, resources.tangentLocation, 2, stride, 16);
    enableAttribute(gl, resources.paramsLocation, 4, stride, 24);
    gl.uniform4f(resources.cameraUniform, camera.x, camera.y, camera.zoom, 0);
    gl.uniform2f(resources.viewportUniform, camera.viewportW, camera.viewportH);
    gl.uniform1f(resources.ageUniform, composition.age);
    gl.uniform1f(resources.lifeScaleUniform, composition.lifeScale);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, entry.vertexCount);
    composition.bufferReuseCount += entry.uploadedThisDraw ? 0 : 1;
    entry.uploadedThisDraw = false;
    return composition.clusterCount;
  }

  retain(ids) {
    const active = new Set(ids);
    for (const [id, entry] of this.buffers) {
      if (active.has(id)) continue;
      this.gl.deleteBuffer(entry.buffer);
      this.buffers.delete(id);
    }
  }

  ensureBuffer(composition) {
    const current = this.buffers.get(composition.id);
    if (current?.signature === composition.signature) return current;
    if (current) this.gl.deleteBuffer(current.buffer);
    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error('webgl_inferno_cluster_buffer_unavailable');
    const data = buildVertexData(composition.clusters);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
    const entry = {
      buffer,
      signature: composition.signature,
      vertexCount: composition.clusterCount * 6,
      uploadedThisDraw: true
    };
    this.buffers.set(composition.id, entry);
    composition.bufferState = 'static_gpu_buffer_retained';
    composition.bufferUploadCount += 1;
    return entry;
  }
}

function buildVertexData(clusters) {
  const data = new Float32Array(clusters.length * 6 * 10);
  let offset = 0;
  for (const cluster of clusters) {
    offset = writeVertex(data, offset, cluster, -1, -1);
    offset = writeVertex(data, offset, cluster, 1, -1);
    offset = writeVertex(data, offset, cluster, -1, 1);
    offset = writeVertex(data, offset, cluster, -1, 1);
    offset = writeVertex(data, offset, cluster, 1, -1);
    offset = writeVertex(data, offset, cluster, 1, 1);
  }
  return data;
}

function writeVertex(data, offset, cluster, localX, localY) {
  data[offset++] = cluster.worldX + localX * cluster.halfWidth;
  data[offset++] = cluster.worldY + localY * cluster.halfHeight;
  data[offset++] = localX;
  data[offset++] = localY;
  data[offset++] = cluster.tangentLocalX;
  data[offset++] = cluster.tangentLocalY;
  data[offset++] = cluster.seed01;
  data[offset++] = cluster.phase;
  data[offset++] = cluster.variant + cluster.role * 4;
  data[offset++] = cluster.accent;
  return offset;
}

function enableAttribute(gl, location, size, stride, offset) {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
}

function createResources(gl) {
  const program = createProgram(gl, INFERNO_CLUSTER_VERTEX_SHADER, INFERNO_CLUSTER_FRAGMENT_SHADER);
  return {
    program,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    localLocation: gl.getAttribLocation(program, 'a_local'),
    tangentLocation: gl.getAttribLocation(program, 'a_tangent'),
    paramsLocation: gl.getAttribLocation(program, 'a_params'),
    cameraUniform: gl.getUniformLocation(program, 'u_camera'),
    viewportUniform: gl.getUniformLocation(program, 'u_viewport'),
    ageUniform: gl.getUniformLocation(program, 'u_age'),
    lifeScaleUniform: gl.getUniformLocation(program, 'u_life_scale')
  };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('webgl_inferno_cluster_program_unavailable');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'unknown_link_error';
    gl.deleteProgram(program);
    throw new Error(`webgl_inferno_cluster_program_failed:${info}`);
  }
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('webgl_inferno_cluster_shader_unavailable');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'unknown_compile_error';
    gl.deleteShader(shader);
    throw new Error(`webgl_inferno_cluster_shader_failed:${info}`);
  }
  return shader;
}
