export const OpeningSequencePhase = Object.freeze({
  INSIDE_EGG: 'inside_egg',
  CRACKING: 'cracking',
  OPENING: 'opening',
  EMERGING: 'emerging',
  SETTLING: 'settling',
  RELEASED: 'released'
});

export const OpeningAudioCueId = Object.freeze({
  ROCK: 'opening.egg.rock',
  CRACK: 'opening.egg.crack',
  BREAK: 'opening.egg.break'
});

export const OpeningSoundscapeCueId = Object.freeze({
  THUNDER: 'world.storm.thunder',
  THUNDER_THROUGH_SHELL: 'opening.exterior.thunder_through_shell',
  RAIDER_SHOUT: 'enemy.raider.distant_shout',
  RAIDER_THROUGH_SHELL: 'opening.exterior.raider_through_shell',
  WEREWOLF_HOWL: 'enemy.werewolf.distant_howl',
  WEREWOLF_THROUGH_SHELL: 'opening.exterior.werewolf_through_shell',
  HUSK_GARGLE: 'enemy.husk.distant_gargle',
  HUSK_THROUGH_SHELL: 'opening.exterior.husk_through_shell',
  MAMA_ROAR: 'world.mama_wyvern.distant_roar'
});

export const OPENING_SEQUENCE = Object.freeze({
  contract: 'black-sky-bound.embodied-hatch-opening.v2',
  classification: 'app_owned_pre_game_opening_lifecycle',
  requiredMovementEdges: 6,
  timing: Object.freeze({
    promptDelaySeconds: 0.9,
    inputCooldownSeconds: 0.58,
    rockPulseSeconds: 0.58,
    movementPulseSeconds: 0.78,
    lightPulseSeconds: 0.86,
    openingSeconds: 2.8,
    emergenceSeconds: 5.1,
    settlingSeconds: 2.2
  }),
  visual: Object.freeze({
    rockShakePixels: 7,
    crackCenter: Object.freeze({ x: 0.512, y: 0.405 }),
    shellCenter: Object.freeze({ x: 0.5, y: 0.46 }),
    shellRadius: Object.freeze({ x: 0.48, y: 0.62 }),
    eggRadiusWorld: Object.freeze({ x: 58, y: 44 }),
    exitDistanceTiles: 2.45,
    cameraZoom: Object.freeze({
      trapped: 4.1,
      opening: 3.55,
      emerging: 3.08,
      released: 2.75
    })
  }),
  soundscape: Object.freeze([
    openingSound({
      id: 'storm_answer_after_first_light',
      cueId: OpeningSoundscapeCueId.THUNDER_THROUGH_SHELL,
      anchor: { kind: 'movement_edge', stage: 1, delaySeconds: 0.38 },
      intensity: 0.58,
      perspective: 'deeply_muffled_outside_storm'
      ,sourceRef: { ownerKind: 'openingEvent', ownerId: 'opening-storm', emitterId: 'thunder' }
    }),
    openingSound({
      id: 'husk_beyond_shell',
      cueId: OpeningSoundscapeCueId.HUSK_THROUGH_SHELL,
      anchor: { kind: 'movement_edge', stage: 2, delaySeconds: 0.34 },
      intensity: 0.44,
      perspective: 'deeply_muffled_nearby_threat'
      ,sourceRef: { ownerKind: 'actor', ownerId: 'husk:28:34:1859', emitterId: 'voice' }
    }),
    openingSound({
      id: 'werewolf_far_ridge',
      cueId: OpeningSoundscapeCueId.WEREWOLF_THROUGH_SHELL,
      anchor: { kind: 'movement_edge', stage: 4, delaySeconds: 0.28 },
      intensity: 0.5,
      perspective: 'muffled_distant_predator'
      ,sourceRef: { ownerKind: 'actor', ownerId: 'werewolf:1', emitterId: 'voice' }
    }),
    openingSound({
      id: 'raider_alarm_at_break',
      cueId: OpeningSoundscapeCueId.RAIDER_THROUGH_SHELL,
      anchor: { kind: 'shell_break', delaySeconds: 0.42 },
      intensity: 0.6,
      perspective: 'partially_exposed_human_alarm'
      ,sourceRef: { ownerKind: 'actor', ownerId: 'raider:38:30:2305', emitterId: 'voice' }
    }),
    openingSound({
      id: 'mama_answering_roar',
      cueId: OpeningSoundscapeCueId.MAMA_ROAR,
      anchor: { kind: 'shell_break', delaySeconds: 1.5 },
      intensity: 1,
      perspective: 'massive_roar_through_opening_shell'
      ,sourceRef: { ownerKind: 'openingEvent', ownerId: 'opening-mama-answer', emitterId: 'voice' }
    }),
    openingSound({
      id: 'husk_now_exposed',
      cueId: OpeningSoundscapeCueId.HUSK_GARGLE,
      anchor: { kind: 'shell_break', delaySeconds: 5.05 },
      intensity: 0.62,
      perspective: 'exposed_nearby_threat'
      ,sourceRef: { ownerKind: 'actor', ownerId: 'husk:28:34:1859', emitterId: 'voice' }
    })
  ])
});

function openingSound(definition) {
  return Object.freeze({
    ...definition,
    anchor: Object.freeze({ ...definition.anchor })
  });
}

export {
  OPENING_CRACK_SEGMENTS,
  OPENING_LIGHT_RAYS,
  OPENING_SHELL_FRAGMENTS,
  OPENING_WORLD_SHELL_PIECES
} from './openingShellGeometry.js';
