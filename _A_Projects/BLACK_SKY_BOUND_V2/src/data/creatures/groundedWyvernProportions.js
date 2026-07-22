export const GroundedWyvernProportionProfileId = Object.freeze({
  HATCHLING_SKELETAL_GAIT_V0: 'grounded_wyvern_hatchling_skeletal_gait_v0'
});

export const GROUNDED_WYVERN_HATCHLING_PROPORTIONS = Object.freeze({
  id: GroundedWyvernProportionProfileId.HATCHLING_SKELETAL_GAIT_V0,
  classification: 'wyvern_proportion_profile',
  sourceAuthority: 'grounded wyvern hatchling projection recipe',
  focus: 'template_slim_aesthetic_pass',
  completedPasses: Object.freeze([
    'head_neck_shoulders_first_pass',
    'rear_hips_tail_counterbalance_pass',
    'skeletal_tail_gait_foundation_pass',
    'template_slim_aesthetic_pass'
  ]),
  visual: Object.freeze({
    scale: 1.42,
    boundsPadding: 0.18
  }),
  skeleton: Object.freeze({
    classification: 'wyvern_skeletal_profile',
    solverId: 'grounded_wyvern_skeletal_gait_solver_v0',
    axialRoles: Object.freeze(['head', 'neck', 'chest', 'hips', 'tailRoot', 'tailBase', 'tailProximal', 'tailMid', 'tailDistal', 'tailTip']),
    tailBoneRoles: Object.freeze(['tailRoot', 'tailBase', 'tailProximal', 'tailMid', 'tailDistal', 'tailTip']),
    hindLegRoles: Object.freeze(['hip', 'knee', 'ankle', 'foot']),
    gaitContactPolicy: 'diagonal_wrist_hind_foot_contacts_v0'
  }),
  head: Object.freeze({
    length: 0.78,
    width: 0.34,
    browWidth: 0.28,
    snoutLength: 0.39,
    socketForward: 0.62
  }),
  jaw: Object.freeze({
    length: 0.43,
    width: 0.16,
    maxOpen: 0.56,
    openingSeparation: 0.11
  }),
  neck: Object.freeze({
    segmentCount: 4,
    chainLength: 1.04,
    width: 0.18,
    stiffness: 0.78,
    maxExtension: 0.34,
    maxLateral: 0.13
  }),
  shoulders: Object.freeze({
    width: 1.02,
    chestWidth: 0.54,
    chestLength: 0.92,
    mass: 1.04,
    braceSpacing: 0.66
  }),
  torso: Object.freeze({
    length: 1.14,
    width: 0.42,
    compactness: 0.74,
    bodyHeight: 0.28,
    maxSquash: 0.06,
    maxStretch: 0.14
  }),
  hips: Object.freeze({
    width: 0.48,
    length: 0.56,
    haunchWidth: 0.24,
    haunchLength: 0.42,
    hipAnchorBack: 0.22,
    supportOffset: 0.22
  }),
  forelimb: Object.freeze({
    shoulderAnchorWidth: 0.5,
    wristReach: 1.66,
    maxWristForward: 0.52,
    maxWristAcross: 0.58,
    groundContactSpacing: 1.14
  }),
  hindLeg: Object.freeze({
    hipWidth: 0.4,
    hipBack: 0.2,
    thighLength: 0.6,
    shinLength: 0.56,
    kneeOut: 0.34,
    kneeBack: 0.34,
    ankleOut: 0.66,
    footBack: 0.72,
    footRadius: 0.17,
    footLength: 0.38,
    thighGirth: 0.21,
    shinGirth: 0.14,
    clawSpread: 0.12,
    groundContactSpacing: 0.98
  }),
  tail: Object.freeze({
    baseWidth: 0.36,
    rootMass: 0.28,
    baseAnchorBack: 0.38,
    length: 3.92,
    boneLengths: Object.freeze([0.52, 0.74, 0.88, 0.78, 0.6, 0.4]),
    taper: Object.freeze([0.36, 0.29, 0.22, 0.16, 0.1, 0.06]),
    renderWidthScale: 0.8,
    maxBend: 0.38,
    counterbalanceLag: 0.62,
    counterReach: 0.6,
    gaitFollowThrough: 0.22
  }),
  gait: Object.freeze({
    hindStride: 0.2,
    hindPlantSpread: 0.12,
    hindPushBack: 0.18,
    tailWave: 0.2,
    tailPlantDamping: 0.62
  }),
  constraints: Object.freeze({
    maxHeadForward: 0.5,
    maxHeadLateral: 0.14,
    maxNeckForward: 0.39,
    maxNeckLateral: 0.13,
    maxNeckHeadSeparation: 0.22,
    maxJawOpen: 0.62,
    maxChestForward: 0.24,
    maxChestLateral: 0.14,
    maxHipForward: 0.14,
    maxHipLateral: 0.11,
    maxTailForward: 0.64,
    maxTailBend: 0.34,
    maxWristForward: 0.68,
    maxWristLateral: 0.84,
    maxElbowForward: 0.34,
    maxElbowLateral: 0.42,
    maxAnkleForward: 0.22,
    maxHindKneeForward: 0.24,
    maxHindKneeLateral: 0.2,
    maxHindAnkleForward: 0.3,
    maxHindAnkleLateral: 0.22,
    maxBodyChainStretch: 1.09
  })
});
