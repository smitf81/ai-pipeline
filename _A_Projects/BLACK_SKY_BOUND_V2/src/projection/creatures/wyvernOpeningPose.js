export function applyWyvernOpeningPose(pose, opening) {
  if (!opening || opening.released === true) {
    pose.openingState = null;
    return;
  }
  const phase = opening.phase;
  const openingProgress = phase === 'opening' ? clamp01(opening.openingProgress) : phaseAfterOpening(phase) ? 1 : 0;
  const emergence = phase === 'emerging' ? clamp01(opening.emergenceProgress) : phaseAfterEmergence(phase) ? 1 : 0;
  const settle = phase === 'settling' ? clamp01(opening.settleProgress) : 0;
  const headOut = smoothstep(0.02, 0.24, emergence);
  const neckOut = smoothstep(0.035, 0.3, emergence);
  const shoulderOut = smoothstep(0.16, 0.46, emergence);
  const torsoOut = smoothstep(0.4, 0.7, emergence);
  const hindOut = smoothstep(0.64, 0.88, emergence);
  const tailOut = smoothstep(0.78, 1, emergence);
  const crownLift = smoothstep(0.16, 0.92, openingProgress);
  const curl = phase === 'inside_egg' || phase === 'cracking'
    ? 1
    : phase === 'opening'
      ? 1 - crownLift * 0.2
      : phase === 'emerging'
        ? 0.8 * (1 - tailOut)
        : 0.08 * (1 - settle);
  const struggle = clamp01(opening.movementPulse);
  const movement = opening.lastMovementDirection ?? { x: 0, y: -1 };
  const rock = struggle * (Math.abs(movement.x) > 0.1 ? movement.x : (opening.acceptedInputCount % 2 ? 1 : -1));
  const axialStrain = struggle * -movement.y;
  const emergenceBrace = Math.sin(clamp01((emergence - 0.1) / 0.8) * Math.PI);
  const settleBrace = phase === 'settling' ? (1 - smoothstep(0.1, 0.72, settle)) : 0;
  const brace = Math.max(emergenceBrace, settleBrace);
  const recoveryBreath = phase === 'settling' ? Math.sin(settle * Math.PI * 2.4) * (1 - settle) : 0;

  pose.bodyOffsets.head.forward -= 0.44 * curl;
  pose.bodyOffsets.head.right += 0.34 * curl + rock * 0.11;
  pose.bodyOffsets.neck.forward -= 0.34 * curl;
  pose.bodyOffsets.neck.right += 0.26 * curl + rock * 0.07;
  pose.bodyOffsets.chest.forward -= 0.2 * curl + 0.08 * brace;
  pose.bodyOffsets.chest.right += 0.08 * curl + rock * 0.05;
  pose.bodyOffsets.hips.forward += 0.17 * curl - 0.06 * torsoOut;
  pose.bodyOffsets.hips.right -= 0.09 * curl + rock * 0.025;
  pose.bodyOffsets.tailBase.forward += 0.18 * curl;
  pose.bodyOffsets.tailBase.right -= 0.34 * curl;
  pose.bodyOffsets.tailMid.forward += 0.48 * curl;
  pose.bodyOffsets.tailMid.right -= 0.68 * curl;
  pose.bodyOffsets.tailTip.forward += 0.76 * curl;
  pose.bodyOffsets.tailTip.right -= 1.02 * curl;

  pose.bodyOffsets.head.forward += 0.2 * crownLift + 0.58 * headOut + axialStrain * 0.08;
  pose.bodyOffsets.neck.forward += 0.14 * crownLift + 0.46 * neckOut + 0.08 * shoulderOut + axialStrain * 0.055;
  pose.bodyOffsets.chest.forward += 0.08 * shoulderOut + 0.3 * torsoOut + recoveryBreath * 0.025;
  pose.bodyOffsets.hips.forward += 0.16 * hindOut;
  pose.bodyOffsets.head.right -= 0.2 * headOut;
  pose.bodyOffsets.neck.right -= 0.18 * neckOut + 0.025 * shoulderOut;
  pose.bodyOffsets.chest.right -= 0.07 * torsoOut;
  pose.jawOpen += 0.05 * headOut + 0.12 * smoothstep(0.78, 1, emergence);

  for (const name of ['left', 'right']) {
    const side = name === 'left' ? -1 : 1;
    pose.wingForelimbs[name].elbow.right -= side * 0.2 * curl;
    pose.wingForelimbs[name].elbow.forward -= 0.08 * curl;
    pose.wingForelimbs[name].wrist.right -= side * 0.42 * curl;
    pose.wingForelimbs[name].wrist.forward -= 0.24 * curl;
    pose.wingForelimbs[name].wrist.right += side * (0.24 * shoulderOut + 0.13 * brace);
    pose.wingForelimbs[name].wrist.forward += 0.2 * headOut - 0.12 * brace;
    pose.hindLegs[name].knee.right -= side * 0.16 * curl;
    pose.hindLegs[name].ankle.right -= side * 0.3 * curl;
    pose.hindLegs[name].ankle.forward += 0.19 * curl - 0.14 * hindOut - 0.08 * brace;
  }
  pose.openingState = {
    phase,
    curl01: curl,
    strain01: struggle,
    crownLift01: crownLift,
    headOut01: headOut,
    neckOut01: neckOut,
    shoulderOut01: shoulderOut,
    torsoOut01: torsoOut,
    hindOut01: hindOut,
    tailOut01: tailOut,
    brace01: brace,
    unfold01: torsoOut,
    settle01: settle,
    progress: phase === 'opening' ? openingProgress : phase === 'emerging' ? emergence : settle,
    progressBucket: Math.round((openingProgress + emergence + settle) * 16)
  };
}

function phaseAfterOpening(phase) {
  return phase === 'emerging' || phase === 'settling' || phase === 'released';
}

function phaseAfterEmergence(phase) {
  return phase === 'settling' || phase === 'released';
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
