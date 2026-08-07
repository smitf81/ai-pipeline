export function createBodyContactRig(radius) {
  return {
    contract: 'black-sky-bound.body-contact-rig.v1',
    broadPhase: null,
    hurtVolumes: [],
    attackVolumes: [],
    previousAttackPoint: null,
    bodyRadius: Math.max(0, Number(radius) || 0),
    solvedFrame: 0,
    poseSource: 'not_solved'
  };
}
