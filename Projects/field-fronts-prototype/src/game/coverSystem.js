import { getTerrain } from '../config/terrain.js';
import { getTerrainField } from '../world/fields.js';
import { getTile } from '../world/mapModel.js';
import { getSceneEntity } from '../world/sceneEntity.js';
import { collectCorpseStacks } from './corpseSystem.js';
import { CONSTRUCTION_STATES } from './structureRegistry.js';

export const COVER_MODEL = Object.freeze({
  hiddenThreshold: 0.62,
  inCoverThreshold: 0.32,
  authoredCoverRadiusTiles: 1.35,
  authoredCoverRating: 0.62,
  corpseCoverRadiusTiles: 1.2,
  closeRevealRadiusTiles: 1.5,
  movingRevealPenalty: 0.2
});

export const MOBILITY_PROFILES = Object.freeze({
  upright: Object.freeze({ id: 'upright', label: 'Standing', speedMultiplier: 1, noiseMultiplier: 1, concealmentBonus: 0 }),
  crouched: Object.freeze({ id: 'crouched', label: 'Crouched', speedMultiplier: 0.62, noiseMultiplier: 0.42, concealmentBonus: 0.2 }),
  garrisoned: Object.freeze({ id: 'garrisoned', label: 'In cover', speedMultiplier: 0, noiseMultiplier: 0, concealmentBonus: 0.3 })
});

export function deriveUnitStealthState(game, map, entity, context = createCoverContext(game, map)) {
  const position = entity.position ?? entity.tile ?? { x: 0, y: 0 };
  const tile = { x: Math.round(position.x), y: Math.round(position.y) };
  const terrain = getTerrain(getTile(map, tile.x, tile.y));
  const terrainField = getTerrainField(map, tile.x, tile.y);
  const mobility = getMobilityProfile(entity);
  const sources = [];
  if (terrain.id === 'forest') {
    sources.push({ kind: 'vegetation', label: 'Trees / tall grass', rating: terrainField.cover });
  } else if (terrainField.cover >= COVER_MODEL.inCoverThreshold) {
    sources.push({ kind: 'terrain', label: terrain.label, rating: terrainField.cover });
  }

  const structure = findBestStructureCover(context, entity, position);
  if (structure) sources.push(structure);
  const authored = findBestAuthoredCover(context, position);
  if (authored) sources.push(authored);
  const corpseCover = findBestCorpseCover(context, position);
  if (corpseCover) sources.push(corpseCover);

  const primary = sources.sort((a, b) => b.rating - a.rating)[0] ?? null;
  const baseCover = Math.max(terrainField.cover * 0.44, primary?.rating ?? 0);
  const movingPenalty = (entity.movement?.lastStepTiles ?? 0) > 0.03 && mobility.id !== 'crouched'
    ? COVER_MODEL.movingRevealPenalty
    : 0;
  const concealment = clamp01(baseCover + mobility.concealmentBonus - movingPenalty);
  const coverRating = clamp01(baseCover * (mobility.id === 'crouched' ? 1.08 : 1));
  const hidden = concealment >= COVER_MODEL.hiddenThreshold && Boolean(primary || terrain.id === 'forest');
  const coverState = hidden ? 'hidden' : coverRating >= COVER_MODEL.inCoverThreshold ? 'in_cover' : 'exposed';
  return {
    posture: mobility.id,
    postureLabel: mobility.label,
    mobility,
    coverState,
    coverLabel: primary?.label ?? 'Open ground',
    coverKind: primary?.kind ?? 'none',
    coverRating: round3(coverRating),
    concealment: round3(concealment),
    hidden,
    visibleToPlayer: entity.factionId === 'player',
    tile
  };
}

export function applyUnitStealthStates(game, map) {
  const context = createCoverContext(game, map);
  const apply = (entity) => ({ ...entity, stealth: deriveUnitStealthState(game, map, entity, context) });
  game.leaders = (game.leaders ?? []).map(apply);
  game.squads = (game.squads ?? []).map(apply);
  const playerObservers = [...game.leaders, ...game.squads].filter((entity) => entity.factionId === 'player' && entity.health?.state !== 'dead');
  const addPlayerVisibility = (entity) => ({
    ...entity,
    stealth: {
      ...entity.stealth,
      visibleToPlayer: entity.factionId === 'player' || playerObservers.some((observer) => canObserverDetectEntity(observer, entity))
    }
  });
  game.leaders = game.leaders.map(addPlayerVisibility);
  game.squads = game.squads.map(addPlayerVisibility);
  return game;
}

export function canObserverDetectEntity(observer, target) {
  if (!observer || !target || observer.factionId === target.factionId || !target.stealth?.hidden) {
    return true;
  }
  const distance = tileDistance(observer.position ?? observer.tile, target.position ?? target.tile);
  if (distance <= COVER_MODEL.closeRevealRadiusTiles) {
    return true;
  }
  if (['firing', 'melee-strike'].includes(target.combat?.state)) {
    return true;
  }
  const sightRadius = Math.max(2, Number(observer.sightRadius ?? observer.influenceRadius ?? 6));
  const detectRadius = sightRadius * Math.max(0.18, 1 - target.stealth.concealment * 0.92);
  return distance <= detectRadius;
}

export function getMobilityProfile(entity = {}) {
  if (entity.type === 'squad' && entity.occupancy?.state === 'occupied') {
    return MOBILITY_PROFILES.garrisoned;
  }
  if (entity.behavior?.intent === 'quiet_move' || entity.ai?.intentState === 'quiet_move') {
    return MOBILITY_PROFILES.crouched;
  }
  return MOBILITY_PROFILES.upright;
}

function createCoverContext(game = {}, map = {}) {
  return {
    structures: (game.structures ?? []).filter((structure) => structure.construction?.state === CONSTRUCTION_STATES.complete && structure.combat?.grantsCover),
    authoredCover: getSceneEntity(map).authoredEntities.filter((entity) => entity.kind === 'cover' || entity.kind === 'shelter'),
    corpseStacks: collectCorpseStacks(game).filter((candidate) => candidate.coverBonus > 0)
  };
}

function findBestStructureCover(context, entity, position) {
  const occupiedId = entity.type === 'squad' && entity.occupancy?.state === 'occupied' ? entity.occupancy.structureId : null;
  const candidates = (context.structures ?? [])
    .map((structure) => {
      const distance = tileDistance(position, structure.position ?? structure.tile);
      const range = occupiedId === structure.id ? Infinity : Math.max(1.05, Number(structure.footprint?.radius ?? structure.footprint?.width ?? 0.6) + 0.82);
      if (distance > range) return null;
      return {
        kind: occupiedId === structure.id ? 'garrison' : 'structure',
        label: occupiedId === structure.id ? `Inside ${structure.name ?? structure.type}` : `Behind ${structure.name ?? structure.type}`,
        rating: clamp01(Number(structure.combat.coverRating) || 0)
      };
    })
    .filter(Boolean);
  return candidates.sort((a, b) => b.rating - a.rating)[0] ?? null;
}

function findBestAuthoredCover(context, position) {
  const cover = (context.authoredCover ?? [])
    .filter((entity) => tileDistance(position, entity.tile) <= COVER_MODEL.authoredCoverRadiusTiles)
    .sort((a, b) => (Number(b.shelterRating) || COVER_MODEL.authoredCoverRating) - (Number(a.shelterRating) || COVER_MODEL.authoredCoverRating))[0];
  return cover
    ? {
      kind: cover.kind === 'shelter' ? 'natural_shelter' : 'barricade',
      label: cover.label ?? 'Cover',
      rating: Number.isFinite(Number(cover.shelterRating)) ? Number(cover.shelterRating) : COVER_MODEL.authoredCoverRating
    }
    : null;
}

function findBestCorpseCover(context, position) {
  const stack = (context.corpseStacks ?? [])
    .filter((candidate) => tileDistance(position, candidate.position) <= COVER_MODEL.corpseCoverRadiusTiles)
    .sort((a, b) => b.coverBonus - a.coverBonus)[0];
  return stack
    ? { kind: 'body_pile', label: stack.stackState === 'wall' ? 'Body wall' : 'Body pile', rating: stack.coverBonus }
    : null;
}

function tileDistance(a = {}, b = {}) {
  return Math.hypot((Number(a.x) || 0) - (Number(b.x) || 0), (Number(a.y) || 0) - (Number(b.y) || 0));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
