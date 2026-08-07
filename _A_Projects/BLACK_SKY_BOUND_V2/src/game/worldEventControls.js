import {
  MamaWyvernEventKind,
  queueMamaWyvernWorldEvent,
  setMamaWyvernAutoEventsEnabled
} from '../data/mamaWyvernWorldEvents.js';
import { AudioEventType } from '../audio/soundEvents.js';

export function createWorldEventDebugControls(state) {
  return {
    trigger(kind = MamaWyvernEventKind.FLYOVER, options = {}) {
      return queueMamaWyvernWorldEvent(state.game.worldEvents, normalizeKind(kind), options);
    },
    flyover(options = {}) {
      return queueMamaWyvernWorldEvent(state.game.worldEvents, MamaWyvernEventKind.FLYOVER, options);
    },
    inferno(options = {}) {
      return queueMamaWyvernWorldEvent(state.game.worldEvents, MamaWyvernEventKind.INFERNO, options);
    },
    lightningFlyover(options = {}) {
      return queueMamaWyvernWorldEvent(state.game.worldEvents, MamaWyvernEventKind.FLYOVER, { ...options, lightningSync: true });
    },
    lightningInferno(options = {}) {
      return queueMamaWyvernWorldEvent(state.game.worldEvents, MamaWyvernEventKind.INFERNO, { ...options, lightningSync: true });
    },
    setAutoEnabled(enabled) {
      return setMamaWyvernAutoEventsEnabled(state.game.worldEvents, enabled);
    },
    snapshot() {
      return JSON.parse(JSON.stringify(state.game.worldEvents));
    }
  };
}

export function applyWorldEventDebugQuery(controls, search = '') {
  const params = new URLSearchParams(search);
  if (params.get('mamaAuto') === '0') controls.setAutoEnabled(false);
  const requested = params.get('mamaEvent');
  if (!requested) return null;
  if (requested === 'flyover') return controls.flyover({ source: 'query_debug_control' });
  if (requested === 'inferno') return controls.inferno({ source: 'query_debug_control' });
  if (requested === 'lightning-flyover') return controls.lightningFlyover({ source: 'query_debug_control' });
  if (requested === 'lightning-inferno') return controls.lightningInferno({ source: 'query_debug_control' });
  throw new Error(`unknown_mama_event_query:${requested}`);
}

export function createWorldEventAudioBridge(audio) {
  let observedGame = null;
  let observedSequence = 0;
  return {
    sync(game) {
      if (game !== observedGame) {
        observedGame = game;
        observedSequence = 0;
      }
      const event = game?.worldEvents?.audio;
      if (!event || event.sequence <= observedSequence) return false;
      const unseen = Array.isArray(event.events) && event.events.length
        ? event.events.filter((receipt) => receipt.sequence > observedSequence)
        : [event];
      for (const receipt of unseen.sort((a, b) => a.sequence - b.sequence)) {
        observedSequence = Math.max(observedSequence, receipt.sequence);
        audio.emit(receipt.eventType ?? AudioEventType.MAMA_WYVERN_ROAR, {
          sourceEventId: receipt.sourceEventId,
          sourceRef: receipt.sourceRef,
          cueId: receipt.cueId,
          intensity: 1
        });
      }
      return unseen.length > 0;
    }
  };
}

function normalizeKind(kind) {
  if (kind === 'flyover') return MamaWyvernEventKind.FLYOVER;
  if (kind === 'inferno') return MamaWyvernEventKind.INFERNO;
  return kind;
}
