# Baby Wyvern First Cry v1

## Outcome

The opening emergence beat now belongs to the hatchling. It plays `player.voice.first_cry` from the player actor's mouth/head emitter and no longer schedules Mama's distant roar as a substitute.

The production identity is newborn, effortful and reptilian: a short strained air edge, a tiny-croc distress contour, and quiet irregular gecko throat/chest texture. It is deliberately vulnerable rather than dominant and contains no generic dragon roar.

## Canonical truth flow

```text
OPENING transition: OPENING -> EMERGING
  -> player.voice.first_cry
  -> stable actor sourceRef using game.dragonId
  -> player AudioEmitter voice role
  -> normal mono production variation
  -> live egg enclosure + world occlusion
  -> HRTF PannerNode
  -> player bus
```

The opening sequence owns timing. The player actor owns source position and cue role. The sound manifest owns the required two-file production palette. The spatial runtime owns shell transmission. No second timing path, baked through-shell asset or centred fallback remains.

Mama retains her later world-event/smoke-transition roles; only the incorrect opening-emergence substitution was removed.

## Source and production

Retained source recordings and licence details are in `assets/audio/sources/baby_wyvern_first_cry_v1/`. All source pages declare use under the Pixabay Content License:

- Tiny Croc Chirp — iwanPlays (Freesound), dominant distress contour.
- Gecko — u_xg7ssi08yr, irregular throat/body texture.
- Crocodile Hissing — DRAGON-STUDIO, brief strained breath edge.

`tools/audio/generate_baby_wyvern_first_cry_v1.py` deterministically imports the originals once, then records exact hashes, windows, rate changes, processing and output hashes in `PRODUCTION_ANALYSIS.json`.

Outputs:

- two 1.85-second, 48 kHz mono runtime WAVs;
- two aligned 24-bit masters;
- six aligned real-source stems;
- Audacity-compatible LOF session and reference mixes;
- Mama-versus-hatchling A/B reel and waveform/spectrum contact sheet.

The assets use no oscillator, generated noise, Mama source, generic fantasy roar or baked egg filter.

## Runtime behaviour

The first cry is queued exactly once when the shell-opening phase hands off to emergence. `createOpeningSequenceState` requires the actual player entity ID for an enabled opening, so an unresolved point owner fails at state construction rather than degrading to centred playback.

The same normal cue is reusable after the opening. During emergence the live enclosure changes its cutoff and transmission gain continuously as the shell opens; after release it returns to full-bandwidth world playback.

## Evidence

`npm run smoke:first-cry` drives the real six-input opening in Chromium. The proof observes:

- source owner `young_dragon_1`, cue role `firstCry`;
- 0.163 m listener distance and a live Panner voice;
- live emergence transmission at 3005 Hz / gain 0.727;
- both mono variations decoded at 48 kHz and rotated;
- no opening Mama cue and zero audio/console/page/request/HTTP errors.

Evidence lives in `artifacts/baby-wyvern-first-cry-v1/`. The inspected screenshot is `01-hatchling-first-cry-emergence.png`; the easy human-ear comparison is `mama-vs-hatchling-comparison-reel.wav`.
