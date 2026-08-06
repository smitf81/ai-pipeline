# Production SFX Creation and Replacement Pass v1

Date: 2026-07-16

> Historical note (2026-08-06): the procedural baby-wyvern bite documented below was rejected in playtesting as cartoon-like and bonk-y. `player.bite.snap` is now owned by the real-source three-variant pipeline documented in `docs/PLAYER_BITE_PRODUCTION_V2.md`; `tools/audio/generate_production_sfx.py` no longer renders or overwrites bite files. Flesh impacts and the historical Mama exploration remain owned by this v1 pass.

## Outcome

Three existing gameplay categories now use original, file-backed production SFX through the canonical Audio Director:

1. player creature action: `player.bite.snap`;
2. combat interaction: `combat.enemy.hit.flesh`;
3. world event: `world.mama_wyvern.distant_roar`.

The former Web Audio synthesized placeholders are retired for these cues. Their manifest entries are required file sources and do not silently fall back to synthesis.

All audio in this pass was generated procedurally inside the repository. No film, game, animal-recording, stock-library, downloaded, or AI-service audio was sampled or incorporated.

## Selected targets

### Baby wyvern bite

- Gameplay event: the third committed player melee combo action, `bite_attack`.
- Cue: `player.bite.snap`.
- Previous state: synthesized Web Audio one-shot behind non-existent placeholder file identifiers.
- Selection reason: a frequently reachable player action with weak physical information in the placeholder.
- Direction: vulnerable young creature scale, throat tension and air motion before a hard jaw/tooth transient, with a short low body tail.

### Enemy flesh impact

- Gameplay event: accepted player damage against an enemy.
- Cue: `combat.enemy.hit.flesh`.
- Previous state: synthesized Web Audio impact behind non-existent placeholder file identifiers.
- Selection reason: high-frequency combat feedback shared by real enemy damage events.
- Direction: low body thud, wet midrange contact, cloth/skin tear, small resonant details, and restrained grit rather than another bass-heavy generic hit.

### Mama Wyvern distant roar

- Gameplay event: the `warning_roar` phase of the existing Mama Wyvern flyover/inferno world event.
- Cue: `world.mama_wyvern.distant_roar`.
- Previous state: short synthesized Web Audio distant-call placeholder behind a non-existent file identifier.
- Selection reason: the highest-value world-scale cue and a major source of danger before Mama is visible.
- Direction: high-level creature-presence inspiration only from grounded giant-animal cinema; no imitation, reproduction, or sampling. The target anatomy is an enormous reptilian animal with a loading inhale, deep lung/chest resonance, unstable multi-chamber throat warble, crocodilian pulse texture, wet gargling decay, tearing peak exhale, restrained upper rasp, and a forest-scale tail.

## Final assets

All files are PCM WAV at 48 kHz. Masters are 24-bit; runtime files are 16-bit.

| Effect | Master | Runtime | Duration | Channels | Peak | External components |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Bite variant 1 | `assets/audio/masters/player_bite_snap_01_master.wav` | `assets/audio/production/player_bite_snap_01.wav` | 0.43 s | mono | -2.8 dBFS | none |
| Bite variant 2 | `assets/audio/masters/player_bite_snap_02_master.wav` | `assets/audio/production/player_bite_snap_02.wav` | 0.43 s | mono | -2.8 dBFS | none |
| Flesh variant 1 | `assets/audio/masters/enemy_hit_flesh_01_master.wav` | `assets/audio/production/enemy_hit_flesh_01.wav` | 0.49 s | mono | -2.3 dBFS | none |
| Flesh variant 2 | `assets/audio/masters/enemy_hit_flesh_02_master.wav` | `assets/audio/production/enemy_hit_flesh_02.wav` | 0.49 s | mono | -2.3 dBFS | none |
| Mama roar | `assets/audio/masters/mama_wyvern_distant_roar_01_master.wav` | `assets/audio/production/mama_wyvern_distant_roar_01.wav` | 5.20 s | stereo | -3.8 dBFS | none |

Every runtime asset has zero clipped samples, negligible DC offset, and signal onset within 20 ms. Exact waveform and spectral measurements are in `artifacts/production-sfx-v1/audio-analysis.json`.

### Runtime SHA-256

| File | SHA-256 |
| --- | --- |
| `enemy_hit_flesh_01.wav` | `B3B94B853590FA1E250DC2C8B80E5FCA26FFDDC3168F32EE475E9EB9B73DD450` |
| `enemy_hit_flesh_02.wav` | `35D94F70C9DB9FC5059C3D3F726DA0CCA1B411D3880026D80D65AF56B5E9AE39` |
| `mama_wyvern_distant_roar_01.wav` | `06B4B64C66ABE9A33C8610364EA2B2001E849A8C706617E8B195341B0D8A60A6` |
| `player_bite_snap_01.wav` | `8852EDA84E197C4D63A9CEA157DC27E5EED12D13CAE3DE2A8768C27FA5603D07` |
| `player_bite_snap_02.wav` | `009719C90A83F7DF1315BD0168D71720E38D049487D5353C796BDFB651C755A2` |

## Creation process

The reproducible generator is `tools/audio/generate_production_sfx.py`. It uses seeded NumPy synthesis and filtering, writes the masters/runtime files, preserves Mama candidate stems, and emits analysis/contact-sheet evidence.

### Bite layers and processing

- band-limited throat noise and a falling throat tone;
- short high-frequency air rush into contact;
- saturated jaw noise;
- three body/jaw resonances;
- staggered tooth clicks;
- low post-contact body tail;
- 32 Hz high-pass, soft saturation, DC removal, short fades, and peak scaling;
- two seeded variants with slightly different timing and resonances.

### Flesh-impact layers and processing

- fast falling low thud;
- saturated wet band noise;
- short cloth/skin tear;
- three delayed resonant contacts;
- low body-noise tail;
- four small high-frequency grit bursts;
- 28 Hz high-pass, soft saturation, DC removal, short fades, and peak scaling;
- two seeded variants with small timing, tuning, and texture differences.

## Mama roar candidates and provenance

Three complete 5.2-second stereo candidates were rendered to a common -4.5 dBFS comparison peak and concatenated in A-B-C order:

- audition reel: `artifacts/production-sfx-v1/mama-roar-candidates/mama_roar_candidate_audition_reel.wav`;
- exact candidate decisions and layer analysis: `artifacts/production-sfx-v1/mama-roar-exploration.json`;
- comparison contact sheet: `artifacts/production-sfx-v1/mama-roar-candidate-contact-sheet.png`.

### Candidate decisions

| Candidate | Decision | Reason |
| --- | --- | --- |
| A — Clean Chamber Bellow | rejected | Too stable and harmonically tidy; retained scale but drifted toward a clean generic dragon bellow. |
| B — Wet Marsh Fury | selected | Best balance of chest weight, unstable multi-chamber warble, wet reptilian decay, tearing exhale, and distant forest scale. |
| C — Torn High Fury | rejected | Torn peak and upper rasp dominated the anatomy, reduced perceived body size, and approached a strained scream. |

An earlier unpreserved tuning attempt was also abandoned because broad upper-frequency energy obscured the body and wet throat structure.

### Selected Candidate B stems

Every used layer is preserved as a 24-bit 48 kHz WAV under `assets/audio/sources/mama_roar_v2/candidate_b_wet_marsh_fury/`.

| Stem | Source and processing provenance |
| --- | --- |
| `01_throat_load_inhale.wav` | Original band-limited turbulent noise plus a low upward chirp, shaped as a 1.16-second loading inhale. |
| `02_body_lung_rumble.wav` | Original coupled 31-86 Hz fundamentals/harmonics plus filtered chest noise; intentionally limited so scale is not subwoofer-only. |
| `03_multi_chamber_warble.wav` | Four original detuned nonlinear throat chambers following one unstable pitch trajectory with independent low-rate modulation. |
| `04_guttural_reptile_growl.wav` | Original 82-1180 Hz saturated noise gated by subharmonic throat phase for irregular crocodilian pulses. |
| `05_wet_gargle_decay.wav` | Seeded original downward bubble chirps, moist band noise, and irregular low bursts concentrated through the decay. |
| `06_tearing_peak_exhale.wav` | Original 115-4300 Hz turbulent exhale with uneven tearing gates around the central peak, weighted toward the midrange. |
| `07_upper_rasp_hiss.wav` | Restrained original 1350-7500 Hz breath rasp held below the body layers to avoid a human-scream reading. |
| `08_distant_forest_tail.wav` | Stereo asymmetric multi-tap reflections of the low-passed dry roar plus a diffuse filtered canopy-noise response. |

Final Candidate B processing:

- candidate-profile layer gains;
- nonlinear soft saturation;
- 23 Hz high-pass and 15.5 kHz low-pass;
- asymmetric stereo forest reflections;
- restrained side-rasp decorrelation;
- 85 ms final fade;
- candidate comparison at -4.5 dBFS;
- promoted master/runtime render at -3.8 dBFS.

The rejected A and C versions also preserve all eight stems. There are 24 Mama source stems in total.

## Browser and desktop work

- Researched a suitable free browser editor and opened AudioMass successfully.
- Captured `artifacts/production-sfx-v1/audiomass-editor-baseline.png` with a clean browser console.
- Made two serious import attempts. The visible load command did not expose a controllable file chooser and the page contained no file input, so browser editing was abandoned as an automation mismatch.
- Audacity, FFmpeg, FFprobe, and SoX were not available locally.
- Continued with the bundled Python/NumPy/Pillow runtime and the repository generator rather than repeatedly fighting the editor boundary.
- Played every final runtime file, the A-B-C candidate reel, and the selected candidate's individual stems through Windows `System.Media.SoundPlayer`.
- Played the selected bite, flesh, and Mama assets through the actual BSB WebAudio path in a headed Chromium session.

The playback tests prove that files are non-silent, decode, reach an active output context, and complete without an application playback error. This agent cannot perform human auditory perception, so tonal approval and mix taste remain a human sign-off rather than a claimed machine capability.

## Licensing manifest

| External component | Creator | Source page | Licence page | Licence | Accessed | Attribution | Modification | Final asset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| None | n/a | n/a | n/a | n/a | n/a | none | n/a | all assets |

Rights/provenance statement:

- all source signals were generated by the repository-owned procedural script;
- no external recordings, copyrighted roar samples, downloaded effects, or unclear AI-service outputs were used;
- there is no third-party attribution requirement for this pass;
- `externalComponents` is an empty array in both generation manifests.

## Integration changes

- `src/audio/soundManifest.js`
  - promotes the three cues to `source: 'file'`;
  - marks all five production files `required`;
  - removes target-cue placeholder definitions;
  - keeps restrained pitch variation and existing bus/concurrency ownership.
- `src/audio/audioAssetBank.js`
  - preloads, fetches, and decodes file cues;
  - exposes ready/loading/error state for development evidence;
  - reports required-file failures explicitly.
- `src/audio/audioDirector.js`
  - routes production cues through `AudioBufferSourceNode`;
  - records file, source, duration, pitch, and playback errors;
  - does not fall back to an old synth voice when a required file fails.
- `src/audio/placeholderSynth.js`
  - retains the existing placeholder implementation for untouched cues without leaving it embedded in the director.
- `tools/launch.mjs`
  - serves WAV/OGG files with explicit audio MIME types.
- `tests/productionSfx.test.mjs`
  - validates manifest ownership, format, quality bounds, masters, candidates, stems, provenance, and no-fallback behavior.
- `tests/runTests.mjs`
  - includes the production-SFX coverage in the main suite.

Existing gameplay triggers were preserved:

- `src/audio/soundEvents.js` maps committed `bite_attack` to the bite event;
- the Audio Director emits flesh impact when a player damage event resolves against an enemy;
- `src/game/worldEventControls.js` emits the Mama roar during the existing warning phase.

No real placeholder audio files were deleted because the previous `.ogg` identifiers did not exist. Only these three manifest/synthesis paths were retired; unrelated placeholder cues remain unchanged.

The current audio system has no positional panner or distance-falloff model. This pass did not invent a second audio framework. Mama's distance is authored into the stereo forest tail and routed through the ambience bus; future true spatial falloff remains separate audio-engine work.

## Verification

### Live gameplay proof

`artifacts/production-sfx-v1/proof.mjs` ran in headed Chromium against the real game.

- All five required production files decoded at 48 kHz.
- A staged real third combo action emitted `player.bite.snap`.
- The target husk's health changed from 28 to 6 and emitted `combat.enemy.hit.flesh`.
- The existing Mama world-event control entered `warning_roar` and emitted `world.mama_wyvern.distant_roar`.
- The observed file-backed buffers were 0.43-second mono bite, 0.49-second mono flesh impact, and 5.2-second stereo Mama roar.
- Browser result: zero application console errors, zero page errors, and zero request failures.

Evidence:

- `artifacts/production-sfx-v1/01-bite-and-flesh-impact.png`;
- `artifacts/production-sfx-v1/02-mama-roar-warning.png`;
- `artifacts/production-sfx-v1/browser-proof-state.json`;
- `artifacts/production-sfx-v1/waveform-spectral-contact-sheet.png`.

### Fail-loud proof

`artifacts/production-sfx-v1/fail-loud-proof.mjs` deliberately blocked both bite assets.

- Both files entered explicit error state.
- The bite cue recorded `required_asset_error`.
- No synthesized bite cue played.
- Browser console diagnostics named the failed files and blocked cue.

Evidence: `artifacts/production-sfx-v1/fail-loud-proof-state.json`.

### Automated checks

Passed:

```powershell
node tests/audioDirector.test.mjs
node tests/productionSfx.test.mjs
npm.cmd run test:loc
node -e "import('./src/app.js').then(() => console.log('app import ok'))"
```

The project-local standard web-game client passed two iterations. The skill-bundled copy could not resolve its Playwright package from outside the repository, so the established project-local client was used.

The complete `npm.cmd test` run reaches an unrelated pre-existing failure in `tests/atmosphericCameraOverlay.test.mjs`:

```text
screen-space overlay alpha should stay low for readability
```

All other 76 test modules passed when that single atmospheric assertion was excluded. No atmospheric, rendering, or overlay code was changed by this pass.

## Honest assessment

| Effect | Assessment | Remaining judgment |
| --- | --- | --- |
| Baby wyvern bite variants | strong first pass | Human ear check for repetition and relative combat level. |
| Enemy flesh-impact variants | strong first pass | Human ear check against different enemy materials and dense combat. |
| Mama Candidate B / final roar | strong first pass | Human approval of creature identity, maternal rage, forest distance, and loudspeaker translation in the full mix. |
| Mama Candidate A | rejected | Too clean and generically draconic. |
| Mama Candidate C | rejected | Too bright, torn, and scream-adjacent. |

Technical integration is complete. Production-ready classification is intentionally withheld until a human listener approves the tone and in-game balance on ordinary speakers as well as headphones.
