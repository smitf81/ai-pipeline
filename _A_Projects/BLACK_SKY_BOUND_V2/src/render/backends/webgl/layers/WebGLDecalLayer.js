import { parseWebGLColor, withAlpha } from '../WebGLColor.js';
import { WEBGL_LIGHT_SPACE_GATE_MODE, lightSpaceAlphaForWorldCircle, lightSpaceGateActive } from '../WebGLLightSpaceGate.js';

const DECAL_MODE = 'liquid_ground_hazard_decal_v1';
const MAX_DECAL_SOURCES = 96;
const NAPALM_POOL_MATERIAL = 'residual_liquid_napalm_pool_v1';
const BLOOD_STAIN_MATERIAL = 'residual_blood_spatter_stain_v0';

export class WebGLDecalLayer {
  constructor() {
    this.id = 'decals';
    this.mode = DECAL_MODE;
    this.status = 'inactive';
    this.objectCount = 0;
    this.sourceCount = 0;
    this.primitiveCount = 0;
    this.radials = [];
    this.triangles = [];
    this.liquidPoolCount = 0;
    this.liquidPoolPrimitiveCount = 0;
    this.hotSpotPrimitiveCount = 0;
    this.bloodStainCount = 0;
    this.bloodStainPrimitiveCount = 0;
    this.corpseCount = 0;
    this.corpsePrimitiveCount = 0;
    this.lightSpaceCulledCount = 0;
    this.lightSpaceGateActive = false;
  }

  update(projection, context) {
    const decals = projection.decals ?? [];
    const hazards = projection.groundHazards ?? [];
    const bounds = context.camera.visibleWorldBounds(96);
    this.radials.length = 0;
    this.triangles.length = 0;
    this.sourceCount = 0;
    this.liquidPoolCount = 0;
    this.liquidPoolPrimitiveCount = 0;
    this.hotSpotPrimitiveCount = 0;
    this.bloodStainCount = 0;
    this.bloodStainPrimitiveCount = 0;
    this.corpseCount = 0;
    this.corpsePrimitiveCount = 0;
    this.lightSpaceCulledCount = 0;
    this.lightSpaceGateActive = lightSpaceGateActive(context);

    this.collectPackets(decals, bounds, context);
    this.collectPackets(hazards, bounds, context);

    this.primitiveCount = this.radials.length + this.triangles.length;
    this.objectCount = this.sourceCount;
    this.status = this.primitiveCount > 0 ? 'active' : 'inactive';
  }

  collectPackets(packets, bounds, context) {
    for (const packet of packets) {
      if (this.sourceCount >= MAX_DECAL_SOURCES) break;
      const radius = Math.max(2, packet.radius ?? 0);
      if (radius <= 0 || !Number.isFinite(packet.worldX) || !Number.isFinite(packet.worldY)) continue;
      if (packet.worldX + radius < bounds.left || packet.worldY + radius < bounds.top
        || packet.worldX - radius > bounds.right || packet.worldY - radius > bounds.bottom) {
        continue;
      }
      const lightSpaceAlpha = lightSpaceAlphaForWorldCircle(context, packet.worldX, packet.worldY, radius);
      if (lightSpaceAlpha <= 0.015) {
        this.lightSpaceCulledCount += 1;
        continue;
      }

      this.sourceCount += 1;
      if (packet.visualRole === 'corpse_body') {
        const corpse = corpseBodyTriangles(packet, lightSpaceAlpha);
        this.triangles.push(...corpse);
        this.corpseCount += 1;
        this.corpsePrimitiveCount += corpse.length;
      } else if (packet.visualRole === 'ground_hazard') {
        const hazard = hazardRadials(packet, radius, lightSpaceAlpha);
        this.radials.push(...hazard.radials);
        if (hazard.liquidPool) {
          this.liquidPoolCount += 1;
          this.liquidPoolPrimitiveCount += hazard.radials.length;
          this.hotSpotPrimitiveCount += hazard.hotSpotCount;
        }
      } else if (isBloodStain(packet)) {
        const stain = bloodStainRadials(packet, radius, lightSpaceAlpha);
        this.radials.push(...stain);
        this.bloodStainCount += 1;
        this.bloodStainPrimitiveCount += stain.length;
      } else {
        this.radials.push(decalRadial(packet, radius, lightSpaceAlpha));
      }
    }
  }

  render(context) {
    if (this.radials.length) context.scene.drawWorldRadialDiscs(this.radials, context.camera);
    if (this.triangles.length) context.scene.drawTriangles(this.triangles, context.camera);
  }

  statsFields() {
    return {
      mode: this.mode,
      decalMode: DECAL_MODE,
      sourceCount: this.sourceCount,
      primitiveCount: this.primitiveCount,
      liquidPoolCount: this.liquidPoolCount,
      liquidPoolPrimitiveCount: this.liquidPoolPrimitiveCount,
      hotSpotPrimitiveCount: this.hotSpotPrimitiveCount,
      bloodStainCount: this.bloodStainCount,
      bloodStainPrimitiveCount: this.bloodStainPrimitiveCount,
      corpseCount: this.corpseCount,
      corpsePrimitiveCount: this.corpsePrimitiveCount,
      maxSourceCount: MAX_DECAL_SOURCES,
      lightSpaceMode: WEBGL_LIGHT_SPACE_GATE_MODE,
      lightSpaceCullingActive: this.lightSpaceGateActive,
      lightSpaceCulledCount: this.lightSpaceCulledCount
    };
  }
}

function corpseBodyTriangles(packet, lightSpaceAlpha) {
  const alpha = Math.max(0, Math.min(1, packet.opacity ?? 0.9)) * lightSpaceAlpha;
  const body = withAlpha(parseWebGLColor(packet.colour, [0.24, 0.2, 0.18, 1]), alpha * 0.82);
  const detail = withAlpha(parseWebGLColor(packet.detailColour, [0.08, 0.06, 0.06, 1]), alpha * 0.92);
  const length = Math.max(8, packet.worldLength ?? packet.radius * 1.6);
  const width = Math.max(5, packet.worldWidth ?? packet.radius * 0.58);
  const rotation = Number(packet.rotation) || 0;
  const triangles = [];
  if (packet.corpseProfileId === 'werewolf_fallen_body') {
    appendWerewolfCorpse(triangles, packet.worldX, packet.worldY, length, width, rotation, body, detail);
  } else if (packet.corpseProfileId === 'husk_sprawled_body') {
    appendHuskCorpse(triangles, packet.worldX, packet.worldY, length, width, rotation, body, detail);
  } else {
    appendRaiderCorpse(triangles, packet.worldX, packet.worldY, length, width, rotation, body, detail);
  }
  return triangles;
}

function appendRaiderCorpse(triangles, x, y, length, width, rotation, body, detail) {
  appendOrientedEllipse(triangles, x, y, length * 0.34, width * 0.48, rotation, body, 10);
  appendOrientedEllipse(triangles, ...offsetPoint(x, y, rotation, length * 0.39, 0), width * 0.34, width * 0.31, rotation, detail, 8);
  appendOrientedQuad(triangles, x, y, rotation + 0.42, length * 0.72, width * 0.16, detail);
  appendOrientedQuad(triangles, x, y, rotation - 0.5, length * 0.68, width * 0.15, body);
}

function appendHuskCorpse(triangles, x, y, length, width, rotation, body, detail) {
  appendOrientedEllipse(triangles, x, y, length * 0.3, width * 0.54, rotation + 0.14, body, 9);
  appendOrientedEllipse(triangles, ...offsetPoint(x, y, rotation, length * 0.34, -width * 0.08), width * 0.3, width * 0.34, rotation, detail, 7);
  appendOrientedQuad(triangles, ...offsetPoint(x, y, rotation, -length * 0.08, width * 0.1), rotation + 0.72, length * 0.7, width * 0.14, detail);
  appendOrientedQuad(triangles, ...offsetPoint(x, y, rotation, -length * 0.05, -width * 0.08), rotation - 0.9, length * 0.64, width * 0.14, body);
}

function appendWerewolfCorpse(triangles, x, y, length, width, rotation, body, detail) {
  appendOrientedEllipse(triangles, x, y, length * 0.34, width * 0.5, rotation, body, 10);
  appendOrientedEllipse(triangles, ...offsetPoint(x, y, rotation, length * 0.34, 0), width * 0.42, width * 0.36, rotation, detail, 8);
  appendOrientedEllipse(triangles, ...offsetPoint(x, y, rotation, -length * 0.28, 0), width * 0.48, width * 0.44, rotation, body, 8);
  appendOrientedQuad(triangles, ...offsetPoint(x, y, rotation, -length * 0.18, 0), rotation + 0.5, length * 0.7, width * 0.13, detail);
}

function appendOrientedEllipse(triangles, x, y, radiusX, radiusY, rotation, color, segments) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let index = 0; index < segments; index += 1) {
    const a0 = index / segments * Math.PI * 2;
    const a1 = (index + 1) / segments * Math.PI * 2;
    const p0 = rotatedPoint(x, y, Math.cos(a0) * radiusX, Math.sin(a0) * radiusY, cos, sin);
    const p1 = rotatedPoint(x, y, Math.cos(a1) * radiusX, Math.sin(a1) * radiusY, cos, sin);
    triangles.push({ ax: x, ay: y, bx: p0.x, by: p0.y, cx: p1.x, cy: p1.y, color });
  }
}

function appendOrientedQuad(triangles, x, y, rotation, length, width, color) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const points = [
    rotatedPoint(x, y, -length * 0.5, -width * 0.5, cos, sin),
    rotatedPoint(x, y, length * 0.5, -width * 0.5, cos, sin),
    rotatedPoint(x, y, length * 0.5, width * 0.5, cos, sin),
    rotatedPoint(x, y, -length * 0.5, width * 0.5, cos, sin)
  ];
  triangles.push(
    { ax: points[0].x, ay: points[0].y, bx: points[1].x, by: points[1].y, cx: points[2].x, cy: points[2].y, color },
    { ax: points[0].x, ay: points[0].y, bx: points[2].x, by: points[2].y, cx: points[3].x, cy: points[3].y, color }
  );
}

function offsetPoint(x, y, rotation, forward, side) {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return [x + forward * cos - side * sin, y + forward * sin + side * cos];
}

function rotatedPoint(x, y, localX, localY, cos, sin) {
  return { x: x + localX * cos - localY * sin, y: y + localX * sin + localY * cos };
}

function decalRadial(packet, radius, lightSpaceAlpha) {
  const base = parseWebGLColor(packet.colour, [0.12, 0.08, 0.06, 0.28]);
  const alpha = Math.max(0.04, Math.min(0.34, base[3] * (packet.opacity ?? 1))) * lightSpaceAlpha;
  return {
    x: packet.worldX,
    y: packet.worldY,
    radius,
    softness: packet.softness ?? 0.9,
    color: withAlpha(base, alpha)
  };
}

function isBloodStain(packet) {
  return packet.visualMaterial === BLOOD_STAIN_MATERIAL || packet.sourceKind === 'blood_spatter_stain';
}

function bloodStainRadials(packet, radius, lightSpaceAlpha) {
  const seed = stableSeed(packet.id ?? `${packet.worldX}:${packet.worldY}:blood`);
  const opacity = Math.max(0, Math.min(1, packet.opacity ?? 0.86));
  const body = parseWebGLColor(packet.colour, [0.3, 0.015, 0.05, 0.48]);
  const rim = parseWebGLColor(packet.rimColour, [0.08, 0.005, 0.02, 0.3]);
  const alpha = opacity * lightSpaceAlpha;
  const corpsePool = packet.kind === 'corpse_blood_pool';
  const radials = [
    {
      x: packet.worldX,
      y: packet.worldY,
      radius: radius * 1.08,
      softness: Math.max(0.76, packet.softness ?? 0.82),
      color: withAlpha(rim, Math.min(corpsePool ? 0.24 : 0.16, rim[3] * alpha * (corpsePool ? 0.72 : 0.56)))
    },
    {
      x: packet.worldX + radius * signedNoise(seed + 3) * 0.06,
      y: packet.worldY + radius * signedNoise(seed + 5) * 0.05,
      radius: radius * 0.74,
      softness: packet.softness ?? 0.78,
      color: withAlpha(body, Math.min(corpsePool ? 0.34 : 0.24, body[3] * alpha * (corpsePool ? 0.92 : 0.72)))
    }
  ];
  for (let i = 0; i < 5; i += 1) {
    const angle = i * 1.37 + signedNoise(seed + i * 19) * 0.5;
    const offset = radius * (0.12 + pseudo(seed + i * 23) * 0.25);
    const lobeRadius = radius * (0.15 + pseudo(seed + i * 31) * 0.2);
    radials.push({
      x: packet.worldX + Math.cos(angle) * offset,
      y: packet.worldY + Math.sin(angle) * offset * 0.68,
      radius: Math.max(1.5, lobeRadius),
      softness: 0.7,
      color: withAlpha(i % 2 === 0 ? body : rim, Math.min(corpsePool ? 0.22 : 0.18, body[3] * alpha * (corpsePool ? 0.62 : 0.48)))
    });
  }
  return radials;
}

function hazardRadials(packet, radius, lightSpaceAlpha) {
  if (packet.visualMaterial === NAPALM_POOL_MATERIAL || packet.sourceKind === 'napalm_pool') {
    const radials = napalmPoolRadials(packet, radius, lightSpaceAlpha);
    return {
      radials,
      liquidPool: true,
      hotSpotCount: countHotSpots(radials)
    };
  }
  return {
    radials: fallbackHazardRadials(packet, radius, lightSpaceAlpha),
    liquidPool: false,
    hotSpotCount: 0
  };
}

function fallbackHazardRadials(packet, radius, lightSpaceAlpha) {
  const life = Math.max(0, Math.min(1, packet.life01 ?? 1));
  const opacity = Math.max(0, Math.min(1, packet.opacity ?? 0.9)) * life;
  const outer = parseWebGLColor(packet.colour, [0.74, 0.18, 0.04, 0.36]);
  const inner = parseWebGLColor(packet.hotColour, [1, 0.62, 0.18, 0.5]);
  return [
    {
      x: packet.worldX,
      y: packet.worldY,
      radius: radius * 1.18,
      softness: packet.softness ?? 0.72,
      color: withAlpha(outer, Math.max(0.08, Math.min(0.38, outer[3] * opacity)) * lightSpaceAlpha)
    },
    {
      x: packet.worldX,
      y: packet.worldY,
      radius: Math.max(2, radius * 0.55),
      softness: 0.58,
      color: withAlpha(inner, Math.max(0.1, Math.min(0.46, inner[3] * opacity)) * lightSpaceAlpha)
    }
  ];
}

function napalmPoolRadials(packet, radius, lightSpaceAlpha) {
  const life = Math.max(0, Math.min(1, packet.life01 ?? 1));
  const spread = Math.max(0, Math.min(1, packet.spread01 ?? 1));
  const heat = Math.max(0, Math.min(1, packet.heat01 ?? life));
  const opacity = Math.max(0, Math.min(1, packet.opacity ?? 0.68));
  const fade = opacity * Math.max(0.16, life) * (0.46 + spread * 0.54);
  const seed = stableSeed(packet.id ?? `${packet.worldX}:${packet.worldY}`);
  const phase = Number(packet.flickerPhase ?? 0);
  const rim = parseWebGLColor(packet.rimColour, [0.13, 0.04, 0.03, 0.42]);
  const body = parseWebGLColor(packet.colour, [0.58, 0.15, 0.06, 0.46]);
  const cooling = parseWebGLColor(packet.coolingColour, [0.32, 0.08, 0.05, 0.38]);
  const hot = parseWebGLColor(packet.hotColour, [1, 0.49, 0.16, 0.42]);
  const radials = [
    {
      x: packet.worldX,
      y: packet.worldY,
      radius: radius * clampScale(packet.rimScale, 0.8, 1.28, 1.08),
      softness: 0.78,
      color: withAlpha(rim, Math.min(0.28, rim[3] * fade * 0.7) * lightSpaceAlpha)
    },
    {
      x: packet.worldX + radius * signedNoise(seed + 11) * 0.08,
      y: packet.worldY + radius * signedNoise(seed + 17) * 0.08,
      radius: radius * clampScale(packet.bodyScale, 0.55, 1, 0.82),
      softness: 0.54,
      color: withAlpha(body, Math.min(0.4, body[3] * fade) * lightSpaceAlpha)
    }
  ];

  for (let i = 0; i < 4; i += 1) {
    const angle = phase + i * 1.72 + signedNoise(seed + i * 19) * 0.42;
    const offset = radius * (0.13 + pseudo(seed + i * 23) * 0.2);
    const lobeRadius = radius * (0.26 + pseudo(seed + i * 31) * 0.16);
    radials.push({
      x: packet.worldX + Math.cos(angle) * offset,
      y: packet.worldY + Math.sin(angle) * offset * 0.72,
      radius: Math.max(1.1, lobeRadius),
      softness: 0.58,
      color: withAlpha(i % 2 === 0 ? cooling : body, Math.min(0.26, cooling[3] * fade * 0.66) * lightSpaceAlpha)
    });
  }

  const hotSpotCount = Math.max(1, Math.min(3, Math.round(packet.hotSpotCount ?? 2)));
  for (let i = 0; i < hotSpotCount; i += 1) {
    const angle = phase * 0.7 + i * 2.1 + signedNoise(seed + i * 43) * 0.5;
    const offset = radius * (0.09 + pseudo(seed + i * 47) * 0.22);
    const pulse = 0.78 + pseudo(seed + i * 53) * 0.22;
    radials.push({
      x: packet.worldX + Math.cos(angle) * offset,
      y: packet.worldY + Math.sin(angle) * offset,
      radius: Math.max(0.8, radius * clampScale(packet.hotSpotScale, 0.08, 0.24, 0.12) * pulse),
      softness: 0.7,
      color: withAlpha(hot, Math.min(0.16, hot[3] * fade * heat * 0.54) * lightSpaceAlpha),
      liquidHotSpot: true
    });
  }

  return radials;
}

function countHotSpots(radials) {
  return radials.filter((radial) => radial.liquidHotSpot).length;
}

function clampScale(value, min, max, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, next));
}

function stableSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudo(seed) {
  let value = Math.imul(seed ^ 0x9e3779b9, 1597334677);
  value ^= value >>> 15;
  value = Math.imul(value, 3812015801);
  value ^= value >>> 13;
  return ((value >>> 0) % 10000) / 10000;
}

function signedNoise(seed) {
  return pseudo(seed) * 2 - 1;
}
