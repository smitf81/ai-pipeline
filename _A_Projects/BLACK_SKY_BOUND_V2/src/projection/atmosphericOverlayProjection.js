import {
  ATMOSPHERIC_CAMERA_OVERLAY_MODE,
  resolveAtmosphericOverlayTuning
} from '../data/atmosphericOverlay.js';
import { buildAtmosphericEmitterProjection } from './atmosphericEmitterProjection.js';

export function buildAtmosphericOverlayProjection({ renderTime = 0, overrides = null, lights = [], camera = null } = {}) {
  const tuning = resolveAtmosphericOverlayTuning(overrides);
  const emitters = tuning.emitterReactiveOverlayEnabled === false ? [] : buildAtmosphericEmitterProjection({
    lights,
    camera,
    maxEmitters: tuning.maxAtmosphereEmitters
  });
  return {
    classification: 'renderer_neutral_camera_atmospheric_overlay_projection',
    mode: ATMOSPHERIC_CAMERA_OVERLAY_MODE,
    enabled: overrides?.enabled !== false,
    renderTime,
    tuning,
    emitters
  };
}
