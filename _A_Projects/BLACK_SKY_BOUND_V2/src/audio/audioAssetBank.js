import { collectSoundAssetFiles } from './soundManifest.js';

export class AudioAssetBank {
  constructor(options = {}) {
    this.context = options.context ?? null;
    this.fetchImpl = options.fetchImpl ?? resolveFetch();
    this.entries = new Map();
    this.requiredFiles = new Set();
    this.pointDirectFiles = new Set();
    this.preloadPromise = Promise.resolve([]);
  }

  preloadCues(cues = {}) {
    const fileCues = Object.values(cues).filter((cue) => cue?.source === 'file');
    const files = collectSoundAssetFiles(cues);
    for (const cue of fileCues) {
      if (cue.spatialization === 'point_mono') for (const file of cue.files ?? []) this.pointDirectFiles.add(file);
      if (!cue.required) continue;
      for (const file of [...(cue.files ?? []), ...(cue.environmentFiles ?? [])]) this.requiredFiles.add(file);
    }
    if (!this.context || !this.fetchImpl) return this.preloadPromise;
    this.preloadPromise = Promise.all(files.map((file) => this.load(file)));
    return this.preloadPromise;
  }

  async load(file) {
    const existing = this.entries.get(file);
    if (existing?.status === 'ready') return existing;
    if (existing?.promise) return existing.promise;
    const entry = {
      file,
      required: this.requiredFiles.has(file),
      status: 'loading',
      buffer: null,
      durationSeconds: 0,
      channels: 0,
      sampleRate: 0,
      error: null,
      promise: null
    };
    entry.promise = this.fetchAndDecode(entry);
    this.entries.set(file, entry);
    return entry.promise;
  }

  async fetchAndDecode(entry) {
    try {
      const response = await this.fetchImpl(entry.file, { cache: 'no-store' });
      if (!response?.ok) throw new Error(`http_${response?.status ?? 'unknown'}`);
      const encoded = await response.arrayBuffer();
      const buffer = await this.context.decodeAudioData(encoded.slice(0));
      if (this.pointDirectFiles.has(entry.file) && buffer.numberOfChannels !== 1) {
        throw new Error(`point_direct_requires_mono:${buffer.numberOfChannels}`);
      }
      entry.status = 'ready';
      entry.buffer = buffer;
      entry.durationSeconds = Number(buffer.duration.toFixed(4));
      entry.channels = buffer.numberOfChannels;
      entry.sampleRate = buffer.sampleRate;
      entry.error = null;
    } catch (error) {
      entry.status = 'error';
      entry.error = String(error?.message || error);
      console.error(`[BSB audio] required asset failed: ${entry.file}: ${entry.error}`);
    } finally {
      entry.promise = null;
    }
    return entry;
  }

  get(file) {
    return this.entries.get(file) ?? null;
  }

  select(cue, sequence = 0) {
    const files = cue?.files ?? [];
    if (!files.length) return null;
    const index = Math.abs(Math.trunc(sequence)) % files.length;
    const file = files[index];
    return { file, entry: this.get(file) };
  }

  selectEnvironment(cue, sequence = 0) {
    const files = cue?.environmentFiles ?? [];
    if (!files.length) return null;
    const index = Math.abs(Math.trunc(sequence)) % files.length;
    const file = files[index];
    return { file, entry: this.get(file) };
  }

  snapshot() {
    const files = [...this.entries.values()].map((entry) => ({
      file: entry.file,
      required: entry.required,
      status: entry.status,
      durationSeconds: entry.durationSeconds,
      channels: entry.channels,
      sampleRate: entry.sampleRate,
      error: entry.error
    }));
    const required = files.filter((entry) => entry.required);
    return {
      mode: this.context ? 'browser_buffer_assets' : 'headless_no_audio_context',
      requiredCount: this.requiredFiles.size,
      requiredReady: this.requiredFiles.size > 0
        && required.length === this.requiredFiles.size
        && required.every((entry) => entry.status === 'ready'),
      readyCount: files.filter((entry) => entry.status === 'ready').length,
      loadingCount: files.filter((entry) => entry.status === 'loading').length,
      errorCount: files.filter((entry) => entry.status === 'error').length,
      files
    };
  }
}

function resolveFetch() {
  if (typeof globalThis.fetch !== 'function') return null;
  return globalThis.fetch.bind(globalThis);
}
