import { WebGLTextureQuadRenderer } from './WebGLTextureQuad.js';
import { WebGLInfernoClusterRenderer } from './WebGLInfernoClusterRenderer.js';

const RECT_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec4 a_color;
uniform vec4 u_camera;
uniform vec2 u_viewport;
varying vec4 v_color;
void main() {
  vec2 screen = (a_position - u_camera.xy) * u_camera.z + u_viewport * 0.5;
  vec2 clip = vec2((screen.x / u_viewport.x) * 2.0 - 1.0, 1.0 - (screen.y / u_viewport.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}
`;

const RECT_FRAGMENT_SHADER = `
precision mediump float;
varying vec4 v_color;
void main() {
  gl_FragColor = v_color;
}
`;

const RADIAL_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_local;
attribute vec4 a_color;
attribute float a_softness;
uniform vec4 u_camera;
uniform vec2 u_viewport;
varying vec2 v_local;
varying vec4 v_color;
varying float v_softness;
void main() {
  vec2 screen = (a_position - u_camera.xy) * u_camera.z + u_viewport * 0.5;
  vec2 clip = vec2((screen.x / u_viewport.x) * 2.0 - 1.0, 1.0 - (screen.y / u_viewport.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_local = a_local;
  v_color = a_color;
  v_softness = a_softness;
}
`;

const RADIAL_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_local;
varying vec4 v_color;
varying float v_softness;
void main() {
  float d = length(v_local);
  if (d > 1.0) discard;
  float inner = clamp(1.0 - v_softness, 0.04, 0.96);
  float falloff = 1.0 - smoothstep(inner, 1.0, d);
  float alpha = v_color.a * falloff;
  gl_FragColor = vec4(v_color.rgb, alpha);
}
`;

const SHADOW_FIELD_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_start;
attribute vec2 a_end;
attribute vec2 a_radius;
attribute float a_softness;
attribute vec4 a_blend;
attribute vec4 a_color;
uniform vec2 u_viewport;
varying vec2 v_point;
varying vec2 v_start;
varying vec2 v_end;
varying vec2 v_radius;
varying float v_softness;
varying vec4 v_blend;
varying vec4 v_color;
void main() {
  vec2 clip = vec2((a_position.x / u_viewport.x) * 2.0 - 1.0, 1.0 - (a_position.y / u_viewport.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_point = a_position;
  v_start = a_start;
  v_end = a_end;
  v_radius = a_radius;
  v_softness = a_softness;
  v_blend = a_blend;
  v_color = a_color;
}
`;

const SHADOW_FIELD_FRAGMENT_SHADER = `
precision highp float;
varying vec2 v_point;
varying vec2 v_start;
varying vec2 v_end;
varying vec2 v_radius;
varying float v_softness;
varying vec4 v_blend;
varying vec4 v_color;

float taperedCapsuleSdf(vec2 point, vec2 start, vec2 end, vec2 radii, out float along) {
  vec2 axis = end - start;
  float axisLengthSq = max(dot(axis, axis), 0.0001);
  along = clamp(dot(point - start, axis) / axisLengthSq, 0.0, 1.0);
  vec2 closest = start + axis * along;
  float radius = mix(radii.x, radii.y, along);
  return length(point - closest) - radius;
}

void main() {
  float along = 0.0;
  float signedDistance = taperedCapsuleSdf(v_point, v_start, v_end, v_radius, along);
  float radius = max(1.0, mix(v_radius.x, v_radius.y, along));
  float edge = max(1.0, radius * clamp(v_softness, 0.08, 1.6) * 0.42);
  float coverage = 1.0 - smoothstep(-edge, edge, signedDistance);
  float edgeGamma = max(0.6, v_blend.x);
  float blendStrength = clamp(v_blend.y, 0.05, 1.8);
  float tailFloor = clamp(v_blend.z, 0.08, 0.96);
  float contactBoost = clamp(v_blend.w, 0.5, 1.8);
  float curvedCoverage = pow(clamp(coverage, 0.0, 1.0), edgeGamma);
  float tailFade = mix(1.0, tailFloor, smoothstep(0.24, 1.0, along));
  float contactFade = mix(contactBoost, 1.0, smoothstep(0.0, 0.36, along));
  float alpha = v_color.a * curvedCoverage * tailFade * contactFade * blendStrength;
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(v_color.rgb, alpha);
}
`;

export class WebGLSceneRoot {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', webglContextAttributes())
      || canvas.getContext('webgl', webglContextAttributes())
      || canvas.getContext('experimental-webgl', webglContextAttributes());
    if (!this.gl) throw new Error('webgl_context_unavailable');
    this.resources = createRectResources(this.gl);
    this.radialResources = createRadialResources(this.gl);
    this.shadowFieldResources = createShadowFieldResources(this.gl);
    this.textureQuadRenderer = new WebGLTextureQuadRenderer(this.gl);
    this.infernoClusterRenderer = new WebGLInfernoClusterRenderer(this.gl);
    this.rectVertexData = new Float32Array(0);
    this.triangleVertexData = new Float32Array(0);
    this.radialVertexData = new Float32Array(0);
    this.shadowFieldVertexData = new Float32Array(0);
    this.setupState();
  }

  setupState() {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  resize(width, height) {
    this.gl.viewport(0, 0, width, height);
  }

  clear(colour = [0.02, 0.032, 0.052, 1]) {
    const gl = this.gl;
    gl.clearColor(colour[0], colour[1], colour[2], colour[3]);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  drawRects(rects, camera) {
    if (!rects?.length) return 0;
    const gl = this.gl;
    const vertexCount = rects.length * 6;
    const floatsPerVertex = 6;
    const requiredFloats = vertexCount * floatsPerVertex;
    if (this.rectVertexData.length < requiredFloats) this.rectVertexData = new Float32Array(requiredFloats);
    let offset = 0;
    for (const rect of rects) {
      offset = writeRectVertices(this.rectVertexData, offset, rect);
    }

    gl.useProgram(this.resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.rectVertexData.subarray(0, requiredFloats), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.resources.positionLocation);
    gl.vertexAttribPointer(this.resources.positionLocation, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.resources.colorLocation);
    gl.vertexAttribPointer(this.resources.colorLocation, 4, gl.FLOAT, false, 24, 8);
    gl.uniform4f(this.resources.cameraUniform, camera.x, camera.y, camera.zoom, 0);
    gl.uniform2f(this.resources.viewportUniform, camera.viewportW, camera.viewportH);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    return rects.length;
  }

  drawScreenRects(rects, camera) {
    return this.drawRects(rects, {
      x: camera.viewportW * 0.5,
      y: camera.viewportH * 0.5,
      zoom: 1,
      viewportW: camera.viewportW,
      viewportH: camera.viewportH
    });
  }

  drawScreenTriangles(triangles, camera) {
    return this.drawTriangles(triangles, {
      x: camera.viewportW * 0.5,
      y: camera.viewportH * 0.5,
      zoom: 1,
      viewportW: camera.viewportW,
      viewportH: camera.viewportH
    });
  }

  drawTriangles(triangles, camera) {
    if (!triangles?.length) return 0;
    const gl = this.gl;
    const vertexCount = triangles.length * 3;
    const floatsPerVertex = 6;
    const requiredFloats = vertexCount * floatsPerVertex;
    if (this.triangleVertexData.length < requiredFloats) this.triangleVertexData = new Float32Array(requiredFloats);
    let offset = 0;
    for (const triangle of triangles) offset = writeTriangleVertices(this.triangleVertexData, offset, triangle);

    gl.useProgram(this.resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.triangleVertexData.subarray(0, requiredFloats), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.resources.positionLocation);
    gl.vertexAttribPointer(this.resources.positionLocation, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(this.resources.colorLocation);
    gl.vertexAttribPointer(this.resources.colorLocation, 4, gl.FLOAT, false, 24, 8);
    gl.uniform4f(this.resources.cameraUniform, camera.x, camera.y, camera.zoom, 0);
    gl.uniform2f(this.resources.viewportUniform, camera.viewportW, camera.viewportH);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    return triangles.length;
  }

  drawWorldRadialLights(lights, camera) {
    return this.drawWorldRadials(lights, camera, 'additive');
  }

  drawWorldRadialSaturatedLights(lights, camera) {
    return this.drawWorldRadials(lights, camera, 'alpha');
  }

  drawWorldRadialDiscs(discs, camera) {
    return this.drawWorldRadials(discs, camera, 'alpha');
  }

  drawScreenRadialDiscs(discs, camera) {
    return this.drawWorldRadials(discs, {
      x: camera.viewportW * 0.5,
      y: camera.viewportH * 0.5,
      zoom: 1,
      viewportW: camera.viewportW,
      viewportH: camera.viewportH
    }, 'alpha');
  }

  drawWorldRadials(radials, camera, blendMode = 'alpha') {
    if (!radials?.length) return 0;
    const gl = this.gl;
    const vertexCount = radials.length * 6;
    const floatsPerVertex = 9;
    const stride = floatsPerVertex * 4;
    const requiredFloats = vertexCount * floatsPerVertex;
    if (this.radialVertexData.length < requiredFloats) this.radialVertexData = new Float32Array(requiredFloats);
    let offset = 0;
    for (const radial of radials) {
      offset = writeRadialQuadVertices(this.radialVertexData, offset, radial);
    }

    gl.useProgram(this.radialResources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.radialResources.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.radialVertexData.subarray(0, requiredFloats), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.radialResources.positionLocation);
    gl.vertexAttribPointer(this.radialResources.positionLocation, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.radialResources.localLocation);
    gl.vertexAttribPointer(this.radialResources.localLocation, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(this.radialResources.colorLocation);
    gl.vertexAttribPointer(this.radialResources.colorLocation, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(this.radialResources.softnessLocation);
    gl.vertexAttribPointer(this.radialResources.softnessLocation, 1, gl.FLOAT, false, stride, 32);
    gl.uniform4f(this.radialResources.cameraUniform, camera.x, camera.y, camera.zoom, 0);
    gl.uniform2f(this.radialResources.viewportUniform, camera.viewportW, camera.viewportH);
    gl.blendFunc(gl.SRC_ALPHA, blendMode === 'additive' ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return radials.length;
  }

  drawScreenSdfShadowFields(fields, camera) {
    if (!fields?.length) return 0;
    const gl = this.gl;
    const vertexCount = fields.length * 6;
    const floatsPerVertex = 17;
    const stride = floatsPerVertex * 4;
    const requiredFloats = vertexCount * floatsPerVertex;
    if (this.shadowFieldVertexData.length < requiredFloats) this.shadowFieldVertexData = new Float32Array(requiredFloats);
    let offset = 0;
    for (const field of fields) {
      offset = writeShadowFieldQuadVertices(this.shadowFieldVertexData, offset, field);
    }

    gl.useProgram(this.shadowFieldResources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowFieldResources.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.shadowFieldVertexData.subarray(0, requiredFloats), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.shadowFieldResources.positionLocation);
    gl.vertexAttribPointer(this.shadowFieldResources.positionLocation, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.shadowFieldResources.startLocation);
    gl.vertexAttribPointer(this.shadowFieldResources.startLocation, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(this.shadowFieldResources.endLocation);
    gl.vertexAttribPointer(this.shadowFieldResources.endLocation, 2, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(this.shadowFieldResources.radiusLocation);
    gl.vertexAttribPointer(this.shadowFieldResources.radiusLocation, 2, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(this.shadowFieldResources.softnessLocation);
    gl.vertexAttribPointer(this.shadowFieldResources.softnessLocation, 1, gl.FLOAT, false, stride, 32);
    gl.enableVertexAttribArray(this.shadowFieldResources.blendLocation);
    gl.vertexAttribPointer(this.shadowFieldResources.blendLocation, 4, gl.FLOAT, false, stride, 36);
    gl.enableVertexAttribArray(this.shadowFieldResources.colorLocation);
    gl.vertexAttribPointer(this.shadowFieldResources.colorLocation, 4, gl.FLOAT, false, stride, 52);
    gl.uniform2f(this.shadowFieldResources.viewportUniform, camera.viewportW, camera.viewportH);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    return fields.length;
  }

  drawWorldTexture(packet, camera) {
    return this.textureQuadRenderer.draw(packet, camera);
  }

  drawWorldInfernoClusters(composition, camera) {
    return this.infernoClusterRenderer.draw(composition, camera);
  }

  retainWorldInfernoClusterBuffers(ids) {
    this.infernoClusterRenderer.retain(ids);
  }
}

function writeRectVertices(data, offset, rect) {
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.w;
  const y1 = rect.y + rect.h;
  const c = rect.color;
  offset = writeVertex(data, offset, x0, y0, c);
  offset = writeVertex(data, offset, x1, y0, c);
  offset = writeVertex(data, offset, x0, y1, c);
  offset = writeVertex(data, offset, x0, y1, c);
  offset = writeVertex(data, offset, x1, y0, c);
  offset = writeVertex(data, offset, x1, y1, c);
  return offset;
}

function writeVertex(data, offset, x, y, c) {
  data[offset++] = x;
  data[offset++] = y;
  data[offset++] = c[0];
  data[offset++] = c[1];
  data[offset++] = c[2];
  data[offset++] = c[3];
  return offset;
}

function writeTriangleVertices(data, offset, triangle) {
  const c = triangle.color;
  offset = writeVertex(data, offset, triangle.ax, triangle.ay, c);
  offset = writeVertex(data, offset, triangle.bx, triangle.by, c);
  offset = writeVertex(data, offset, triangle.cx, triangle.cy, c);
  return offset;
}

function writeRadialQuadVertices(data, offset, light) {
  const radiusX = light.radiusX ?? light.radius;
  const radiusY = light.radiusY ?? light.radius;
  const rotation = light.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  offset = writeRadialVertex(data, offset, light, -1, -1, radiusX, radiusY, cos, sin);
  offset = writeRadialVertex(data, offset, light, 1, -1, radiusX, radiusY, cos, sin);
  offset = writeRadialVertex(data, offset, light, -1, 1, radiusX, radiusY, cos, sin);
  offset = writeRadialVertex(data, offset, light, -1, 1, radiusX, radiusY, cos, sin);
  offset = writeRadialVertex(data, offset, light, 1, -1, radiusX, radiusY, cos, sin);
  offset = writeRadialVertex(data, offset, light, 1, 1, radiusX, radiusY, cos, sin);
  return offset;
}

function writeRadialVertex(data, offset, light, localX, localY, radiusX, radiusY, cos, sin) {
  const ellipseX = localX * radiusX;
  const ellipseY = localY * radiusY;
  data[offset++] = light.x + ellipseX * cos - ellipseY * sin;
  data[offset++] = light.y + ellipseX * sin + ellipseY * cos;
  data[offset++] = localX;
  data[offset++] = localY;
  data[offset++] = light.color[0];
  data[offset++] = light.color[1];
  data[offset++] = light.color[2];
  data[offset++] = light.color[3];
  data[offset++] = light.softness;
  return offset;
}

function writeShadowFieldQuadVertices(data, offset, field) {
  offset = writeShadowFieldVertex(data, offset, field, field.left, field.top);
  offset = writeShadowFieldVertex(data, offset, field, field.right, field.top);
  offset = writeShadowFieldVertex(data, offset, field, field.left, field.bottom);
  offset = writeShadowFieldVertex(data, offset, field, field.left, field.bottom);
  offset = writeShadowFieldVertex(data, offset, field, field.right, field.top);
  offset = writeShadowFieldVertex(data, offset, field, field.right, field.bottom);
  return offset;
}

function writeShadowFieldVertex(data, offset, field, x, y) {
  const c = field.color;
  data[offset++] = x;
  data[offset++] = y;
  data[offset++] = field.startX;
  data[offset++] = field.startY;
  data[offset++] = field.endX;
  data[offset++] = field.endY;
  data[offset++] = field.radiusStart;
  data[offset++] = field.radiusEnd;
  data[offset++] = field.softness;
  data[offset++] = field.edgeGamma;
  data[offset++] = field.blendStrength;
  data[offset++] = field.tailFloor;
  data[offset++] = field.contactBoost;
  data[offset++] = c[0];
  data[offset++] = c[1];
  data[offset++] = c[2];
  data[offset++] = c[3];
  return offset;
}

function createRectResources(gl) {
  const program = createProgram(gl, RECT_VERTEX_SHADER, RECT_FRAGMENT_SHADER);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('webgl_rect_buffer_unavailable');
  return {
    program,
    buffer,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    colorLocation: gl.getAttribLocation(program, 'a_color'),
    cameraUniform: gl.getUniformLocation(program, 'u_camera'),
    viewportUniform: gl.getUniformLocation(program, 'u_viewport')
  };
}

function createRadialResources(gl) {
  const program = createProgram(gl, RADIAL_VERTEX_SHADER, RADIAL_FRAGMENT_SHADER);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('webgl_radial_buffer_unavailable');
  return {
    program,
    buffer,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    localLocation: gl.getAttribLocation(program, 'a_local'),
    colorLocation: gl.getAttribLocation(program, 'a_color'),
    softnessLocation: gl.getAttribLocation(program, 'a_softness'),
    cameraUniform: gl.getUniformLocation(program, 'u_camera'),
    viewportUniform: gl.getUniformLocation(program, 'u_viewport')
  };
}

function createShadowFieldResources(gl) {
  const program = createProgram(gl, SHADOW_FIELD_VERTEX_SHADER, SHADOW_FIELD_FRAGMENT_SHADER);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('webgl_shadow_field_buffer_unavailable');
  return {
    program,
    buffer,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    startLocation: gl.getAttribLocation(program, 'a_start'),
    endLocation: gl.getAttribLocation(program, 'a_end'),
    radiusLocation: gl.getAttribLocation(program, 'a_radius'),
    softnessLocation: gl.getAttribLocation(program, 'a_softness'),
    blendLocation: gl.getAttribLocation(program, 'a_blend'),
    colorLocation: gl.getAttribLocation(program, 'a_color'),
    viewportUniform: gl.getUniformLocation(program, 'u_viewport')
  };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('webgl_program_unavailable');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'unknown_link_error';
    gl.deleteProgram(program);
    throw new Error(`webgl_program_link_failed:${info}`);
  }
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('webgl_shader_unavailable');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'unknown_compile_error';
    gl.deleteShader(shader);
    throw new Error(`webgl_shader_compile_failed:${info}`);
  }
  return shader;
}

function webglContextAttributes() {
  return {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance'
  };
}
