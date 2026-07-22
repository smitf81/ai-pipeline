import { ATMOSPHERIC_POST_PROCESS_POLISH_MODE, POST_PROCESS_POLISH_TUNING } from '../../../data/postProcessPolish.js';

const FULLSCREEN_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const VIGNETTE_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform float u_gradeStrength;
uniform float u_shadowCoolStrength;
uniform float u_fireWarmStrength;
uniform float u_vignetteStrength;
uniform float u_vignetteRadius;
uniform float u_grainStrength;
uniform float u_glowProxyStrength;
uniform float u_lowHealthPostStrength;
uniform float u_healthPressure;
uniform float u_hitPulse;
uniform float u_staminaPressure;
uniform float u_breathPulse;
uniform float u_desaturation;
uniform float u_contrast;
uniform float u_time;
varying vec2 v_uv;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec4 scene = texture2D(u_scene, v_uv);
  vec3 color = scene.rgb;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float grade = clamp(u_gradeStrength, 0.0, 1.0);
  float shadow = 1.0 - smoothstep(0.08, 0.56, luma);
  float warm = clamp(color.r * 1.15 + color.g * 0.25 - color.b * 1.1, 0.0, 1.0) * smoothstep(0.18, 0.9, luma);
  vec3 gray = vec3(luma);
  float pressure = clamp(u_healthPressure + u_hitPulse * 0.72, 0.0, 1.0);
  float breath = clamp(u_staminaPressure + u_breathPulse * 0.38, 0.0, 1.0);
  color = mix(color, gray, clamp(u_desaturation, 0.0, 0.55) + grade * shadow * (1.0 - warm * 0.7) * 0.28);
  vec3 coolShadow = color * vec3(0.88, 0.95, 1.08) + vec3(0.0, 0.01, 0.028);
  color = mix(color, coolShadow, grade * shadow * clamp(u_shadowCoolStrength, 0.0, 1.0));
  vec3 fireWarm = vec3(1.0, 0.48, 0.16);
  color += fireWarm * warm * grade * clamp(u_fireWarmStrength, 0.0, 1.0);
  float brightWarm = smoothstep(0.42, 0.95, luma) * warm;
  color += fireWarm * brightWarm * grade * clamp(u_glowProxyStrength, 0.0, 0.3);
  vec2 centered = v_uv * 2.0 - 1.0;
  centered.x *= u_resolution.x / max(1.0, u_resolution.y);
  float edge = smoothstep(clamp(u_vignetteRadius, 0.45, 1.25), 1.34, length(centered));
  float vignette = 1.0 - edge * clamp(u_vignetteStrength + pressure * u_lowHealthPostStrength + breath * 0.08, 0.0, 0.62);
  color *= vignette;
  color = mix(color, vec3(0.32, 0.015, 0.016), edge * clamp(pressure * (0.16 + u_lowHealthPostStrength * 0.4), 0.0, 0.42));
  color = mix(color, vec3(0.015, 0.033, 0.07), edge * clamp(breath * 0.16, 0.0, 0.28));
  color = mix(vec3(0.5), color, 1.0 + clamp(u_contrast, 0.0, 0.18));
  float grain = hash12(floor(gl_FragCoord.xy) + floor(u_time * 7.0));
  color += (grain - 0.5) * clamp(u_grainStrength, 0.0, 0.06) * mix(0.55, 1.0, shadow);
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), scene.a);
}
`;

const FULLSCREEN_TRIANGLES = new Float32Array([
  -1, -1,
  1, -1,
  -1, 1,
  -1, 1,
  1, -1,
  1, 1
]);

export const WEBGL_POST_PROCESS_MODE = ATMOSPHERIC_POST_PROCESS_POLISH_MODE;
export const WEBGL_BODY_STATE_POST_PROCESS_MODE = 'atmospheric_post_process_polish_body_state_v0';
export const WEBGL_POST_PROCESS_PASSTHROUGH_MODE = 'copy_passthrough_v0';

export class WebGLPostProcessPipeline {
  constructor(gl) {
    this.gl = gl;
    this.resources = createFullscreenResources(gl);
    this.target = null;
    this.width = 0;
    this.height = 0;
    this.mode = WEBGL_POST_PROCESS_MODE;
    this.passCount = 0;
    this.renderTargetActive = false;
  }

  beginScene(width, height) {
    const target = this.ensureRenderTarget(width, height);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    this.renderTargetActive = true;
    this.passCount = 0;
    return target;
  }

  compositeToScreen({ enabled = true, bodyState = null, tuning = POST_PROCESS_POLISH_TUNING, width = this.width, height = this.height, renderTime = 0 } = {}) {
    if (!this.target) {
      return {
        mode: WEBGL_POST_PROCESS_PASSTHROUGH_MODE,
        passCount: 0,
        renderTargetActive: false
      };
    }
    const gl = this.gl;
    const blendWasEnabled = gl.isEnabled(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    if (blendWasEnabled) gl.disable(gl.BLEND);

    gl.useProgram(this.resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.buffer);
    gl.enableVertexAttribArray(this.resources.positionLocation);
    gl.vertexAttribPointer(this.resources.positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.target.texture);
    gl.uniform1i(this.resources.sceneUniform, 0);
    gl.uniform2f(this.resources.resolutionUniform, this.width, this.height);
    const post = bodyState?.postProcess ?? {};
    const active = enabled && tuning?.postEnabled !== false;
    const vignetteStrength = tuning?.vignetteStrength ?? post.baseVignetteStrength ?? POST_PROCESS_POLISH_TUNING.vignetteStrength;
    gl.uniform1f(this.resources.gradeStrengthUniform, active ? (tuning?.gradeStrength ?? 0) : 0);
    gl.uniform1f(this.resources.shadowCoolStrengthUniform, active ? (tuning?.shadowCoolStrength ?? 0) : 0);
    gl.uniform1f(this.resources.fireWarmStrengthUniform, active ? (tuning?.fireWarmStrength ?? 0) : 0);
    gl.uniform1f(this.resources.vignetteStrengthUniform, active ? vignetteStrength : 0);
    gl.uniform1f(this.resources.vignetteRadiusUniform, tuning?.vignetteRadius ?? POST_PROCESS_POLISH_TUNING.vignetteRadius);
    gl.uniform1f(this.resources.grainStrengthUniform, active ? (tuning?.grainStrength ?? 0) : 0);
    gl.uniform1f(this.resources.glowProxyStrengthUniform, active ? (tuning?.glowProxyStrength ?? 0) : 0);
    gl.uniform1f(this.resources.lowHealthPostStrengthUniform, active ? (tuning?.lowHealthPostStrength ?? 0) : 0);
    gl.uniform1f(this.resources.healthPressureUniform, active ? (post.healthPressure ?? 0) : 0);
    gl.uniform1f(this.resources.hitPulseUniform, active ? (post.hitPulse ?? 0) : 0);
    gl.uniform1f(this.resources.staminaPressureUniform, active ? (post.staminaPressure ?? 0) : 0);
    gl.uniform1f(this.resources.breathPulseUniform, active ? (post.breathPulse ?? 0) : 0);
    gl.uniform1f(this.resources.desaturationUniform, active ? (post.desaturation ?? 0) : 0);
    gl.uniform1f(this.resources.contrastUniform, active ? (post.contrast ?? 0) : 0);
    gl.uniform1f(this.resources.timeUniform, Number.isFinite(renderTime) ? renderTime : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (blendWasEnabled) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    this.passCount = 1;
    this.renderTargetActive = true;
    this.mode = active ? (bodyState ? WEBGL_BODY_STATE_POST_PROCESS_MODE : WEBGL_POST_PROCESS_MODE) : WEBGL_POST_PROCESS_PASSTHROUGH_MODE;
    return {
      mode: this.mode,
      passCount: this.passCount,
      renderTargetActive: this.renderTargetActive
    };
  }

  ensureRenderTarget(width, height) {
    const targetWidth = Math.max(1, Math.floor(width || 1));
    const targetHeight = Math.max(1, Math.floor(height || 1));
    if (this.target && this.width === targetWidth && this.height === targetHeight) return this.target;

    const gl = this.gl;
    if (!this.target) {
      this.target = createRenderTarget(gl);
    }
    this.width = targetWidth;
    this.height = targetHeight;

    gl.bindTexture(gl.TEXTURE_2D, this.target.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.width,
      this.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target.texture, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`webgl_post_process_framebuffer_incomplete:${status}`);
    }
    return this.target;
  }
}

function createRenderTarget(gl) {
  const framebuffer = gl.createFramebuffer();
  const texture = gl.createTexture();
  if (!framebuffer || !texture) throw new Error('webgl_post_process_render_target_unavailable');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { framebuffer, texture };
}

function createFullscreenResources(gl) {
  const program = createProgram(gl, FULLSCREEN_VERTEX_SHADER, VIGNETTE_FRAGMENT_SHADER);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('webgl_post_process_buffer_unavailable');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLES, gl.STATIC_DRAW);
  return {
    program,
    buffer,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    sceneUniform: gl.getUniformLocation(program, 'u_scene'),
    resolutionUniform: gl.getUniformLocation(program, 'u_resolution'),
    gradeStrengthUniform: gl.getUniformLocation(program, 'u_gradeStrength'),
    shadowCoolStrengthUniform: gl.getUniformLocation(program, 'u_shadowCoolStrength'),
    fireWarmStrengthUniform: gl.getUniformLocation(program, 'u_fireWarmStrength'),
    vignetteStrengthUniform: gl.getUniformLocation(program, 'u_vignetteStrength'),
    vignetteRadiusUniform: gl.getUniformLocation(program, 'u_vignetteRadius'),
    grainStrengthUniform: gl.getUniformLocation(program, 'u_grainStrength'),
    glowProxyStrengthUniform: gl.getUniformLocation(program, 'u_glowProxyStrength'),
    lowHealthPostStrengthUniform: gl.getUniformLocation(program, 'u_lowHealthPostStrength'),
    healthPressureUniform: gl.getUniformLocation(program, 'u_healthPressure'),
    hitPulseUniform: gl.getUniformLocation(program, 'u_hitPulse'),
    staminaPressureUniform: gl.getUniformLocation(program, 'u_staminaPressure'),
    breathPulseUniform: gl.getUniformLocation(program, 'u_breathPulse'),
    desaturationUniform: gl.getUniformLocation(program, 'u_desaturation'),
    contrastUniform: gl.getUniformLocation(program, 'u_contrast'),
    timeUniform: gl.getUniformLocation(program, 'u_time')
  };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('webgl_post_process_program_unavailable');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'unknown_link_error';
    gl.deleteProgram(program);
    throw new Error(`webgl_post_process_program_link_failed:${info}`);
  }
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('webgl_post_process_shader_unavailable');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'unknown_compile_error';
    gl.deleteShader(shader);
    throw new Error(`webgl_post_process_shader_compile_failed:${info}`);
  }
  return shader;
}
