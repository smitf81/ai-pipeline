import { getDragon } from '../game/selectors.js';
import { getTerrainDef } from '../world/terrain.js';
import { createDebugSnapshot } from './snapshot.js';
import { buildPlayerAbilityText } from './playerAbilityText.js'; import { buildTutorialText } from './tutorialText.js';
import { buildEnemyBehaviourText } from './enemyBehaviourText.js';
import { buildOpeningSequenceProjection } from '../projection/openingSequenceProjection.js';
import { buildSmokeAwakeningText } from './smokeAwakeningText.js';
import { buildAuthoredTransitionText } from './authoredTransitionText.js'; import { buildArenaWaveText } from './arenaWaveText.js'; import { buildRaiderPhysicalMotionText } from './raiderPhysicalMotionText.js';

export function renderGameToText(app) {
  const dragon = getDragon(app.state.game); const snapshot = createDebugSnapshot(app.state.game);
  const rigPose = dragon?.wyvernProjection?.rigPose ?? null;
  return JSON.stringify({
    coordinateSystem: 'world tiles, origin top-left, x right, y down',
    status: app.state.game.status,
    paused: app.state.paused,
    pauseMenu: app.state.paused ? { selectedSettingIndex: app.state.pauseMenu?.selectedSettingIndex ?? 0,
      lastInputMethod: app.state.pauseMenu?.lastInputMethod ?? null, draggedSettingId: app.state.pauseMenu?.draggedSettingId ?? null,
      pointerOverControl: app.state.pauseMenu?.pointerOverControl === true, settings: { ...(app.state.playerProfile?.settings?.audio ?? {}) } } : null,
    time: Number(app.state.time.toFixed(3)),
    gameplayTimeScale: Number((app.state.gameTime?.currentScale ?? 1).toFixed(3)),
    performance: {
      fps: Number((app.state.diagnostics.performance?.fps ?? 0).toFixed(2)),
      frameMs: Number((app.state.diagnostics.performance?.frameMs ?? 0).toFixed(3)),
      frame: app.state.diagnostics.frame
    },
    runtimeMap: {
      contract: app.state.map.contract,
      id: app.state.map.id,
      width: app.state.map.width,
      height: app.state.map.height,
      revision: app.state.map.revision,
      source: app.state.runtimeMapSource,
      path: app.state.runtimeMapLoad.path,
      hash: app.state.runtimeMapLoad.hash,
      version: app.state.runtimeMapLoad.version,
      fallbackUsed: app.state.runtimeMapLoad.fallbackUsed,
      selectionSource: app.state.runtimeMapLoad.selectionSource,
      manifestPath: app.state.runtimeMapLoad.manifestPath,
      catalogueMapId: app.state.runtimeMapLoad.catalogueMapId,
      transition: app.state.runtimeMapLoad.transition ?? null,
      escapeTransition: app.state.map.transitions?.escapeZone ?? null,
      sceneSequenceIds: (app.state.map.sceneSequences ?? []).map((entry) => entry.id),
      immutable: Object.isFrozen(app.state.map)
    },
    camera: {
      x: Number(app.state.camera.x.toFixed(2)),
      y: Number(app.state.camera.y.toFixed(2)),
      zoom: Number(app.state.camera.zoom.toFixed(3)),
      mapWidth: app.state.map.width,
      mapHeight: app.state.map.height
    },
    player: dragon ? buildPlayerText(dragon) : null,
    opening: buildOpeningText(app.state),
    authoredTransition: buildAuthoredTransitionText(app.state),
    arena: buildArenaWaveText(app.state.game),
    smokeAwakening: buildSmokeAwakeningText(app.state),
    tutorial: buildTutorialText(app.state),
    actors: app.state.game.actors.map(buildActorText),
    corpses: (app.state.game.corpses ?? []).map(buildCorpseText),
    sceneObjects: app.state.game.sceneObjects.map(buildSceneObjectText),
    sceneLights: app.state.game.sceneLights.map(buildSceneLightText),
    unitSpawners: (app.state.game.unitSpawners ?? []).map(buildUnitSpawnerText),
    unitSpawnerFixtures: (app.state.game.unitSpawnerFixtures ?? []).map(buildUnitSpawnerFixtureText),
    movementSpacing: app.state.game.movementSpacing ?? null,
    worldEvents: buildWorldEventText(app.state.game.worldEvents),
    spatialHazards: (app.state.game.spatialHazards ?? []).map((hazard) => ({ ...hazard })),
    lights: app.state.game.lights.length,
    lightViews: app.state.game.lights.map(buildLightViewText),
    smokeSources: app.state.game.smokeSources.length,
    smokeSourceViews: app.state.game.smokeSources.map(buildSmokeSourceText),
    occlusionBlockers: app.state.game.occlusionBlockers.length,
    materials: buildRuntimeMaterialSummary(app.state),
    tuning: {
      active: app.state.tuning.active,
      source: app.state.tuning.source,
      saveStatus: app.state.tuning.saveStatus,
      selectedEntityId: app.state.tuning.selectedEntityId,
      selectedProfileId: app.state.tuning.selectedProfileId,
      overrideCount: app.state.tuning.overrideCount,
      changedPaths: app.state.tuning.changedPaths,
      rigBounds: rigPose?.visualBounds ?? null
    },
    audio: app.audio.getDebugState(),
    renderLayerStats: snapshot.renderLayerStats
  });
}

function buildOpeningText(state) {
  const opening = buildOpeningSequenceProjection(state);
  if (!opening) return null;
  return {
    contract: opening.contract,
    source: opening.source,
    active: opening.active,
    phase: opening.phase,
    elapsedReal: Number(opening.elapsedReal.toFixed(3)),
    phaseElapsedReal: Number(opening.phaseElapsedReal.toFixed(3)),
    acceptedInputCount: opening.acceptedInputCount,
    requiredInputCount: opening.requiredInputCount,
    crackStage: opening.crackStage,
    strainProgress: Number(opening.strainProgress.toFixed(3)),
    openingProgress: Number(opening.openingProgress.toFixed(3)),
    emergenceProgress: Number(opening.emergenceProgress.toFixed(3)),
    settleProgress: Number(opening.settleProgress.toFixed(3)),
    egressProgress: Number(opening.egressProgress.toFixed(3)),
    rockPulse: Number(opening.rockPulse.toFixed(3)),
    movementPulse: Number(opening.movementPulse.toFixed(3)),
    lightPulse: Number(opening.lightPulse.toFixed(3)),
    lastMovementDirection: opening.lastMovementDirection,
    movementHistory: opening.movementHistory,
    crackCount: opening.cracks.length,
    lightRayCount: opening.lightRays.length,
    egg: {
      visible: opening.egg.visible,
      mapId: opening.egg.mapId,
      worldX: opening.egg.worldX,
      worldY: opening.egg.worldY,
      revealOpacity: Number(opening.egg.revealOpacity.toFixed(3)),
      shellOpenProgress: Number(opening.egg.shellOpenProgress.toFixed(3)),
      shellPieceCount: opening.egg.shellPieceCount
    },
    camera: {
      zoom: Number(opening.camera.zoom.toFixed(3)),
      anchorWorldX: Number(opening.camera.anchorWorldX.toFixed(2)),
      anchorWorldY: Number(opening.camera.anchorWorldY.toFixed(2)),
      impulseWorldX: Number(opening.camera.impulseWorldX.toFixed(2)),
      impulseWorldY: Number(opening.camera.impulseWorldY.toFixed(2))
    },
    released: opening.released,
    prompt: opening.prompt,
    simulationGateTicks: state.opening?.diagnostics?.simulationGateTicks ?? 0,
    audio: { ...(state.opening?.audio ?? {}) },
    reducedMotion: opening.settings.reducedMotion
  };
}

function buildPlayerText(dragon) {
  return {
    x: Number(dragon.x.toFixed(2)),
    y: Number(dragon.y.toFixed(2)),
    rotation: Number((dragon.rotation ?? 0).toFixed(3)),
    hp: dragon.hp,
    maxHp: dragon.maxHp,
    alive: dragon.alive,
    recovery: dragon.health ? {
      blockedByThreat: dragon.health.recoveryBlockedByThreat === true,
      directPursuerCount: dragon.health.directPursuerCount ?? 0,
      delayRemainingMs: Number((dragon.health.recoveryDelayRemainingMs ?? 0).toFixed(1)),
      regeneratedTotal: Number((dragon.health.regeneratedTotal ?? 0).toFixed(3))
    } : null,
    lifecycle: dragon.playerLifecycle ? {
      state: dragon.playerLifecycle.state,
      previousState: dragon.playerLifecycle.previousState ?? null,
      stateElapsed: Number((dragon.playerLifecycle.stateElapsed ?? 0).toFixed(3)),
      controlSuppressed: dragon.playerLifecycle.controlSuppressed === true,
      deathCount: dragon.playerLifecycle.deathCount ?? 0,
      respawnCount: dragon.playerLifecycle.respawnCount ?? 0,
      lastRespawnSource: dragon.playerLifecycle.lastRespawnSource ?? null,
      lastRespawnX: dragon.playerLifecycle.lastRespawnX == null ? null : Number(dragon.playerLifecycle.lastRespawnX.toFixed(2)),
      lastRespawnY: dragon.playerLifecycle.lastRespawnY == null ? null : Number(dragon.playerLifecycle.lastRespawnY.toFixed(2))
    } : null,
    stamina: dragon.stamina ? {
      current: Number(dragon.stamina.current.toFixed(2)),
      max: dragon.stamina.max,
      state: dragon.stamina.state,
      sprinting: dragon.stamina.sprinting === true,
      recoveryTimer: Number((dragon.stamina.recoveryTimer ?? 0).toFixed(3))
    } : null,
    dodge: dragon.dodgeState ? {
      active: dragon.dodgeState.active === true,
      recovering: dragon.dodgeState.recovering === true,
      phase: Number((dragon.dodgeState.phase ?? 0).toFixed(3)),
      recoveryProgress: Number((dragon.dodgeState.recoveryProgress ?? 0).toFixed(3)),
      cooldownRemaining: Number((dragon.dodgeState.cooldownRemaining ?? 0).toFixed(3)),
      count: dragon.dodgeState.count ?? 0,
      lastReason: dragon.dodgeState.lastReason ?? null,
      lastDeniedReason: dragon.dodgeState.lastDeniedReason ?? null
    } : null,
    ...buildPlayerAbilityText(dragon),
    action: dragon.wyvernProjection?.actionState ? {
      active: dragon.wyvernProjection.actionState.active === true,
      recovering: dragon.wyvernProjection.actionState.recovering === true,
      actionId: dragon.wyvernProjection.actionState.actionId ?? null,
      recoveryActionId: dragon.wyvernProjection.actionState.recoveryActionId ?? null,
      phase: Number((dragon.wyvernProjection.actionState.phase ?? 0).toFixed(3)),
      recoveryPhase: Number((dragon.wyvernProjection.actionState.recoveryPhase ?? 1).toFixed(3)),
      recoveryProgress: Number((dragon.wyvernProjection.actionState.recoveryProgress ?? 0).toFixed(3)),
      directionX: Number((dragon.wyvernProjection.actionState.directionX ?? 0).toFixed(3)),
      directionY: Number((dragon.wyvernProjection.actionState.directionY ?? 0).toFixed(3)),
      committedFacing: Number((dragon.wyvernProjection.actionState.committedFacing ?? 0).toFixed(3)),
      movementBlocked: dragon.wyvernProjection.actionState.movementBlocked === true
    } : null,
    head: dragon.wyvernProjection?.rigPose?.head?.center ? {
      x: Number(dragon.wyvernProjection.rigPose.head.center.x.toFixed(3)),
      y: Number(dragon.wyvernProjection.rigPose.head.center.y.toFixed(3))
    } : null,
    impactReaction: dragon.wyvernProjection?.proceduralPose?.impactState ?? null
  };
}

function buildActorText(actor) {
  return {
    id: actor.id, authoredId: actor.authoredId ?? null,
    type: actor.type,
    team: actor.team,
    x: Number(actor.x.toFixed(2)),
    y: Number(actor.y.toFixed(2)),
    hp: actor.hp,
    alive: actor.alive,
    corpseSlowdownMultiplier: Number((actor.corpseSlowdownMultiplier ?? 1).toFixed(3)),
    speedMultiplier: Number((actor.speedMultiplier ?? 1).toFixed(3)),
    movementSlow: actor.statusEffects?.movementSlowTimer > 0 ? {
      remaining: Number(actor.statusEffects.movementSlowTimer.toFixed(3)),
      multiplier: Number((actor.statusEffects.movementSlowMultiplier ?? 1).toFixed(3)),
      source: actor.statusEffects.movementSlowSource ?? null
    } : null,
    stamina: actor.stamina ? {
      current: Number(actor.stamina.current.toFixed(2)),
      max: actor.stamina.max,
      state: actor.stamina.state,
      sprinting: actor.stamina.sprinting === true
    } : null,
    dodge: actor.dodgeState ? {
      enabled: actor.dodgeState.enabled === true,
      active: actor.dodgeState.active === true,
      phase: Number((actor.dodgeState.phase ?? 0).toFixed(3)),
      cooldownRemaining: Number((actor.dodgeState.cooldownRemaining ?? 0).toFixed(3)),
      distanceApplied: Number((actor.dodgeState.distanceApplied ?? 0).toFixed(3)),
      count: actor.dodgeState.count ?? 0,
      lastReason: actor.dodgeState.lastReason ?? null,
      lastDeniedReason: actor.dodgeState.lastDeniedReason ?? null
    } : null,
    enemyBehaviour: actor.enemyBehaviour ? buildEnemyBehaviourText(actor.enemyBehaviour) : null,
    materialProfileId: actor.materialProfileId ?? null,
    humanoidProfileId: actor.humanoidProjection?.profileId ?? null,
    humanoidMotionState: actor.humanoidProjection?.motionState ?? null,
    humanoidAttackState: actor.humanoidProjection?.attackState ? {
      profileId: actor.humanoidProjection.attackState.profileId, phase: actor.humanoidProjection.attackState.phase,
      progress01: Number(actor.humanoidProjection.attackState.progress01.toFixed(3)), damageWindowActive: actor.humanoidProjection.attackState.damageWindowActive === true,
      damageTime01: actor.humanoidProjection.attackState.damageTime01, weaponReach: actor.humanoidProjection.attackState.weaponReach,
      hitShape: actor.humanoidProjection.attackState.hitShape, strikeOriginSocket: actor.humanoidProjection.attackState.strikeOriginSocket ?? null,
      strikeEndpointSocket: actor.humanoidProjection.attackState.strikeEndpointSocket ?? null, telegraphVisual: actor.humanoidProjection.attackState.telegraphVisual ?? null,
      weaponSocket: actor.humanoidProjection.attackState.weaponSocket ?? null
    } : null,
    humanoidGuardState: actor.humanoidProjection?.guardState ?? null,
    humanoidJoints: actor.humanoidProjection?.points?.leftElbow ? {
      leftElbow: roundPoint(actor.humanoidProjection.points.leftElbow), rightElbow: roundPoint(actor.humanoidProjection.points.rightElbow),
      leftKnee: roundPoint(actor.humanoidProjection.points.leftKnee), rightKnee: roundPoint(actor.humanoidProjection.points.rightKnee)
    } : null,
    humanoidPartCount: actor.humanoidProjection?.partCount ?? null,
    humanoidReactionState: actor.humanoidProjection?.reactionState ?? null,
    creatureRecipe: actor.creatureRecipe ? { contract: actor.creatureRecipe.contract, recipeId: actor.creatureRecipe.recipeId, seed: actor.creatureRecipe.seed, seedProvenance: actor.creatureRecipe.seedProvenance, variantSignature: actor.creatureRecipe.variantSignature, attachmentIds: actor.creatureRecipe.attachmentIds } : null,
    raiderPhysicalMotion: buildRaiderPhysicalMotionText(actor.raiderPhysicalMotion, roundPoint),
    motionTrailRoles: [...new Set((actor.humanoidProjection?.motionTrails ?? []).map((sample) => sample.role))],
    motionTrailSamples: actor.humanoidProjection?.motionTrails?.length ?? 0,
    spearSocket: actor.humanoidProjection?.sockets?.spearTip ? {
      x: Number(actor.humanoidProjection.sockets.spearTip.x.toFixed(2)),
      y: Number(actor.humanoidProjection.sockets.spearTip.y.toFixed(2))
    } : null,
    predatorProfileId: actor.predatorProjection?.profileId ?? null,
    predatorMotionState: actor.predatorProjection?.motionState ?? null,
    predatorAttackState: actor.predatorProjection?.attackState ?? null,
    predatorReactionState: actor.predatorProjection?.reactionState ?? null,
    impactResponse: actor.impactResponse ? {
      staggerTimer: Number((actor.impactResponse.staggerTimer ?? 0).toFixed(3)),
      reactionDuration: Number((actor.impactResponse.reactionDuration ?? 0).toFixed(3)),
      knockbackVelocityX: Number((actor.impactResponse.knockbackVelocityX ?? 0).toFixed(3)),
      knockbackVelocityY: Number((actor.impactResponse.knockbackVelocityY ?? 0).toFixed(3)),
      lastImpact: actor.impactResponse.lastImpact ?? null
    } : null,
    torchState: actor.humanoidProjection?.torchState ? {
      mode: actor.humanoidProjection.torchState.mode ?? null,
      x: Number(actor.humanoidProjection.torchState.x.toFixed(2)),
      y: Number(actor.humanoidProjection.torchState.y.toFixed(2)),
      fade01: Number((actor.humanoidProjection.torchState.fade01 ?? 0).toFixed(3)),
      defeatedElapsed: actor.humanoidProjection.torchState.defeatedElapsed == null
        ? null
        : Number(actor.humanoidProjection.torchState.defeatedElapsed.toFixed(3))
    } : null,
    torchSocket: actor.humanoidProjection?.sockets?.torchFlame ? {
      x: Number(actor.humanoidProjection.sockets.torchFlame.x.toFixed(2)),
      y: Number(actor.humanoidProjection.sockets.torchFlame.y.toFixed(2))
    } : null
  };
}

function buildWorldEventText(worldEvents) {
  if (!worldEvents) return null;
  const event = worldEvents.activeEvent;
  return {
    contract: worldEvents.contract,
    enabled: worldEvents.enabled !== false,
    autoEnabled: worldEvents.autoEnabled !== false,
    elapsed: Number((worldEvents.elapsed ?? 0).toFixed(3)),
    nextEventAt: Number((worldEvents.nextEventAt ?? 0).toFixed(3)),
    activeEvent: event ? {
      id: event.id,
      kind: event.kind,
      phase: event.phase,
      progress: Number((event.progress ?? 0).toFixed(3)),
      headingRadians: Number((event.headingRadians ?? 0).toFixed(3)),
      forward: roundVector(event.forwardX, event.forwardY),
      right: roundVector(event.rightX, event.rightY),
      crossingAnchorPolicy: event.crossingAnchorPolicy ?? null,
      crossingX: Number((event.centerX ?? 0).toFixed(2)),
      crossingY: Number((event.centerY ?? 0).toFixed(2)),
      position: roundVector(event.worldX, event.worldY),
      pathStart: roundVector(event.startX, event.startY),
      pathEnd: roundVector(event.endX, event.endY),
      trajectorySource: event.trajectorySource ?? null,
      trajectoryDistanceTiles: Number((event.trajectoryDistanceTiles ?? 0).toFixed(3)),
      cameraBoundsAtFlyoverStart: roundBounds(event.cameraBoundsAtFlyoverStart),
      breath: event.breath ? {
        mode: resolveMamaBreathMode(event),
        active: event.breath.active === true,
        phase: Number((event.breath.phase ?? 0).toFixed(3)),
        opacity: Number((event.breath.opacity ?? 0).toFixed(3)),
        origin: roundVector(event.breath.originX, event.breath.originY),
        target: roundVector(event.breath.targetX, event.breath.targetY)
      } : null,
      lightningSync: event.lightningSync === true,
      lightningQueued: event.lightningQueued === true,
      infernoDeployed: event.infernoDeployed === true
    } : null,
    fireWalls: (worldEvents.fireWalls ?? []).map((wall) => ({
      id: wall.id,
      headingRadians: Number((wall.headingRadians ?? 0).toFixed(3)),
      forward: roundVector(wall.forwardX, wall.forwardY),
      start: roundVector(wall.ax, wall.ay),
      end: roundVector(wall.bx, wall.by),
      age: Number(wall.age.toFixed(3)),
      remainingSeconds: Number(Math.max(0, wall.lifetime - wall.age).toFixed(3)),
      damageScale: Number(wall.damageScale.toFixed(3)),
      slowMultiplier: Number(wall.slowMultiplier.toFixed(3)),
      lightScale: Number(wall.lightScale.toFixed(3)),
      lastHitCount: wall.lastHitCount,
      totalHitCount: wall.totalHitCount
    })),
    audio: { ...worldEvents.audio },
    diagnostics: { ...worldEvents.diagnostics },
    manualControls: [
      'app.worldEvents.flyover()',
      'app.worldEvents.inferno()',
      'app.worldEvents.lightningFlyover()',
      'app.worldEvents.lightningInferno()'
    ]
  };
}

function roundVector(x, y) {
  return { x: Number((x ?? 0).toFixed(3)), y: Number((y ?? 0).toFixed(3)) };
}

function roundBounds(bounds) {
  return bounds ? Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Number(value.toFixed(3))])) : null;
}

function resolveMamaBreathMode(event) {
  return event.breath?.mode ?? 'mama_head_rooted_directional_delivery_v1';
}

function buildCorpseText(corpse) {
  return {
    id: corpse.id,
    sourceEntityId: corpse.sourceEntityId,
    sourceKind: corpse.sourceKind,
    profileId: corpse.profileId,
    x: Number(corpse.x.toFixed(2)),
    y: Number(corpse.y.toFixed(2)),
    rotation: Number(corpse.rotation.toFixed(3)),
    bloodRadius: corpse.bloodRadius,
    slowdownRadius: corpse.slowdownRadius,
    slowdownMultiplier: corpse.slowdownMultiplier
  };
}

function buildSceneObjectText(object) {
  return {
    id: object.id,
    type: object.type,
    tileX: object.tileX,
    tileY: object.tileY,
    widthTiles: object.widthTiles,
    heightTiles: object.heightTiles,
    visualWidthTiles: object.visualWidthTiles,
    visualHeightTiles: object.visualHeightTiles,
    scaleProfileId: object.scaleProfileId,
    physicalHeightMeters: object.physical?.heightMeters ?? null,
    materialProfileId: object.materialProfileId ?? null,
    materialState: object.materialState ?? null,
    blocksMovement: object.blocksMovement,
    collisionPolicy: object.collisionPolicy,
    castsShadow: object.occlusion?.castsShadow !== false,
    occlusionRadius: object.occlusion?.radius ?? null,
    occlusionHeight: object.occlusion?.height ?? object.occlusion?.occlusionHeight ?? null,
    emitter: object.emitter ? {
      lightEmitterId: object.emitter.lightEmitterId ?? null,
      smokeSourceKind: object.emitter.smokeSourceKind ?? null,
      sourcePolicy: object.emitter.sourcePolicy ?? null
    } : null
  };
}

function buildSceneLightText(light) {
  return {
    id: light.id,
    sourceKind: light.sourceKind,
    sourcePolicy: light.sourcePolicy,
    x: Number.isFinite(Number(light.x)) ? Number(Number(light.x).toFixed(2)) : null,
    y: Number.isFinite(Number(light.y)) ? Number(Number(light.y).toFixed(2)) : null,
    radius: light.radius,
    intensity: light.intensity,
    shadowLengthScale: light.shadow?.lengthScale ?? null,
    cloudOcclusionContract: light.cloudOcclusion?.contract ?? null,
    cloudScaleTiles: light.cloudOcclusion?.scaleTiles ?? null,
    cloudShapeNoise: light.cloudOcclusion?.shapeNoise ?? null,
    stormContract: light.storm?.contract ?? null,
    stormIntervalSeconds: light.storm?.intervalSeconds ?? null
  };
}

function buildUnitSpawnerText(spawner) {
  return {
    id: spawner.id,
    type: spawner.type,
    team: spawner.team,
    x: spawner.x,
    y: spawner.y,
    enabled: spawner.enabled !== false,
    intervalSeconds: spawner.intervalSeconds,
    burstCount: spawner.burstCount,
    maxAlive: spawner.maxAlive,
    limit: spawner.limit,
    spawnRadiusTiles: spawner.spawnRadiusTiles,
    hitPoints: spawner.hitPoints,
    fixtureRadiusTiles: spawner.fixtureRadiusTiles,
    audioEmitter: spawner.audioEmitter ? { ...spawner.audioEmitter } : null, fixtureEntityId: spawner.fixtureEntityId ?? null,
    destroyed: spawner.destroyed === true,
    destroyedAt: spawner.destroyedAt ?? null,
    cooldownSeconds: Number((spawner.cooldownSeconds ?? 0).toFixed(3)),
    spawnedCount: spawner.spawnedCount ?? 0,
    aliveCount: spawner.spawnedEntityIds?.length ?? 0
  };
}

function buildUnitSpawnerFixtureText(fixture) {
  return {
    id: fixture.id,
    spawnerId: fixture.spawnerId,
    type: fixture.type,
    team: fixture.team,
    x: Number(fixture.x.toFixed(2)),
    y: Number(fixture.y.toFixed(2)),
    hp: fixture.hp,
    maxHp: fixture.maxHp,
    alive: fixture.alive,
    enabled: fixture.enabled,
    destroyed: fixture.destroyed,
    radius: fixture.radius
  };
}

function buildLightViewText(light) {
  return {
    id: light.id,
    sourceKind: light.sourceKind,
    sceneLight: !!light.sceneLight,
    sourceSocket: light.sourceSocket ?? null,
    x: Number(light.x.toFixed(2)),
    y: Number(light.y.toFixed(2)),
    radius: Number(light.radius.toFixed(2)),
    intensity: Number(light.intensity.toFixed(3)),
    revealRadius: Number((light.revealRadius ?? light.radius).toFixed(2)),
    revealStrength: Number((light.revealStrength ?? light.intensity).toFixed(3)),
    glowRadius: Number((light.glowRadius ?? light.radius).toFixed(2)),
    glowStrength: Number((light.glowStrength ?? light.intensity).toFixed(3)),
    coreRadius: Number((light.coreRadius ?? light.radius).toFixed(2)),
    coreStrength: Number((light.coreStrength ?? light.intensity).toFixed(3)),
    sourceAnchor: light.sourceAnchor ?? null,
    cloudOcclusionContract: light.cloudOcclusion?.contract ?? null,
    flashStage: light.flashStage ?? null,
    afterimageIntensity: light.afterimageIntensity ?? null,
    stormEvent: light.stormEvent ?? null
  };
}

function buildSmokeSourceText(source) {
  return {
    id: source.id,
    sourceKind: source.sourceKind,
    sourceId: source.sourceId,
    shape: source.shape ?? null,
    x: Number(source.x.toFixed(2)),
    y: Number(source.y.toFixed(2)),
    radius: Number(source.radius.toFixed(2)),
    density: Number((source.density ?? 0).toFixed(3))
  };
}

function buildRuntimeMaterialSummary(state) {
  const actorProfiles = uniqueProfiles(state.game.actors.map((actor) => actor.materialProfileId));
  const sceneObjectProfiles = uniqueProfiles(state.game.sceneObjects.map((object) => object.materialProfileId));
  const terrainProfiles = uniqueProfiles((state.map?.tiles ?? []).flat().map((type) => getTerrainDef(type).materialProfileId));
  return {
    contract: 'black-sky-bound.material-profile.v0',
    actorProfiles,
    sceneObjectProfiles,
    terrainProfiles,
    profileCount: uniqueProfiles([...actorProfiles, ...sceneObjectProfiles, ...terrainProfiles]).length
  };
}

function uniqueProfiles(values) {
  return [...new Set(values.filter(Boolean))].sort();
}
function roundPoint(point) { return { x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)) }; }
