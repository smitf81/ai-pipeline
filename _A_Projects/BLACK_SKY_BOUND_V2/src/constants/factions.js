export const Faction = Object.freeze({
  PLAYER: 'player',
  RAIDERS: 'raiders',
  HUSKS: 'husks',
  WOLVES: 'wolves',
  ALLIES: 'allies',
  ENEMY: 'enemy',
  NEUTRAL: 'neutral'
});

const FACTION_IDS = Object.freeze(Object.values(Faction));

const FRIENDLY_FACTIONS = Object.freeze({
  [Faction.PLAYER]: Object.freeze([Faction.PLAYER, Faction.ALLIES]),
  [Faction.ALLIES]: Object.freeze([Faction.PLAYER, Faction.ALLIES]),
  [Faction.ENEMY]: Object.freeze([Faction.ENEMY, Faction.RAIDERS, Faction.HUSKS, Faction.WOLVES]),
  [Faction.RAIDERS]: Object.freeze([Faction.RAIDERS, Faction.ENEMY]),
  [Faction.HUSKS]: Object.freeze([Faction.HUSKS, Faction.ENEMY]),
  [Faction.WOLVES]: Object.freeze([Faction.WOLVES, Faction.ENEMY]),
  [Faction.NEUTRAL]: Object.freeze([Faction.NEUTRAL])
});

const HOSTILE_FACTIONS = Object.freeze({
  [Faction.PLAYER]: Object.freeze([Faction.ENEMY, Faction.RAIDERS, Faction.HUSKS, Faction.WOLVES]),
  [Faction.ALLIES]: Object.freeze([Faction.ENEMY, Faction.RAIDERS, Faction.HUSKS, Faction.WOLVES]),
  [Faction.ENEMY]: Object.freeze([Faction.PLAYER, Faction.ALLIES]),
  [Faction.RAIDERS]: Object.freeze([Faction.PLAYER, Faction.ALLIES, Faction.HUSKS, Faction.WOLVES]),
  [Faction.HUSKS]: Object.freeze([Faction.PLAYER, Faction.ALLIES, Faction.RAIDERS, Faction.WOLVES]),
  [Faction.WOLVES]: Object.freeze([Faction.PLAYER, Faction.ALLIES, Faction.RAIDERS, Faction.HUSKS]),
  [Faction.NEUTRAL]: Object.freeze([])
});

export function isFaction(value) {
  return FACTION_IDS.includes(value);
}

export function areFactionsHostile(a, b) {
  if (!isFaction(a) || !isFaction(b)) return false;
  return HOSTILE_FACTIONS[a].includes(b);
}

export function areFactionsFriendly(a, b) {
  if (!isFaction(a) || !isFaction(b)) return false;
  return FRIENDLY_FACTIONS[a].includes(b);
}
