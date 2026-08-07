import { SceneLightSourceKind } from '../data/sceneLights.js';

export function createLightningThunderBridge() {
  return new LightningThunderBridge();
}

class LightningThunderBridge {
  constructor() {
    this.observedKeys = new Set();
    this.keyOrder = [];
    this.pending = [];
    this.recent = [];
    this.thunderCount = 0;
  }

  collect(game, timeMs) {
    const player = findPlayer(game);
    for (const light of game?.lights ?? []) {
      if (light?.sourceKind !== SceneLightSourceKind.LIGHTNING || !light.stormEvent) continue;
      const event = light.stormEvent;
      const key = `${event.eventIndex}:${event.eventStart}:${event.sourceEventId ?? 'scheduled'}`;
      if (this.observedKeys.has(key)) continue;
      this.rememberKey(key);
      const distanceTiles = player ? Math.hypot((light.x ?? 0) - player.x, (light.y ?? 0) - player.y) : 24;
      const delayMs = Math.round(520 + Math.min(1700, distanceTiles * 24));
      const pending = {
        key,
        dueAtMs: timeMs + delayMs,
        flashAtMs: timeMs,
        delayMs,
        distanceTiles: rounded(distanceTiles),
        intensity: clamp01(0.56 + (light.intensity ?? 0.6) * 0.44),
        sourceEventId: event.sourceEventId ?? null
      };
      this.pending.push(pending);
      this.pending.sort((a, b) => a.dueAtMs - b.dueAtMs);
      while (this.pending.length > 8) this.pending.shift();
      this.recent.push({
        key,
        flashAtMs: Math.round(timeMs),
        thunderDueAtMs: Math.round(pending.dueAtMs),
        delayMs,
        distanceTiles: pending.distanceTiles,
        sourceEventId: pending.sourceEventId,
        firedAtMs: null
      });
      while (this.recent.length > 12) this.recent.shift();
    }
  }

  process(timeMs, muffleIntensity, playCue) {
    const ready = this.pending.filter((entry) => entry.dueAtMs <= timeMs);
    this.pending = this.pending.filter((entry) => entry.dueAtMs > timeMs);
    for (const entry of ready) {
      const played = playCue('world.storm.thunder', {
        intensity: entry.intensity,
        reason: 'lightning_flash_delayed_thunder',
        lightningKey: entry.key,
        muffleAtPlay: muffleIntensity
      });
      const recent = this.recent.find((candidate) => candidate.key === entry.key);
      if (recent) recent.firedAtMs = Math.round(timeMs);
      if (played) this.thunderCount += 1;
    }
  }

  snapshot() {
    return {
      pendingThunder: this.pending.map((entry) => ({
        key: entry.key,
        dueAtMs: Math.round(entry.dueAtMs),
        delayMs: entry.delayMs,
        distanceTiles: entry.distanceTiles,
        sourceEventId: entry.sourceEventId
      })),
      recentStrikes: this.recent.map((entry) => ({ ...entry })),
      thunderCount: this.thunderCount
    };
  }

  rememberKey(key) {
    this.observedKeys.add(key);
    this.keyOrder.push(key);
    while (this.keyOrder.length > 32) this.observedKeys.delete(this.keyOrder.shift());
  }
}

function findPlayer(game) {
  return (game?.actors ?? []).find((actor) => actor.id === game.dragonId)
    ?? (game?.actors ?? []).find((actor) => actor.team === 'player')
    ?? null;
}

function rounded(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(3)) : 0;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
