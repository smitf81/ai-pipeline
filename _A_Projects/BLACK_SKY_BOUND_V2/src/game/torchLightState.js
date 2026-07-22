export function resolveTorchLightAnchor(transform, humanoidProjection, lightEmitter) {
  const torchState = humanoidProjection?.torchState;
  if (torchState && Number.isFinite(torchState.x) && Number.isFinite(torchState.y)) {
    return buildAnchor(torchState.x, torchState.y, torchState.forwardX, torchState.forwardY, {
      sourceSocket: torchState.sourceSocket ?? 'defeated_torch_ground_socket',
      mode: torchState.mode ?? 'grounded',
      transform,
      humanoidProjection
    });
  }
  return resolveCarriedTorchAnchor(transform, humanoidProjection, lightEmitter);
}

export function resolveCarriedTorchAnchor(transform, humanoidProjection, lightEmitter) {
  const socket = humanoidProjection?.sockets?.torchFlame ?? humanoidProjection?.sockets?.torchHand ?? null;
  if (socket && Number.isFinite(socket.x) && Number.isFinite(socket.y)) {
    return buildAnchor(socket.x, socket.y, socket.forward?.x, socket.forward?.y, {
      sourceSocket: socket.role ?? 'torch_flame_socket',
      mode: 'carried',
      transform,
      humanoidProjection
    });
  }
  const rotation = Number.isFinite(transform?.rotation) ? transform.rotation : (humanoidProjection?.facing ?? 0);
  return buildAnchor(
    (transform?.x ?? 0) + (lightEmitter?.visual?.offsetX ?? 0),
    (transform?.y ?? 0) + (lightEmitter?.visual?.offsetY ?? 0),
    Math.cos(rotation),
    Math.sin(rotation),
    {
      sourceSocket: null,
      mode: 'fallback',
      transform,
      humanoidProjection
    }
  );
}

function buildAnchor(x, y, forwardX, forwardY, { sourceSocket, mode, transform, humanoidProjection }) {
  const forward = normaliseDirection(forwardX, forwardY, transform?.rotation ?? humanoidProjection?.facing ?? 0);
  return {
    x,
    y,
    forwardX: forward.x,
    forwardY: forward.y,
    rightX: -forward.y,
    rightY: forward.x,
    sourceSocket,
    mode
  };
}

function normaliseDirection(x, y, fallbackRotation = 0) {
  const nx = Number(x);
  const ny = Number(y);
  const length = Math.hypot(nx, ny);
  if (Number.isFinite(length) && length > 0.001) return { x: nx / length, y: ny / length };
  return { x: Math.cos(fallbackRotation), y: Math.sin(fallbackRotation) };
}
