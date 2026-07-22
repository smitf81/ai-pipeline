import { parseWebGLColor, withAlpha } from './WebGLColor.js';

export function appendSmokeBurstPop(layer, effect, radius, lightSpaceAlpha) {
  const life = clamp01(effect.life01 ?? 1);
  const born = 1 - life;
  const base = parseWebGLColor(effect.colour, [0.72, 0.72, 0.68, 0.55]);
  const alpha = Math.min(base[3], (effect.opacity ?? 0.55) * Math.pow(life, 0.8)) * lightSpaceAlpha;
  if (alpha <= 0.004) return;
  const bloomRadius = radius * (0.52 + born * 0.88);
  layer.radials.push({
    x: effect.worldX,
    y: effect.worldY,
    radius: bloomRadius,
    softness: 0.94,
    color: withAlpha(base, alpha * 0.22)
  });
  for (let index = 0; index < 7; index += 1) {
    const angle = index / 7 * Math.PI * 2 + born * 0.38;
    const distance = bloomRadius * (0.22 + (index % 3) * 0.13);
    layer.radials.push({
      x: effect.worldX + Math.cos(angle) * distance,
      y: effect.worldY + Math.sin(angle) * distance * 0.74,
      radius: Math.max(1.4, bloomRadius * (0.12 + (index % 2) * 0.04)),
      softness: 0.9,
      color: withAlpha(base, alpha * (0.2 + (index % 3) * 0.08))
    });
  }
}

export function appendSmokePursuitBreak(layer, effect, radius, lightSpaceAlpha) {
  const life = clamp01(effect.life01 ?? 1);
  const born = 1 - life;
  const base = parseWebGLColor(effect.colour, [0.72, 0.82, 0.78, 0.88]);
  const core = parseWebGLColor(effect.coreColour, [0.92, 0.92, 0.82, 0.94]);
  const alpha = Math.min(base[3], (effect.opacity ?? 0.9) * Math.pow(life, 0.72)) * lightSpaceAlpha;
  if (alpha <= 0.004) return;
  const ringRadius = radius * (0.34 + born * 0.82);
  const moteRadius = Math.max(1.2, radius * (0.055 + life * 0.025));
  for (let index = 0; index < 8; index += 1) {
    if (index === 1 || index === 5) continue;
    const angle = index / 8 * Math.PI * 2 - Math.PI * 0.5;
    layer.radials.push({
      x: effect.worldX + Math.cos(angle) * ringRadius,
      y: effect.worldY + Math.sin(angle) * ringRadius * 0.72,
      radius: moteRadius,
      softness: effect.softness ?? 0.82,
      color: withAlpha(index % 2 === 0 ? core : base, alpha * (0.48 + life * 0.32))
    });
  }
  const slashHalf = radius * (0.3 + born * 0.12);
  const slashWidth = Math.max(1, (effect.lineWidth ?? 1.8) * life);
  addStreakTriangle(
    layer.triangles,
    effect.worldX - slashHalf,
    effect.worldY - slashHalf * 0.56,
    effect.worldX + slashHalf,
    effect.worldY + slashHalf * 0.56,
    slashWidth,
    withAlpha(core, alpha * 0.72)
  );
  addStreakTriangle(
    layer.triangles,
    effect.worldX - slashHalf,
    effect.worldY + slashHalf * 0.56,
    effect.worldX + slashHalf,
    effect.worldY - slashHalf * 0.56,
    slashWidth,
    withAlpha(base, alpha * 0.58)
  );
}

function addStreakTriangle(triangles, sx, sy, tx, ty, width, color) {
  const dx = tx - sx;
  const dy = ty - sy;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width;
  const ny = dx / length * width;
  triangles.push({
    ax: sx - nx,
    ay: sy - ny,
    bx: sx + nx,
    by: sy + ny,
    cx: tx,
    cy: ty,
    color
  });
}

function clamp01(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.min(1, next));
}
