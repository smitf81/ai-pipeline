import { Faction } from '../constants/factions.js';

export const CombatBalanceProfileId = Object.freeze({
  FIRST_PASS_VULNERABLE_WYVERN: 'vulnerable_hatchling_pressure_v1'
});

export const COMBAT_BALANCE = Object.freeze({
  id: CombatBalanceProfileId.FIRST_PASS_VULNERABLE_WYVERN,
  playerHitSlow: Object.freeze({
    enabled: true,
    durationSeconds: 0.78,
    movementMultiplier: 0.52,
    refreshPolicy: 'refresh_to_longest_remaining'
  }),
  hostileBodyContact: Object.freeze({
    enabled: true,
    durationSeconds: 0.34,
    movementMultiplier: 0.38,
    policy: 'ordinary_locomotion_bogs_on_hostile_body_contact_dodge_displacement_unmodified'
  }),
  enemyVsEnemyDamage: Object.freeze({
    enabled: true,
    multiplier: 0.68,
    minimumDamage: 1,
    policy: 'enemy_origin_non_player_target_scale_down'
  }),
  playerRecovery: Object.freeze({
    directPursuitBlocksRegeneration: true,
    delayRestartsWhileDirectlyPursued: true,
    policy: 'direct_hostile_target_or_committed_attack_requires_fresh_safety_window'
  })
});

export function resolveIncomingDamageAmount(world, source, target, baseDamage, getTeam) {
  const damage = Math.max(0, Number(baseDamage) || 0);
  if (!COMBAT_BALANCE.enemyVsEnemyDamage.enabled) return damage;
  const sourceTeam = getTeam(world, source);
  const targetTeam = getTeam(world, target);
  if (!isNonPlayerCombatFaction(sourceTeam) || !isNonPlayerCombatFaction(targetTeam)) return damage;
  const scaled = damage * COMBAT_BALANCE.enemyVsEnemyDamage.multiplier;
  return Math.max(COMBAT_BALANCE.enemyVsEnemyDamage.minimumDamage, scaled);
}

export function resolveHitSlowForTarget(world, target, getTeam) {
  const targetTeam = getTeam(world, target);
  if (targetTeam !== Faction.PLAYER || !COMBAT_BALANCE.playerHitSlow.enabled) return null;
  return COMBAT_BALANCE.playerHitSlow;
}

function isNonPlayerCombatFaction(team) {
  return team === Faction.RAIDERS || team === Faction.HUSKS || team === Faction.WOLVES || team === Faction.ENEMY;
}
