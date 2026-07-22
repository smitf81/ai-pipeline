import { getLightSpaceAlphaForCircle } from '../../../projection/lightSpaceRenderCulling.js';

export const WEBGL_LIGHT_SPACE_GATE_MODE = 'webgl_light_space_render_detail_gate_v0';

export function lightSpaceAlphaForWorldCircle(context, worldX, worldY, radiusWorld) {
  const culling = context.lightSpaceCulling;
  if (!culling?.enabled) return 1;
  if (!culling.regions?.length) return 0;
  const camera = context.camera;
  const zoom = Math.max(0.001, camera.zoom ?? 1);
  const screenX = (worldX - camera.x) * zoom + camera.viewportW / 2;
  const screenY = (worldY - camera.y) * zoom + camera.viewportH / 2;
  const radiusPx = Math.max(1, radiusWorld * zoom);
  return getLightSpaceAlphaForCircle(culling, screenX, screenY, radiusPx);
}

export function shouldCullByLightSpace(context, worldX, worldY, radiusWorld) {
  return lightSpaceAlphaForWorldCircle(context, worldX, worldY, radiusWorld) <= 0.015;
}

export function lightSpaceGateActive(context) {
  return !!context.lightSpaceCulling?.enabled;
}
