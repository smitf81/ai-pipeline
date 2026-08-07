import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { getActorLightReadabilityProfile } from '../data/actorLightReadabilityProfiles.js';

export const ACTOR_LIGHT_READABILITY_CONTRACT = 'black-sky-bound.actor-light-silhouette-readability.v0';

export function applyActorLightReadabilityProjection(actors, lights) {
  const maxActors = RENDER_BUDGETS.actorLightReadability.maxActors;
  for (let index = 0; index < actors.length; index += 1) {
    actors[index].lightReadability = index < maxActors
      ? buildActorLightReadabilityProjection(actors[index], lights)
      : inactiveProjection(actors[index]?.lightReadabilityProfileId, 'actor_budget_exceeded');
  }
  return actors;
}

export function buildActorLightReadabilityProjection(actor, lights) {
  const profile = getActorLightReadabilityProfile(actor?.lightReadabilityProfileId);
  if (!profile) return inactiveProjection(actor?.lightReadabilityProfileId, 'profile_missing');
  const light = selectLocalEmitter(actor, lights, profile);
  const parts = selectRoles(buildMajorParts(actor), profile.rimPartRoles, profile.maxRimParts);
  const catchlights = selectRoles(buildCatchlights(actor), profile.catchlightRoles, profile.maxCatchlights);
  const core = buildCorePart(actor, parts);
  if (!light) {
    return {
      ...baseProjection(profile),
      active: false,
      inactiveReason: 'no_relevant_local_emitter',
      emitter: null,
      direction: null,
      influence: 0,
      parts,
      catchlights,
      core,
      contactShadow: null
    };
  }
  const dx = light.worldX - actor.worldX;
  const dy = light.worldY - actor.worldY;
  const distance = Math.hypot(dx, dy);
  const fallback = { x: Math.cos(actor.rotation ?? 0), y: Math.sin(actor.rotation ?? 0) };
  const direction = distance > 0.001 ? { x: dx / distance, y: dy / distance } : fallback;
  const influenceRadius = light.revealRadius ?? light.radius;
  const strength = light.revealStrength ?? light.effectiveIntensity ?? light.intensity ?? 0;
  const normalizedDistance = clamp01(distance / Math.max(1, influenceRadius * profile.influenceRadiusScale));
  const influence = clamp01(strength * Math.pow(1 - normalizedDistance, profile.falloffExponent));
  const active = influence >= profile.minimumInfluence;
  return {
    ...baseProjection(profile),
    active,
    inactiveReason: active ? null : 'emitter_influence_below_threshold',
    emitter: {
      id: light.id,
      sourceKind: light.sourceKind,
      sourceEntity: light.sourceEntity ?? null,
      sourceSocket: light.sourceSocket ?? null,
      worldX: light.worldX,
      worldY: light.worldY,
      radius: light.radius,
      revealRadius: light.revealRadius ?? light.radius,
      glowRadius: light.glowRadius ?? light.radius,
      distance,
      normalizedDistance
    },
    direction,
    influence,
    rimColour: light.colour,
    catchlightColour: light.innerColour,
    parts,
    catchlights,
    core,
    contactShadow: active ? buildContactShadow(actor, direction, profile) : null
  };
}

function baseProjection(profile) {
  return {
    classification: 'renderer_neutral_actor_light_readability_projection',
    contract: ACTOR_LIGHT_READABILITY_CONTRACT,
    profileId: profile.id,
    lightPolicy: profile.lightPolicy,
    fillPolicy: profile.fillPolicy,
    outlinePolicy: profile.outlinePolicy,
    contactShadowPolicy: profile.contactShadowPolicy,
    rimWidthPx: profile.rimWidthPx,
    rimArcHalfAngle: profile.rimArcHalfAngle,
    rimAlpha: profile.rimAlpha,
    rimColourMix: profile.rimColourMix,
    catchlightAlpha: profile.catchlightAlpha,
    catchlightRadiusPx: profile.catchlightRadiusPx,
    coreOcclusionAlpha: profile.coreOcclusionAlpha,
    coreOcclusionScale: profile.coreOcclusionScale,
    contactShadowAlpha: profile.contactShadowAlpha
  };
}

function inactiveProjection(profileId, reason) {
  return {
    classification: 'renderer_neutral_actor_light_readability_projection',
    contract: ACTOR_LIGHT_READABILITY_CONTRACT,
    profileId: profileId ?? null,
    active: false,
    inactiveReason: reason,
    emitter: null,
    direction: null,
    influence: 0,
    parts: [],
    catchlights: [],
    core: null,
    contactShadow: null
  };
}

function selectLocalEmitter(actor, lights, profile) {
  let selected = null;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (const light of lights ?? []) {
    if (!isRelevantLocalLight(light)) continue;
    const distance = Math.hypot(light.worldX - actor.worldX, light.worldY - actor.worldY);
    const reach = Math.max(1, (light.revealRadius ?? light.radius) * profile.influenceRadiusScale);
    if (distance > reach) continue;
    const score = (light.revealStrength ?? light.effectiveIntensity ?? light.intensity ?? 0) * Math.pow(1 - distance / reach, profile.falloffExponent);
    if (score < profile.minimumInfluence || distance >= selectedDistance) continue;
    selected = light;
    selectedDistance = distance;
  }
  return selected;
}

function isRelevantLocalLight(light) {
  if (!light?.enabled || (light.revealStrength ?? light.effectiveIntensity ?? light.intensity ?? 0) <= 0.01 || (light.revealRadius ?? light.radius) <= 1) return false;
  if (light.sourceAnchor?.type === 'scene_light') return false;
  const sourceKind = String(light.sourceKind ?? '').toLowerCase();
  return !sourceKind.includes('moonlight') && !sourceKind.includes('lightning');
}

function buildMajorParts(actor) {
  if (actor.silhouette === 'grounded_wyvern') return buildWyvernParts(actor);
  if (actor.silhouette === 'humanoid') return buildHumanoidParts(actor);
  if (actor.silhouette === 'predator') return buildPredatorParts(actor);
  return [ellipse('body', actorPoint(actor), actor.worldRadius, actor.worldRadius * 0.78, actor.rotation ?? 0)];
}

function buildWyvernParts(actor) {
  const rig = actor.wyvernProjection?.rigPose ?? {};
  const head = rig.head?.center ?? rig.axial?.head;
  const chest = rig.axial?.chest;
  const hips = rig.axial?.hips;
  const tail = rig.tail ?? [];
  return [
    ellipse('head', head, rig.head?.worldHeadLength * 0.48, rig.head?.worldHeadWidth * 0.56, actor.rotation ?? 0),
    ellipse('chest', chest, rig.body?.worldChestLength * 0.58, rig.body?.worldChestWidth * 0.58, actor.rotation ?? 0),
    ellipse('hips', hips, rig.body?.worldHipLength * 0.58, rig.body?.worldHipWidth * 0.56, actor.rotation ?? 0),
    segment('tail', tail[0], tail.at(-1), Math.max(tail[0]?.worldWidth ?? 0, actor.worldRadius * 0.34))
  ].filter(Boolean);
}

function buildHumanoidParts(actor) {
  const points = actor.humanoidProjection?.points ?? {};
  return [
    ellipse('head', points.head, pointRadius(points.head, actor.worldRadius * 0.42), pointRadius(points.head, actor.worldRadius * 0.42) * 0.86, actor.rotation ?? 0),
    segment('torso', points.chest, points.hips, actor.worldRadius * 0.82),
    segment('left_arm', points.leftShoulder, points.leftHand, actor.worldRadius * 0.32),
    segment('torch_arm', points.rightShoulder, points.rightHand, actor.worldRadius * 0.34),
    segment('spear', points.spearButt, points.spearTip, Math.max(2, actor.worldRadius * 0.16))
  ].filter(Boolean);
}

function buildPredatorParts(actor) {
  const points = actor.predatorProjection?.points ?? {};
  return [
    ellipse('head', points.head, pointRadius(points.head, actor.worldRadius * 0.5), pointRadius(points.head, actor.worldRadius * 0.5) * 0.82, actor.rotation ?? 0),
    segment('torso', points.chest, points.hips, actor.worldRadius * 0.92),
    segment('shoulders', points.leftShoulder, points.rightShoulder, actor.worldRadius * 0.72),
    segment('muzzle', points.head, points.muzzle, Math.max(3, pointRadius(points.muzzle, actor.worldRadius * 0.25) * 1.2)),
    segment('left_forearm', points.leftElbow, points.leftClaw, actor.worldRadius * 0.32),
    segment('tail', points.tailBase, points.tailTip, actor.worldRadius * 0.28)
  ].filter(Boolean);
}

function buildCatchlights(actor) {
  if (actor.silhouette === 'grounded_wyvern') return buildWyvernCatchlights(actor);
  if (actor.silhouette === 'humanoid') return buildHumanoidCatchlights(actor);
  if (actor.silhouette === 'predator') return buildPredatorCatchlights(actor);
  return [];
}

function buildWyvernCatchlights(actor) {
  const rig = actor.wyvernProjection?.rigPose ?? {};
  const head = rig.head?.center ?? rig.axial?.head;
  const mouth = actor.wyvernProjection?.proceduralPose?.sockets?.mouth;
  if (!isPoint(head)) return pointCatchlight('mouth', mouth) ? [pointCatchlight('mouth', mouth)] : [];
  const forward = { x: Math.cos(actor.rotation ?? 0), y: Math.sin(actor.rotation ?? 0) };
  const right = { x: -forward.y, y: forward.x };
  return [
    catchlight('left_eye', head.worldX + forward.x * actor.worldRadius * 0.25 - right.x * actor.worldRadius * 0.17, head.worldY + forward.y * actor.worldRadius * 0.25 - right.y * actor.worldRadius * 0.17),
    catchlight('right_eye', head.worldX + forward.x * actor.worldRadius * 0.25 + right.x * actor.worldRadius * 0.17, head.worldY + forward.y * actor.worldRadius * 0.25 + right.y * actor.worldRadius * 0.17),
    pointCatchlight('mouth', mouth)
  ].filter(Boolean);
}

function buildHumanoidCatchlights(actor) {
  const sockets = actor.humanoidProjection?.sockets ?? {};
  const points = actor.humanoidProjection?.points ?? {};
  return [
    pointCatchlight('torch_flame', sockets.torchFlame ?? points.torchFlame),
    pointCatchlight('spear_tip', sockets.spearTip ?? points.spearTip)
  ].filter(Boolean);
}

function buildPredatorCatchlights(actor) {
  const points = actor.predatorProjection?.points ?? {};
  if (isPoint(points.leftEye) && isPoint(points.rightEye)) {
    return [
      pointCatchlight('left_eye', points.leftEye),
      pointCatchlight('right_eye', points.rightEye),
      pointCatchlight('mouth', points.mouth)
    ].filter(Boolean);
  }
  if (!isPoint(points.head) || !isPoint(points.muzzle)) return [];
  const dx = points.muzzle.worldX - points.head.worldX;
  const dy = points.muzzle.worldY - points.head.worldY;
  const length = Math.hypot(dx, dy) || 1;
  const fx = dx / length;
  const fy = dy / length;
  const rx = -fy;
  const ry = fx;
  return [
    catchlight('left_eye', points.head.worldX + fx * 2 - rx * 3.5, points.head.worldY + fy * 2 - ry * 3.5),
    catchlight('right_eye', points.head.worldX + fx * 2 + rx * 3.5, points.head.worldY + fy * 2 + ry * 3.5)
  ];
}

function buildCorePart(actor, parts) {
  return parts.find((part) => part.role === 'chest' || part.role === 'torso') ?? parts.find((part) => part.role === 'hips' || part.role === 'body') ?? null;
}

function buildContactShadow(actor, direction, profile) {
  const radius = Math.max(4, actor.worldRadius * profile.contactShadowScale);
  return {
    classification: 'actor_local_contact_shadow_projection',
    centerX: actor.worldX - direction.x * actor.worldRadius * profile.contactShadowOffsetScale,
    centerY: actor.worldY - direction.y * actor.worldRadius * profile.contactShadowOffsetScale + actor.worldRadius * 0.16,
    radiusX: radius,
    radiusY: Math.max(2.2, radius * 0.34),
    rotation: Math.atan2(direction.y, direction.x)
  };
}

function selectRoles(values, roles, maxCount) {
  const byRole = new Map((values ?? []).map((value) => [value.role, value]));
  return roles.map((role) => byRole.get(role)).filter(Boolean).slice(0, maxCount);
}

function ellipse(role, point, radiusX, radiusY, rotation = 0) {
  if (!isPoint(point)) return null;
  return {
    role,
    shape: 'ellipse',
    centerX: point.worldX,
    centerY: point.worldY,
    radiusX: Math.max(2, finite(radiusX, pointRadius(point, 4))),
    radiusY: Math.max(2, finite(radiusY, pointRadius(point, 4))),
    rotation
  };
}

function segment(role, start, end, width) {
  if (!isPoint(start) || !isPoint(end)) return null;
  return {
    role,
    shape: 'segment',
    startX: start.worldX,
    startY: start.worldY,
    endX: end.worldX,
    endY: end.worldY,
    width: Math.max(2, finite(width, 3))
  };
}

function pointCatchlight(role, point) {
  return isPoint(point) ? catchlight(role, point.worldX, point.worldY) : null;
}

function catchlight(role, worldX, worldY) {
  return { role, worldX, worldY };
}

function actorPoint(actor) {
  return { worldX: actor.worldX, worldY: actor.worldY, worldRadius: actor.worldRadius };
}

function pointRadius(point, fallback) {
  return Math.max(2, finite(point?.worldRadius, fallback));
}

function isPoint(point) {
  return Number.isFinite(point?.worldX) && Number.isFinite(point?.worldY);
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}
