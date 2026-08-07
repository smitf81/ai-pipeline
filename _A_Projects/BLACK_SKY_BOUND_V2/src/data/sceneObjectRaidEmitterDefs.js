export function buildRaidEmitterSceneObjects({
  SceneObjectType,
  WORLD_SCALE,
  metersToTiles,
  MaterialProfileId,
  LightEmitterId,
  SmokeSourceKind
}) {
  const FIRE_ARROW_PHYSICAL = Object.freeze({
    widthMeters: WORLD_SCALE.sceneObjectTargets.fireArrowEmitter.single.widthMeters,
    depthMeters: WORLD_SCALE.sceneObjectTargets.fireArrowEmitter.single.depthMeters,
    heightMeters: WORLD_SCALE.sceneObjectTargets.fireArrowEmitter.single.heightMeters
  });

  const FIRE_ARROW_CLUSTER_PHYSICAL = Object.freeze({
    widthMeters: WORLD_SCALE.sceneObjectTargets.fireArrowEmitter.cluster.widthMeters,
    depthMeters: WORLD_SCALE.sceneObjectTargets.fireArrowEmitter.cluster.depthMeters,
    heightMeters: WORLD_SCALE.sceneObjectTargets.fireArrowEmitter.cluster.heightMeters
  });

  const SMOULDERING_FERN_PHYSICAL = Object.freeze({
    widthMeters: 1.3,
    depthMeters: 0.9,
    heightMeters: 0.4
  });

  const SMOULDERING_BRAMBLE_PHYSICAL = Object.freeze({
    widthMeters: 1.7,
    depthMeters: 1.15,
    heightMeters: 0.55
  });

  return Object.freeze({
    [SceneObjectType.FIRE_ARROW_LEFT]: Object.freeze({
      type: SceneObjectType.FIRE_ARROW_LEFT,
      label: 'Fire Arrow (Left Lean)',
      scaleProfileId: WORLD_SCALE.id,
      materialProfileId: MaterialProfileId.WOOD_DEAD_SNAG,
      materialState: {
        burnAmount: 0.84,
        density: 0.42,
        integrity: 0.58,
        nightReveal: 0.82
      },
      physical: FIRE_ARROW_PHYSICAL,
      footprint: { w: 1, h: 1 },
      visualFootprint: {
        w: metersToTiles(FIRE_ARROW_PHYSICAL.widthMeters),
        h: metersToTiles(FIRE_ARROW_PHYSICAL.depthMeters),
        offsetX: -0.24,
        offsetY: -0.18
      },
      collision: {
        blocksMovement: false,
        policy: 'non_blocking_scene_detail_v0'
      },
      occlusion: {
        castsShadow: false,
        radius: 0.24,
        height: FIRE_ARROW_PHYSICAL.heightMeters
      },
      emitter: {
        lightEmitterId: LightEmitterId.RAID_FLAME,
        sourcePolicy: 'static_scene_object_embedded_fire_arrow_emitter',
        anchorSpace: 'object_anchor',
        anchorOffsetX: -0.16,
        anchorOffsetY: -0.18,
        forwardX: -0.32,
        forwardY: -1,
        smokeSourceKind: SmokeSourceKind.RAID_FLAME_WISP,
        radiusScale: 0.82,
        emissionScale: 0.84
      },
      audioEmitter: fireAudioEmitter(-0.16, -0.18),
      render: {
        kind: 'fire_arrow',
        scaleRead: 'embedded_fire_arrow_v0',
        shaftColour: '#5f4126',
        wrapColour: '#7d5a33',
        emberColour: '#ff7a2f',
        emberCoreColour: '#ffd68e',
        fletchingColour: '#4e3427',
        baseShadow: 'rgba(0,0,0,0.16)',
        angle: -0.78,
        shaftLengthScale: 0.62,
        shaftWidthScale: 0.09,
        flameScale: 0.72
      }
    }),
    [SceneObjectType.FIRE_ARROW_RIGHT]: Object.freeze({
      type: SceneObjectType.FIRE_ARROW_RIGHT,
      label: 'Fire Arrow (Right Lean)',
      scaleProfileId: WORLD_SCALE.id,
      materialProfileId: MaterialProfileId.WOOD_DEAD_SNAG,
      materialState: {
        burnAmount: 0.86,
        density: 0.42,
        integrity: 0.56,
        nightReveal: 0.82
      },
      physical: FIRE_ARROW_PHYSICAL,
      footprint: { w: 1, h: 1 },
      visualFootprint: {
        w: metersToTiles(FIRE_ARROW_PHYSICAL.widthMeters),
        h: metersToTiles(FIRE_ARROW_PHYSICAL.depthMeters),
        offsetX: -0.16,
        offsetY: -0.14
      },
      collision: {
        blocksMovement: false,
        policy: 'non_blocking_scene_detail_v0'
      },
      occlusion: {
        castsShadow: false,
        radius: 0.24,
        height: FIRE_ARROW_PHYSICAL.heightMeters
      },
      emitter: {
        lightEmitterId: LightEmitterId.RAID_FLAME,
        sourcePolicy: 'static_scene_object_embedded_fire_arrow_emitter',
        anchorSpace: 'object_anchor',
        anchorOffsetX: 0.14,
        anchorOffsetY: -0.17,
        forwardX: 0.28,
        forwardY: -1,
        smokeSourceKind: SmokeSourceKind.RAID_FLAME_WISP,
        radiusScale: 0.8,
        emissionScale: 0.82
      },
      audioEmitter: fireAudioEmitter(0.14, -0.17),
      render: {
        kind: 'fire_arrow',
        scaleRead: 'embedded_fire_arrow_v0',
        shaftColour: '#5e4025',
        wrapColour: '#805631',
        emberColour: '#ff7f31',
        emberCoreColour: '#ffd18c',
        fletchingColour: '#463027',
        baseShadow: 'rgba(0,0,0,0.16)',
        angle: 0.72,
        shaftLengthScale: 0.62,
        shaftWidthScale: 0.09,
        flameScale: 0.7
      }
    }),
    [SceneObjectType.FIRE_ARROW_STEEP]: Object.freeze({
      type: SceneObjectType.FIRE_ARROW_STEEP,
      label: 'Fire Arrow (Steep)',
      scaleProfileId: WORLD_SCALE.id,
      materialProfileId: MaterialProfileId.WOOD_DEAD_SNAG,
      materialState: {
        burnAmount: 0.88,
        density: 0.44,
        integrity: 0.54,
        nightReveal: 0.84
      },
      physical: FIRE_ARROW_PHYSICAL,
      footprint: { w: 1, h: 1 },
      visualFootprint: {
        w: metersToTiles(FIRE_ARROW_PHYSICAL.widthMeters),
        h: metersToTiles(FIRE_ARROW_PHYSICAL.depthMeters),
        offsetX: -0.1,
        offsetY: -0.24
      },
      collision: {
        blocksMovement: false,
        policy: 'non_blocking_scene_detail_v0'
      },
      occlusion: {
        castsShadow: false,
        radius: 0.24,
        height: FIRE_ARROW_PHYSICAL.heightMeters
      },
      emitter: {
        lightEmitterId: LightEmitterId.RAID_FLAME,
        sourcePolicy: 'static_scene_object_embedded_fire_arrow_emitter',
        anchorSpace: 'object_anchor',
        anchorOffsetX: 0.02,
        anchorOffsetY: -0.22,
        forwardX: 0.06,
        forwardY: -1,
        smokeSourceKind: SmokeSourceKind.RAID_FLAME_WISP,
        radiusScale: 0.84,
        emissionScale: 0.88
      },
      audioEmitter: fireAudioEmitter(0.02, -0.22),
      render: {
        kind: 'fire_arrow',
        scaleRead: 'embedded_fire_arrow_v0',
        shaftColour: '#66452b',
        wrapColour: '#8c6037',
        emberColour: '#ff8634',
        emberCoreColour: '#ffe09c',
        fletchingColour: '#513729',
        baseShadow: 'rgba(0,0,0,0.18)',
        angle: 0.18,
        shaftLengthScale: 0.64,
        shaftWidthScale: 0.09,
        flameScale: 0.76
      }
    }),
    [SceneObjectType.FIRE_ARROW_CLUSTER]: Object.freeze({
      type: SceneObjectType.FIRE_ARROW_CLUSTER,
      label: 'Fire Arrow Cluster',
      scaleProfileId: WORLD_SCALE.id,
      materialProfileId: MaterialProfileId.WOOD_DEAD_SNAG,
      materialState: {
        burnAmount: 0.92,
        density: 0.5,
        integrity: 0.48,
        nightReveal: 0.88
      },
      physical: FIRE_ARROW_CLUSTER_PHYSICAL,
      footprint: { w: 1, h: 1 },
      visualFootprint: {
        w: metersToTiles(FIRE_ARROW_CLUSTER_PHYSICAL.widthMeters),
        h: metersToTiles(FIRE_ARROW_CLUSTER_PHYSICAL.depthMeters),
        offsetX: -0.46,
        offsetY: -0.18
      },
      collision: {
        blocksMovement: false,
        policy: 'non_blocking_scene_detail_v0'
      },
      occlusion: {
        castsShadow: false,
        radius: 0.32,
        height: FIRE_ARROW_CLUSTER_PHYSICAL.heightMeters
      },
      emitter: {
        lightEmitterId: LightEmitterId.RAID_FLAME,
        sourcePolicy: 'static_scene_object_grouped_fire_arrow_emitter',
        anchorSpace: 'object_anchor',
        anchorOffsetX: 0.03,
        anchorOffsetY: -0.28,
        forwardX: 0,
        forwardY: -1,
        smokeSourceKind: SmokeSourceKind.RAID_FLAME_WISP,
        radiusScale: 1.05,
        emissionScale: 0.96
      },
      audioEmitter: fireAudioEmitter(0.03, -0.28),
      render: {
        kind: 'fire_arrow_cluster',
        scaleRead: 'embedded_fire_arrow_cluster_v0',
        shaftColour: '#624226',
        wrapColour: '#885c34',
        emberColour: '#ff7a2d',
        emberCoreColour: '#ffe39d',
        fletchingColour: '#4a3023',
        baseShadow: 'rgba(0,0,0,0.18)',
        shaftLengthScale: 0.54,
        shaftWidthScale: 0.08,
        clusterSpreadPx: 4.2,
        flameScale: 0.76
      }
    }),
    [SceneObjectType.SMOULDERING_FERN]: Object.freeze({
      type: SceneObjectType.SMOULDERING_FERN,
      label: 'Smouldering Fern',
      scaleProfileId: WORLD_SCALE.id,
      materialProfileId: MaterialProfileId.FOLIAGE_FERN,
      materialState: {
        burnAmount: 0.68,
        density: 0.56,
        integrity: 0.52,
        nightReveal: 0.74
      },
      physical: SMOULDERING_FERN_PHYSICAL,
      footprint: { w: 1, h: 1 },
      visualFootprint: {
        w: metersToTiles(SMOULDERING_FERN_PHYSICAL.widthMeters),
        h: metersToTiles(SMOULDERING_FERN_PHYSICAL.depthMeters),
        offsetX: -0.82,
        offsetY: -0.42
      },
      collision: {
        blocksMovement: false,
        policy: 'non_blocking_scene_detail_v0'
      },
      occlusion: {
        castsShadow: false,
        radius: 0.42,
        height: SMOULDERING_FERN_PHYSICAL.heightMeters
      },
      emitter: {
        lightEmitterId: LightEmitterId.SMOULDER_PATCH,
        sourcePolicy: 'static_scene_object_smouldering_fern_emitter',
        anchorOffsetX: -0.02,
        anchorOffsetY: -0.08,
        forwardX: -0.12,
        forwardY: -1,
        smokeSourceKind: SmokeSourceKind.SMOULDER_PATCH_WISP,
        radiusScale: 0.96,
        emissionScale: 0.92
      },
      audioEmitter: fireAudioEmitter(-0.02, -0.08),
      render: {
        kind: 'smouldering_fern',
        scaleRead: 'charred_fern_low_emitter_v0',
        frondColour: '#253826',
        frondShade: '#151f18',
        emberColour: '#ff7b32',
        emberCoreColour: '#ffbf74',
        ashColour: '#4f443b',
        baseShadow: 'rgba(0,0,0,0.18)'
      }
    }),
    [SceneObjectType.SMOULDERING_BRAMBLE]: Object.freeze({
      type: SceneObjectType.SMOULDERING_BRAMBLE,
      label: 'Smouldering Bramble',
      scaleProfileId: WORLD_SCALE.id,
      materialProfileId: MaterialProfileId.FOLIAGE_SHRUB,
      materialState: {
        burnAmount: 0.74,
        density: 0.62,
        integrity: 0.48,
        nightReveal: 0.76
      },
      physical: SMOULDERING_BRAMBLE_PHYSICAL,
      footprint: { w: 1, h: 1 },
      visualFootprint: {
        w: metersToTiles(SMOULDERING_BRAMBLE_PHYSICAL.widthMeters),
        h: metersToTiles(SMOULDERING_BRAMBLE_PHYSICAL.depthMeters),
        offsetX: -1.04,
        offsetY: -0.64
      },
      collision: {
        blocksMovement: false,
        policy: 'non_blocking_scene_detail_v0'
      },
      occlusion: {
        castsShadow: false,
        radius: 0.52,
        height: SMOULDERING_BRAMBLE_PHYSICAL.heightMeters
      },
      emitter: {
        lightEmitterId: LightEmitterId.SMOULDER_PATCH,
        sourcePolicy: 'static_scene_object_smouldering_bramble_emitter',
        anchorOffsetX: 0.04,
        anchorOffsetY: -0.1,
        forwardX: 0.18,
        forwardY: -1,
        smokeSourceKind: SmokeSourceKind.SMOULDER_PATCH_WISP,
        radiusScale: 1.12,
        emissionScale: 1.04
      },
      audioEmitter: fireAudioEmitter(0.04, -0.1),
      render: {
        kind: 'smouldering_bramble',
        scaleRead: 'charred_bramble_emitter_v0',
        bodyColour: '#2c332a',
        shadeColour: '#171d17',
        emberColour: '#ff6f2b',
        emberCoreColour: '#ffc678',
        ashColour: '#5a4d42',
        baseShadow: 'rgba(0,0,0,0.2)'
      }
    })
  });
}

function fireAudioEmitter(anchorOffsetX, anchorOffsetY) {
  return Object.freeze({
    contract: 'black-sky-bound.audio-emitter.v1',
    emitterId: 'fire',
    profileId: 'smoulder_fire_spatial_v1',
    cueRoles: Object.freeze({ loop: 'world.fire.smoulder_loop' }),
    anchor: 'transform',
    anchorOffsetX,
    anchorOffsetY,
    anchorHeightMeters: 0.35,
    shape: 'point',
    enabled: true
  });
}
