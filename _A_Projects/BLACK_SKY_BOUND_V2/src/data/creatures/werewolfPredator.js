export const PredatorProjectionId = Object.freeze({
  WEREWOLF_TOP_DOWN: 'werewolf_top_down_predator_v0'
});

const PROFILE_SECTIONS = Object.freeze([
  'visual', 'body', 'head', 'limbs', 'fur', 'tail', 'gait', 'attack', 'readability', 'collision', 'palette'
]);

const BASE_WEREWOLF_PROFILE = Object.freeze({
  id: PredatorProjectionId.WEREWOLF_TOP_DOWN,
  classification: 'predator_projection_profile',
  label: 'Werewolf heavy forward predator',
  visual: {
    scale: 1,
    boundsPadding: 0.24,
    shadowScale: 1.58,
    detailTier: 2
  },
  body: {
    chestForward: 0.25,
    hipBack: 0.42,
    chestRadius: 0.38,
    chestDepth: 0.34,
    waistRadius: 0.18,
    hipRadius: 0.3,
    shoulderWidth: 0.95,
    hipWidth: 0.68,
    neckForward: 0.18,
    neckRadius: 0.24,
    hunch: 0.09
  },
  head: {
    forward: 0.28,
    radius: 0.23,
    width: 0.33,
    muzzleForward: 0.19,
    muzzleRadius: 0.13,
    jawWidth: 0.17,
    earLength: 0.21,
    earWidth: 0.09,
    brokenEarScale: 0.62
  },
  limbs: {
    upperArmLength: 0.4,
    forearmLength: 0.47,
    upperArmWidth: 0.17,
    forearmWidth: 0.135,
    forePawRadius: 0.13,
    clawLength: 0.15,
    clawSpread: 0.105,
    foreGroundOut: 0.08,
    thighLength: 0.39,
    shinLength: 0.36,
    hockLength: 0.18,
    thighWidth: 0.205,
    shinWidth: 0.15,
    hindPawRadius: 0.125,
    hindGroundOut: 0.07,
    idleForeForward: 0.19,
    idleHindBack: 0.24,
    foreAsymmetry: 0.075,
    hindAsymmetry: 0.055
  },
  fur: {
    maneIntensity: 0.64,
    shoulderTuftLength: 0.15,
    spineTuftLength: 0.105,
    flankRaggedness: 0.065
  },
  tail: {
    back: 0.66,
    side: 0.23,
    width: 0.11,
    midpointBias: 0.18
  },
  gait: {
    phasePerWorldUnit: 5.25,
    idlePhaseSpeed: 0.78,
    maxMovementForFullGait: 3.15,
    stride: 0.27,
    bodyRoll: 0.045,
    breathAmplitude: 0.027,
    weightShift: 0.034,
    shoulderLead: 0.1,
    haunchDrive: 0.075
  },
  attack: {
    coilBack: 0.24,
    chestDrive: 0,
    headRecoil: 0.15,
    braceOut: 0.15,
    clawPullback: 0.17,
    clawDrive: 0.25,
    jawOpen: 0.96,
    recoverySlump: 0.15,
    poseExaggeration: 1
  },
  readability: {
    rimPartRoles: ['head', 'shoulders', 'muzzle', 'left_forearm'],
    catchlightRoles: ['left_eye', 'right_eye', 'mouth'],
    rimWidthPx: 2.15,
    rimArcHalfAngle: 0.72,
    rimAlpha: 0.33,
    catchlightAlpha: 0.74,
    catchlightRadiusPx: 1.25,
    coreOcclusionAlpha: 0.22,
    contactShadowAlpha: 0.25,
    contactShadowScale: 1.72,
    baseEyeAlpha: 0.34,
    baseToothAlpha: 0.62,
    baseClawAlpha: 0.68
  },
  collision: {
    policy: 'single_collider_circle_body_v0',
    colliderRadius: 0.38,
    extremityPolicy: 'projection_only_non_damageable_extremities',
    attackEndpointPolicy: 'canonical_muzzle_socket_at_profile_weapon_reach'
  },
  palette: {
    outline: '#120f15',
    fur: '#4c3f4d',
    furHighlight: '#645568',
    mane: '#312936',
    muzzle: '#29222b',
    mouth: '#160f15',
    eye: '#d8b3de',
    tooth: '#d5cbd2',
    claw: '#bfb5c4'
  }
});

export function createWerewolfPredatorProfile(overrides = {}) {
  const result = {
    ...BASE_WEREWOLF_PROFILE,
    ...overrides,
    classification: 'predator_projection_profile'
  };
  for (const key of PROFILE_SECTIONS) {
    const section = { ...BASE_WEREWOLF_PROFILE[key], ...(overrides[key] ?? {}) };
    if (key === 'readability') {
      section.rimPartRoles = Object.freeze([...(section.rimPartRoles ?? [])]);
      section.catchlightRoles = Object.freeze([...(section.catchlightRoles ?? [])]);
    }
    result[key] = Object.freeze(section);
  }
  return Object.freeze(result);
}

export const WEREWOLF_PREDATOR_PROFILE = createWerewolfPredatorProfile();

export function getPredatorProjectionProfile(profileId) {
  if (profileId !== PredatorProjectionId.WEREWOLF_TOP_DOWN) throw new Error(`Unknown predator projection profile: ${profileId}`);
  return WEREWOLF_PREDATOR_PROFILE;
}
