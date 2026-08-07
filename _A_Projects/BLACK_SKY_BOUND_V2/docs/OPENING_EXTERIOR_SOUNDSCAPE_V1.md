# Opening Exterior Soundscape v1

## Outcome

The opening's synthetic thunder roll, oscillator werewolf howl, generated husk gargle and oscillator raider shout have been replaced by recorded-source production palettes.

Each family now owns two perspectives:

| Family | Reusable normal cue | Opening-only shell cue |
| --- | --- | --- |
| Thunder | `world.storm.thunder` | `opening.exterior.thunder_through_shell` |
| Werewolf | `enemy.werewolf.distant_howl` | `opening.exterior.werewolf_through_shell` |
| Husk | `enemy.husk.distant_gargle` | `opening.exterior.husk_through_shell` |
| Raider | `enemy.raider.distant_shout` | `opening.exterior.raider_through_shell` |

The normal assets were authored first and remain available for lightning, smoke-awakening and later world/enemy events. The opening does not permanently muffle those canonical gameplay cues. Instead, its first four exterior beats use separately rendered source-derived shell variants. The late `husk_now_exposed` beat deliberately returns to `enemy.husk.distant_gargle`, making the change in perspective explicit.

## Before and after

Before:

- one seeded noise/oscillator thunder renderer;
- one triangle/sawtooth oscillator predator call;
- one sawtooth plus filtered-noise husk renderer;
- one sawtooth/triangle human-call renderer;
- one shared runtime low-pass did nearly all of the opening perspective work.

After:

- two real dry-thunder performances selected from a retained field recording;
- two real wolf performances, one solo and one pack/ridge call;
- two human-performed wet-airway husk variations with restrained real gargle detail;
- two human raider yells from the previously retained and licensed raider source;
- two full-range normal variations and two matched opening derivatives per family;
- separate event-specific shell ceilings, body-conduction bands, cavity smears and stereo-collapse values, followed by the existing live shell-opening muffle transition.

No synthetic noise, oscillator, replacement voice or Mama-wyvern vocal is present in the sixteen production files.

## Perspective design

The source asset and the runtime opening mix have separate jobs:

1. Normal assets preserve the recorded identity, full useful band and source-derived early distance reflections.
2. Opening derivatives model family-specific wall transmission and body conduction inside the egg.
3. `resolveOpeningMix()` and `AudioBusGraph.setMuffleIntensity()` continue to open the shared low-pass from a sealed value of `0.8` toward `0` as exposure increases.

This prevents a baked egg sound from leaking into normal gameplay while retaining a continuous opening transition.

## Sources and licence

Provider pages, artist names, the Pixabay Content License, hashes and exact selected windows are retained in:

- `assets/audio/sources/opening_exterior_v1/SOURCE_AND_LICENSE.md`
- `assets/audio/sources/opening_exterior_v1/PRODUCTION_ANALYSIS.json`

Five untouched downloads live in `opening_exterior_v1/originals/`. The raider cue reuses the untouched `(Male) Grunts and Yells` recording already retained under `raider_warning_v1/originals/`.

## Editable and comparison material

- Normal and shell aligned stems: `assets/audio/sources/opening_exterior_v1/processed_stems/`
- Portable Audacity session: `assets/audio/sources/opening_exterior_v1/audacity_session/opening_exterior_v1.lof`
- 24-bit masters: `assets/audio/masters/`
- 16-bit runtime files: `assets/audio/production/`
- A/B reel: `artifacts/opening-exterior-v1/normal-vs-through-shell-comparison-reel.wav`
- Waveform/spectrum sheet: `artifacts/opening-exterior-v1/normal-vs-through-shell-contact-sheet.png`

The artifacts directory is intentionally ignored; the retained source analysis and editable material are tracked.

## Reproduction

From the project root:

```powershell
.\tools\audio\.venv\Scripts\python.exe -m pip install -r tools\audio\requirements-opening-exterior-v1.txt
.\tools\audio\.venv\Scripts\python.exe tools\audio\generate_opening_exterior_v1.py
```

The generator deterministically rewrites the stems, masters, runtime assets, comparison reel, contact sheet and machine-readable analysis from the retained recordings.

## Runtime ownership

- `src/data/openingSequence.js` owns the authored order, perspective labels and the normal-versus-shell cue choice.
- `src/audio/soundManifest.js` owns cue identity, file variations, bus, level and required-asset behavior.
- `src/audio/audioStateMath.js` and `src/audio/audioBus.js` own the exposure-driven live shell muffle.
- `src/audio/proceduralOneShots.js` no longer contains callable thunder, werewolf, husk or distant-shout placeholder renderers.

Required file failures remain explicit in Audio Director diagnostics; none of these cues silently falls back to synthesis.
