const state = {
  installed: false,
  ctx: null,
  dom: null,
  camera: null,
  orbitTarget: null,
  keys: new Set(),
  middleDown: false,
  lastMouse: { x: 0, y: 0 },
  cleanup: [],
  raf: null,
  lastTick: 0
};

const REQUIRED_APIS = [
  "scene.getCamera",
  "scene.getOrbitTarget",
  "scene.getRendererDomElement",
  "scene.getSelected",
  "scene.focusSelected"
];

function getLogger(ctx) {
  return ctx?.logger || ctx?.log || console;
}

function missingRuntimeApis(ctx) {
  const missing = [];
  if (typeof ctx?.scene?.getCamera !== 'function') missing.push('scene.getCamera');
  if (typeof ctx?.scene?.getOrbitTarget !== 'function') missing.push('scene.getOrbitTarget');
  if (typeof ctx?.scene?.getRendererDomElement !== 'function') missing.push('scene.getRendererDomElement');
  if (typeof ctx?.scene?.getSelected !== 'function') missing.push('scene.getSelected');
  if (typeof ctx?.scene?.focusSelected !== 'function') missing.push('scene.focusSelected');
  return missing;
}

function normaliseVector3(v) {
  if (!v) return null;
  const len = Math.hypot(v.x || 0, v.y || 0, v.z || 0) || 1;
  return { x: (v.x || 0) / len, y: (v.y || 0) / len, z: (v.z || 0) / len };
}

function addScaledVector(target, vec, scalar) {
  if (!target || !vec) return;
  target.x += vec.x * scalar;
  target.y += vec.y * scalar;
  target.z += vec.z * scalar;
}

function makeVector3(x = 0, y = 0, z = 0) {
  const Vector3 = state.ctx?.THREE?.Vector3 || globalThis.THREE?.Vector3;
  return Vector3 ? new Vector3(x, y, z) : { x, y, z };
}

function getCameraForward(camera) {
  if (typeof camera.getWorldDirection === 'function') {
    const target = makeVector3(0, 0, 0);
    return normaliseVector3(camera.getWorldDirection(target));
  }
  return normaliseVector3({
    x: (state.orbitTarget?.x || 0) - (camera.position?.x || 0),
    y: 0,
    z: (state.orbitTarget?.z || 0) - (camera.position?.z || 0)
  });
}

function getCameraRight(camera) {
  const forward = getCameraForward(camera) || { x: 0, y: 0, z: -1 };
  return normaliseVector3({ x: forward.z, y: 0, z: -forward.x });
}

function orbitBy(dx, dy) {
  const camera = state.camera;
  const target = state.orbitTarget;
  if (!camera?.position || !target) return;

  const sensitivity = 0.005;
  const offset = {
    x: camera.position.x - target.x,
    y: camera.position.y - target.y,
    z: camera.position.z - target.z
  };
  const radius = Math.max(0.001, Math.hypot(offset.x, offset.y, offset.z));
  let theta = Math.atan2(offset.x, offset.z) - dx * sensitivity;
  let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))) - dy * sensitivity;
  phi = Math.max(0.05, Math.min(Math.PI - 0.05, phi));

  camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
  camera.position.y = target.y + radius * Math.cos(phi);
  camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);

  if (typeof camera.lookAt === 'function') camera.lookAt(target.x, target.y, target.z);
}

function panHeldKeys(deltaSeconds) {
  if (!state.middleDown || !state.camera?.position || !state.orbitTarget) return;

  const forward = getCameraForward(state.camera);
  const right = getCameraRight(state.camera);
  if (forward) forward.y = 0;
  const flatForward = normaliseVector3(forward) || { x: 0, y: 0, z: -1 };
  const speed = 8 * Math.min(deltaSeconds, 0.05);

  if (state.keys.has('w')) {
    addScaledVector(state.camera.position, flatForward, speed);
    addScaledVector(state.orbitTarget, flatForward, speed);
  }
  if (state.keys.has('s')) {
    addScaledVector(state.camera.position, flatForward, -speed);
    addScaledVector(state.orbitTarget, flatForward, -speed);
  }
  if (state.keys.has('d')) {
    addScaledVector(state.camera.position, right, speed);
    addScaledVector(state.orbitTarget, right, speed);
  }
  if (state.keys.has('a')) {
    addScaledVector(state.camera.position, right, -speed);
    addScaledVector(state.orbitTarget, right, -speed);
  }

  if (typeof state.camera.lookAt === 'function') {
    state.camera.lookAt(state.orbitTarget.x, state.orbitTarget.y, state.orbitTarget.z);
  }
}

function tick(t) {
  const dt = state.lastTick ? (t - state.lastTick) / 1000 : 0;
  state.lastTick = t;
  panHeldKeys(dt);
  state.raf = requestAnimationFrame(tick);
}

function addListener(target, event, handler, options) {
  target.addEventListener(event, handler, options);
  state.cleanup.push(() => target.removeEventListener(event, handler, options));
}

export function installViewportNavigation(ctx) {
  if (state.installed) return { ok: true, status: 'already_installed' };

  const missing = missingRuntimeApis(ctx);
  if (missing.length) {
    return {
      ok: false,
      reason: 'missing_runtime_api',
      required_apis: REQUIRED_APIS,
      missing_apis: missing
    };
  }

  state.ctx = ctx;
  state.camera = ctx.scene.getCamera();
  state.orbitTarget = ctx.scene.getOrbitTarget();
  state.dom = ctx.scene.getRendererDomElement();

  if (!state.camera || !state.orbitTarget || !state.dom) {
    return {
      ok: false,
      reason: 'runtime_api_returned_null',
      required_apis: REQUIRED_APIS
    };
  }

  addListener(state.dom, 'mousedown', event => {
    if (event.button !== 1) return;
    state.middleDown = true;
    state.lastMouse = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  });

  addListener(window, 'mouseup', event => {
    if (event.button === 1) state.middleDown = false;
  });

  addListener(window, 'mousemove', event => {
    if (!state.middleDown) return;
    const dx = event.clientX - state.lastMouse.x;
    const dy = event.clientY - state.lastMouse.y;
    state.lastMouse = { x: event.clientX, y: event.clientY };
    if (Math.abs(dx) + Math.abs(dy) > 0) orbitBy(dx, dy);
  });

  addListener(window, 'keydown', event => {
    const key = String(event.key || '').toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) state.keys.add(key);
    if (key === 'f' && !event.target?.matches?.('input,textarea,[contenteditable=true]')) {
      const selected = ctx.scene.getSelected();
      if (selected) {
        ctx.scene.focusSelected();
        event.preventDefault();
      }
    }
  });

  addListener(window, 'keyup', event => {
    const key = String(event.key || '').toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) state.keys.delete(key);
  });

  state.installed = true;
  state.lastTick = 0;
  state.raf = requestAnimationFrame(tick);
  getLogger(ctx)?.info?.('capabilitydependencypressurefield: viewport navigation installed');
  ctx.notify?.('Viewport navigation plugin installed');
  return { ok: true, status: 'installed' };
}

export function uninstallViewportNavigation() {
  for (const cleanup of state.cleanup.splice(0)) {
    try { cleanup(); } catch {}
  }
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  state.keys.clear();
  state.middleDown = false;
  state.installed = false;
  return { ok: true, status: 'uninstalled' };
}

export async function onLoad(ctx) {
  getLogger(ctx)?.info?.('capabilitydependencypressurefield: loaded');
}

export async function onActivate(ctx) {
  return installViewportNavigation(ctx);
}

export async function onDeactivate() {
  return uninstallViewportNavigation();
}

export async function onUnload() {
  return uninstallViewportNavigation();
}

export const integrationContract = {
  "kind": "runtime_api_contract",
  "summary": "Installs additive viewport navigation handlers without modifying AXIOM core files.",
  "required_context": {
    "scene": [
      "getCamera()",
      "getOrbitTarget()",
      "getRendererDomElement()",
      "getSelected()",
      "focusSelected()"
    ],
    "optional": [
      "notify()",
      "logger/log"
    ]
  },
  "behaviour": [
    "Middle mouse drag orbits camera around orbit target.",
    "Middle mouse held with WASD moves camera and orbit target through the scene.",
    "Mouse wheel zoom is untouched.",
    "F delegates to existing focusSelected runtime API.",
    "Left-click object selection is not intercepted."
  ],
  "activation": "proposal_only_until_axiom_runtime_plugin_loader_exists"
};
