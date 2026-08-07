import {
  CAMERA_VISIBILITY_FOCUS_PROFILE_CONTRACT,
  DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE,
  normalizeCameraVisibilityFocusProfile
} from '../data/cameraVisibilityFocusProfile.js';
import { CAMERA_VISIBILITY_FOCUS_STATE_CONTRACT } from '../game/cameraVisibilityFocus.js';

export const CAMERA_VISIBILITY_FOCUS_PROJECTION_CONTRACT = 'black-sky-bound.camera-visibility-focus-projection.v1';

export function buildCameraVisibilityFocusProjection(state, actors = []) {
  if (state?.contract !== CAMERA_VISIBILITY_FOCUS_STATE_CONTRACT) return inactive('camera_visibility_focus_state_missing');
  if (state.enabled === false) return inactive('camera_visibility_focus_disabled', state);
  const actor = actors.find((entry) => entry.id === state.targetEntityId);
  if (!actor) return inactive('camera_visibility_focus_target_missing', state);
  if (actor.alive === false && actor.team !== 'player') return inactive('camera_visibility_focus_target_inactive', state);
  const sourceProfile = actor.wyvernProjection?.proportionProfile
    ?? actor.humanoidProjection?.profile
    ?? actor.predatorProjection?.profile
    ?? null;
  const profile = normalizeCameraVisibilityFocusProfile(sourceProfile?.visibilityFocus ?? DEFAULT_CAMERA_VISIBILITY_FOCUS_PROFILE);
  const focusHeightMeters = actor.humanoidProjection ? 1.02 : actor.predatorProjection ? 0.78 : actor.wyvernProjection ? 0.58 : 0.7;
  return Object.freeze({
    contract: CAMERA_VISIBILITY_FOCUS_PROJECTION_CONTRACT,
    classification: 'renderer_neutral_camera_visibility_focus_projection',
    active: profile.enabled,
    reason: profile.enabled ? null : 'camera_visibility_focus_profile_disabled',
    targetEntityId: actor.id,
    targetKind: actor.type,
    targetSource: state.source,
    mode: 'occlusion_aware_orthographic_sightline_corridor',
    sourceProfileId: sourceProfile?.id ?? 'camera_visibility_focus_default',
    profileContract: profile.contract ?? CAMERA_VISIBILITY_FOCUS_PROFILE_CONTRACT,
    worldX: actor.worldX,
    worldY: actor.worldY,
    focusHeightMeters,
    radiusMeters: profile.radiusMeters,
    featherMeters: profile.featherMeters,
    minimumOccluderOpacity: profile.minimumOccluderOpacity,
    readabilityLightPower: profile.readabilityLightPower,
    readabilityLightDistanceMeters: Number((profile.radiusMeters + profile.featherMeters + 1.5).toFixed(3))
  });
}

function inactive(reason, state = null) {
  return Object.freeze({
    contract: CAMERA_VISIBILITY_FOCUS_PROJECTION_CONTRACT,
    classification: 'renderer_neutral_camera_visibility_focus_projection',
    active: false,
    reason,
    targetEntityId: state?.targetEntityId ?? null,
    targetSource: state?.source ?? null
  });
}
