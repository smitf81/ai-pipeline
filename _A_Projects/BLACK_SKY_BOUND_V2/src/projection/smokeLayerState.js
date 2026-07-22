import { RENDER_BUDGETS } from '../data/renderBudgets.js';
import { getSmokeSourceRecipe, SmokeSourceKind } from '../data/smokeSources.js';
import { resolveNapalmDropletVisualState } from './napalmLayerState.js';
import { buildMamaWorldEventSmokeSourceViews } from '../data/mamaWyvernWorldEvents.js';
import { buildTreeFireSmokeSourceViews } from '../data/treeFireStates.js';

export function buildSmokeSourceViews(game) {
  const sources = [
    ...buildDragonSmokeSourceViews(game),
    ...buildNapalmDropletWispSourceViews(game),
    ...buildNapalmSmoulderSourceViews(game),
    ...buildLightDrivenSmokeSourceViews(game),
    ...buildTreeFireSmokeSourceViews(game.sceneObjects),
    ...buildMamaWorldEventSmokeSourceViews(game.worldEvents)
  ];
  sources.sort((a, b) => (b.renderPriority ?? 0) - (a.renderPriority ?? 0));
  const max = RENDER_BUDGETS.smokeField.maxSources;
  const trimmed = sources.slice(0, max);
  const dropped = Math.max(0, sources.length - trimmed.length);
  recordSmokeSourceDiagnostics(game.renderLayers, trimmed, dropped);
  return trimmed;
}

export function recordSmokeSourceDiagnostics(renderLayers, sources, droppedSources = 0) {
  const smokeField = renderLayers?.smokeField;
  if (!smokeField) return;
  const counts = {};
  for (const source of sources ?? []) counts[source.sourceKind] = (counts[source.sourceKind] ?? 0) + 1;
  smokeField.sourceKinds = counts;
  smokeField.droppedSources = droppedSources;
}

function buildDragonSmokeSourceViews(game) {
  return (game.smokeClouds ?? []).map((cloud) => {
    const kind = cloud.sourceKind ?? SmokeSourceKind.DRAGON_SMOKE_CLOUD;
    const recipe = getSmokeSourceRecipe(kind);
    return {
      id: `smoke_source:${kind}:${cloud.id}`,
      sourceKind: kind,
      sourceId: cloud.id,
      x: cloud.x,
      y: cloud.y,
      radius: cloud.radius * recipe.radiusScale,
      density: recipe.density * (cloud.density ?? 1),
      opacity: cloud.opacity ?? 1,
      age: cloud.age,
      lifetime: cloud.lifetime,
      driftScale: recipe.driftScale,
      renderPriority: recipe.renderPriority,
      classification: 'derived_smoke_source_view',
      shape: cloud.shape ?? 'soft_disc',
      softness: cloud.softness ?? 0.86,
      plumeId: cloud.plumeId ?? null,
      segmentIndex: cloud.segmentIndex ?? null,
      plumeT: cloud.plumeT ?? null,
      forwardX: cloud.forwardX ?? null,
      forwardY: cloud.forwardY ?? null
    };
  });
}

function buildNapalmDropletWispSourceViews(game) {
  const recipe = getSmokeSourceRecipe(SmokeSourceKind.NAPALM_DROPLET_WISP);
  return (game.renderLayers?.napalm?.droplets ?? [])
    .filter((droplet) => droplet.age < droplet.duration)
    .map((droplet) => {
      const visual = resolveNapalmDropletVisualState(droplet);
      const life01 = visual.life01;
      return {
        id: `smoke_source:${SmokeSourceKind.NAPALM_DROPLET_WISP}:${droplet.id}`,
        sourceKind: SmokeSourceKind.NAPALM_DROPLET_WISP,
        sourceId: droplet.id,
        x: visual.x,
        y: visual.y,
        radius: (droplet.glowRadius ?? droplet.radius ?? 0.14) * recipe.radiusScale * (0.72 + life01 * 0.28),
        density: recipe.density * (0.56 + life01 * 0.44),
        opacity: 0.34 + life01 * 0.18,
        age: droplet.age,
        lifetime: droplet.duration,
        driftScale: recipe.driftScale,
        renderPriority: recipe.renderPriority,
        classification: 'derived_smoke_source_view',
        shape: 'rising_micro_wisp',
        forwardX: 0,
        forwardY: -1
      };
    });
}

function buildNapalmSmoulderSourceViews(game) {
  const recipe = getSmokeSourceRecipe(SmokeSourceKind.NAPALM_SMOULDER);
  return (game.renderLayers?.napalm?.pools ?? [])
    .filter((pool) => pool.age < pool.lifetime)
    .map((pool) => {
      const life01 = normalisedLife(pool.age, pool.lifetime);
      return {
        id: `smoke_source:${SmokeSourceKind.NAPALM_SMOULDER}:${pool.id}`,
        sourceKind: SmokeSourceKind.NAPALM_SMOULDER,
        sourceId: pool.id,
        x: pool.x,
        y: pool.y,
        radius: pool.radius * recipe.radiusScale * (0.78 + life01 * 0.22),
        density: recipe.density * (0.35 + life01 * 0.65),
        age: pool.age,
        lifetime: pool.lifetime,
        driftScale: recipe.driftScale,
        renderPriority: recipe.renderPriority,
        classification: 'derived_smoke_source_view'
      };
    });
}

function buildLightDrivenSmokeSourceViews(game) {
  return (game.lights ?? [])
    .filter((light) => light.enabled !== false && light.smokeSourceKind)
    .flatMap((light) => {
      const kind = light.smokeSourceKind;
      if (kind === SmokeSourceKind.TORCH_WISP || kind === SmokeSourceKind.RAID_FLAME_WISP) {
        return buildLightWispPair(light, kind);
      }
      if (kind === SmokeSourceKind.SMOULDER_PATCH_WISP) {
        return buildSmoulderPatchWisps(light);
      }
      return [];
    });
}

function buildLightWispPair(light, kind) {
  const recipe = getSmokeSourceRecipe(kind);
  const strength = clamp01(light.effectiveIntensity ?? light.intensity ?? 1);
  const authoredForward = normaliseVector(light.forwardX, light.forwardY, 0, -1);
  const smokeForward = normaliseVector(authoredForward.x * 0.2, -1, 0, -1);
  const side = { x: -smokeForward.y, y: smokeForward.x };
  const trailOffset = Math.max(0.08, light.radius * 0.045);
  const sourceId = light.sourceEntity ?? light.id;
  const arrowScale = kind === SmokeSourceKind.RAID_FLAME_WISP ? 0.7 : 1;
  return [
    {
      id: `smoke_source:${kind}:${light.id}:core`,
      sourceKind: kind,
      sourceId,
      x: light.x,
      y: light.y,
      radius: light.radius * recipe.radiusScale * 0.42 * arrowScale,
      density: recipe.density * (0.72 + strength * 0.48),
      opacity: kind === SmokeSourceKind.RAID_FLAME_WISP ? 0.78 : 0.86,
      age: 0,
      lifetime: null,
      driftScale: recipe.driftScale,
      renderPriority: recipe.renderPriority + 1,
      classification: 'derived_smoke_source_view',
      forwardX: smokeForward.x,
      forwardY: smokeForward.y
    },
    {
      id: `smoke_source:${kind}:${light.id}:trail`,
      sourceKind: kind,
      sourceId,
      x: light.x + smokeForward.x * trailOffset + side.x * trailOffset * 0.22,
      y: light.y + smokeForward.y * trailOffset + side.y * trailOffset * 0.22,
      radius: light.radius * recipe.radiusScale * (kind === SmokeSourceKind.RAID_FLAME_WISP ? 0.62 : 0.76),
      density: recipe.density * (0.48 + strength * 0.32),
      opacity: kind === SmokeSourceKind.RAID_FLAME_WISP ? 0.62 : 0.68,
      age: 0,
      lifetime: null,
      driftScale: recipe.driftScale * 1.08,
      renderPriority: recipe.renderPriority,
      classification: 'derived_smoke_source_view',
      forwardX: smokeForward.x,
      forwardY: smokeForward.y
    }
  ];
}

function buildSmoulderPatchWisps(light) {
  const kind = SmokeSourceKind.SMOULDER_PATCH_WISP;
  const recipe = getSmokeSourceRecipe(kind);
  const strength = clamp01(light.effectiveIntensity ?? light.intensity ?? 1);
  const smokeForward = normaliseVector(-(light.forwardX ?? 0), -(light.forwardY ?? 0), 0, -1);
  const side = { x: -smokeForward.y, y: smokeForward.x };
  const sourceId = light.sourceEntity ?? light.id;
  return [
    {
      id: `smoke_source:${kind}:${light.id}:core`,
      sourceKind: kind,
      sourceId,
      x: light.x,
      y: light.y,
      radius: light.radius * recipe.radiusScale * 0.82,
      density: recipe.density * (0.84 + strength * 0.28),
      opacity: 0.78,
      age: 0,
      lifetime: null,
      driftScale: recipe.driftScale,
      renderPriority: recipe.renderPriority + 1,
      classification: 'derived_smoke_source_view',
      forwardX: smokeForward.x,
      forwardY: smokeForward.y
    },
    {
      id: `smoke_source:${kind}:${light.id}:side_a`,
      sourceKind: kind,
      sourceId,
      x: light.x + side.x * light.radius * 0.06,
      y: light.y + side.y * light.radius * 0.06 - light.radius * 0.02,
      radius: light.radius * recipe.radiusScale * 0.54,
      density: recipe.density * 0.72,
      opacity: 0.62,
      age: 0,
      lifetime: null,
      driftScale: recipe.driftScale * 0.94,
      renderPriority: recipe.renderPriority,
      classification: 'derived_smoke_source_view',
      forwardX: smokeForward.x,
      forwardY: smokeForward.y
    },
    {
      id: `smoke_source:${kind}:${light.id}:side_b`,
      sourceKind: kind,
      sourceId,
      x: light.x - side.x * light.radius * 0.07,
      y: light.y - side.y * light.radius * 0.07 - light.radius * 0.03,
      radius: light.radius * recipe.radiusScale * 0.48,
      density: recipe.density * 0.66,
      opacity: 0.56,
      age: 0,
      lifetime: null,
      driftScale: recipe.driftScale,
      renderPriority: recipe.renderPriority,
      classification: 'derived_smoke_source_view',
      forwardX: smokeForward.x,
      forwardY: smokeForward.y
    }
  ];
}

function normalisedLife(age, lifetime) {
  if (!Number.isFinite(lifetime) || lifetime <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - age / lifetime));
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normaliseVector(x, y, fallbackX = 0, fallbackY = -1) {
  const nx = Number(x);
  const ny = Number(y);
  const length = Math.hypot(nx, ny);
  if (Number.isFinite(length) && length > 0.001) return { x: nx / length, y: ny / length };
  const fallbackLength = Math.hypot(fallbackX, fallbackY) || 1;
  return { x: fallbackX / fallbackLength, y: fallbackY / fallbackLength };
}
