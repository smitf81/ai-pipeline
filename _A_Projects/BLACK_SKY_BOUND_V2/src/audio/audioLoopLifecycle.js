const PLAYER_BODY_LOOP_CUE_IDS = Object.freeze(new Set([
  'player.breath.calm',
  'player.breath.strained',
  'player.heartbeat'
]));

export function isPlayerBodyLoopCue(cueId) {
  return PLAYER_BODY_LOOP_CUE_IDS.has(cueId);
}

export function createLoopState(cueId) {
  return { cueId, targetGain: 0, voice: null, suspended: false };
}

export function syncLoopSuspension(loop, suspended) {
  loop.suspended = suspended === true;
  if (!loop.suspended || !loop.voice) return loop.suspended;
  for (const node of loop.voice.nodes ?? []) {
    try { node.stop?.(); } catch {}
    try { node.disconnect?.(); } catch {}
  }
  try { loop.voice.gain?.disconnect?.(); } catch {}
  loop.voice = null;
  return true;
}

export function loopVoiceIsActive(loop, hasAudioContext) {
  if (loop?.suspended) return false;
  return hasAudioContext ? !!loop?.voice : (loop?.targetGain ?? 0) > 0;
}

