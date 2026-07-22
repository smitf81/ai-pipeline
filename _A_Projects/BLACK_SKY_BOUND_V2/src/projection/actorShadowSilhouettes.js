export const ACTOR_SHADOW_SILHOUETTE_CONTRACT = 'visual_actor_shadow_silhouette.v1';

export function buildActorShadowBlockers(actors = []) {
  if (!Array.isArray(actors)) return [];
  return actors
    .map(buildActorShadowBlocker)
    .filter(Boolean);
}

function buildActorShadowBlocker(actor) {
  if (!actor?.alive) return null;
  if (actor.silhouette === 'grounded_wyvern' && actor.wyvernProjection) return buildWyvernShadowBlocker(actor);
  if (actor.silhouette === 'humanoid' && actor.humanoidProjection) return buildHumanoidShadowBlocker(actor);
  return buildGenericActorShadowBlocker(actor);
}

function buildWyvernShadowBlocker(actor) {
  const rig = actor.wyvernProjection?.rigPose ?? {};
  const primitives = [
    primitiveFromPoint(actor, 'head', 'head_lobe', rig.head?.center ?? rig.axial?.head, 0.5, 0.68, 0.86),
    primitiveFromPoint(actor, 'chest', 'body_lobe', rig.axial?.chest, 0.82, 0.98, 1.08),
    primitiveFromPoint(actor, 'hips', 'body_lobe', rig.axial?.hips, 0.7, 0.86, 0.96),
    primitiveFromPoint(actor, 'tail_root', 'tail_lobe', rig.tail?.[1] ?? rig.tail?.[0], 0.44, 0.66, 0.78),
    primitiveFromPoint(actor, 'tail_tip', 'tail_lobe', rig.tail?.[3] ?? rig.tail?.[2], 0.28, 0.48, 0.52),
    primitiveFromPair(actor, 'left_wing', 'wing_lobe', rig.wingForelimbs?.left?.shoulder, rig.wingForelimbs?.left?.wrist, 0.36, 0.62, 0.62),
    primitiveFromPair(actor, 'right_wing', 'wing_lobe', rig.wingForelimbs?.right?.shoulder, rig.wingForelimbs?.right?.wrist, 0.36, 0.62, 0.62),
    primitiveFromPair(actor, 'left_hind_leg', 'limb_lobe', rig.hindLegs?.left?.hip, rig.hindLegs?.left?.foot, 0.32, 0.5, 0.56),
    primitiveFromPair(actor, 'right_hind_leg', 'limb_lobe', rig.hindLegs?.right?.hip, rig.hindLegs?.right?.foot, 0.32, 0.5, 0.56)
  ].filter(Boolean);
  return createActorBlocker(actor, 'visual_actor_shadow_wyvern', visualRadius(actor, rig.visualBounds, 0.34), 0.72, {
    shape: 'grounded_wyvern_visual_sdf_shadow_lobes_v1',
    primitives
  });
}

function buildHumanoidShadowBlocker(actor) {
  const points = actor.humanoidProjection?.points ?? {};
  const primitives = [
    primitiveFromPair(actor, 'torso', 'body_lobe', points.chest, points.hips, 0.72, 0.82, 1.08),
    primitiveFromPoint(actor, 'head', 'head_lobe', points.head, 0.42, 0.54, 0.74),
    primitiveFromPair(actor, 'left_arm', 'limb_lobe', points.leftShoulder, points.leftHand, 0.26, 0.42, 0.52),
    primitiveFromPair(actor, 'right_arm', 'limb_lobe', points.rightShoulder, points.rightHand, 0.26, 0.42, 0.52),
    primitiveFromPair(actor, 'left_leg', 'limb_lobe', points.leftHip, points.leftFoot, 0.3, 0.48, 0.6),
    primitiveFromPair(actor, 'right_leg', 'limb_lobe', points.rightHip, points.rightFoot, 0.3, 0.48, 0.6)
  ].filter(Boolean);
  return createActorBlocker(actor, 'visual_actor_shadow_humanoid', visualRadius(actor, actor.humanoidProjection?.visualBounds, 0.28), 0.46, {
    shape: 'humanoid_visual_sdf_shadow_lobes_v1',
    primitives
  });
}

function buildGenericActorShadowBlocker(actor) {
  return createActorBlocker(actor, 'visual_actor_shadow_generic', Math.max(0.12, (actor.radius ?? 0.2) * 1.12), 0.38, {
    shape: 'generic_actor_visual_sdf_shadow_lobe_v1',
    primitives: [{
      id: 'body_core',
      kind: 'body_lobe',
      widthScale: 0.78,
      lengthScale: 0.82,
      tailWidthScale: 0.78,
      dimnessScale: 0.82,
      softnessScale: 1.1
    }]
  });
}

function createActorBlocker(actor, blockerKind, radius, height, silhouette) {
  const primitives = silhouette.primitives?.length ? silhouette.primitives : buildGenericActorShadowBlocker(actor)?.shadowSilhouette?.primitives;
  if (!primitives?.length) return null;
  return {
    id: `actor_shadow:${actor.id}`,
    entityId: actor.id,
    source: 'renderer_neutral_actor_visual_projection',
    classification: 'derived_visual_actor_shadow_blocker',
    kind: 'actor_visual_shadow',
    blockerKind,
    x: actor.x,
    y: actor.y,
    radius,
    height,
    castsShadow: true,
    static: false,
    shadowSilhouette: {
      contract: ACTOR_SHADOW_SILHOUETTE_CONTRACT,
      shape: silhouette.shape,
      primitives
    }
  };
}

function primitiveFromPair(actor, id, kind, a, b, widthScale, lengthScale, dimnessScale) {
  if (!isPoint(a) || !isPoint(b)) return null;
  return primitiveFromPoint(actor, id, kind, midpoint(a, b), widthScale, lengthScale, dimnessScale);
}

function primitiveFromPoint(actor, id, kind, point, widthScale, lengthScale, dimnessScale) {
  if (!isPoint(point)) return null;
  return {
    id,
    kind,
    offsetX: clamp(point.x - actor.x, -2.5, 2.5),
    offsetY: clamp(point.y - actor.y, -2.5, 2.5),
    widthScale,
    lengthScale,
    tailWidthScale: kind === 'tail_lobe' ? 0.42 : 0.68,
    dimnessScale,
    softnessScale: kind === 'wing_lobe' || kind === 'limb_lobe' ? 1.22 : 1.04
  };
}

function visualRadius(actor, bounds, scale) {
  const visual = Number.isFinite(bounds?.width) && Number.isFinite(bounds?.height)
    ? Math.max(bounds.width, bounds.height) * scale
    : 0;
  return Math.max(0.12, actor.radius * 1.12, Math.min(0.92, visual || 0));
}

function midpoint(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

function isPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
