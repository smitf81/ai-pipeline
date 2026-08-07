export function applyWyvernSmokeAwakeningPose(pose, scene) {
  if (!scene || scene.released === true) {
    pose.smokeAwakeningState = null;
    return;
  }
  const stage01 = scene.acceptedInputCount / Math.max(1, scene.requiredInputCount);
  const cough = clamp01(scene.exhalePulse) * (1 - stage01 * 0.18);
  const preparing = scene.phase === 'exhale' ? 1 : 0;
  const fullExhale = scene.phase === 'clearing' ? 1 - clamp01(scene.phaseElapsedReal / 1.85) : stage01 >= 1 ? 1 : 0;
  const compression = preparing * (0.08 + stage01 * 0.08) + cough * 0.15;
  const brace = smoothstep(0.04, 0.48, scene.phaseElapsedReal) * (preparing || fullExhale);

  pose.bodyOffsets.head.forward -= compression * 0.72;
  pose.bodyOffsets.neck.forward -= compression * 0.5;
  pose.bodyOffsets.chest.forward -= compression;
  pose.bodyOffsets.hips.forward += compression * 0.25;
  pose.jawOpen += cough * 0.24 + fullExhale * 0.48;
  for (const name of ['left', 'right']) {
    const side = name === 'left' ? -1 : 1;
    pose.wingForelimbs[name].wrist.right += side * 0.12 * brace;
    pose.wingForelimbs[name].wrist.forward -= 0.07 * brace;
    pose.hindLegs[name].ankle.right += side * 0.055 * brace;
  }
  pose.bodyOffsets.tailMid.right -= cough * 0.04;
  pose.bodyOffsets.tailTip.right += cough * 0.08;
  pose.smokeAwakeningState = {
    phase: scene.phase,
    stage01,
    cough01: cough,
    brace01: brace,
    fullExhale01: fullExhale,
    progressBucket: Math.round((stage01 + fullExhale) * 12)
  };
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

