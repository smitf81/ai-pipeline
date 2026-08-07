import { WORLD_SCALE } from '../../data/worldScale.js';

export const WORLD_TRANSFORM_3D_CONTRACT = 'black-sky-bound.world-transform-3d.v1';

export const WORLD_TRANSFORM_3D = Object.freeze({
  contract: WORLD_TRANSFORM_3D_CONTRACT,
  tileMeters: WORLD_SCALE.tileMeters,
  worldAxes: Object.freeze({ gameplayX: 'render_x', gameplayY: 'render_z', height: 'render_y' }),
  camera: Object.freeze({ yawDegrees: 45, elevationDegrees: 50, fixedBearing: true }),
  input: Object.freeze({ mode: 'screen_relative_fixed_camera', yawDegrees: 45 })
});

export function tilePointToWorld3D(x, y, heightMeters = 0) {
  return Object.freeze({
    x: round(Number(x) * WORLD_TRANSFORM_3D.tileMeters),
    y: round(Number(heightMeters)),
    z: round(Number(y) * WORLD_TRANSFORM_3D.tileMeters)
  });
}

export function renderWorldPointToWorld3D(worldX, worldY, tileSize, heightMeters = 0) {
  return tilePointToWorld3D(Number(worldX) / tileSize, Number(worldY) / tileSize, heightMeters);
}

export function rotateScreenRelativeInput(x, y, yawDegrees = WORLD_TRANSFORM_3D.input.yawDegrees) {
  const angle = -yawDegrees * Math.PI / 180;
  return Object.freeze({
    x: round(x * Math.cos(angle) - y * Math.sin(angle)),
    y: round(x * Math.sin(angle) + y * Math.cos(angle))
  });
}

function round(value) {
  return Number(value.toFixed(5));
}
