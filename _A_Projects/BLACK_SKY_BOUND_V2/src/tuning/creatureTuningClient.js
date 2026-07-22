import { createEmptyCreatureTuning, normalizeCreatureTuning } from '../data/creatures/creatureTuning.js';

const TUNING_ENDPOINT = '/api/tuning/creature-overrides';

export async function loadCreatureTuningFromServer() {
  if (typeof fetch !== 'function') return blocked('fetch_unavailable');
  try {
    const response = await fetch(TUNING_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) return blocked(`load_failed_${response.status}`);
    const payload = await response.json();
    return { ok: true, tuning: normalizeCreatureTuning(payload).tuning, source: 'file_api' };
  } catch (error) {
    return blocked(error?.message ?? 'load_failed');
  }
}

export async function saveCreatureTuningToServer(tuning) {
  if (typeof fetch !== 'function') return blocked('fetch_unavailable');
  try {
    const response = await fetch(TUNING_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizeCreatureTuning(tuning).tuning)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return blocked(payload?.error ?? `save_failed_${response.status}`);
    return { ok: true, tuning: normalizeCreatureTuning(payload?.tuning ?? payload).tuning, source: 'file_api' };
  } catch (error) {
    return blocked(error?.message ?? 'save_failed');
  }
}

function blocked(reason) {
  return { ok: false, reason, tuning: createEmptyCreatureTuning(), source: 'unavailable' };
}
