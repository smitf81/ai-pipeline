# Black Sky Bound Active Slice

Status: Baby Wyvern Bite Production Replacement v2 completed 2026-08-06. Immediate audio successor: Opening Exterior Soundscape v1.

## Interpreted Task

Continue replacing placeholder-feeling BSB audio with grounded production assets. The combat bite now has a real-source three-variant palette; the opening remains the next most visible identity break because its storm and exterior creatures are procedural oscillators heard through a runtime muffle filter.

The practical goal is an authored inside-egg soundscape: recognisable physical events outside a closed shell, obscured by distance, shell mass and the hatchling's bodily perspective without becoming dull or unintelligible.

## Completed Predecessor

### Baby Wyvern Bite Production Replacement v2

- Three real-source 0.48-second variations replaced the rejected two-file synthetic palette.
- Jaw closure moved from 128-142 ms to 195 ms, matching the 197 ms animation contact point.
- The old procedural generator no longer owns or can overwrite `player_bite_snap`.
- Masters, originals, aligned stems, portable Audacity session, source/licence record, comparison reel, analysis and browser proof are retained.
- Full tests, launcher regression, curated build and exact-Desktop-root browser playtest passed.

## Best Next Slice

### Opening Exterior Soundscape v1

Objective: replace the four synthetic exterior cues heard before shell release with recorded-source production assets and author their closed-shell perspective in the assets as well as through the existing runtime muffle state.

Target cue set:

- `world.storm.thunder`;
- `enemy.husk.distant_gargle`;
- `enemy.werewolf.distant_howl`;
- `enemy.raider.distant_shout`.

Canonical owner and landing points:

- event order, narrative intent and shell state: `_A_Projects/BLACK_SKY_BOUND_V2/src/data/openingSequence.js`;
- cue identity and file palette: `_A_Projects/BLACK_SKY_BOUND_V2/src/audio/soundManifest.js`;
- dynamic perspective mix: existing opening-state path in `src/audio/audioDirector.js`;
- runtime/master/source/session assets: `assets/audio/{production,masters,sources}`;
- proof: opening-sequence event order plus a real browser hatch run with decoded-file and `muffleAtPlay` diagnostics.

Explicit exclusions:

- no baby-first-cry implementation in this slice;
- no reuse or pitch-shift derivation of Mama's voice for the baby;
- no shell crack/break replacement unless source research exposes a uniquely coherent, low-risk companion set;
- no changes to opening input timing, egg-break progression, creature spawning or combat;
- no generic fantasy ambience bed pasted under the entire sequence.

## Definition of Done

- Every target cue uses recorded-source layers and retains source URL, provider, artist, licence, unaltered original and editable aligned material.
- Each event remains individually legible through a closed-shell perspective: attenuated upper frequencies, transmitted low/body energy, constrained stereo width and event-specific distance, without merely applying one blanket low-pass preset.
- Runtime cues remain file-backed and required, with bounded variation and no silent procedural fallback.
- The real opening sequence emits the target cues in authored order, decoded files play, `muffleAtPlay` follows shell state, and the exact Desktop launcher/browser diagnostics report no errors.
- Full tests and the curated build pass; source materials do not enter the public playtest package.

## Follow-up Slices

1. **Baby Wyvern First Cry v1:** add a dedicated newborn vocal at the release beat and remove Mama's full roar from that narrative role. Mama may answer later, but must not mask the hatchling identity beat.
2. **Egg Shell Interaction Palette v1:** replace rock, crack and break with recorded shell/mineral/organic membrane layers authored from the hatchling's internal perspective.
3. **Opening Mix and Transition v1:** A/B the full sequence, expose the high-frequency world as the shell opens, and balance exterior threats, shell movement, first cry, Mama answer, heartbeat and ambience in context.
4. **Remaining Combat Palette:** review claw swipe, lunge body, enemy flesh impacts and player-hit cues in frequency-of-use order.

## Confidence / Uncertainty

- High confidence: the current thunder, husk, werewolf and distant-raider opening cues are procedural and runtime muffling alone cannot provide recorded physical identity.
- High confidence: no baby-first-cry cue currently exists, while `mama_answering_roar` schedules the full Mama cue after release.
- Medium confidence: the four exterior events belong in one soundscape slice because their perspective must translate consistently; shell-contact transients are safer as a separate palette.
