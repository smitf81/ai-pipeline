import { COLLISION_SHAPE_2D_CONTRACT, translateCollisionShape } from './collisionShapes.js';

export const TRAVERSAL_MODIFIER_2D_CONTRACT = 'black-sky-bound.traversal-modifier-2d.v1';

export function createTraversalModifier(shape, multiplier, source = shape?.source ?? {}) {
  if (shape?.contract !== COLLISION_SHAPE_2D_CONTRACT) {
    throw new Error(`traversal_modifier_shape_invalid:${shape?.contract ?? 'missing'}`);
  }
  const safeMultiplier = Math.max(0.1, Math.min(1, Number(multiplier) || 1));
  return Object.freeze({
    contract: TRAVERSAL_MODIFIER_2D_CONTRACT,
    shape,
    multiplier: safeMultiplier,
    source: Object.freeze({ ...source })
  });
}

export function translateTraversalModifier(modifier, offsetX, offsetY, source = modifier?.source ?? {}) {
  if (modifier?.contract !== TRAVERSAL_MODIFIER_2D_CONTRACT) {
    throw new Error(`traversal_modifier_translate_invalid:${modifier?.contract ?? 'missing'}`);
  }
  return createTraversalModifier(
    translateCollisionShape(modifier.shape, offsetX, offsetY, source),
    modifier.multiplier,
    source
  );
}
