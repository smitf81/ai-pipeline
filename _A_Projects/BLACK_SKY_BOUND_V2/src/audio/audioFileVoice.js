export function startDecodedFileVoice(director, cue, outputGain, pitch, sequence, loop = false, options = {}) {
  const selected = options.environment === true
    ? director.assets.selectEnvironment(cue, sequence)
    : director.assets.select(cue, sequence);
  if (!selected?.file || selected.entry?.status !== 'ready' || !selected.entry.buffer) {
    const status = selected?.entry?.status ?? 'not_registered';
    director.recordPlaybackError(cue, selected?.file ?? null, `required_asset_${status}`);
    return null;
  }
  const context = director.bus.context;
  const source = context.createBufferSource();
  source.buffer = selected.entry.buffer;
  if (source.playbackRate?.setValueAtTime) {
    source.playbackRate.setValueAtTime(pitch, context.currentTime);
  } else if (source.playbackRate) {
    source.playbackRate.value = pitch;
  }
  source.loop = loop;
  source.connect(outputGain);
  const duration = selected.entry.buffer.duration;
  const offset = loop && duration > 0 ? Math.max(0, Number(options.offsetSeconds) || 0) % duration : 0;
  source.start(context.currentTime, offset);
  return {
    source: 'file',
    file: selected.file,
    mode: loop ? 'decoded_file_buffer_loop' : null,
    tonal: false,
    durationMs: selected.entry.buffer.duration * 1000 / Math.max(0.01, pitch),
    nodes: [source],
    sourceNode: source
  };
}
