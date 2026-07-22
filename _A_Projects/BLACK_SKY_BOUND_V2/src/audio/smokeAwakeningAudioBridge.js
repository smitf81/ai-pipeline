export function createSmokeAwakeningAudioBridge(audio) {
  let observedScene = null;
  let observedSequence = 0;
  return {
    sync(scene) {
      if (scene !== observedScene) {
        observedScene = scene;
        observedSequence = 0;
      }
      const events = (scene?.audio?.events ?? []).filter((event) => event.sequence > observedSequence);
      for (const event of events) {
        audio.playCue(event.cueId, {
          intensity: event.intensity,
          reason: event.reason,
          perspective: 'night_forest_instinct_transition',
          openingPhase: scene.phase
        });
        observedSequence = Math.max(observedSequence, event.sequence);
      }
      return events.length > 0;
    }
  };
}

