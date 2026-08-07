import { ComponentType } from '../constants/componentTypes.js';
import { EventType } from '../constants/eventTypes.js';
import { getComponent } from '../ecs/world.js';
import { emitEvent } from '../ecs/events.js';
import { query } from '../ecs/query.js';
import { areFactionsHostile } from '../constants/factions.js';
import { WyvernActionId, getWyvernActionProfile } from '../data/creatures/groundedWyvernMotionProfiles.js';
import { isPlayerInteractiveLifecycle } from '../data/playerLifecycle.js';
import { canStartProceduralAction, startProceduralAction } from './proceduralActionState.js';
import { AbilityId } from '../constants/abilityIds.js';
import { canUseAbility } from '../game/playerAbilities.js';

const DEFAULT_MELEE_SEQUENCE = Object.freeze([
  WyvernActionId.LEFT_CLAW_SWIPE,
  WyvernActionId.RIGHT_CLAW_SWIPE,
  WyvernActionId.BITE_ATTACK
]);

export function combatSystem({ game, dt = 0 }) {
  for (const entity of query(game.world, [ComponentType.PlayerIntent, ComponentType.AttackSet, ComponentType.Cooldowns, ComponentType.Transform])) {
    if (!isPlayerInteractiveLifecycle(getComponent(game.world, entity, ComponentType.PlayerLifecycle))) continue;
    const intent = getComponent(game.world, entity, ComponentType.PlayerIntent);
    const attacks = getComponent(game.world, entity, ComponentType.AttackSet);
    const cooldowns = getComponent(game.world, entity, ComponentType.Cooldowns);
    const transform = getComponent(game.world, entity, ComponentType.Transform);
    const combo = getComponent(game.world, entity, ComponentType.ComboState);
    tickComboState(combo, dt);
    if ((intent.melee || intent.bite) && canUseAbility(game.world, entity, AbilityId.BITE_CLAW)) performMeleeCombo(game, entity, transform, intent, attacks.bite, cooldowns, combo);
    if (intent.smokeAbilityId === AbilityId.SMOKE_BURST && canUseAbility(game.world, entity, AbilityId.SMOKE_BURST)) {
      performSmokeBurst(game, entity, transform, intent, attacks.smokeBurst, cooldowns);
    } else if (intent.smokeAbilityId === AbilityId.SMOKE_SPIT && canUseAbility(game.world, entity, AbilityId.SMOKE_SPIT)) {
      performSmokeSpit(game, entity, transform, intent, attacks.smokeSpit, cooldowns);
    }
    if (intent.lunge && canUseAbility(game.world, entity, AbilityId.BODY_LUNGE)) performLungeAttack(game, entity, transform, intent, attacks.lunge, cooldowns);
  }
}

function tickComboState(combo, dt) {
  if (!combo) return;
  combo.resetTimer = Math.max(0, (combo.resetTimer ?? 0) - Math.max(0, dt));
  if (combo.resetTimer <= 0) combo.index = 0;
}

function performMeleeCombo(game, source, transform, intent, melee, cooldowns, combo) {
  if (!melee || cooldowns.bite > 0 || !canStartProceduralAction(game.world, source)) return false;
  const sequence = combo?.sequence?.length ? combo.sequence : DEFAULT_MELEE_SEQUENCE;
  const index = combo?.resetTimer > 0 ? combo.index ?? 0 : 0;
  const actionId = sequence[index % sequence.length];
  const profile = getWyvernActionProfile(actionId);
  const dir = normalise(intent.aimX - transform.x, intent.aimY - transform.y);
  faceAttackDirection(transform, dir);
  const started = startProceduralAction(game.world, source, actionId, {
    sourceAbilityId: melee.id,
    aimX: intent.aimX,
    aimY: intent.aimY,
    sideOverride: profile?.fixedSide
  });
  if (!started) return false;
  cooldowns.bite = melee.cooldown;
  if (combo) {
    combo.lastActionId = actionId;
    combo.index = (index + 1) % sequence.length;
    combo.resetTimer = combo.resetTimeout ?? 0.92;
  }
  emitEvent(game.world, EventType.PLAYER_ACTION_ACCEPTED, {
    source,
    abilityId: melee.id,
    inputAction: melee.inputAction,
    actionId,
    comboStep: index,
    comboLength: sequence.length
  });
  return true;
}

function performSmokeBurst(game, source, transform, intent, smoke, cooldowns) {
  if (!intent.smoke || !smoke || cooldowns.smoke > 0 || !canStartProceduralAction(game.world, source)) return false;
  const started = startProceduralAction(game.world, source, WyvernActionId.SMOKE_BURST, {
    sourceAbilityId: smoke.id,
    aimX: transform.x,
    aimY: transform.y
  });
  if (!started) return false;
  cooldowns.smoke = smoke.cooldown;
  emitEvent(game.world, EventType.PLAYER_ACTION_ACCEPTED, {
    source,
    abilityId: smoke.id,
    inputAction: smoke.inputAction,
    actionId: WyvernActionId.SMOKE_BURST
  });
  return true;
}

function performSmokeSpit(game, source, transform, intent, smoke, cooldowns) {
  if (!smoke || cooldowns.smoke > 0 || !canStartProceduralAction(game.world, source)) return false;
  const dir = normalise(intent.aimX - transform.x, intent.aimY - transform.y);
  faceAttackDirection(transform, dir);
  const started = startProceduralAction(game.world, source, WyvernActionId.SMOKE_SPIT, {
    sourceAbilityId: smoke.id,
    aimX: intent.aimX,
    aimY: intent.aimY
  });
  if (!started) return false;
  cooldowns.smoke = smoke.cooldown;
  emitEvent(game.world, EventType.PLAYER_ACTION_ACCEPTED, {
    source,
    abilityId: smoke.id,
    inputAction: smoke.inputAction,
    actionId: WyvernActionId.SMOKE_SPIT
  });
  return true;
}

function performLungeAttack(game, source, transform, intent, lunge, cooldowns) {
  if (!lunge || cooldowns.lunge > 0 || !canStartProceduralAction(game.world, source)) return false;
  cooldowns.lunge = lunge.cooldown;
  const dir = normalise(intent.aimX - transform.x, intent.aimY - transform.y);
  faceAttackDirection(transform, dir);
  const started = startProceduralAction(game.world, source, WyvernActionId.LUNGE_ATTACK, {
    sourceAbilityId: lunge.id,
    aimX: intent.aimX,
    aimY: intent.aimY
  });
  if (!started) {
    cooldowns.lunge = 0;
    return false;
  }
  emitEvent(game.world, EventType.LUNGE_TRIGGERED, { source });
  emitEvent(game.world, EventType.PLAYER_ACTION_ACCEPTED, {
    source,
    abilityId: lunge.id,
    inputAction: lunge.inputAction,
    actionId: WyvernActionId.LUNGE_ATTACK
  });
  return true;
}

export function aliveHostileEntities(game, source) {
  const sourceTeam = getComponent(game.world, source, ComponentType.Team)?.id;
  if (!sourceTeam) return [];
  return query(game.world, [ComponentType.Team, ComponentType.Health, ComponentType.Transform, ComponentType.Collider])
    .filter((entity) => entity !== source)
    .filter((entity) => areFactionsHostile(sourceTeam, getComponent(game.world, entity, ComponentType.Team).id))
    .filter((entity) => getComponent(game.world, entity, ComponentType.Health).alive);
}

export function aliveEnemyEntities(game, source = game.dragonId) {
  return aliveHostileEntities(game, source);
}

export function entityDistance(world, a, b) {
  const ta = getComponent(world, a, ComponentType.Transform);
  const tb = getComponent(world, b, ComponentType.Transform);
  return Math.hypot(ta.x - tb.x, ta.y - tb.y);
}

function normalise(x, y) {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}

function faceAttackDirection(transform, dir) {
  if (Math.hypot(dir.x, dir.y) > 0.001) transform.rotation = Math.atan2(dir.y, dir.x);
}
