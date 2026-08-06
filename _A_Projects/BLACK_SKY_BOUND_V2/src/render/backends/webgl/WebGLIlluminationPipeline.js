const FULLSCREEN_VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const ILLUMINATION_COMPOSITE_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_scene;
uniform sampler2D u_illumination;
varying vec2 v_uv;
void main() {
  vec4 scene = texture2D(u_scene, v_uv);
  vec3 illumination = clamp(texture2D(u_illumination, v_uv).rgb, 0.0, 1.0);
  gl_FragColor = vec4(scene.rgb * illumination, scene.a);
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

export const WEBGL_ILLUMINATION_COMPOSITE_MODE = 'scene_colour_times_additive_illumination_field_v1';
export const WEBGL_ILLUMINATION_FIELD_MODE = 'ambient_plus_world_light_rgb_field_v1';

export class WebGLIlluminationPipeline {
  constructor(gl) {
    this.gl = gl;
    this.resources = createFullscreenResources(gl);
    this.illuminationTarget = null;
    this.litSceneTarget = null;
    this.width = 0;
    this.height = 0;
    this.compositeMode = WEBGL_ILLUMINATION_COMPOSITE_MODE;
    this.fieldMode = WEBGL_ILLUMINATION_FIELD_MODE;
    this.active = false;
    this.fieldPassCount = 0;
    this.compositePassCount = 0;
  }

  compositeWorld({
    scene,
    postProcess,
    camera,
    width,
    height,
    ambientColour,
    lightInfluences = [],
    attenuationTriangles = []
  }) {
    const sourceTexture = postProcess.getActiveSceneTexture();
    if (!sourceTexture) return this.inactiveResult();
    this.ensureRenderTargets(width, height);
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.illuminationTarget.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.clearColor(ambientColour[0], ambientColour[1], ambientColour[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (lightInfluences.length) scene.drawWorldRadialLights(lightInfluences, camera);
    if (attenuationTriangles.length) scene.drawTriangles(attenuationTriangles, camera);
    this.fieldPassCount = 1;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.litSceneTarget.framebuffer);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.useProgram(this.resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.buffer);
    gl.enableVertexAttribArray(this.resources.positionLocation);
    gl.vertexAttribPointer(this.resources.positionLocation, 2, gl.FLOAT, false, 0, 0);
    bindTexture(gl, sourceTexture, gl.TEXTURE0, 0, this.resources.sceneUniform);
    bindTexture(gl, this.illuminationTarget.texture, gl.TEXTURE1, 1, this.resources.illuminationUniform);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    postProcess.setActiveSceneTarget(this.litSceneTarget);
    this.active = true;
    this.compositePassCount = 1;
    return this.result();
  }

  ensureRenderTargets(width, height) {
    const targetWidth = Math.max(1, Math.floor(width || 1));
    const targetHeight = Math.max(1, Math.floor(height || 1));
    if (!this.illuminationTarget) this.illuminationTarget = createRenderTarget(this.gl);
    if (!this.litSceneTarget) this.litSceneTarget = createRenderTarget(this.gl);
    if (this.width === targetWidth && this.height === targetHeight) return;
    this.width = targetWidth;
    this.height = targetHeight;
    allocateTarget(this.gl, this.illuminationTarget, this.width, this.height, 'illumination');
    allocateTarget(this.gl, this.litSceneTarget, this.width, this.height, 'lit_scene');
  }

  result() {
    return {
      active: this.active,
      compositeMode: this.compositeMode,
      fieldMode: this.fieldMode,
      fieldPassCount: this.fieldPassCount,
      compositePassCount: this.compositePassCount
    };
  }

  inactiveResult() {
    this.active = false;
    this.fieldPassCount = 0;
    this.compositePassCount = 0;
    return this.result();
  }
}

function bindTexture(gl, texture, unit, index, uniform) {
  gl.activeTexture(unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(uniform, index);
}

function createRenderTarget(gl) {
  const framebuffer = gl.createFramebuffer();
  const texture = gl.createTexture();
  if (!framebuffer || !texture) throw new Error('webgl_illumination_render_target_unavailable');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { framebuffer, texture };
}

function allocateTarget(gl, target, width, height, label) {
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`webgl_${label}_framebuffer_incomplete:${status}`);
}

function createFullscreenResources(gl) {
  const program = createProgram(gl, FULLSCREEN_VERTEX_SHADER, ILLUMINATION_COMPOSITE_FRAGMENT_SHADER);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('webgl_illumination_composite_buffer_unavailable');
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLES, gl.STATIC_DRAW);
  return {
    program,
    buffer,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    sceneUniform: gl.getUniformLocation(program, 'u_scene'),
    illuminationUniform: gl.getUniformLocation(program, 'u_illumination')
  };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('webgl_illumination_composite_program_unavailable');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'unknown_link_error';
    gl.deleteProgram(program);
    throw new Error(`webgl_illumination_composite_program_link_failed:${info}`);
  }
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('webgl_illumination_composite_shader_unavailable');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'unknown_compile_error';
    gl.deleteShader(shader);
    throw new Error(`webgl_illumination_composite_shader_compile_failed:${info}`);
  }
  return shader;
}
