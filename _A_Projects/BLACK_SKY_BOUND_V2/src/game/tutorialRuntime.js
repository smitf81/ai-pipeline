import { EventType } from '../constants/eventTypes.js';
import { areFactionsHostile } from '../constants/factions.js';
import { getTutorialCue, TutorialCueId, TUTORIAL_TUNING } from '../data/tutorialCues.js';
import { getActiveInputLabels, InputActionId } from '../data/inputActions.js';
import { applyAbilityUnlockEvent } from './playerAbilities.js';
import {
  captureAbilityProgressionInProfile,
  markTutorialCueCompleted,
  markTutorialCueReviewable,
  markTutorialCueShown,
  normalizePlayerProfile,
  TutorialTimeSlowMode
} from './playerProfile.js';
import { releaseGameTimeScale, requestGameTimeScale } from './gameTime.js';

export function createTutorialRuntime() {
  return {
    classification: 'bounded_profile_tutorial_cue_runtime_v1',
    activeCue: null,
    queue: [],
    nextSequence: 1,
    temporarilyDismissedCueIds: new Set(),
    completedRunCueIds: new Set(),
    seenEvents: new WeakSet(),
    gameplayActiveRealSeconds: 0,
    lastPlayerX: null,
    lastPlayerY: null,
    activatedCount: 0,
    completedCount: 0,
    lastCompletionReason: null
  };
}

export function updateTutorialRuntime({ state, input, realDt = 0, gameplayDt = 0, persistProfile = null }) {
  const runtime = state?.tutorial;
  if (!runtime || !state.game) return;
  const realDelta = Math.max(0, Number(realDt) || 0);
  const gameDelta = Math.max(0, Number(gameplayDt) || 0);
  runtime.gameplayActiveRealSeconds += realDelta;
  processSemanticEvents(runtime, state, persistProfile);

  if (state.playerProfile?.settings?.tutorialPrompts === false) {
    suppressRuntimePrompts(runtime, state);
    updateLastPlayerPosition(runtime, state.game);
    return;
  }

  maybeQueueOnboarding(runtime, state, persistProfile);
  maybeQueueCombatIntroduction(runtime, state, persistProfile);
  activateNextCue(runtime, state, persistProfile);
  tickActiveCue(runtime, state, input, realDelta, gameDelta, persistProfile);
  updateLastPlayerPosition(runtime, state.game);
}

export function requestTutorialCue(runtime, state, cueId, context = {}, persistProfile = null) {
  const cue = getTutorialCue(cueId);
  if (!runtime || !cue || state.playerProfile?.settings?.tutorialPrompts === false) return false;
  if (profileCompleted(state.playerProfile, cueId) || runtime.completedRunCueIds.has(cueId) || runtime.temporarilyDismissedCueIds.has(cueId)) return false;
  if (!requiredAbilitiesAvailable(state.game, cue.requiredAbilities)) return false;
  if (cue.blockedBy.some((blockedId) => profileCompleted(state.playerProfile, blockedId))) return false;
  if (runtime.activeCue?.id === cueId || runtime.queue.some((entry) => entry.id === cueId)) return false;

  const entry = { id: cueId, context: { ...context }, sequence: runtime.nextSequence++, resume: null };
  if (runtime.activeCue && cue.priority > runtime.activeCue.priority) {
    releaseTutorialSlowTime(state, 'higher_priority_interrupt');
    runtime.queue.push({
      id: runtime.activeCue.id,
      context: { ...runtime.activeCue.context },
      sequence: runtime.nextSequence++,
      resume: runtime.activeCue
    });
    runtime.activeCue = null;
  }
  runtime.queue.push(entry);
  sortAndBoundQueue(runtime);
  activateNextCue(runtime, state, persistProfile);
  return true;
}

export function temporarilyDismissActiveTutorialCue(runtime, state, reason = 'temporarily_dismissed') {
  if (!runtime?.activeCue) return false;
  runtime.temporarilyDismissedCueIds.add(runtime.activeCue.id);
  runtime.lastCompletionReason = reason;
  runtime.activeCue = null;
  releaseTutorialSlowTime(state, reason);
  return true;
}

export function resetTutorialRuntimeForGame(runtime, state = null) {
  if (!runtime) return;
  runtime.activeCue = null;
  runtime.queue.length = 0;
  runtime.temporarilyDismissedCueIds.clear();
  runtime.seenEvents = new WeakSet();
  runtime.gameplayActiveRealSeconds = 0;
  runtime.lastPlayerX = null;
  runtime.lastPlayerY = null;
  if (state) releaseTutorialSlowTime(state, 'game_replaced');
}

function processSemanticEvents(runtime, state, persistProfile) {
  for (const event of state.game.world?.events ?? []) {
    if (!event || runtime.seenEvents.has(event)) continue;
    runtime.seenEvents.add(event);
    const payload = event.payload ?? {};
    if (event.type === EventType.ENEMY_ATTACK_COMMITTED && payload.target === state.game.dragonId) {
      requestTutorialCue(runtime, state, TutorialCueId.FIRST_DODGE, {
        attackerId: payload.attacker,
        attackProfileId: payload.profileId
      }, persistProfile);
    } else if (event.type === EventType.ENEMY_ATTACK_RESOLVED) {
      resolveIncomingAttackCue(runtime, state, payload, persistProfile);
    } else if (event.type === EventType.SMOKE_PURSUIT_BROKEN && payload.target === state.game.dragonId) {
      registerSmokePursuitBreak(runtime, state, payload, persistProfile);
      requestTutorialCue(runtime, state, TutorialCueId.SMOKE_VEIL, {
        enemyId: payload.enemy,
        reason: payload.reason,
        sourceKind: payload.sourceKind
      }, persistProfile);
    } else if (event.type === EventType.PLAYER_ACTION_ACCEPTED && payload.source === state.game.dragonId) {
      applyAcceptedAction(runtime, state, payload, persistProfile);
    } else if (event.type === EventType.PLAYER_NEAR_DEATH && payload.player === state.game.dragonId) {
      registerChargeInstinct(runtime, state, payload, persistProfile);
    }
  }
}

function registerChargeInstinct(runtime, state, payload, persistProfile) {
  const cue = getTutorialCue(TutorialCueId.CHARGE_INSTINCT);
  const receipt = applyAbilityUnlockEvent(state.game.world, state.game.dragonId, cue.unlockEventId);
  if (receipt.ok) {
    let next = captureAbilityProgressionInProfile(state.game.world, state.game.dragonId, state.playerProfile);
    next = markTutorialCueReviewable(next, cue.id);
    replaceProfile(state, next, persistProfile);
  }
  requestTutorialCue(runtime, state, cue.id, {
    sourceId: payload.source,
    healthRatio: payload.healthRatio,
    unlockReceipt: receipt
  }, persistProfile);
}

function applyAcceptedAction(runtime, state, payload, persistProfile) {
  const active = runtime.activeCue;
  if (!active || active.phase === 'exiting') return;
  if (active.id === TutorialCueId.FIRST_COMBAT) {
    if (payload.inputAction === InputActionId.MELEE) active.progress.comboAccepted = Math.max(active.progress.comboAccepted, (payload.comboStep ?? 0) + 1);
    if (active.progress.comboAccepted >= 3) completeCue(runtime, state, 'combat_combo_accepted', persistProfile);
  } else if (active.id === TutorialCueId.SMOKE_ESCAPE && payload.inputAction === InputActionId.SMOKE) {
    active.progress.smokeAccepted = true;
  } else if (active.id === TutorialCueId.FIRST_DODGE && payload.inputAction === InputActionId.DODGE) {
    active.progress.dodgeAccepted = true;
    completeCue(runtime, state, 'dodge_accepted', persistProfile);
  } else if (active.id === TutorialCueId.CHARGE_INSTINCT) {
    if (payload.inputAction === InputActionId.DODGE) {
      active.progress.dodgeAccepted = true;
      active.progress.pounceAvailable = payload.followupsEnabled !== false;
      active.progress.emergencyDodgeAccepted = payload.dodgeMode === 'emergency';
      active.supportingText = active.progress.pounceAvailable
        ? getTutorialCue(TutorialCueId.CHARGE_INSTINCT).supportingText
        : 'LOW STAMINA · RECOVER TO COUNTER';
      releaseTutorialSlowTime(state, 'instinct_first_dodge_accepted');
    }
    if (payload.inputAction === InputActionId.POUNCE_COUNTER) {
      active.progress.pounceAccepted = true;
      completeCue(runtime, state, 'pounce_counter_accepted', persistProfile);
    }
  }
}

function resolveIncomingAttackCue(runtime, state, payload, persistProfile) {
  const active = runtime.activeCue;
  if (active?.id !== TutorialCueId.FIRST_DODGE || active.phase === 'exiting') return;
  if (active.context.attackerId && payload.attacker !== active.context.attackerId) return;
  active.progress.attackResolved = true;
  completeCue(runtime, state, 'incoming_attack_resolved', persistProfile);
}

function maybeQueueOnboarding(runtime, state, persistProfile) {
  if (runtime.gameplayActiveRealSeconds < TUTORIAL_TUNING.activationDelayRealSeconds) return;
  requestTutorialCue(runtime, state, TutorialCueId.FIRST_MOVEMENT, {}, persistProfile);
}

function maybeQueueCombatIntroduction(runtime, state, persistProfile) {
  const nearest = findNearestHostile(state.game);
  if (!nearest || nearest.distance > TUTORIAL_TUNING.combatIntroductionDistanceTiles) return;
  requestTutorialCue(runtime, state, TutorialCueId.FIRST_COMBAT, { attackerId: nearest.actor.id }, persistProfile);
}

function activateNextCue(runtime, state, persistProfile) {
  if (runtime.activeCue || runtime.queue.length === 0) return;
  sortAndBoundQueue(runtime);
  const entry = runtime.queue.shift();
  const cue = getTutorialCue(entry.id);
  if (!cue || profileCompleted(state.playerProfile, cue.id) || runtime.completedRunCueIds.has(cue.id)) return activateNextCue(runtime, state, persistProfile);
  const active = entry.resume ?? createActiveCue(cue, entry.context);
  active.phase = 'entering';
  active.context = { ...active.context, ...entry.context };
  runtime.activeCue = active;
  runtime.activatedCount += 1;
  if (cue.persistenceScope !== 'run') replaceProfile(state, markTutorialCueShown(state.playerProfile, cue.id), persistProfile);
  requestTutorialSlowTime(state, cue);
}

function createActiveCue(cue, context) {
  return {
    id: cue.id,
    priority: cue.priority,
    presentationType: cue.presentationType,
    title: cue.title,
    supportingText: cue.supportingText,
    inputActions: [...cue.inputActions],
    phase: 'entering',
    elapsedReal: 0,
    elapsedGameplay: 0,
    exitElapsed: 0,
    exitReason: null,
    context: { ...context },
    progress: {
      pressedLabels: [],
      movementLabels: [],
      movementDistance: 0,
      comboAccepted: 0,
      smokeAccepted: false,
      pursuitBroken: false,
      dodgeAccepted: false,
      pounceAccepted: false,
      pounceAvailable: true,
      emergencyDodgeAccepted: false,
      attackResolved: false
    }
  };
}

function registerSmokePursuitBreak(runtime, state, payload, persistProfile) {
  const active = runtime.activeCue;
  if (active?.id !== TutorialCueId.SMOKE_ESCAPE || active.phase === 'exiting') return;
  active.progress.pursuitBroken = true;
  active.context.brokenEnemyId = payload.enemy ?? null;
  completeCue(runtime, state, 'smoke_pursuit_broken_run_now', persistProfile);
}

function tickActiveCue(runtime, state, input, realDt, gameplayDt, persistProfile) {
  const active = runtime.activeCue;
  if (!active) return;
  if (active.phase === 'exiting') {
    active.exitElapsed += realDt;
    if (active.exitElapsed >= TUTORIAL_TUNING.exitSeconds) {
      runtime.activeCue = null;
      activateNextCue(runtime, state, persistProfile);
    }
    return;
  }
  active.elapsedReal += realDt;
  active.elapsedGameplay += gameplayDt;
  if (active.phase === 'entering' && active.elapsedReal >= 0.18) active.phase = 'active';
  active.progress.pressedLabels = unique(active.inputActions.flatMap((actionId) => getActiveInputLabels(input, actionId)));
  if (active.id === TutorialCueId.FIRST_MOVEMENT) {
    updateMovementCue(active, runtime, state.game);
    if (active.progress.meaningfulMovementAccepted) completeCue(runtime, state, 'meaningful_movement_accepted', persistProfile);
  }
  const timeout = getTutorialCue(active.id)?.dismissConditions?.timeoutRealSeconds ?? 4;
  if (active.elapsedReal >= timeout) completeCue(runtime, state, 'bounded_timeout', persistProfile);
}

function updateMovementCue(active, runtime, game) {
  const player = findPlayer(game);
  if (!player || runtime.lastPlayerX == null || active.progress.pressedLabels.length === 0) return;
  const moved = Math.hypot(player.x - runtime.lastPlayerX, player.y - runtime.lastPlayerY);
  if (moved <= 0.0001) return;
  active.progress.movementDistance += moved;
  active.progress.movementLabels = unique([...active.progress.movementLabels, ...active.progress.pressedLabels]);
  if (active.progress.movementDistance >= TUTORIAL_TUNING.movementDismissDistanceTiles) {
    active.progress.meaningfulMovementAccepted = true;
  }
}

function completeCue(runtime, state, reason, persistProfile) {
  const active = runtime.activeCue;
  if (!active || active.phase === 'exiting') return false;
  active.phase = 'exiting';
  active.exitElapsed = 0;
  active.exitReason = reason;
  runtime.completedCount += 1;
  runtime.completedRunCueIds.add(active.id);
  runtime.lastCompletionReason = reason;
  const cue = getTutorialCue(active.id);
  if (cue?.persistenceScope !== 'run') replaceProfile(state, markTutorialCueCompleted(state.playerProfile, active.id), persistProfile);
  releaseTutorialSlowTime(state, reason);
  return true;
}

function requestTutorialSlowTime(state, cue) {
  if (!cue.slowTime || state.playerProfile?.settings?.tutorialTimeSlow === TutorialTimeSlowMode.OFF) return;
  const reduced = state.playerProfile?.settings?.tutorialTimeSlow === TutorialTimeSlowMode.REDUCED;
  requestGameTimeScale(state.gameTime, {
    id: TUTORIAL_TUNING.slowTimeRequestId,
    source: cue.id,
    scale: reduced ? cue.slowTime.reducedScale : cue.slowTime.scale,
    durationRealSeconds: cue.slowTime.durationRealSeconds,
    priority: cue.priority
  });
}

function releaseTutorialSlowTime(state, reason) {
  releaseGameTimeScale(state?.gameTime, TUTORIAL_TUNING.slowTimeRequestId, reason);
}

function suppressRuntimePrompts(runtime, state) {
  if (runtime.activeCue) temporarilyDismissActiveTutorialCue(runtime, state, 'tutorial_prompts_disabled');
  for (const entry of runtime.queue) runtime.temporarilyDismissedCueIds.add(entry.id);
  runtime.queue.length = 0;
  releaseTutorialSlowTime(state, 'tutorial_prompts_disabled');
}

function requiredAbilitiesAvailable(game, requiredAbilities) {
  const player = findPlayer(game);
  return requiredAbilities.every((abilityId) => player?.abilityProgression?.unlockedAbilities?.includes(abilityId));
}

function profileCompleted(profile, cueId) {
  if (getTutorialCue(cueId)?.persistenceScope === 'run') return false;
  return normalizePlayerProfile(profile).tutorial.completedCueIds.includes(cueId);
}

function replaceProfile(state, profile, persistProfile) {
  state.playerProfile = normalizePlayerProfile(profile);
  persistProfile?.(state.playerProfile);
}

function findPlayer(game) {
  return (game.actors ?? []).find((actor) => actor.id === game.dragonId) ?? null;
}

function findNearestHostile(game) {
  const player = findPlayer(game);
  if (!player) return null;
  let nearest = null;
  for (const actor of game.actors ?? []) {
    if (!actor.alive || !areFactionsHostile(player.team, actor.team)) continue;
    const distance = Math.hypot(actor.x - player.x, actor.y - player.y);
    if (!nearest || distance < nearest.distance) nearest = { actor, distance };
  }
  return nearest;
}

function updateLastPlayerPosition(runtime, game) {
  const player = findPlayer(game);
  runtime.lastPlayerX = player?.x ?? null;
  runtime.lastPlayerY = player?.y ?? null;
}

function sortAndBoundQueue(runtime) {
  runtime.queue.sort((a, b) => {
    const priorityDelta = (getTutorialCue(b.id)?.priority ?? 0) - (getTutorialCue(a.id)?.priority ?? 0);
    return priorityDelta || a.sequence - b.sequence;
  });
  if (runtime.queue.length > TUTORIAL_TUNING.queueCapacity) runtime.queue.length = TUTORIAL_TUNING.queueCapacity;
}

function unique(values) {
  return [...new Set(values)];
}
