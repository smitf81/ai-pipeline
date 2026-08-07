# Black Sky Bound Active Slice

Status: Opening Exterior Soundscape v1 completed 2026-08-07. Immediate audio successor: Baby Wyvern First Cry v1.

## Interpreted Task

Continue replacing placeholder-feeling BSB audio with grounded production assets. The opening exterior now has separate recorded-source normal and through-shell palettes for thunder, husk, werewolf and raider events. The most visible remaining identity break is the hatchling's release beat: the opening currently lets the full Mama-wyvern roar own the moment when the newborn should audibly announce itself.

The practical goal is one unmistakably young, vulnerable but dangerous first vocal that belongs to the player hatchling. Mama may answer afterward if the story mix benefits, but her established adult voice must not substitute for or mask the baby identity beat.

## Completed Predecessor

### Opening Exterior Soundscape v1

- Two reusable normal and two opening-only through-shell variations now exist for thunder, werewolf, husk and raider cues.
- All sixteen assets derive from retained real recordings; four obsolete oscillator/noise placeholder renderers were deleted.
- The first four opening beats use family-specific shell derivatives while `husk_now_exposed` returns to the normal husk cue.
- Sources, licences, unaltered originals, aligned stems, 24-bit masters, a portable Audacity session, A/B evidence and deterministic regeneration are retained.
- Full tests, launcher regression, curated build and exact-Desktop-root opening browser proof passed with all assets decoded and zero errors.

## Best Next Slice

### Baby Wyvern First Cry v1

Objective: add a dedicated recorded-source newborn wyvern vocal at the hatchling's first exposed/release beat and stop the full Mama roar from owning that narrative action.

Canonical owner and landing points:

- release timing, narrative order and Mama-answer relationship: `_A_Projects/BLACK_SKY_BOUND_V2/src/data/openingSequence.js` and its opening state owner;
- cue identity and file palette: `_A_Projects/BLACK_SKY_BOUND_V2/src/audio/soundManifest.js`;
- runtime/master/source/session assets: `assets/audio/{production,masters,sources}`;
- proof: a real opening run showing the baby cue at the authored body-release beat, any Mama answer later and subordinate, decoded-file provenance, correct live muffle/exposure and no errors.

Design direction:

- small chest and throat rather than an adult roar;
- first breath, strain and uncertain cry before confidence;
- reptilian/birdlike/crocodilian source identity without cartoon chirps;
- brief enough to read as a single embodied action, with one or two real performance variations if repetition remains plausible.

Explicit exclusions:

- no reuse, resampling or pitch-shift derivation of the Mama roar;
- no generic fantasy-dragon stock roar;
- no shell rock/crack/break replacement in this slice;
- no opening input, emergence animation, spawn, combat or renderer changes;
- no broad opening remix beyond making enough room for the first cry and any later Mama answer.

## Definition of Done

- A dedicated hatchling cue uses recorded-source layers and retains provider page, artist, licence, unaltered original and editable aligned material.
- The vocal reads as newborn and physically small without sounding robotic, comic or like a reduced adult Mama.
- The real opening emits the baby cue at the authored body-release beat; Mama no longer substitutes for it and any Mama answer is later and subordinate.
- The cue is required file audio with no silent procedural fallback, decodes through the exact Desktop launcher and is audible at the correct exposure/muffle state.
- Focused/full tests and the curated build pass; source materials do not enter the public playtest package.

## Follow-up Slices

1. **Egg Shell Interaction Palette v1:** replace rock, crack and break with recorded shell/mineral/organic membrane layers authored from the hatchling's internal perspective.
2. **Opening Mix and Transition v1:** A/B the full sequence and balance exterior threats, shell movement, first cry, later Mama answer, heartbeat and ambience in context.
3. **Remaining Combat Palette:** review claw swipe, lunge body, enemy flesh impacts and player-hit cues in frequency-of-use order.

## Confidence / Uncertainty

- High confidence: no dedicated baby-first-cry production cue currently owns the release beat.
- High confidence: the full adult Mama voice is the wrong identity source for the newborn and must not be pitch-shifted into one.
- Medium confidence: Mama should remain as a later answer; exact timing and level should be decided after hearing the new baby cue in context.
