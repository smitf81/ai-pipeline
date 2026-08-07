import { createEmptyAudioTuning, normalizeAudioTuning } from '../data/audio/audioTuning.js';

const AUDIO_TUNING_ENDPOINT = '/api/tuning/audio-overrides';

export async function loadAudioTuningFromServer() {
  if (typeof fetch !== 'function') return blocked('fetch_unavailable');
  try {
    const response = await fetch(AUDIO_TUNING_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) return blocked(`load_failed_${response.status}`);
    const payload = await response.json();
    return { ok: true, tuning: normalizeAudioTuning(payload).tuning, source: 'file_api' };
  } catch (error) {
    return blocked(error?.message ?? 'load_failed');
  }
}

export async function saveAudioTuningToServer(tuning) {
  if (typeof fetch !== 'function') return blocked('fetch_unavailable');
  try {
    const response = await fetch(AUDIO_TUNING_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizeAudioTuning(tuning).tuning)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return blocked(payload?.error ?? `save_failed_${response.status}`);
    return { ok: true, tuning: normalizeAudioTuning(payload?.tuning ?? payload).tuning, source: 'file_api' };
  } catch (error) {
    return blocked(error?.message ?? 'save_failed');
  }
}

function blocked(reason) {
  return { ok: false, reason, tuning: createEmptyAudioTuning(), source: 'unavailable' };
}
