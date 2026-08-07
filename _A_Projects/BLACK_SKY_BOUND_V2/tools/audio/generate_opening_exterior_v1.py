from __future__ import annotations

import hashlib
import json
import math
import wave
from pathlib import Path

import miniaudio
import numpy as np
from PIL import Image, ImageDraw, ImageFont


SAMPLE_RATE = 48_000
ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "assets" / "audio" / "sources" / "opening_exterior_v1"
ORIGINAL_DIR = SOURCE_ROOT / "originals"
STEM_DIR = SOURCE_ROOT / "processed_stems"
SESSION_DIR = SOURCE_ROOT / "audacity_session"
MASTER_DIR = ROOT / "assets" / "audio" / "masters"
RUNTIME_DIR = ROOT / "assets" / "audio" / "production"
REPORT_DIR = ROOT / "artifacts" / "opening-exterior-v1"
RAIDER_SOURCE_ROOT = ROOT / "assets" / "audio" / "sources" / "raider_warning_v1"

SOURCES = {
    "thunder": ORIGINAL_DIR / "thunder-dry-distant-rolling-field-notl-2011-48804.mp3",
    "wolf_solo": ORIGINAL_DIR / "wolf-howl-6310.mp3",
    "wolf_pack": ORIGINAL_DIR / "wolves-76744.mp3",
    "husk_voice": ORIGINAL_DIR / "gurgling-monster-65641.mp3",
    "husk_wet": ORIGINAL_DIR / "gargles-63643.mp3",
    "raider": RAIDER_SOURCE_ROOT / "originals" / "male-grunts-and-yells-65945.mp3",
}

SOURCE_META = {
    "thunder": ("TRP (Freesound)", "https://pixabay.com/sound-effects/nature-thunder-dry-distant-rolling-field-notl-2011-48804/"),
    "wolf_solo": ("NaturesTemper (Freesound)", "https://pixabay.com/sound-effects/nature-wolf-howl-6310/"),
    "wolf_pack": ("Paresh (Freesound)", "https://pixabay.com/sound-effects/nature-wolves-76744/"),
    "husk_voice": ("Darsycho (Freesound)", "https://pixabay.com/sound-effects/horror-gurgling-monster-65641/"),
    "husk_wet": ("Bronxio (Freesound)", "https://pixabay.com/sound-effects/people-gargles-63643/"),
    "raider": ("jozef_sound (Freesound)", "https://pixabay.com/sound-effects/people-male-grunts-and-yells-65945/"),
}

VARIANTS = (
    {"family": "thunder", "id": "01", "sources": (("thunder", 25.55, 32.75),), "duration": 7.2, "high": 8_500, "body": 0.18, "space": 0.23},
    {"family": "thunder", "id": "02", "sources": (("thunder", 40.55, 47.75),), "duration": 7.2, "high": 8_200, "body": 0.15, "space": 0.20},
    {"family": "werewolf", "id": "01", "sources": (("wolf_solo", 0.34, 7.53),), "duration": 7.0, "high": 9_200, "body": 0.14, "space": 0.22},
    {"family": "werewolf", "id": "02", "sources": (("wolf_pack", 7.15, 14.35),), "duration": 7.0, "high": 8_600, "body": 0.12, "space": 0.25},
    {"family": "husk", "id": "01", "sources": (("husk_voice", 0.12, 1.92), ("husk_wet", 8.58, 10.20)), "duration": 1.72, "high": 5_800, "body": 0.17, "space": 0.16},
    {"family": "husk", "id": "02", "sources": (("husk_voice", 10.35, 12.18), ("husk_wet", 12.82, 14.42)), "duration": 1.72, "high": 5_600, "body": 0.19, "space": 0.17},
    {"family": "raider", "id": "01", "sources": (("raider", 8.72, 10.27),), "duration": 1.58, "high": 7_600, "body": 0.12, "space": 0.24},
    {"family": "raider", "id": "02", "sources": (("raider", 17.55, 19.10),), "duration": 1.58, "high": 7_300, "body": 0.14, "space": 0.26},
)

FAMILY_FILES = {
    "thunder": ("storm_thunder_distant", "opening_through_shell_thunder"),
    "werewolf": ("werewolf_distant_howl", "opening_through_shell_werewolf"),
    "husk": ("husk_distant_gargle", "opening_through_shell_husk"),
    "raider": ("raider_distant_shout", "opening_through_shell_raider"),
}

SHELL_PROFILES = {
    "thunder": {"high": 2_250, "body_high": 320, "body_gain": 0.31, "width": 0.025, "smear_ms": (38, 71)},
    "werewolf": {"high": 2_550, "body_high": 580, "body_gain": 0.24, "width": 0.030, "smear_ms": (27, 52)},
    "husk": {"high": 2_750, "body_high": 720, "body_gain": 0.22, "width": 0.020, "smear_ms": (18, 41)},
    "raider": {"high": 3_450, "body_high": 820, "body_gain": 0.16, "width": 0.030, "smear_ms": (16, 34)},
}


def main() -> None:
    for directory in (STEM_DIR, SESSION_DIR, MASTER_DIR, RUNTIME_DIR, REPORT_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    missing = [relative(path) for path in SOURCES.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing retained source recordings: {missing}")

    decoded = {name: decode_mono(path) for name, path in SOURCES.items()}
    assets = []
    pairs = []
    for spec in VARIANTS:
        normal = render_normal(spec, decoded)
        shell = render_shell(spec, normal)
        assets.extend((normal, shell))
        pairs.append((normal, shell))

    write_session(assets)
    write_comparison_reel(pairs)
    write_contact_sheet(pairs)
    report = build_report(decoded, assets)
    report_text = json.dumps(report, indent=2) + "\n"
    (REPORT_DIR / "audio-analysis.json").write_text(report_text, encoding="utf-8")
    (SOURCE_ROOT / "PRODUCTION_ANALYSIS.json").write_text(report_text, encoding="utf-8")
    print(json.dumps(report, indent=2))


def render_normal(spec: dict, decoded: dict[str, np.ndarray]) -> dict:
    count = seconds_to_samples(spec["duration"])
    source_layers = []
    source_segments = []
    for index, (source_id, start, end) in enumerate(spec["sources"]):
        layer = slice_seconds(decoded[source_id], start, end)
        layer = fft_filter(layer, 42 if spec["family"] == "thunder" else 68, spec["high"], 150)
        layer = trim_leading(layer, 0.008 if spec["family"] == "thunder" else 0.025, 8)
        layer = fit_length(layer, count)
        layer = normalize_rms(layer, -18 if index == 0 else -24)
        source_layers.append(layer)
        source_segments.append({"sourceId": source_id, "startSeconds": start, "endSeconds": end})

    identity = source_layers[0]
    if spec["family"] == "husk":
        identity = np.tanh(identity * 1.18) / math.tanh(1.18)
        wet = source_layers[1] * 0.18
        wet = delay_mono(wet, 42)
        identity = identity + wet

    body_rate = {"thunder": 0.975, "werewolf": 0.91, "husk": 0.86, "raider": 0.93}[spec["family"]]
    body_high = {"thunder": 410, "werewolf": 1_850, "husk": 1_650, "raider": 1_700}[spec["family"]]
    body = fit_length(rate_shift(source_layers[0], body_rate), count)
    body = fft_filter(body, 32, body_high, 100)
    body = normalize_rms(body, -22) * spec["body"]

    identity_stereo = stereo_space(identity, spec["family"], direct=True)
    distance_stereo = stereo_space(identity * spec["space"] + body, spec["family"], direct=False)
    mix = identity_stereo * 0.82 + distance_stereo
    mix = finalize(mix, -3.8, 14, 120 if spec["family"] in {"thunder", "werewolf"} else 75)

    normal_stem_dir = STEM_DIR / "normal" / f"{spec['family']}_{spec['id']}"
    identity_path = normal_stem_dir / "01_recorded_identity.wav"
    space_path = normal_stem_dir / "02_source_derived_distance_and_body.wav"
    write_pcm_wav(identity_path, finalize(identity_stereo, -7.0, 8, 80), 24)
    write_pcm_wav(space_path, finalize(distance_stereo, -9.0, 8, 100), 24)

    stem, _ = FAMILY_FILES[spec["family"]]
    return write_asset(
        f"{stem}_{spec['id']}", spec["family"], "normal_full_range", mix,
        (identity_path, space_path), source_segments,
        [
            "real recorded identity retained as the dominant layer",
            "source-derived lower body support with no oscillator or generated vocal",
            "source-derived staggered early reflections for normal in-world distance",
            f"full-range event ceiling {spec['high']} Hz; no egg-shell filter baked into this asset",
        ],
    )


def render_shell(spec: dict, normal: dict) -> dict:
    profile = SHELL_PROFILES[spec["family"]]
    signal = normal["_signal"]
    center = np.mean(signal, axis=1)
    wall = fft_filter(center, 34, profile["high"], 130)
    wall = np.tanh(normalize_rms(wall, -18.5) * 1.07) / math.tanh(1.07)
    body = fft_filter(center, 28, profile["body_high"], 85)
    body = np.tanh(normalize_rms(body, -20.5) * 1.12) / math.tanh(1.12)
    smear_a = delay_mono(wall, profile["smear_ms"][0])
    smear_b = delay_mono(wall, profile["smear_ms"][1])
    cavity = smear_a * 0.10 + smear_b * 0.065
    shell_center = wall * 0.78 + body * profile["body_gain"] + cavity
    side = (smear_a - smear_b) * profile["width"]
    shell_stereo = np.column_stack((shell_center + side, shell_center - side))
    shell_stereo = finalize(shell_stereo, -4.7, 18, 150 if spec["family"] in {"thunder", "werewolf"} else 90)

    shell_stem_dir = STEM_DIR / "through_shell" / f"{spec['family']}_{spec['id']}"
    wall_path = shell_stem_dir / "01_shell_wall_transmission.wav"
    body_path = shell_stem_dir / "02_shell_body_conduction.wav"
    write_pcm_wav(wall_path, finalize(np.column_stack((wall, wall)), -7.2, 12, 100), 24)
    write_pcm_wav(body_path, finalize(np.column_stack((body, body)), -10.0, 12, 100), 24)

    _, shell_stem = FAMILY_FILES[spec["family"]]
    result = write_asset(
        f"{shell_stem}_{spec['id']}", spec["family"], "opening_through_shell", shell_stereo,
        (wall_path, body_path), normal["sourceSegments"],
        [
            f"event-specific shell wall transmission ceiling {profile['high']} Hz",
            f"source-derived body conduction retained below {profile['body_high']} Hz",
            f"source-derived cavity smears at {profile['smear_ms'][0]} and {profile['smear_ms'][1]} ms",
            f"stereo width collapsed to {profile['width']} before the live opening muffle bus",
            "no generated noise, oscillator, replacement voice, or Mama-wyvern reuse",
        ],
    )
    result["normalAssetId"] = normal["id"]
    result["shellProfile"] = dict(profile)
    return result


def write_asset(asset_id: str, family: str, perspective: str, signal: np.ndarray, stems, source_segments, process) -> dict:
    master_path = MASTER_DIR / f"{asset_id}_master.wav"
    runtime_path = RUNTIME_DIR / f"{asset_id}.wav"
    write_pcm_wav(master_path, signal, 24)
    write_pcm_wav(runtime_path, signal, 16)
    result = analyze(signal)
    result.update({
        "id": asset_id,
        "family": family,
        "perspective": perspective,
        "runtimeFile": relative(runtime_path),
        "runtimeSha256": hashlib.sha256(runtime_path.read_bytes()).hexdigest(),
        "masterFile": relative(master_path),
        "stemFiles": [relative(path) for path in stems],
        "sourceSegments": source_segments,
        "process": process,
        "_signal": signal,
    })
    return result


def build_report(decoded: dict[str, np.ndarray], assets: list[dict]) -> dict:
    public_assets = [{key: value for key, value in asset.items() if key != "_signal"} for asset in assets]
    return {
        "contract": "black-sky-bound.opening-exterior-production.v1",
        "sampleRate": SAMPLE_RATE,
        "generator": relative(Path(__file__)),
        "designIntent": "Four reusable full-range weather/enemy palettes plus separately rendered, event-specific through-shell derivatives for the embodied hatch opening.",
        "syntheticLayersInProductionAssets": 0,
        "normalCueIds": ["world.storm.thunder", "enemy.werewolf.distant_howl", "enemy.husk.distant_gargle", "enemy.raider.distant_shout"],
        "openingDerivativeCueIds": ["opening.exterior.thunder_through_shell", "opening.exterior.werewolf_through_shell", "opening.exterior.husk_through_shell", "opening.exterior.raider_through_shell"],
        "runtimeShellBus": {"sealedMuffle": 0.8, "sealedCutoffHz": 4_176, "owner": "src/audio/audioStateMath.js + src/audio/audioBus.js"},
        "sources": [source_entry(name, path, decoded[name]) for name, path in SOURCES.items()],
        "assets": public_assets,
        "audacitySession": relative(SESSION_DIR / "opening_exterior_v1.lof"),
        "comparisonReel": relative(REPORT_DIR / "normal-vs-through-shell-comparison-reel.wav"),
        "contactSheet": relative(REPORT_DIR / "normal-vs-through-shell-contact-sheet.png"),
        "trackedAnalysis": relative(SOURCE_ROOT / "PRODUCTION_ANALYSIS.json"),
    }


def write_session(assets: list[dict]) -> None:
    lines = [
        "# Black Sky Bound opening exterior v1 - real-source normal and through-shell pairs",
        "# Each window opens two aligned source-derived stems plus the 24-bit production master.",
        "# The normal assets remain reusable after opening; shell assets are opening-only derivatives.",
    ]
    for asset in assets:
        lines.append(f"window offset 0 duration {asset['durationSeconds']}")
        for path in asset["stemFiles"]:
            lines.append(f'file "../{(ROOT / path).relative_to(SOURCE_ROOT).as_posix()}"')
        master_relative = (ROOT / asset["masterFile"]).relative_to(ROOT / "assets" / "audio")
        lines.append(f'file "../../../{master_relative.as_posix()}"')
    (SESSION_DIR / "opening_exterior_v1.lof").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_comparison_reel(pairs) -> None:
    silence = np.zeros((seconds_to_samples(0.55), 2), dtype=np.float64)
    family_gap = np.zeros((seconds_to_samples(1.1), 2), dtype=np.float64)
    segments = []
    previous_family = None
    for normal, shell in pairs:
        if previous_family and previous_family != normal["family"]:
            segments.append(family_gap)
        segments.extend((normal["_signal"], silence, shell["_signal"], silence))
        previous_family = normal["family"]
    write_pcm_wav(REPORT_DIR / "normal-vs-through-shell-comparison-reel.wav", np.concatenate(segments), 16)


def write_contact_sheet(pairs) -> None:
    width, row_height = 1540, 190
    image = Image.new("RGB", (width, 88 + row_height * len(pairs)), "#081018")
    draw, font = ImageDraw.Draw(image), ImageFont.load_default()
    draw.text((28, 22), "BLACK SKY BOUND - OPENING EXTERIOR v1 / NORMAL vs THROUGH-SHELL", fill="#f2d8aa", font=font)
    draw.text((28, 45), "Cyan = normal full-range; amber = source-derived shell perspective; lower graph = log spectrum", fill="#9fb6c7", font=font)
    for row, (normal, shell) in enumerate(pairs):
        top = 78 + row * row_height
        draw.text((24, top + 4), f"{normal['family']} {normal['id'][-2:]}", fill="#e6edf3", font=font)
        for column, (asset, colour) in enumerate(((normal, "#58c3bf"), (shell, "#e4a85f"))):
            left = 180 + column * 670
            right = left + 620
            mono = np.mean(asset["_signal"], axis=1)
            draw.text((left, top + 4), asset["perspective"], fill=colour, font=font)
            draw_graph(draw, mono, (left, top + 24, right, top + 92), colour, spectrum=False)
            draw_graph(draw, mono, (left, top + 104, right, top + 174), colour, spectrum=True)
    image.save(REPORT_DIR / "normal-vs-through-shell-contact-sheet.png")


def draw_graph(draw, signal, box, colour, spectrum) -> None:
    left, top, right, bottom = box
    draw.rectangle(box, outline="#284052")
    width = right - left
    if not spectrum:
        for x in range(width):
            start, end = int(x * len(signal) / width), max(1, int((x + 1) * len(signal) / width))
            level = float(np.max(np.abs(signal[start:end])))
            middle, height = (top + bottom) // 2, int(level * (bottom - top) * 0.46)
            draw.line((left + x, middle - height, left + x, middle + height), fill=colour)
        return
    values = np.abs(np.fft.rfft(signal * np.hanning(len(signal))))
    values_db = 20 * np.log10(np.maximum(values / max(float(np.max(values)), 1e-12), 1e-6))
    frequencies = np.fft.rfftfreq(len(signal), 1 / SAMPLE_RATE)
    samples = np.interp(np.geomspace(35, 12_000, width), frequencies, values_db)
    points = [(left + x, bottom - int(np.clip((value + 60) / 60, 0, 1) * (bottom - top))) for x, value in enumerate(samples)]
    draw.line(points, fill=colour, width=2)


def stereo_space(signal: np.ndarray, family: str, direct: bool) -> np.ndarray:
    if direct:
        width = {"thunder": 0.16, "werewolf": 0.08, "husk": 0.05, "raider": 0.07}[family]
        side = (delay_mono(signal, 11) - delay_mono(signal, 19)) * width
        return np.column_stack((signal + side, signal - side))
    delays = {"thunder": (74, 119), "werewolf": (92, 147), "husk": (61, 103), "raider": (82, 151)}[family]
    left, right = delay_mono(signal, delays[0]), delay_mono(signal, delays[1])
    return np.column_stack((left, right))


def finalize(signal: np.ndarray, target_db: float, fade_in_ms: float, fade_out_ms: float) -> np.ndarray:
    output = signal - np.mean(signal, axis=0)
    output = np.tanh(output * 1.06) / math.tanh(1.06)
    output = apply_fades(output, fade_in_ms, fade_out_ms)
    return normalize_peak(output, db_to_linear(target_db))


def source_entry(name: str, path: Path, signal: np.ndarray) -> dict:
    artist, page = SOURCE_META[name]
    return {
        "role": name,
        "file": relative(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "durationSeconds": round(len(signal) / SAMPLE_RATE, 4),
        "provider": "Pixabay",
        "artist": artist,
        "providerPage": page,
        "license": "Pixabay Content License",
    }


def analyze(signal: np.ndarray) -> dict:
    peak = float(np.max(np.abs(signal)))
    rms = float(np.sqrt(np.mean(np.square(signal))))
    mono = np.mean(signal, axis=1)
    side = (signal[:, 0] - signal[:, 1]) * 0.5
    spectrum = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    frequencies = np.fft.rfftfreq(len(mono), 1 / SAMPLE_RATE)
    total = max(float(np.sum(spectrum)), 1e-12)
    indices = np.flatnonzero(np.max(np.abs(signal), axis=1) >= db_to_linear(-50))
    return {
        "durationSeconds": round(len(signal) / SAMPLE_RATE, 4),
        "channels": 2,
        "peakDbfs": round(20 * math.log10(max(peak, 1e-12)), 3),
        "rmsDbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
        "sideRmsDbfs": round(20 * math.log10(max(float(np.sqrt(np.mean(side ** 2))), 1e-12)), 3),
        "spectralCentroidHz": round(float(np.sum(frequencies * spectrum) / total), 2),
        "highFrequencyEnergyRatioAbove3k": round(float(np.sum(spectrum[frequencies >= 3_000]) / total), 6),
        "dcOffset": round(float(np.max(np.abs(np.mean(signal, axis=0)))), 8),
        "clippedSampleCount": int(np.count_nonzero(np.abs(signal) >= 0.999)),
        "firstSignalMs": round(float(indices[0] / SAMPLE_RATE * 1000), 3) if len(indices) else None,
    }


def decode_mono(path: Path) -> np.ndarray:
    decoded = miniaudio.decode_file(str(path), output_format=miniaudio.SampleFormat.FLOAT32, nchannels=1, sample_rate=SAMPLE_RATE)
    signal = np.asarray(decoded.samples, dtype=np.float64)
    return signal - np.mean(signal)


def slice_seconds(signal, start, end):
    return signal[max(0, seconds_to_samples(start)):min(len(signal), seconds_to_samples(end))].copy()


def rate_shift(signal, rate):
    positions = np.arange(max(1, int(round(len(signal) / rate))), dtype=np.float64) * rate
    return np.interp(positions, np.arange(len(signal)), signal, left=0.0, right=0.0)


def fft_filter(signal, low_hz, high_hz, edge_hz):
    spectrum = np.fft.rfft(signal)
    frequencies = np.fft.rfftfreq(len(signal), 1 / SAMPLE_RATE)
    low = np.clip((frequencies - max(0, low_hz - edge_hz)) / max(edge_hz, 1), 0, 1)
    high = np.clip((high_hz + edge_hz - frequencies) / max(edge_hz, 1), 0, 1)
    mask = (0.5 - 0.5 * np.cos(np.pi * low)) * (0.5 - 0.5 * np.cos(np.pi * high))
    return np.fft.irfft(spectrum * mask, n=len(signal))


def delay_mono(signal, delay_ms):
    count = seconds_to_samples(delay_ms / 1000)
    return np.pad(signal, (count, 0))[:len(signal)]


def fit_length(signal, count):
    return signal[:count].copy() if len(signal) >= count else np.pad(signal, (0, count - len(signal)))


def trim_leading(signal, relative_threshold, pre_roll_ms):
    indices = np.flatnonzero(np.abs(signal) >= max(float(np.max(np.abs(signal))) * relative_threshold, 1e-7))
    if not len(indices):
        return signal
    return signal[max(0, int(indices[0]) - seconds_to_samples(pre_roll_ms / 1000)):].copy()


def normalize_peak(signal, target):
    peak = float(np.max(np.abs(signal)))
    return signal if peak <= 1e-12 else signal * (target / peak)


def normalize_rms(signal, target_db):
    rms = float(np.sqrt(np.mean(np.square(signal))))
    return signal if rms <= 1e-12 else signal * (db_to_linear(target_db) / rms)


def apply_fades(signal, fade_in_ms, fade_out_ms):
    output = signal.copy()
    fade_in, fade_out = min(len(output), seconds_to_samples(fade_in_ms / 1000)), min(len(output), seconds_to_samples(fade_out_ms / 1000))
    if fade_in:
        output[:fade_in] *= (np.sin(np.linspace(0, np.pi / 2, fade_in)) ** 2)[:, None]
    if fade_out:
        output[-fade_out:] *= (np.cos(np.linspace(0, np.pi / 2, fade_out)) ** 2)[:, None]
    return output


def write_pcm_wav(path: Path, signal: np.ndarray, bits: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    channels = 1 if signal.ndim == 1 else signal.shape[1]
    clipped = np.clip(signal, -1.0, 1.0 - 1 / (2 ** (bits - 1)))
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(bits // 8)
        handle.setframerate(SAMPLE_RATE)
        if bits == 16:
            payload = np.round(clipped * 32_767).astype("<i2").tobytes()
        elif bits == 24:
            values = np.round(clipped * 8_388_607).astype("<i4").reshape(-1)
            payload = values.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
        else:
            raise ValueError(f"Unsupported bit depth: {bits}")
        handle.writeframes(payload)


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def seconds_to_samples(seconds: float) -> int:
    return int(round(seconds * SAMPLE_RATE))


def db_to_linear(value: float) -> float:
    return 10 ** (value / 20)


if __name__ == "__main__":
    main()
