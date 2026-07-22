import { AbilityId } from '../constants/abilityIds.js';
import { AbilityUnlockEventId } from './abilityUnlockEvents.js';
import { InputActionId } from './inputActions.js';

export const TutorialCueId = Object.freeze({
  FIRST_MOVEMENT: 'first_movement',
  FIRST_COMBAT: 'first_combat',
  FIRST_DODGE: 'first_incoming_attack_dodge',
  SMOKE_ESCAPE: 'smoke_instinct_escape',
  SMOKE_VEIL: 'smoke_veil_pursuit_broken',
  CHARGE_INSTINCT: 'charge_instinct_awakened'
});

export const TUTORIAL_TUNING = Object.freeze({
  activationDelayRealSeconds: 0.72,
  combatIntroductionDistanceTiles: 5.6,
  movementDismissDistanceTiles: 0.72,
  queueCapacity: 4,
  exitSeconds: 0.22,
  slowTimeRequestId: 'tutorial-cue',
  timeSlow: Object.freeze({
    fullScale: 0.32,
    reducedScale: 0.58,
    durationRealSeconds: 1.05
  })
});

export const TUTORIAL_CUES = Object.freeze({
  [TutorialCueId.FIRST_MOVEMENT]: cue({
    id: TutorialCueId.FIRST_MOVEMENT,
    trigger: 'gameplay_active_first_profile_run',
    priority: 10,
    presentationType: 'movement_keys',
    inputActions: [InputActionId.MOVE],
    title: 'MOVE',
    dismissConditions: { movementDistanceTiles: TUTORIAL_TUNING.movementDismissDistanceTiles, timeoutRealSeconds: 5.4 }
  }),
  [TutorialCueId.FIRST_COMBAT]: cue({
    id: TutorialCueId.FIRST_COMBAT,
    trigger: 'hostile_within_immediate_engagement_distance',
    requiredAbilities: [AbilityId.BITE_CLAW],
    priority: 40,
    presentationType: 'combo_only',
    inputActions: [InputActionId.MELEE],
    title: 'ATTACK COMBO',
    dismissConditions: { acceptedComboInputs: 3, timeoutRealSeconds: 6.5 }
  }),
  [TutorialCueId.FIRST_DODGE]: cue({
    id: TutorialCueId.FIRST_DODGE,
    trigger: 'enemy_attack_committed_to_player',
    requiredAbilities: [AbilityId.DODGE],
    priority: 100,
    presentationType: 'single_action',
    inputActions: [InputActionId.DODGE],
    title: 'DODGE',
    slowTime: {
      scale: TUTORIAL_TUNING.timeSlow.fullScale,
      reducedScale: TUTORIAL_TUNING.timeSlow.reducedScale,
      durationRealSeconds: TUTORIAL_TUNING.timeSlow.durationRealSeconds
    },
    dismissConditions: { acceptedAction: InputActionId.DODGE, attackResolved: true, timeoutRealSeconds: 2.2 }
  }),
  [TutorialCueId.SMOKE_ESCAPE]: cue({
    id: TutorialCueId.SMOKE_ESCAPE,
    trigger: 'smoke_instinct_scene_released_into_hunting_party',
    requiredAbilities: [AbilityId.SMOKE_BURST],
    priority: 110,
    presentationType: 'single_action',
    inputActions: [InputActionId.SMOKE],
    title: 'EXHALE',
    supportingText: 'BREAK SIGHT · RUN',
    dismissConditions: { acceptedAction: InputActionId.SMOKE, timeoutRealSeconds: 7.5 }
  }),
  [TutorialCueId.SMOKE_VEIL]: cue({
    id: TutorialCueId.SMOKE_VEIL,
    trigger: 'dragon_smoke_breaks_enemy_pursuit',
    requiredAbilities: [AbilityId.SMOKE_BURST],
    priority: 55,
    presentationType: 'message',
    inputActions: [],
    title: 'PURSUIT BROKEN',
    supportingText: 'MOVE BEFORE THEY FIND YOU',
    dismissConditions: { timeoutRealSeconds: 2.05 }
  }),
  [TutorialCueId.CHARGE_INSTINCT]: cue({
    id: TutorialCueId.CHARGE_INSTINCT,
    trigger: 'hostile_near_death_threshold_crossed',
    requiredAbilities: [AbilityId.DODGE],
    priority: 90,
    presentationType: 'dodge_charge_sequence',
    inputActions: [InputActionId.DODGE, InputActionId.DODGE_FOLLOWUP],
    title: 'DODGE · CHARGE',
    supportingText: 'DODGE AGAIN TO COUNTER',
    slowTime: {
      scale: 0.36,
      reducedScale: TUTORIAL_TUNING.timeSlow.reducedScale,
      durationRealSeconds: TUTORIAL_TUNING.timeSlow.durationRealSeconds
    },
    dismissConditions: { acceptedSequence: [InputActionId.DODGE, InputActionId.DODGE_FOLLOWUP], timeoutRealSeconds: 4.2 },
    unlockEventId: AbilityUnlockEventId.INSTINCT_CHARGE_AWAKENED
  })
});

export function getTutorialCue(id) {
  return TUTORIAL_CUES[id] ?? null;
}

function cue(definition) {
  return Object.freeze({
    requiredAbilities: Object.freeze([]),
    blockedBy: Object.freeze([]),
    cooldown: 0,
    persistenceScope: 'player_profile',
    slowTime: null,
    supportingText: null,
    unlockEventId: null,
    ...definition,
    requiredAbilities: Object.freeze([...(definition.requiredAbilities ?? [])]),
    blockedBy: Object.freeze([...(definition.blockedBy ?? [])]),
    inputActions: Object.freeze([...(definition.inputActions ?? [])]),
    dismissConditions: Object.freeze({ ...(definition.dismissConditions ?? {}) }),
    slowTime: definition.slowTime ? Object.freeze({ ...definition.slowTime }) : null
  });
}
