import { ComponentType } from '../constants/componentTypes.js';
import { EntityKind } from '../constants/entityKinds.js';
import { areFactionsHostile } from '../constants/factions.js';
import { getComponent } from '../ecs/world.js';
import { query } from '../ecs/query.js';
import { buildNapalmLightViews } from '../projection/napalmLayerState.js';
import { buildSmokeSourceViews } from '../projection/smokeLayerState.js';
import { buildSceneLightViews } from '../data/sceneLights.js';
import { getLightEmitterRecipe, resolveEmitterLightContribution } from '../data/lightEmitters.js';
import { resolveSmokeCloudShape } from './smokeCloudShape.js';
import { resolveTorchLightAnchor } from './torchLightState.js';
import { buildMamaWorldEventLightViews } from '../data/mamaWyvernWorldEvents.js';
import { buildFoliageFireLightViews } from '../data/foliageFireStates.js';

export function createActorView(game, entity) {
  const world = game.world;
  const kind = getComponent(world, entity, ComponentType.Kind);
  const transform = getComponent(world, entity, ComponentType.Transform);
  const motion = getComponent(world, entity, ComponentType.Motion);
  const stamina = getComponent(world, entity, ComponentType.Stamina);
  const dodgeState = getComponent(world, entity, ComponentType.DodgeState);
  const pounceCounterState = getComponent(world, entity, ComponentType.PounceCounterState);
  const abilityProgression = getComponent(world, entity, ComponentType.AbilityProgression);
  const health = getComponent(world, entity, ComponentType.Health);
  const collider = getComponent(world, entity, ComponentType.Collider);
  const bodyContactRig = getComponent(world, entity, ComponentType.BodyContactRig);
  const renderable = getComponent(world, entity, ComponentType.Renderable);
  const creatureRecipe = getComponent(world, entity, ComponentType.CreatureRecipe);
  const raiderPhysicalMotion = getComponent(world, entity, ComponentType.RaiderPhysicalMotion);
  const team = getComponent(world, entity, ComponentType.Team);
  const cooldowns = getComponent(world, entity, ComponentType.Cooldowns) ?? {};
  const status = getComponent(world, entity, ComponentType.StatusEffects) ?? {};
  const impactResponse = getComponent(world, entity, ComponentType.ImpactResponse);
  const lightEmitter = getComponent(world, entity, ComponentType.LightEmitter);
  const wyvernProjection = getComponent(world, entity, ComponentType.WyvernProjection);
  const humanoidProjection = getComponent(world, entity, ComponentType.HumanoidProjection);
  const predatorProjection = getComponent(world, entity, ComponentType.PredatorProjection);
  const motionState = getComponent(world, entity, ComponentType.MotionState);
  const actionState = getComponent(world, entity, ComponentType.ActionState);
  const comboState = getComponent(world, entity, ComponentType.ComboState);
  const playerLifecycle = getComponent(world, entity, ComponentType.PlayerLifecycle);
  const limbRig = getComponent(world, entity, ComponentType.LimbRig);
  const proceduralPose = getComponent(world, entity, ComponentType.ProceduralPose);
  const rigPose = getComponent(world, entity, ComponentType.CreatureRigPose);
  const enemyPressureAI = getComponent(world, entity, ComponentType.EnemyPressureAI);
  const audioListener = getComponent(world, entity, ComponentType.AudioListener);
  const audioEmitter = getComponent(world, entity, ComponentType.AudioEmitter);
  if (!kind || !transform || !health || !collider || !team) return null;
  if (kind.type === EntityKind.UNIT_SPAWNER) return null;
  return {
    id: entity,
    authoredId: game.entityAuthoredIds?.[entity] ?? null,
    audioListener: cloneData(audioListener),
    audioEmitter: cloneData(audioEmitter),
    type: kind.type,
    team: team.id,
    label: kind.label,
    x: transform.x,
    y: transform.y,
    rotation: transform.rotation ?? 0,
    vx: 0,
    vy: 0,
    hp: health.hp,
    maxHp: health.maxHp,
    health: cloneData(health),
    speed: motion?.speed ?? 0,
    speedMultiplier: motion?.speedMultiplier ?? 1,
    corpseSlowdownMultiplier: motion?.corpseSlowdownMultiplier ?? 1,
    radius: collider.radius,
    bodyContactRig: cloneData(bodyContactRig),
    colour: renderable?.colour ?? '#d8d8d8',
    stroke: renderable?.stroke ?? '#111111',
    materialProfileId: renderable?.materialProfileId ?? null,
    role: renderable?.role ?? 'actor',
    silhouette: renderable?.silhouette ?? 'marker',
    lightReadabilityProfileId: renderable?.lightReadabilityProfileId ?? null,
    creatureRecipe: cloneData(creatureRecipe),
    raiderPhysicalMotion: cloneData(raiderPhysicalMotion),
    alive: health.alive,
    attackTimer: cooldowns.attack ?? 0,
    biteCooldown: cooldowns.bite ?? 0,
    lungeCooldown: cooldowns.lunge ?? 0,
    smokeCooldown: cooldowns.smoke ?? 0,
    panicTimer: status.panicTimer ?? 0,
    statusEffects: cloneData(status),
    impactResponse: cloneData(impactResponse),
    stamina: cloneData(stamina),
    dodgeState: cloneData(dodgeState),
    pounceCounterState: cloneData(pounceCounterState),
    chargeCounterState: cloneData(pounceCounterState),
    abilityProgression: cloneData(abilityProgression),
    playerLifecycle: cloneData(playerLifecycle),
    enemyBehaviour: cloneData(enemyPressureAI),
    humanoidProjection: humanoidProjection ? cloneData(humanoidProjection) : null,
    predatorProjection: predatorProjection ? cloneData(predatorProjection) : null,
    wyvernProjection: wyvernProjection ? {
      recipeId: wyvernProjection.recipeId,
      gaitPhase: wyvernProjection.gaitPhase ?? 0,
      idlePhase: wyvernProjection.idlePhase ?? 0,
      movement01: wyvernProjection.movement01 ?? 0,
      bodyPoints: (wyvernProjection.bodyPoints ?? []).map((point) => ({ ...point })),
      sockets: cloneSockets(wyvernProjection.sockets),
      axialTurn: cloneData(wyvernProjection.axialTurn),
      malformedTurnFrameCount: wyvernProjection.malformedTurnFrameCount ?? 0,
      motionState: cloneData(motionState),
      actionState: cloneData(actionState),
      comboState: cloneData(comboState),
      limbRig: cloneData(limbRig),
      proceduralPose: cloneData(proceduralPose),
      rigPose: cloneData(rigPose)
    } : null,
    lightEmitter: lightEmitter ? {
      id: lightEmitter.id,
      label: lightEmitter.label,
      enabled: lightEmitter.enabled !== false,
      colour: lightEmitter.colour,
      innerColour: lightEmitter.innerColour,
      visual: lightEmitter.visual ?? null
    } : null
  };
}

export function getDragon(game) {
  return createActorView(game, game.dragonId);
}

export function getAliveEnemies(game) {
  const playerTeam = getComponent(game.world, game.dragonId, ComponentType.Team)?.id;
  if (!playerTeam) return [];
  return buildActorViews(game).filter((actor) => actor.alive && areFactionsHostile(playerTeam, actor.team));
}

export function buildActorViews(game) {
  return query(game.world, [ComponentType.Kind, ComponentType.Transform, ComponentType.Health, ComponentType.Collider, ComponentType.Team])
    .map((entity) => createActorView(game, entity))
    .filter(Boolean);
}

export function buildSmokeViews(game) {
  return query(game.world, [ComponentType.Transform, ComponentType.SmokeCloud, ComponentType.Lifetime])
    .map((entity) => {
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      const smoke = getComponent(game.world, entity, ComponentType.SmokeCloud);
      const lifetime = getComponent(game.world, entity, ComponentType.Lifetime);
      const shape = resolveSmokeCloudShape(transform, smoke, lifetime);
      return {
        id: entity,
        x: shape.x,
        y: shape.y,
        radius: shape.radius,
        age: shape.age,
        lifetime: shape.lifetime,
        density: shape.density,
        opacity: shape.opacity,
        sourceKind: smoke.sourceKind,
        shape: smoke.shape,
        softness: smoke.softness,
        slowMultiplier: smoke.slowMultiplier,
        plumeId: smoke.plumeId,
        segmentIndex: smoke.segmentIndex,
        plumeT: smoke.plumeT,
        forwardX: smoke.forwardX,
        forwardY: smoke.forwardY
      };
    });
}

export function buildEffectViews(game) {
  return query(game.world, [ComponentType.Transform, ComponentType.Effect, ComponentType.Lifetime])
    .map((entity) => {
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      const effect = getComponent(game.world, entity, ComponentType.Effect);
      const lifetime = getComponent(game.world, entity, ComponentType.Lifetime);
      return {
        id: entity,
        kind: effect.kind,
        x: transform.x,
        y: transform.y,
        radius: effect.radius,
        age: lifetime.age,
        lifetime: lifetime.duration,
        hits: effect.hits,
        recipeId: effect.recipeId,
        style: effect.style ?? {}
      };
    });
}

export function buildCorpseViews(game) {
  return query(game.world, [ComponentType.Transform, ComponentType.Corpse])
    .map((entity) => {
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      const corpse = getComponent(game.world, entity, ComponentType.Corpse);
      return {
        id: entity,
        x: transform.x,
        y: transform.y,
        rotation: transform.rotation ?? 0,
        ...cloneData(corpse)
      };
    });
}

export function buildUnitSpawnerFixtureViews(game) {
  return (game.unitSpawners ?? [])
    .map((spawner) => {
      const entity = spawner.fixtureEntityId;
      if (!entity || !game.world.entities.has(entity)) return null;
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      const health = getComponent(game.world, entity, ComponentType.Health);
      const collider = getComponent(game.world, entity, ComponentType.Collider);
      const team = getComponent(game.world, entity, ComponentType.Team);
      if (!transform || !health || !collider || !team) return null;
      return {
        id: entity,
        spawnerId: spawner.id,
        label: spawner.label,
        type: spawner.type,
        kind: EntityKind.UNIT_SPAWNER,
        team: team.id,
        x: transform.x,
        y: transform.y,
        tileX: spawner.x,
        tileY: spawner.y,
        radius: collider.radius,
        hp: health.hp,
        maxHp: health.maxHp,
        alive: health.alive !== false,
        enabled: spawner.enabled !== false,
        destroyed: spawner.destroyed === true || health.alive === false,
        destroyedAt: spawner.destroyedAt ?? null,
        cooldownSeconds: spawner.cooldownSeconds ?? 0,
        spawnedCount: spawner.spawnedCount ?? 0,
        aliveCount: spawner.spawnedEntityIds?.length ?? 0,
        maxAlive: spawner.maxAlive,
        limit: spawner.limit,
        spawnRadiusTiles: spawner.spawnRadiusTiles,
        fixtureRadiusTiles: spawner.fixtureRadiusTiles
      };
    })
    .filter(Boolean);
}


export function buildLightViews(game, renderTime = 0, visibilityContext = null) {
  const entityLights = query(game.world, [ComponentType.Transform, ComponentType.LightEmitter])
    .map((entity) => {
      const transform = getComponent(game.world, entity, ComponentType.Transform);
      const light = getComponent(game.world, entity, ComponentType.LightEmitter);
      const humanoidProjection = getComponent(game.world, entity, ComponentType.HumanoidProjection);
      const recipe = safeLightEmitterRecipe(light?.id);
      const anchor = resolveTorchLightAnchor(transform, humanoidProjection, light);
      const radiusScale = Math.max(0, Number(light.radiusScale ?? 1));
      const emissionScale = Math.max(0, Number(light.emissionScale ?? 1));
      const contribution = resolveEmitterLightContribution(light, { radiusScale, emissionScale });
      const radius = contribution.glowRadius;
      const intensity = contribution.glowStrength;
      const enabled = light.enabled !== false && radius > 0.01 && intensity > 0.01;
      const droppedTorch = light.lifecycleState && light.lifecycleState !== 'carried';
      return {
        id: entity,
        x: anchor.x,
        y: anchor.y,
        radius,
        intensity,
        ...contribution,
        softness: light.softness,
        colour: light.colour,
        innerColour: light.innerColour,
        flickerAmount: light.flickerAmount,
        flickerSpeed: light.flickerSpeed,
        flickerPhase: light.flickerPhase,
        renderTime,
        enabled,
        sourceEntity: entity,
        sourceKind: light.id,
        sourceSocket: anchor.sourceSocket,
        sourceAnchor: {
          type: droppedTorch ? 'defeated_torch' : 'world_entity',
          id: entity,
          lifecycleState: light.lifecycleState ?? 'carried'
        },
        smokeSourceKind: light.smokeSourceKind ?? recipe?.smokeSourceKind ?? null,
        ambientParticleKind: light.ambientParticleKind ?? recipe?.ambientParticleKind ?? null,
        forwardX: anchor.forwardX,
        forwardY: anchor.forwardY,
        lifecycleState: light.lifecycleState ?? 'carried',
        defeatedElapsed: light.defeatedElapsed ?? null
      };
    });
  return [
    ...entityLights,
    ...buildSceneObjectLightViews(game.sceneObjects ?? [], renderTime),
    ...buildFoliageFireLightViews(game.sceneObjects ?? [], renderTime),
    ...buildSceneLightViews(game.sceneLights, renderTime, visibilityContext),
    ...buildNapalmLightViews(game.renderLayers, renderTime),
    ...buildMamaWorldEventLightViews(game.worldEvents, renderTime)
  ];
}

function buildSceneObjectLightViews(sceneObjects = [], renderTime = 0) {
  return sceneObjects
    .filter((object) => object?.emitter?.lightEmitterId)
    .map((object) => {
      const emitter = object.emitter ?? {};
      const recipe = getLightEmitterRecipe(emitter.lightEmitterId);
      const radiusScale = Math.max(0, Number(emitter.radiusScale ?? 1));
      const emissionScale = Math.max(0, Number(emitter.emissionScale ?? 1));
      const contribution = resolveEmitterLightContribution({ ...recipe, ...emitter }, { radiusScale, emissionScale });
      const anchorSpace = emitter.anchorSpace ?? 'visual_center';
      const anchorBaseX = anchorSpace === 'object_anchor' ? object.x : finiteNumber(object.visualX, object.x);
      const anchorBaseY = anchorSpace === 'object_anchor' ? object.y : finiteNumber(object.visualY, object.y);
      const x = anchorBaseX + finiteNumber(emitter.anchorOffsetX, 0);
      const y = anchorBaseY + finiteNumber(emitter.anchorOffsetY, 0);
      const forward = normalizeVector(emitter.forwardX, emitter.forwardY, 0, -1);
      return {
        id: `scene_object_light:${object.id}`,
        x,
        y,
        radius: contribution.glowRadius,
        intensity: contribution.glowStrength,
        ...contribution,
        softness: recipe.softness,
        colour: recipe.colour,
        innerColour: recipe.innerColour,
        flickerAmount: recipe.flickerAmount,
        flickerSpeed: recipe.flickerSpeed,
        flickerPhase: finiteNumber(emitter.flickerPhase, 0),
        renderTime,
        enabled: emitter.enabled !== false,
        sourceEntity: object.id,
        sourceKind: recipe.id,
        sceneLight: true,
        sourceSocket: emitter.sourceSocket ?? 'scene_object_emitter',
        sourceAnchor: {
          type: 'scene_object',
          id: object.id,
          objectType: object.type,
          anchorSpace
        },
        sourcePolicy: emitter.sourcePolicy ?? 'static_scene_object_authored_emitter',
        smokeSourceKind: emitter.smokeSourceKind ?? recipe.smokeSourceKind ?? null,
        ambientParticleKind: emitter.ambientParticleKind ?? recipe.ambientParticleKind ?? null,
        forwardX: forward.x,
        forwardY: forward.y,
        lifecycleState: 'static'
      };
    });
}

function cloneSockets(sockets) {
  if (!sockets) return {};
  return Object.fromEntries(Object.entries(sockets).map(([key, value]) => [key, { ...value }]));
}

function cloneData(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function safeLightEmitterRecipe(id) {
  try {
    return getLightEmitterRecipe(id);
  } catch {
    return null;
  }
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeVector(x, y, fallbackX = 0, fallbackY = -1) {
  const nx = Number(x);
  const ny = Number(y);
  const length = Math.hypot(nx, ny);
  if (Number.isFinite(length) && length > 0.001) return { x: nx / length, y: ny / length };
  const fallbackLength = Math.hypot(fallbackX, fallbackY) || 1;
  return { x: fallbackX / fallbackLength, y: fallbackY / fallbackLength };
}

export function syncGameViews(game, visibilityContext = null) {
  game.actors = buildActorViews(game);
  game.unitSpawnerFixtures = buildUnitSpawnerFixtureViews(game);
  game.corpses = buildCorpseViews(game);
  game.smokeClouds = buildSmokeViews(game);
  game.effects = buildEffectViews(game);
  game.lights = buildLightViews(game, game.renderTime ?? 0, visibilityContext);
  game.smokeSources = buildSmokeSourceViews(game);
  return game;
}
