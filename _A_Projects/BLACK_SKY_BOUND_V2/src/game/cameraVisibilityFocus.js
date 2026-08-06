export const CAMERA_VISIBILITY_FOCUS_STATE_CONTRACT = 'black-sky-bound.camera-visibility-focus-state.v0';

export function createCameraVisibilityFocusState(targetEntityId, source = 'gameplay_player_camera') {
  return {
    contract: CAMERA_VISIBILITY_FOCUS_STATE_CONTRACT,
    classification: 'runtime_camera_component',
    enabled: true,
    targetEntityId: requireTargetId(targetEntityId),
    source
  };
}

export function setCameraVisibilityFocusTarget(state, targetEntityId, source) {
  if (!state || state.contract !== CAMERA_VISIBILITY_FOCUS_STATE_CONTRACT) {
    throw new Error('camera_visibility_focus_state_invalid');
  }
  state.enabled = true;
  state.targetEntityId = requireTargetId(targetEntityId);
  state.source = String(source || 'runtime_focus_change');
  return state;
}

function requireTargetId(value) {
  const targetId = String(value ?? '').trim();
  if (!targetId) throw new Error('camera_visibility_focus_target_missing');
  return targetId;
}
