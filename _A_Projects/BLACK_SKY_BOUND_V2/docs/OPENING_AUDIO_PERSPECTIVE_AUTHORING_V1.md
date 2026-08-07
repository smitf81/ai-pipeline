# Opening Audio Perspective Authoring v1

## Outcome

The opening's through-egg perspective is now a governed BSB tuning domain exposed in AXIOM Entity Studio. A sound designer can make the sealed shell darker, quieter or slower to open acoustically, Preview the change against the real opening, Revert it, or Apply it with persisted readback.

This slice does not claim listener-relative 3D audio. The runtime truth shown in AXIOM and Audio Director diagnostics is `authored_distance_non_positional_shell_transmission`.

## Canonical ownership

- Defaults, ranges and validation: `src/data/audio/audioTuning.js`
- Persisted project overrides: `tuning/audio-overrides.json`
- Runtime consumption: `src/audio/audioDirector.js`, `src/audio/audioPressureMix.js` and `src/audio/audioBus.js`
- Launcher API: `GET`/`PUT /api/tuning/audio-overrides`
- AXIOM bridge: the `bsb.opening-audio-perspective-tuning` provider in `src/tuning/entityAuthoringRuntime.js`

Creature tuning and Map Forge do not own these values. AXIOM edits a non-committed candidate, the BSB runtime owns preview/revert, and Apply writes through the BSB audio API before verified readback.

## Authoring fields

| Field | Default | Range | Runtime effect |
| --- | ---: | ---: | --- |
| Sealed cutoff | 560 Hz | 240-4200 Hz | Low-pass ceiling at a fully sealed shell |
| Exterior level | 0.46 | 0.10-1.00 | Gain applied to opening exterior soundscape cues |
| Maximum muffle | 0.92 | 0.50-1.00 | Strongest closed-shell muffle intensity |
| Crack light leakage | 0.32 | 0.10-0.80 | How strongly shell-opening progress exposes the outside mix |
| Emergence exposure | 1.15 | 0.50-2.00 | How quickly emergence removes the shell perspective |

The default 560 Hz cutoff, 46% exterior level and 0.92 maximum muffle intentionally make the sealed egg thicker than the previous fixed mix. They are starting values for human playtesting, not an assertion that the balance is final.

## What “distance” currently means

The four exterior sound families have normal versions plus separately rendered through-shell derivatives. Their perceived distance, reflections, bandwidth loss and narrowed stereo image are authored into those WAV files. Runtime event intensity and the opening exterior gain then control level.

There is currently:

- no `PannerNode`;
- no sound-source or listener coordinates;
- no `distanceModel`, `refDistance`, `maxDistance` or `rolloffFactor`;
- no listener-relative azimuth, stereo pan or Doppler projection;
- no spatial emitter attached to the thunder, husk, werewolf or raider opening cues.

Enemy proximity can decide when a warning is eligible and how intense it is, but it is not a spatial falloff implementation. AXIOM therefore labels the current path “authored distance · non-positional” and shows “3D falloff not active.”

True emitter/listener attenuation belongs to the later Spatial Audio Emitter Foundation slice, after Baby Wyvern First Cry v1.

## Runtime flow

1. Browser boot reads the audio override document independently of creature tuning.
2. Audio Director resolves defaults plus overrides and publishes effective tuning diagnostics.
3. The opening lifecycle produces shell exposure from opening and emergence progress.
4. `resolveOpeningMix()` derives effective muffle, cutoff and exterior gain.
5. Audio Bus applies the cutoff; opening soundscape cues consume the exterior gain.
6. AXIOM Preview updates that live runtime path and restarts the real opening for audition.
7. Apply persists, reloads and verifies the same field value through the canonical BSB owner.

Audio unlock now becomes complete only after the context resumes and all required asset preloads settle. This prevents a required production loop from being scheduled while its asset is still in `loading` state.

## Evidence

The Entity Studio Playwright proof changed the sealed cutoff from 560 Hz to 520 Hz, drove four real egg-opening inputs and observed three shell exterior cues. The Audio Bus reported 520 Hz, the first storm cue consumed the 0.46 exterior gain at 0.92 muffle, Apply persisted to `tuning/audio-overrides.json`, iframe reload read back 520 Hz, and all protected files were restored. It reported zero unexpected console, page, HTTP or request failures.

Evidence is written under `AXIOM/apps/launcher/output/playwright/entity-studio/`. The full BSB and AXIOM test suites, exact-root launcher test, line-of-code gate, curated playtest build and `git diff --check` are the release gates for this slice.
