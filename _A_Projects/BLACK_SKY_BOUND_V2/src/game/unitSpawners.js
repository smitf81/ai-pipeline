import { EntityKind } from '../constants/entityKinds.js';
import { ComponentType } from '../constants/componentTypes.js';
import { isFaction } from '../constants/factions.js';
import { getDefaultActorFaction } from '../data/actors.js';
import { Components } from '../components/createComponents.js';
import { addComponent, createEntity, getComponent } from '../ecs/world.js';
import { getCreatureRecipe, normalizeCreatureRecipeReference } from '../data/creatures/creatureRecipes.js';

export const UNIT_SPAWNER_CONTRACT = 'black-sky-bound.unit-spawner.v0';

const DEFAULT_SPAWNER = Object.freeze({
  type: EntityKind.HUSK,
  enabled: true,
  intervalSeconds: 4,
  initialDelaySeconds: 0.2,
  burstCount: 1,
  maxAlive: 3,
  limit: 0,
  spawnRadiusTiles: 0.6,
  hitPoints: 36,
  fixtureRadiusTiles: 0.48
});

const SPAWNABLE_ENTITY_KINDS = new Set([EntityKind.RAIDER, EntityKind.HUSK, EntityKind.WEREWOLF]);

export function normalizeUnitSpawner(entry = {}, index = 0) {
  const type = isEntityKind(entry.type) ? entry.type : DEFAULT_SPAWNER.type;
  const team = isFaction(entry.team) ? entry.team : getDefaultActorFaction(type);
  const x = roundTile(entry.x ?? entry.tileX, 0);
  const y = roundTile(entry.y ?? entry.tileY, 0);
  const creature = normalizeCreatureRecipeReference(entry.creature);
  if (creature && getCreatureRecipe(creature.recipeId).identity.actorKind !== type) {
    throw new Error(`unit_spawner_creature_kind_mismatch:${creature.recipeId}:${type}`);
  }
  return {
    contract: UNIT_SPAWNER_CONTRACT,
    id: normalizeText(entry.id, `spawner_${String(index + 1).padStart(2, '0')}`),
    label: normalizeText(entry.label, `${labelForType(type)} Spawner`),
    type,
    team,
    x,
    y,
    enabled: entry.enabled !== false,
    intervalSeconds: clampNumber(entry.intervalSeconds, DEFAULT_SPAWNER.intervalSeconds, 0.1, 60),
    initialDelaySeconds: clampNumber(entry.initialDelaySeconds, DEFAULT_SPAWNER.initialDelaySeconds, 0, 60),
    burstCount: clampInteger(entry.burstCount, DEFAULT_SPAWNER.burstCount, 1, 12),
    maxAlive: clampInteger(entry.maxAlive, DEFAULT_SPAWNER.maxAlive, 1, 32),
    limit: clampInteger(entry.limit, DEFAULT_SPAWNER.limit, 0, 999),
    spawnRadiusTiles: clampNumber(entry.spawnRadiusTiles, DEFAULT_SPAWNER.spawnRadiusTiles, 0, 8),
    hitPoints: clampInteger(entry.hitPoints ?? entry.hp ?? entry.maxHp, DEFAULT_SPAWNER.hitPoints, 1, 999),
    fixtureRadiusTiles: clampNumber(entry.fixtureRadiusTiles ?? entry.fixtureRadius ?? entry.radius, DEFAULT_SPAWNER.fixtureRadiusTiles, 0.15, 3),
    ...(entry.audioEmitter ? { audioEmitter: normalizeAudioEmitterOverride(entry.audioEmitter) } : {}),
    ...(creature ? { creature } : {})
  };
}

export function normalizeUnitSpawnerList(entries = []) {
  return Array.isArray(entries)
    ? entries.map((entry, index) => normalizeUnitSpawner(entry, index))
    : [];
}

export function createRuntimeUnitSpawners(entries = [], world = null) {
  return normalizeUnitSpawnerList(entries).map((entry) => ({
    ...entry,
    cooldownSeconds: entry.initialDelaySeconds,
    spawnedCount: 0,
    spawnedEntityIds: [],
    destroyed: false,
    destroyedAt: null,
    fixtureEntityId: world ? createUnitSpawnerFixtureEntity(world, entry) : null
  }));
}

export function serializeUnitSpawner(entry = {}) {
  const normalized = normalizeUnitSpawner(entry);
  return {
    id: normalized.id,
    label: normalized.label,
    type: normalized.type,
    team: normalized.team,
    x: normalized.x,
    y: normalized.y,
    enabled: normalized.enabled,
    intervalSeconds: normalized.intervalSeconds,
    initialDelaySeconds: normalized.initialDelaySeconds,
    burstCount: normalized.burstCount,
    maxAlive: normalized.maxAlive,
    limit: normalized.limit,
    spawnRadiusTiles: normalized.spawnRadiusTiles,
    hitPoints: normalized.hitPoints,
    fixtureRadiusTiles: normalized.fixtureRadiusTiles,
    ...(normalized.creature ? { creature: { ...normalized.creature } } : {})
    ,...(normalized.audioEmitter ? { audioEmitter: { ...normalized.audioEmitter } } : {})
  };
}

function normalizeAudioEmitterOverride(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('unit_spawner_audio_emitter_invalid');
  if (Object.hasOwn(value, 'x') || Object.hasOwn(value, 'y') || Object.hasOwn(value, 'z') || Object.hasOwn(value, 'position')) {
    throw new Error('unit_spawner_audio_emitter_duplicate_position');
  }
  return { ...value };
}

export function cloneRuntimeUnitSpawners(entries = []) {
  return createRuntimeUnitSpawners(entries).map((entry) => ({
    ...entry,
    spawnedEntityIds: [...entry.spawnedEntityIds]
  }));
}

export function createUnitSpawnerFixtureEntity(world, spawner) {
  if (!world) return null;
  const entity = createEntity(world, EntityKind.UNIT_SPAWNER);
  addComponent(world, entity, ComponentType.Kind, Components.kind(EntityKind.UNIT_SPAWNER, spawner.label));
  addComponent(world, entity, ComponentType.Transform, Components.transform(spawner.x + 0.5, spawner.y + 0.5, 0));
  addComponent(world, entity, ComponentType.Health, Components.health(spawner.hitPoints, {
    maxHealth: spawner.hitPoints,
    hitPulseDurationMs: 160,
    criticalHealthThreshold: 0.35,
    maxPressure: 1
  }));
  addComponent(world, entity, ComponentType.Collider, Components.collider(spawner.fixtureRadiusTiles, false));
  addComponent(world, entity, ComponentType.Team, Components.team(spawner.team));
  addComponent(world, entity, ComponentType.Renderable, Components.renderable({
    label: spawner.label,
    colour: '#6f4a8e',
    stroke: '#100817',
    radius: spawner.fixtureRadiusTiles,
    layer: 'spawner_fixtures',
    materialProfileId: null
  }));
  return entity;
}

export function syncUnitSpawnerFixtureLifecycle(game, spawner) {
  const world = game?.world;
  const entity = spawner?.fixtureEntityId;
  if (!world || !entity) return false;
  if (!world.entities.has(entity)) {
    spawner.enabled = false;
    spawner.destroyed = true;
    spawner.destroyedAt = spawner.destroyedAt ?? (game.renderTime ?? 0);
    return true;
  }
  const health = getComponent(world, entity, ComponentType.Health);
  if (health?.alive === false || (Number.isFinite(health?.hp) && health.hp <= 0)) {
    spawner.enabled = false;
    spawner.destroyed = true;
    spawner.destroyedAt = spawner.destroyedAt ?? (game.renderTime ?? 0);
    return true;
  }
  spawner.destroyed = false;
  spawner.destroyedAt = null;
  return false;
}

function isEntityKind(value) {
  return SPAWNABLE_ENTITY_KINDS.has(value);
}

function labelForType(type) {
  if (type === EntityKind.RAIDER) return 'Raider';
  if (type === EntityKind.WEREWOLF) return 'Werewolf';
  if (type === EntityKind.YOUNG_DRAGON) return 'Dragon';
  return 'Husk';
}

function normalizeText(value, fallback) {
  return String(value ?? '').trim() || fallback;
}

function roundTile(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function clampInteger(value, fallback, min, max) {
  return Math.round(clampNumber(value, fallback, min, max));
}
