import { AI_BEHAVIOUR_CONTRACT_ID, AI_BEHAVIOUR_FIELD_IDS, clamp01 } from '../game/aiContracts.js';
import { collectCorpseStacks } from '../game/corpseSystem.js';
import { createField, getFieldValue, getTerrainField } from './fields.js';

export const BEHAVIOUR_FIELDS_CONTRACT_ID = `${AI_BEHAVIOUR_CONTRACT_ID}.fields`;
export const BEHAVIOUR_FIELD_RECOMPUTE_INTERVAL_TICKS = 6;

export function createBehaviourFieldSet(map, seed = {}) {
  const fields = Object.fromEntries(Object.values(AI_BEHAVIOUR_FIELD_IDS).map((id) => [
    id,
    createField(map.width, map.height, Number(seed[id]) || 0)
  ]));
  return {
    contract: BEHAVIOUR_FIELDS_CONTRACT_ID,
    width: map.width,
    height: map.height,
    tick: Math.max(0, Math.floor(Number(seed.tick) || 0)),
    fields
  };
}

export function sampleBehaviourFields(fieldSet, x, y) {
  const fields = fieldSet?.fields ?? fieldSet ?? {};
  return Object.fromEntries(Object.values(AI_BEHAVIOUR_FIELD_IDS).map((id) => [
    id,
    clamp01(getFieldValue(fields, id, Math.round(Number(x) || 0), Math.round(Number(y) || 0)) ?? 0)
  ]));
}

export function classifyCoverState(sample = {}) {
  const shelter = clamp01(sample.shelter ?? 0);
  const exposure = clamp01(sample.exposure ?? 1 - shelter);
  if (shelter >= 0.68 && exposure <= 0.42) return 'sheltered';
  if (shelter >= 0.34 || exposure <= 0.64) return 'partial_cover';
  return 'exposed';
}


export function findBestBehaviourFieldTile(map, fieldSet, origin = {}, options = {}) {
  const fieldId = options.fieldId ?? AI_BEHAVIOUR_FIELD_IDS.shelter;
  const radius = Math.max(1, Math.floor(Number(options.radius) || 5));
  const avoidFieldId = options.avoidFieldId ?? AI_BEHAVIOUR_FIELD_IDS.threat;
  const originPoint = normalisePoint(origin);
  let best = null;
  for (let y = Math.max(0, Math.floor(originPoint.y - radius)); y <= Math.min(map.height - 1, Math.ceil(originPoint.y + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(originPoint.x - radius)); x <= Math.min(map.width - 1, Math.ceil(originPoint.x + radius)); x += 1) {
      const distance = distanceBetween(originPoint, { x, y });
      if (distance > radius) continue;
      const sample = sampleBehaviourFields(fieldSet, x, y);
      const desirability = clamp01(sample[fieldId] ?? 0);
      const avoid = clamp01(sample[avoidFieldId] ?? 0);
      const distancePenalty = distance / Math.max(1, radius) * 0.18;
      const score = clamp01(desirability - avoid * 0.34 - distancePenalty);
      if (!best || score > best.score) {
        best = { x, y, score: round3(score), sample };
      }
    }
  }
  return best;
}

export function writeBehaviourFieldValue(fieldSet, fieldId, x, y, value) {
  const field = fieldSet?.fields?.[fieldId];
  const tx = Math.round(Number(x) || 0);
  const ty = Math.round(Number(y) || 0);
  if (!field || tx < 0 || ty < 0 || tx >= field.width || ty >= field.height) {
    return false;
  }
  field.values[ty][tx] = clamp01(value);
  return true;
}

export function createBehaviourFieldSignature(game = {}) {
  const entitySignature = [...(game.leaders ?? []), ...(game.squads ?? [])]
    .map((entity) => {
      const p = getEntityPosition(entity);
      return [
        entity.id,
        entity.factionId,
        round3(p.x),
        round3(p.y),
        entity.ai?.emotionalState ?? '',
        entity.ai?.intentState ?? '',
        round3(entity.ai?.morale ?? entity.attributes?.morale ?? entity.qualities?.presence ?? 0),
        round3(entity.ai?.commandConfidence ?? entity.attributes?.discipline ?? entity.qualities?.discipline ?? 0),
        entity.health?.state ?? '',
        round3(entity.health?.health ?? 0)
      ].join(':');
    })
    .join('|');
  const structureSignature = (game.structures ?? [])
    .filter((structure) => structure.construction?.state === 'complete')
    .map((structure) => [
      structure.id,
      structure.factionId ?? '',
      round3((structure.position ?? structure.tile)?.x ?? 0),
      round3((structure.position ?? structure.tile)?.y ?? 0),
      round3(structure.combat?.coverRating ?? 0),
      round3(structure.integrity?.health ?? 0)
    ].join(':'))
    .join('|');
  const deathSignature = (game.deathEvents ?? [])
    .slice(-12)
    .map((event) => `${event.id ?? event.entityId ?? 'death'}:${event.factionId ?? ''}:${round3(event.position?.x ?? event.tile?.x ?? 0)}:${round3(event.position?.y ?? event.tile?.y ?? 0)}:${event.tick ?? event.occurredAtTick ?? ''}`)
    .join('|');
  const attentionSignature = (game.ai?.attentionMarkers ?? [])
    .map((marker) => `${marker.id}:${marker.type}:${round3(marker.position?.x ?? 0)}:${round3(marker.position?.y ?? 0)}:${round3(marker.strength ?? 0)}:${marker.expiresAtTick ?? 0}`)
    .join('|');
  const corpseSignature = (game.corpses ?? [])
    .map((corpse) => `${corpse.id}:${corpse.state}:${corpse.count ?? 1}:${round3(corpse.position?.x ?? corpse.tile?.x ?? 0)}:${round3(corpse.position?.y ?? corpse.tile?.y ?? 0)}:${round3(corpse.horrorValueTotal ?? corpse.horrorValue ?? 0)}`)
    .join('|');
  const versionSignature = [
    game.versions?.map ?? 0,
    game.versions?.fields ?? 0,
    game.versions?.ai ?? 0,
    game.versions?.squads ?? 0,
    game.versions?.structures ?? 0,
    game.versions?.combatTargets ?? 0
  ].join(':');
  return [versionSignature, entitySignature, structureSignature, deathSignature, attentionSignature, corpseSignature].join('/');
}

export function deriveBehaviourFields(map, game = {}, sourceFields = game.fields ?? {}) {
  const fieldSet = createBehaviourFieldSet(map, { tick: game.tick ?? 0 });
  const fields = fieldSet.fields;
  const playerEntities = collectFactionEntities(game, 'player');
  const enemyEntities = collectFactionEntities(game, 'enemy');
  const livingEntities = [...playerEntities, ...enemyEntities];

  paintEntityThreat(fields.threat, map, enemyEntities, 1);
  paintEntityThreat(fields.threat, map, playerEntities, 0.72);
  paintRecentDeathThreat(fields.threat, map, game.deathEvents ?? [], game.tick ?? 0);
  paintCorpseHorror(fields, map, game.corpses ?? [], game.tick ?? 0);
  paintAttentionMarkers(fields.attention, fields.threat, map, game.ai?.attentionMarkers ?? [], game.tick ?? 0);
  paintMoraleAndCommand(fields, map, livingEntities, game);
  paintStructureShelter(fields.shelter, fields.morale, map, game.structures ?? [], game.outposts ?? []);

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const terrain = getTerrainField(map, x, y);
      const enemyLoS = readSource(sourceFields, 'enemyLoS', x, y);
      const playerLoS = readSource(sourceFields, 'playerLoS', x, y);
      const playerCommand = readSource(sourceFields, 'playerCommand', x, y);
      const enemyCommand = readSource(sourceFields, 'enemyCommand', x, y);
      const frontPressure = readSource(sourceFields, 'frontPressure', x, y);
      const objectivePressure = readSource(sourceFields, 'objectivePressure', x, y);
      const terrainShelter = clamp01(
        terrain.cover * 0.46 +
        terrain.height * 0.18 +
        terrain.logistics * 0.12 +
        terrain.passability * 0.1 +
        (terrain.water > 0.45 ? 0.04 : 0)
      );
      const commandSupport = clamp01(Math.max(playerCommand, enemyCommand));
      const losDanger = clamp01(Math.max(enemyLoS, playerLoS) * 0.24);
      const structureShelter = fields.shelter.values[y][x];
      const threat = clamp01(Math.max(
        fields.threat.values[y][x],
        frontPressure * 0.62,
        objectivePressure * 0.38,
        Math.max(playerCommand, enemyCommand) * 0.08
      ));
      fields.threat.values[y][x] = round3(threat);

      const shelter = clamp01(
        Math.max(structureShelter, terrainShelter) +
        commandSupport * 0.13 -
        threat * 0.18 -
        losDanger * 0.12 -
        Math.max(0, 0.3 - terrain.passability) * 0.32
      );
      fields.shelter.values[y][x] = round3(shelter);

      const exposure = clamp01(
        (1 - shelter) * 0.54 +
        Math.max(enemyLoS, playerLoS) * 0.18 +
        frontPressure * 0.14 +
        threat * 0.22 +
        Math.max(0, 0.42 - terrain.passability) * 0.28
      );
      fields.exposure.values[y][x] = round3(exposure);

      const morale = clamp01(fields.morale.values[y][x] + shelter * 0.12 - threat * 0.14 - exposure * 0.08);
      fields.morale.values[y][x] = round3(morale);

      const commandConfidence = clamp01(fields.commandConfidence.values[y][x] + commandSupport * 0.22 + morale * 0.12 - exposure * 0.1);
      fields.commandConfidence.values[y][x] = round3(commandConfidence);

      fields.attention.values[y][x] = round3(fields.attention.values[y][x]);
    }
  }

  return {
    contract: BEHAVIOUR_FIELDS_CONTRACT_ID,
    width: map.width,
    height: map.height,
    tick: game.tick ?? 0,
    signature: createBehaviourFieldSignature(game),
    fields
  };
}

export function deriveCadencedBehaviourFields(map, game = {}, sourceFields = game.fields ?? {}) {
  const mapSignature = `${map.width}x${map.height}:${Math.max(0, Number(map.revision) || 0)}`;
  const signature = createBehaviourFieldSignature(game);
  const tick = Math.max(0, Math.floor(Number(game.tick) || 0));
  const cached = game?._runtimeCache?.behaviourFields;
  const withinCadence = Number.isFinite(cached?.tick) && (tick - cached.tick) < BEHAVIOUR_FIELD_RECOMPUTE_INTERVAL_TICKS;
  const dirty = Boolean(game?.dirty?.ai || game?.dirty?.fields || game?.dirty?.combatTargets);
  if (
    cached?.mapSignature === mapSignature &&
    cached?.signature === signature &&
    cached?.fields &&
    withinCadence &&
    !dirty
  ) {
    return cached.fields;
  }

  const derived = deriveBehaviourFields(map, game, sourceFields);
  if (game && typeof game === 'object') {
    game._runtimeCache = {
      ...(game._runtimeCache ?? {}),
      behaviourFields: {
        mapSignature,
        signature,
        tick,
        fields: derived.fields
      }
    };
  }
  return derived.fields;
}

function collectFactionEntities(game, factionId) {
  return [...(game.leaders ?? []), ...(game.squads ?? [])]
    .filter((entity) => entity?.factionId === factionId && entity?.health?.state !== 'dead');
}

function paintEntityThreat(field, map, entities = [], scale = 1) {
  entities.forEach((entity) => {
    const position = getEntityPosition(entity);
    const radius = Math.max(2.5, Number(entity.sightRadius ?? entity.influenceRadius ?? 4) * 0.8);
    const combatPressure = clamp01(
      (Number(entity.combat?.baseDamage ?? entity.combat?.attackDamage ?? 4) / 12) * 0.38 +
      (Number(entity.attributes?.firepower ?? 0.48) * 0.22) +
      (Number(entity.ai?.emotionalState === 'panicked' ? 0.08 : 0.22))
    );
    paintRadial(field, map, position, radius, combatPressure * scale, 'max');
  });
}

function paintRecentDeathThreat(field, map, deathEvents = [], tick = 0) {
  deathEvents.slice(-16).forEach((event) => {
    const position = event.position ?? event.tile;
    if (!position) return;
    const eventTick = Math.max(0, Number(event.tick ?? event.occurredAtTick ?? tick) || 0);
    const age = Math.max(0, tick - eventTick);
    const strength = clamp01(0.62 - age * 0.025);
    if (strength <= 0) return;
    paintRadial(field, map, position, 5.2, strength, 'max');
  });
}


function paintCorpseHorror(fields, map, corpses = [], tick = 0) {
  const gameLike = { corpses };
  collectCorpseStacks(gameLike).forEach((stack) => {
    const position = stack.position ?? stack.tile;
    if (!position) return;
    const effectivePileCount = Math.min(8, stack.count);
    const horror = clamp01((stack.horrorValue / Math.max(1, stack.count)) * Math.min(1.4, 0.72 + effectivePileCount * 0.16));
    if (horror > 0.02) {
      paintRadial(fields.threat, map, position, 3.8 + horror * 2.4 + effectivePileCount * 0.24, horror * 0.32, 'max');
      paintRadial(fields.exposure, map, position, 2.5 + horror * 2.2, horror * 0.18, 'max');
      paintRadial(fields.morale, map, position, 3.5 + horror * 2.8, -horror * 0.18, 'add');
      paintRadial(fields.attention, map, position, 2.2 + horror * 1.8, horror * 0.16, 'max');
    }
    if (stack.coverBonus > 0) {
      paintRadial(fields.shelter, map, position, 0.9 + effectivePileCount * 0.22, stack.coverBonus, 'max');
      paintRadial(fields.exposure, map, position, 0.9 + effectivePileCount * 0.18, -stack.exposureReduction, 'add');
    }
  });
}

function paintAttentionMarkers(attentionField, threatField, map, markers = [], tick = 0) {
  markers.forEach((marker) => {
    if (!marker?.position) return;
    const duration = Math.max(1, (marker.expiresAtTick ?? tick + 1) - (marker.createdAtTick ?? tick));
    const remaining = clamp01(((marker.expiresAtTick ?? tick) - tick) / duration);
    const strength = clamp01((marker.strength ?? 0.5) * remaining);
    if (strength <= 0) return;
    const audibleRadius = Math.max(0.5, Number(marker.audibleRadiusTiles) || (4.5 + strength * 5));
    paintRadial(attentionField, map, marker.position, audibleRadius, strength, 'max');
    paintRadial(threatField, map, marker.position, Math.min(audibleRadius, 2.8 + strength * 3), strength * 0.22, 'max');
  });
}

function paintMoraleAndCommand(fields, map, entities = [], game = {}) {
  const commanderDead = (game.leaders ?? []).some((leader) => leader.factionId === 'player' && leader.health?.state === 'dead');
  entities.forEach((entity) => {
    const position = getEntityPosition(entity);
    const isLeader = entity.type === 'leader';
    const morale = clamp01((entity.ai?.morale ?? entity.attributes?.morale ?? entity.qualities?.presence ?? 0.5) - (entity.ai?.maxMoralePenalty ?? 0));
    const confidence = clamp01(entity.ai?.commandConfidence ?? entity.attributes?.discipline ?? entity.qualities?.discipline ?? 0.5);
    const emotionalPenalty = emotionalCommandPenalty(entity.ai?.emotionalState);
    const radius = Math.max(2, Number(entity.influenceRadius ?? (isLeader ? 6 : 3)));
    const leaderBonus = isLeader ? 1.2 : 0.72;
    const commanderLossPenalty = commanderDead && entity.factionId === 'player' ? 0.32 : 0;
    paintRadial(fields.morale, map, position, radius, Math.max(0, morale - commanderLossPenalty) * leaderBonus, 'max');
    paintRadial(fields.commandConfidence, map, position, radius, Math.max(0, confidence - emotionalPenalty - commanderLossPenalty) * leaderBonus, 'max');
  });
}

function paintStructureShelter(shelterField, moraleField, map, structures = [], outposts = []) {
  structures
    .filter((structure) => structure?.construction?.state === 'complete')
    .forEach((structure) => {
      const position = structure.position ?? structure.tile;
      if (!position) return;
      const coverRating = clamp01(structure.combat?.coverRating ?? 0.22);
      const radius = Math.max(1.8, Math.sqrt(Math.max(1, structure.footprint?.tiles?.length ?? 1)) + 2.2);
      paintRadial(shelterField, map, position, radius, 0.28 + coverRating * 0.58, 'max');
      paintRadial(moraleField, map, position, radius + 1.4, 0.18 + coverRating * 0.22, 'max');
    });
  outposts.forEach((outpost) => {
    if (!outpost?.tile) return;
    const value = outpost.factionId && outpost.factionId !== 'neutral' ? 0.46 : 0.28;
    paintRadial(shelterField, map, outpost.tile, 3.5, value, 'max');
    paintRadial(moraleField, map, outpost.tile, 4.5, value * 0.7, 'max');
  });
}

function paintRadial(field, map, position, radius, strength, mode = 'max') {
  if (!field || !position) return;
  if (mode !== 'add' && strength <= 0) return;
  const origin = normalisePoint(position);
  const safeRadius = Math.max(0.5, Number(radius) || 0.5);
  const minX = Math.max(0, Math.floor(origin.x - safeRadius));
  const maxX = Math.min(map.width - 1, Math.ceil(origin.x + safeRadius));
  const minY = Math.max(0, Math.floor(origin.y - safeRadius));
  const maxY = Math.min(map.height - 1, Math.ceil(origin.y + safeRadius));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distance = distanceBetween(origin, { x, y });
      if (distance > safeRadius) continue;
      const falloff = Math.max(0, 1 - distance / safeRadius);
      const value = mode === 'add' ? strength * falloff : clamp01(strength * falloff);
      if (mode === 'add') {
        field.values[y][x] = clamp01((field.values[y][x] ?? 0) + value);
      } else {
        field.values[y][x] = Math.max(field.values[y][x] ?? 0, value);
      }
    }
  }
}

function readSource(sourceFields, id, x, y) {
  return clamp01(getFieldValue(sourceFields, id, x, y) ?? 0);
}

function getEntityPosition(entity = {}) {
  return normalisePoint(entity.position ?? entity.tile ?? { x: 0, y: 0 });
}

function normalisePoint(point = {}) {
  return {
    x: Number.isFinite(Number(point.x)) ? Number(point.x) : 0,
    y: Number.isFinite(Number(point.y)) ? Number(point.y) : Number.isFinite(Number(point.z)) ? Number(point.z) : 0
  };
}

function distanceBetween(a, b) {
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function emotionalCommandPenalty(state) {
  if (state === 'routed') return 0.7;
  if (state === 'panicked') return 0.42;
  if (state === 'pressured') return 0.2;
  if (state === 'alert') return 0.08;
  return 0;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
