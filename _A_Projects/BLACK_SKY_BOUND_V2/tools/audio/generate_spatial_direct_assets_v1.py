"""Re-export retained production stems for world-space playback.

Point-source direct layers are mono by contract. Selected stereo-only reflections are
kept as separate non-positional environment returns. This is deterministic and does
not alter or replace any retained source recording.
"""
from __future__ import annotations

import json
import math
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "assets" / "audio" / "sources"
PRODUCTION = ROOT / "assets" / "audio" / "production"
MASTER = ROOT / "assets" / "audio" / "masters"
PROJECT = ROOT / "assets" / "audio" / "projects" / "spatial_direct_v1"


DIRECT = {
    "enemy_hit_flesh_direct_mono_01.wav": [PRODUCTION / "enemy_hit_flesh_01.wav"],
    "enemy_hit_flesh_direct_mono_02.wav": [PRODUCTION / "enemy_hit_flesh_02.wav"],
    "enemy_raider_warning_direct_mono_01.wav": [PRODUCTION / "enemy_raider_warning_01.wav"],
    "enemy_raider_warning_direct_mono_02.wav": [PRODUCTION / "enemy_raider_warning_02.wav"],
    "enemy_raider_warning_direct_mono_03.wav": [PRODUCTION / "enemy_raider_warning_03.wav"],
    "enemy_raider_warning_direct_mono_04.wav": [PRODUCTION / "enemy_raider_warning_04.wav"],
    "enemy_raider_warning_direct_mono_05.wav": [PRODUCTION / "enemy_raider_warning_05.wav"],
    "mama_wyvern_distant_roar_direct_mono_01.wav": [
        SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_distant_roar_02__roar_body.wav"
    ],
    "mama_wyvern_flyover_roar_direct_mono_01.wav": [
        SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_flyover_roar_01__close_roar.wav",
        SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_flyover_roar_01__chest_body.wav"
    ],
    "mama_wyvern_napalm_direct_mono_01.wav": [
        SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_napalm_projection_01__pressure_hiss.wav",
        SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_napalm_projection_01__throat_load.wav"
    ],
    "storm_thunder_direct_mono_01.wav": [SOURCES / "opening_exterior_v1/processed_stems/normal/thunder_01/01_recorded_identity.wav"],
    "storm_thunder_direct_mono_02.wav": [SOURCES / "opening_exterior_v1/processed_stems/normal/thunder_02/01_recorded_identity.wav"],
    "werewolf_voice_direct_mono_01.wav": [SOURCES / "opening_exterior_v1/processed_stems/normal/werewolf_01/01_recorded_identity.wav"],
    "werewolf_voice_direct_mono_02.wav": [SOURCES / "opening_exterior_v1/processed_stems/normal/werewolf_02/01_recorded_identity.wav"],
    "husk_voice_direct_mono_01.wav": [SOURCES / "opening_exterior_v1/processed_stems/normal/husk_01/01_recorded_identity.wav"],
    "husk_voice_direct_mono_02.wav": [SOURCES / "opening_exterior_v1/processed_stems/normal/husk_02/01_recorded_identity.wav"],
    "raider_voice_direct_mono_01.wav": [SOURCES / "opening_exterior_v1/processed_stems/normal/raider_01/01_recorded_identity.wav"],
    "raider_voice_direct_mono_02.wav": [SOURCES / "opening_exterior_v1/processed_stems/normal/raider_02/01_recorded_identity.wav"],
    "smoulder_fire_direct_mono_loop_01.wav": [
        SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_inferno_aftermath_01__sparse_crackle.wav"
    ]
}

RETURNS = {
    "mama_wyvern_distant_roar_environment_return_01.wav": SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_distant_roar_02__forest_tail.wav",
    "mama_wyvern_flyover_environment_return_01.wav": SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_flyover_roar_01__air_wake.wav",
    "mama_wyvern_napalm_environment_return_01.wav": SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_napalm_projection_01__delayed_ignition.wav",
    "smoulder_fire_environment_return_01.wav": SOURCES / "mama_sampled_v1/processed_stems/mama_wyvern_inferno_aftermath_01__residual_fire.wav"
}


def decode(path: Path) -> tuple[int, list[list[float]]]:
    with wave.open(str(path), "rb") as source:
        channels, width, rate, frames = source.getnchannels(), source.getsampwidth(), source.getframerate(), source.getnframes()
        raw = source.readframes(frames)
    values = []
    if width == 2:
        values = [value / 32768 for value in struct.unpack(f"<{len(raw) // 2}h", raw)]
    elif width == 3:
        for index in range(0, len(raw), 3):
            value = int.from_bytes(raw[index:index + 3], "little", signed=False)
            if value & 0x800000:
                value -= 1 << 24
            values.append(value / 8388608)
    elif width == 4:
        values = [value / 2147483648 for value in struct.unpack(f"<{len(raw) // 4}i", raw)]
    else:
        raise ValueError(f"unsupported_sample_width:{path}:{width}")
    return rate, [values[channel::channels] for channel in range(channels)]


def encode(path: Path, rate: int, channels: list[list[float]], width: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame_count = max(len(channel) for channel in channels)
    peak = max((abs(value) for channel in channels for value in channel), default=1)
    scale = min(8, 0.9 / max(0.000001, peak))
    raw = bytearray()
    maximum = 8388607 if width == 3 else 32767
    for frame in range(frame_count):
        for channel in channels:
            value = channel[frame] if frame < len(channel) else 0
            sample = max(-maximum - 1, min(maximum, round(value * scale * maximum)))
            raw.extend(sample.to_bytes(width, "little", signed=True))
    with wave.open(str(path), "wb") as target:
        target.setnchannels(len(channels))
        target.setsampwidth(width)
        target.setframerate(rate)
        target.writeframes(bytes(raw))


def direct_mix(paths: list[Path], loop: bool) -> tuple[int, list[list[float]]]:
    decoded = [decode(path) for path in paths]
    rates = {rate for rate, _ in decoded}
    if len(rates) != 1:
        raise ValueError(f"source_rate_mismatch:{paths}")
    rate = decoded[0][0]
    mono = []
    for _, channels in decoded:
        count = max(len(channel) for channel in channels)
        mono.append([sum(channel[index] if index < len(channel) else 0 for channel in channels) / len(channels) for index in range(count)])
    count = max(len(channel) for channel in mono)
    mixed = [sum(channel[index] if index < len(channel) else 0 for channel in mono) / math.sqrt(len(mono)) for index in range(count)]
    if loop and len(mixed) > int(rate * 0.45):
        crossfade = min(int(rate * 0.2), len(mixed) // 6)
        for index in range(crossfade):
            t = index / max(1, crossfade - 1)
            mixed[index] = mixed[index] * t + mixed[-crossfade + index] * (1 - t)
        mixed = mixed[:-crossfade]
    return rate, [mixed]


def main() -> None:
    analysis = {"contract": "black-sky-bound.spatial-direct-assets.v1", "direct": [], "environmentReturns": []}
    for name, sources in DIRECT.items():
        rate, channels = direct_mix(sources, "loop" in name)
        encode(MASTER / f"{Path(name).stem}_master.wav", rate, channels, 3)
        encode(PRODUCTION / name, rate, channels, 2)
        analysis["direct"].append({"file": name, "channels": 1, "sampleRate": rate, "sources": [str(path.relative_to(ROOT)) for path in sources]})
    for name, source in RETURNS.items():
        rate, channels = decode(source)
        encode(MASTER / f"{Path(name).stem}_master.wav", rate, channels, 3)
        encode(PRODUCTION / name, rate, channels, 2)
        analysis["environmentReturns"].append({"file": name, "channels": len(channels), "sampleRate": rate, "source": str(source.relative_to(ROOT))})
    PROJECT.mkdir(parents=True, exist_ok=True)
    (PROJECT / "PRODUCTION_ANALYSIS.json").write_text(json.dumps(analysis, indent=2) + "\n", encoding="utf-8")
    lof = [f'file "{(MASTER / (Path(name).stem + "_master.wav")).as_posix()}"' for name in [*DIRECT, *RETURNS]]
    (PROJECT / "spatial_direct_v1.lof").write_text("\n".join(lof) + "\n", encoding="utf-8")
    print(json.dumps({"direct": len(DIRECT), "returns": len(RETURNS), "production": str(PRODUCTION)}, indent=2))


if __name__ == "__main__":
    main()
