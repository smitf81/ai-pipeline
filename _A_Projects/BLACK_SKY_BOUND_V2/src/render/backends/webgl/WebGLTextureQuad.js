const TEXTURE_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
uniform vec4 u_camera;
uniform vec2 u_viewport;
varying vec2 v_uv;
void main() {
  vec2 screen = (a_position - u_camera.xy) * u_camera.z + u_viewport * 0.5;
  vec2 clip = vec2((screen.x / u_viewport.x) * 2.0 - 1.0, 1.0 - (screen.y / u_viewport.y) * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const TEXTURE_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
void main() {
  gl_FragColor = texture2D(u_texture, v_uv);
}
`;

export class WebGLTextureQuadRenderer {
  constructor(gl) {
    this.gl = gl;
    this.resources = createTextureResources(gl);
    this.vertexData = new Float32Array(0);
  }

  draw(packet, camera) {
    if (!packet?.texture) return 0;
    const gl = this.gl;
    const vertexCount = 6;
    const floatsPerVertex = 4;
    const requiredFloats = vertexCount * floatsPerVertex;
    if (this.vertexData.length < requiredFloats) this.vertexData = new Float32Array(requiredFloats);
    writeTextureQuadVertices(this.vertexData, packet);

    gl.useProgram(this.resources.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.resources.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.subarray(0, requiredFloats), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.resources.positionLocation);
    gl.vertexAttribPointer(this.resources.positionLocation, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.resources.uvLocation);
    gl.vertexAttribPointer(this.resources.uvLocation, 2, gl.FLOAT, false, 16, 8);
    gl.uniform4f(this.resources.cameraUniform, camera.x, camera.y, camera.zoom, 0);
    gl.uniform2f(this.resources.viewportUniform, camera.viewportW, camera.viewportH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, packet.texture);
    gl.uniform1i(this.resources.textureUniform, 0);
    gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    return 1;
  }
}

function writeTextureQuadVertices(data, packet) {
  const x0 = packet.x;
  const y0 = packet.y;
  const x1 = packet.x + packet.w;
  const y1 = packet.y + packet.h;
  let offset = 0;
  offset = writeTextureVertex(data, offset, x0, y0, 0, 0);
  offset = writeTextureVertex(data, offset, x1, y0, 1, 0);
  offset = writeTextureVertex(data, offset, x0, y1, 0, 1);
  offset = writeTextureVertex(data, offset, x0, y1, 0, 1);
  offset = writeTextureVertex(data, offset, x1, y0, 1, 0);
  writeTextureVertex(data, offset, x1, y1, 1, 1);
}

function writeTextureVertex(data, offset, x, y, u, v) {
  data[offset++] = x;
  data[offset++] = y;
  data[offset++] = u;
  data[offset++] = v;
  return offset;
}

function createTextureResources(gl) {
  const program = createProgram(gl, TEXTURE_VERTEX_SHADER, TEXTURE_FRAGMENT_SHADER);
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('webgl_texture_quad_buffer_unavailable');
  return {
    program,
    buffer,
    positionLocation: gl.getAttribLocation(program, 'a_position'),
    uvLocation: gl.getAttribLocation(program, 'a_uv'),
    cameraUniform: gl.getUniformLocation(program, 'u_camera'),
    viewportUniform: gl.getUniformLocation(program, 'u_viewport'),
    textureUniform: gl.getUniformLocation(program, 'u_texture')
  };
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('webgl_texture_quad_program_unavailable');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) || 'unknown_link_error';
    gl.deleteProgram(program);
    throw new Error(`webgl_texture_quad_program_link_failed:${info}`);
  }
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('webgl_texture_quad_shader_unavailable');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) || 'unknown_compile_error';
    gl.deleteShader(shader);
    throw new Error(`webgl_texture_quad_shader_compile_failed:${info}`);
  }
  return shader;
}
