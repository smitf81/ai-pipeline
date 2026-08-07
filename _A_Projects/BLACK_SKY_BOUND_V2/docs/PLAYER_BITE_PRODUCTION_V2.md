# Baby Wyvern Bite Production Replacement v2

Date: 2026-08-06

## Outcome

`player.bite.snap` now rotates through three short, real-source production composites. The rejected procedural jaw resonances, generated noise, tooth clicks, and chirps have been removed from the canonical generator path.

The cue represents the hatchling's action, not guaranteed damage: a restrained throat/breath load, a jaw-and-bone closure, and a quiet wet mouth release. `combat.enemy.hit.flesh` remains the separate owner of confirmed contact, so a missed bite does not falsely sound like a large flesh hit.

## Before / after

| Property | Rejected v1 | Production v2 |
| --- | --- | --- |
| Source identity | generated noise, chirps, resonators and clicks | three retained animal/organic recordings |
| Variations | two seeded synthetic variations | three separately selected real-source regions |
| Jaw closure | 128-142 ms | 195 ms |
| Animation contact | about 197 ms | about 197 ms |
| Runtime pitch range | 0.96-1.035 | 0.985-1.015 |
| Duration | 0.43 s | 0.48 s |
| Peak | -2.8 dBFS | -3.8 dBFS |
| Miss semantics | synthetic impact-heavy snap | action breath/jaw with restrained wet detail |

## Source palette

The retained originals, artist/provider details, source/CDN URLs, SHA-256 hashes, access date, licence, and layer roles are in `assets/audio/sources/player_bite_v2/SOURCE_AND_LICENSE.md`.

- Dog Snarl (Self-made): breath/snarl loading layer.
- Dog Eating a Bone and Growling: jaw/bone closure transient.
- Eating Juicy Meat: restrained post-closure mouth detail.

All three source pages identified the files as free to use under the Pixabay Content License when acquired. Attribution is preserved voluntarily for durable provenance.

## Authored assets

Each production variant is 0.48-second mono 48 kHz PCM with no clipped samples. Runtime files use 16-bit PCM; masters and aligned stems use 24-bit PCM.

| Variant | Runtime SHA-256 | Peak | RMS | First signal |
| --- | --- | ---: | ---: | ---: |
| `player_bite_snap_01.wav` | `CE5134A44B84F46F1900D3DD2F58828113671CA7B32E38B1D0D5722944987FAF` | -3.8 dBFS | -13.65 dBFS | 31.9 ms |
| `player_bite_snap_02.wav` | `D2F3ED23029A9B7E9F596735A5286CC777E68AAD806CFE89D25317E39CF40A9F` | -3.8 dBFS | -14.66 dBFS | 10.5 ms |
| `player_bite_snap_03.wav` | `82B13779C097EFF1151CEE92913E10FE83D52B3749AD71ECD35504D26FDEA08D` | -3.8 dBFS | -12.87 dBFS | 13.8 ms |

Exact measurements and layer/process metadata are retained in `assets/audio/sources/player_bite_v2/PRODUCTION_ANALYSIS.json` and mirrored into `artifacts/player-bite-v2/audio-analysis.json` when the generator runs.

Editable material:

- nine full-length, contact-aligned stems in `assets/audio/sources/player_bite_v2/processed_stems/`;
- three 24-bit reference mixes and copies of all stems in `assets/audio/sources/player_bite_v2/audacity_session/`;
- `player_bite_v2.lof`, which opens the aligned material as a portable Audacity session;
- 24-bit final masters in `assets/audio/masters/`;
- the two rejected v1 files in `assets/audio/sources/player_bite_v2/legacy_procedural/`, mirrored into a legacy-versus-production audition reel in `artifacts/player-bite-v2/`.

Audacity was open during the pass, but the desktop-control bridge could not attach to the running process. No `.aup3` claim is made. The LOF and aligned lossless tracks preserve a portable, editable session without inventing evidence of an application save that did not occur.

## Reproduction

The task-local environment is intentionally ignored by Git. Recreate and run it with:

```powershell
python -m venv tools/audio/.venv
tools/audio/.venv/Scripts/python.exe -m pip install -r tools/audio/requirements-player-bite-v2.txt
tools/audio/.venv/Scripts/python.exe tools/audio/generate_player_bite_v2.py
```

The generator decodes the retained originals, selects documented regions, applies deterministic rate/pitch shaping, frequency limiting, envelopes, contact alignment, mild saturation, fades, and peak scaling, then writes runtime files, masters, stems, the Audacity session, comparison reel, analysis JSON, and contact sheet. It adds no synthesized source layer.

## Runtime integration and proof

- `src/audio/soundManifest.js` owns the three-file palette and a narrow authored pitch range.
- The existing `PLAYER_ACTION_BITE -> player.bite.snap` path is unchanged.
- `tools/audio/generate_production_sfx.py` no longer contains `make_bite` or any `player_bite_snap` output, preventing a legacy regeneration from restoring the rejected files.
- The package builder remains manifest-derived, so the third file is included without a second allowlist.

`artifacts/player-bite-v2/proof.mjs` launched the exact Desktop checkout through `tools/launch.mjs`, used the real third-combo input path, observed `bite_attack` recovery and a decoded `player.bite.snap` file cue, then rotated all three variants. Every file returned HTTP 200 as `audio/wav` with `Cache-Control: no-store`, decoded as 0.48-second mono 48 kHz audio, and reached a real `AudioBufferSourceNode`.

Browser result: zero audio, console, page, request, or HTTP errors. The full report is `artifacts/player-bite-v2/playtest-report.json`; the inspected in-game capture is `artifacts/player-bite-v2/01-production-bite-action.png`.

## Next audio slice

The opening scene audit confirms the current thunder, husk, werewolf, distant-raider, and shell-interaction cues are procedural. The release beat also schedules Mama's full roar and has no dedicated hatchling-first-cry cue.

The next bounded slice is **Opening Exterior Soundscape v1**: recorded exterior and shell-interaction sources authored through an inside-egg perspective. It will be followed by a distinct **Baby Wyvern First Cry v1**, with Mama reserved for a later answering role if the mix and story timing support it.
