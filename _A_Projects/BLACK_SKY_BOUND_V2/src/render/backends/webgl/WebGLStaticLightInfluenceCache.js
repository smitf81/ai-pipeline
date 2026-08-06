export class WebGLStaticLightInfluenceCache {
  constructor(buildInfluences) {
    this.buildInfluences = buildInfluences;
    this.entries = new Map();
    this.used = new Set();
    this.hitCount = 0;
    this.missCount = 0;
  }

  beginFrame() {
    this.used.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  resolve(light, profile, composite) {
    if (light.illuminationState !== 'nearby_static') {
      return this.buildInfluences(light, profile, composite);
    }
    const key = String(light.id);
    const signature = signatureFor(light, profile, composite);
    this.used.add(key);
    const cached = this.entries.get(key);
    if (cached?.signature === signature) {
      this.hitCount += 1;
      return cached.influences;
    }
    const influences = this.buildInfluences(light, profile, composite);
    this.entries.set(key, { signature, influences });
    this.missCount += 1;
    return influences;
  }

  endFrame() {
    for (const key of this.entries.keys()) {
      if (!this.used.has(key)) this.entries.delete(key);
    }
    return { hitCount: this.hitCount, missCount: this.missCount, entryCount: this.entries.size };
  }
}

function signatureFor(light, profile, composite) {
  return JSON.stringify([
    light.worldX, light.worldY, light.revealRadius, light.glowRadius, light.coreRadius,
    light.revealStrength, light.glowStrength, light.coreStrength, light.colour, light.innerColour,
    light.revealWarmth, light.softness, light.influenceAlphaScale,
    profile.emitterRevealColour, profile.lightRevealStrength, profile.warmBloomOpacity,
    composite.haloRadiusScale, composite.haloBlendScale, composite.outerBlendScale, composite.coreBlendScale
  ]);
}
