# Player Bite v2 — source and licence record

The three production variants are edits and composites of the retained, unmodified recordings below. They contain no oscillator, generated-noise, or text-to-audio layers. All source pages identified the download as free to use under the Pixabay Content License when acquired on 6 August 2026. Attribution is retained here voluntarily for provenance.

## Sources

### Dog Snarl (Self-made)

- Provider: Pixabay
- Artist shown by Pixabay: deleted_user_3424813 (Freesound)
- Source page: https://pixabay.com/sound-effects/nature-dog-snarl-self-made-105738/
- Download URL: https://cdn.pixabay.com/audio/2022/03/24/audio_d89de316fb.mp3
- Retained original: `originals/dog-snarl-self-made-105738.mp3`
- SHA-256: `B6A767242B4C51F2A5C88DB693DA5C1847AE3132157A3E440B82BA81C781A9B6`
- Use: breath/snarl loading layer before jaw closure

### Dog Eating a Bone and Growling

- Provider: Pixabay
- Artist shown by Pixabay: poorenglishjuggler (Freesound)
- Source page: https://pixabay.com/sound-effects/dog-eating-a-bone-and-growling-76746/
- Download URL: https://cdn.pixabay.com/audio/2022/03/15/audio_7bd04f91e0.mp3
- Retained original: `originals/dog-eating-a-bone-and-growling-76746.mp3`
- SHA-256: `2660D00E4C0A67DA41A7ADCA3D626B1C7B32048543FF19CB0322197F952770B4`
- Use: jaw/bone closure transient

### Eating Juicy Meat

- Provider: Pixabay
- Artist shown by Pixabay: ProductionNow (Freesound)
- Source page: https://pixabay.com/sound-effects/eating-juicy-meat-7024/
- Download URL: https://cdn.pixabay.com/audio/2021/08/09/audio_d7961b6f59.mp3
- Retained original: `originals/eating-juicy-meat-7024.mp3`
- SHA-256: `4BE03411AB3778EBA2871B5C021477585B16FA8ED192CAB79443BCC4C040011B`
- Use: restrained wet mouth detail after closure

## Authored processing

- Three separately selected source regions provide real variation.
- Breath and jaw recordings are pitch-shaped and frequency-limited to move away from a recognisable domestic-dog read.
- The jaw transient is aligned at 195 ms, matching the bite animation's 0.34 s duration × 0.58 hit timing (197 ms).
- The wet layer is intentionally quiet because `combat.enemy.hit.flesh` owns confirmed damage; `player.bite.snap` must also work when the attack misses.
- Runtime WAVs are mono, 48 kHz, 16-bit PCM. Working masters and aligned stems are 48 kHz, 24-bit PCM.

Licence: https://pixabay.com/service/license-summary/
