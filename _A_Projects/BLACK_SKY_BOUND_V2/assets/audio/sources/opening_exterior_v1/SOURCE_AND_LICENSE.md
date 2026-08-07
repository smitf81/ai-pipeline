# Opening exterior soundscape v1 - sources and licence

## Design boundary

This source bundle produces two deliberately separate perspectives for four cues:

- reusable full-range weather, werewolf, husk and raider assets for normal gameplay;
- separately rendered, source-derived opening variants heard through the egg shell.

The normal assets remain reusable after opening; the opening sequence never claims them as permanently muffled source material.

The shell variants are not the normal assets hidden behind one generic preset. Each family has its own wall-transmission ceiling, body-conduction band, cavity smear and stereo collapse, followed at runtime by the existing opening-state muffle transition. No generated voice, oscillator, synthetic noise layer, or Mama-wyvern vocal is present in these production files.

## Newly retained sources

All five files below were downloaded unchanged from their visible Pixabay provider pages on 2026-08-07 and are preserved in `originals/`.

### Thunder, dry distant rolling, field, NOTL, 2011

- Artist: `TRP (Freesound)`
- Provider page: <https://pixabay.com/sound-effects/nature-thunder-dry-distant-rolling-field-notl-2011-48804/>
- Preserved file: `originals/thunder-dry-distant-rolling-field-notl-2011-48804.mp3`

### Wolf howl

- Artist: `NaturesTemper (Freesound)`
- Provider page: <https://pixabay.com/sound-effects/nature-wolf-howl-6310/>
- Preserved file: `originals/wolf-howl-6310.mp3`

### Wolves

- Artist: `Paresh (Freesound)`
- Provider page: <https://pixabay.com/sound-effects/nature-wolves-76744/>
- Preserved file: `originals/wolves-76744.mp3`

### Gurgling monster

- Artist: `Darsycho (Freesound)`
- Provider page: <https://pixabay.com/sound-effects/horror-gurgling-monster-65641/>
- Preserved file: `originals/gurgling-monster-65641.mp3`

### Gargles

- Artist: `Bronxio (Freesound)`
- Provider page: <https://pixabay.com/sound-effects/people-gargles-63643/>
- Preserved file: `originals/gargles-63643.mp3`

## Reused retained raider source

The raider palette reuses the unchanged real human performance already retained for `raider_warning_v1` rather than downloading or inventing another voice:

- Title: `(Male) Grunts and Yells`
- Artist: `jozef_sound (Freesound)`
- Provider page: <https://pixabay.com/sound-effects/people-male-grunts-and-yells-65945/>
- Canonical retained file: `../raider_warning_v1/originals/male-grunts-and-yells-65945.mp3`

The other retained raider-warning recordings and their licence record remain documented in `../raider_warning_v1/SOURCE_AND_LICENSE.md`.

## Licence

Every provider page marks its recording as free for use under the Pixabay Content License:

<https://pixabay.com/service/license-summary/>

The licence permits modification and incorporation into a larger creative work, including commercial work, subject to its restrictions on standalone redistribution and other prohibited uses. Attribution is not required, but each source and artist is credited here deliberately. Exact source hashes, durations, selected windows and every runtime/master hash are retained in `PRODUCTION_ANALYSIS.json`.

## Editable material

- `processed_stems/normal/` retains the aligned recorded identity and source-derived normal-distance/body layers.
- `processed_stems/through_shell/` retains the event-specific wall-transmission and body-conduction layers.
- `audacity_session/opening_exterior_v1.lof` opens each aligned stem pair beside its 24-bit master in Audacity.
- `artifacts/opening-exterior-v1/normal-vs-through-shell-comparison-reel.wav` provides an ordered A/B reel.
