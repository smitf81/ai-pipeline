export function startDecodedFileVoice(director, cue, outputGain, pitch, sequence, loop = false) {
  const selected = director.assets.select(cue, sequence);
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
  source.start(context.currentTime);
  return {
    source: 'file',
    file: selected.file,
    mode: loop ? 'decoded_file_buffer_loop' : null,
    tonal: false,
    durationMs: selected.entry.buffer.duration * 1000 / Math.max(0.01, pitch),
    nodes: [source]
  };
}
