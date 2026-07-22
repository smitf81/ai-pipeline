import { resolveNapalmDropletVisualState } from './napalmLayerState.js';

export function buildProjectileProjection(droplets, tileSize) {
  return droplets.map((droplet) => {
    const visual = resolveNapalmDropletVisualState(droplet);
    return {
      classification: 'renderer_neutral_projectile_effect_projection',
      id: droplet.id,
      kind: droplet.kind ?? 'napalm_droplet',
      visualRole: 'falling_napalm_drip',
      worldX: visual.x * tileSize,
      worldY: visual.y * tileSize,
      previousWorldX: visual.previousX * tileSize,
      previousWorldY: visual.previousY * tileSize,
      groundWorldX: visual.groundX * tileSize,
      groundWorldY: visual.groundY * tileSize,
      radius: Math.max(0.8, (droplet.radius ?? 0.05) * tileSize),
      glowRadius: Math.max(2, (droplet.glowRadius ?? 0.11) * tileSize),
      colour: droplet.colour ?? 'rgba(238,76,24,0.9)',
      coreColour: droplet.coreColour ?? 'rgba(255,210,100,0.94)',
      shadowColour: droplet.shadowColour ?? 'rgba(95,30,10,0.42)',
      age: droplet.age ?? 0,
      lifetime: visual.duration,
      life01: visual.life01,
      drop01: visual.drop01,
      stretch: 1.05 + visual.life01 * 0.35
    };
  });
}

export function buildEffectProjection(effects, tileSize) {
  return effects.map((effect) => ({
    classification: 'renderer_neutral_live_effect_projection',
    id: effect.id,
    kind: effect.kind,
    recipeId: effect.recipeId ?? null,
    visualRole: effect.style?.visualRole ?? effect.kind,
    worldX: effect.x * tileSize,
    worldY: effect.y * tileSize,
    radius: Math.max(1, effect.radius * tileSize),
    age: effect.age,
    lifetime: effect.lifetime,
    life01: normalisedLife(effect.age ?? 0, effect.lifetime),
    hits: effect.hits ?? 0,
    colour: effect.style?.stroke ?? 'rgba(255,220,160,0.65)',
    fillColour: effect.style?.fill ?? effect.style?.stroke ?? 'rgba(255,220,160,0.65)',
    coreColour: effect.style?.core ?? effect.style?.fill ?? effect.style?.stroke ?? 'rgba(255,220,160,0.65)',
    opacity: effect.style?.opacity ?? 1,
    softness: effect.style?.softness ?? 0.72,
    lineWidth: effect.style?.lineWidth ?? 1,
    particleCount: effect.style?.particleCount ?? 0,
    spreadRadians: effect.style?.spreadRadians ?? Math.PI * 2,
    directionX: Number.isFinite(effect.style?.directionX) ? effect.style.directionX : 0,
    directionY: Number.isFinite(effect.style?.directionY) ? effect.style.directionY : 0
  }));
}

function normalisedLife(age, lifetime) {
  if (!Number.isFinite(lifetime) || lifetime <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - age / lifetime));
}
