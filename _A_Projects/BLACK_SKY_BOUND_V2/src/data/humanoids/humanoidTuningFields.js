export const HUMANOID_TUNING_FIELDS = Object.freeze([
  field('visual.scale', 'Visual scale', 'Scale', 0.72, 1.45, 0.01),
  field('body.torsoLength', 'Body', 'Torso length', 0.22, 0.72, 0.01),
  field('body.shoulderWidth', 'Body', 'Shoulder width', 0.34, 0.92, 0.01),
  field('body.hipWidth', 'Body', 'Hip width', 0.22, 0.68, 0.01),
  field('body.spineWidth', 'Body', 'Spine width', 0.04, 0.18, 0.01),
  field('head.radius', 'Head', 'Radius', 0.1, 0.28, 0.01),
  field('head.forward', 'Head', 'Forward offset', 0.14, 0.42, 0.01),
  field('limbs.armLength', 'Limbs', 'Arm length', 0.3, 0.82, 0.01),
  field('limbs.legLength', 'Limbs', 'Leg length', 0.26, 0.78, 0.01),
  field('limbs.handRadius', 'Limbs', 'Hand radius', 0.04, 0.14, 0.01),
  field('limbs.footRadius', 'Limbs', 'Foot radius', 0.05, 0.16, 0.01),
  field('gait.stride', 'Gait', 'Stride', 0.06, 0.34, 0.01),
  field('gait.armSwing', 'Gait', 'Arm swing', 0.04, 0.28, 0.01),
  field('torch.handOffsetForward', 'Torch', 'Hand forward', -0.06, 0.2, 0.01),
  field('torch.handOffsetRight', 'Torch', 'Hand side', -0.08, 0.16, 0.01),
  field('torch.length', 'Torch', 'Length', 0.2, 0.62, 0.01)
]);

export function getHumanoidTuningFields() {
  return HUMANOID_TUNING_FIELDS.map((item) => ({ ...item }));
}

function field(path, group, label, min, max, step) {
  return Object.freeze({ path, group, label, min, max, step });
}
