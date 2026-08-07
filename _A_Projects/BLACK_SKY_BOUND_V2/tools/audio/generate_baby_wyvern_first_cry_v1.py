from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from generate_player_bite_v2 import (
    SAMPLE_RATE,
    analyze,
    apply_fades,
    db_to_linear,
    decode_mono,
    fft_filter,
    fit_length,
    normalize_peak,
    normalize_rms,
    place,
    rate_shift,
    relative,
    remove_dc,
    seconds_to_samples,
    shaped_envelope,
    slice_seconds,
    trim_leading,
    write_pcm_wav,
)


ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "assets" / "audio" / "sources" / "baby_wyvern_first_cry_v1"
ORIGINAL_DIR = SOURCE_ROOT / "originals"
STEM_DIR = SOURCE_ROOT / "processed_stems"
SESSION_DIR = SOURCE_ROOT / "audacity_session"
MASTER_DIR = ROOT / "assets" / "audio" / "masters"
RUNTIME_DIR = ROOT / "assets" / "audio" / "production"
REPORT_DIR = ROOT / "artifacts" / "baby-wyvern-first-cry-v1"
OUTPUT_SECONDS = 1.85
TARGET_PEAK_DB = -3.6

SOURCES = {
    "croc_chirp": {
        "file": "tiny-croc-chirp-40638.mp3",
        "download": "freesound_community-tiny-croc-chirp-40638.mp3",
        "artist": "iwanPlays (Freesound)",
        "url": "https://pixabay.com/sound-effects/film-special-effects-tiny-croc-chirp-40638/",
        "role": "newborn reptile distress contour",
    },
    "gecko": {
        "file": "gecko-371354.mp3",
        "download": "u_xg7ssi08yr-gecko-371354.mp3",
        "artist": "u_xg7ssi08yr",
        "url": "https://pixabay.com/sound-effects/nature-gecko-371354/",
        "role": "irregular reptile throat and chest texture",
    },
    "croc_hiss": {
        "file": "crocodile-hissing-372480.mp3",
        "download": "dragon-studio-crocodile-hissing-372480.mp3",
        "artist": "DRAGON-STUDIO",
        "url": "https://pixabay.com/sound-effects/nature-crocodile-hissing-372480/",
        "role": "short strained breath edge",
    },
}

VARIANTS = (
    {
        "id": "01",
        "chirp_window": (0.34, 1.58),
        "chirp_rate": 0.90,
        "gecko_window": (8.78, 10.28),
        "gecko_rate": 0.80,
        "hiss_window": (0.40, 1.36),
        "hiss_rate": 0.92,
        "gains": (0.82, 0.25, 0.19),
    },
    {
        "id": "02",
        "chirp_window": (2.17, 3.82),
        "chirp_rate": 0.95,
        "gecko_window": (12.58, 13.92),
        "gecko_rate": 0.84,
        "hiss_window": (0.68, 1.72),
        "hiss_rate": 0.87,
        "gains": (0.78, 0.28, 0.17),
    },
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--import-dir", type=Path, help="One-time source import directory; retained originals are used afterward.")
    args = parser.parse_args()
    for directory in (ORIGINAL_DIR, STEM_DIR, SESSION_DIR, MASTER_DIR, RUNTIME_DIR, REPORT_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    import_sources(args.import_dir)
    source_paths = {source_id: ORIGINAL_DIR / spec["file"] for source_id, spec in SOURCES.items()}
    missing = [relative(path) for path in source_paths.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing retained source recordings: {missing}")

    decoded = {source_id: decode_mono(path) for source_id, path in source_paths.items()}
    rendered = [render_variant(spec, decoded) for spec in VARIANTS]
    legacy = load_legacy_mama_reference()
    write_audacity_session(rendered)
    write_comparison_reel(legacy, rendered)
    write_contact_sheet(legacy, rendered)
    report = build_report(source_paths, decoded, rendered)
    report_text = json.dumps(report, indent=2) + "\n"
    (SOURCE_ROOT / "PRODUCTION_ANALYSIS.json").write_text(report_text, encoding="utf-8")
    (REPORT_DIR / "audio-analysis.json").write_text(report_text, encoding="utf-8")
    print(report_text)


def import_sources(import_dir: Path | None) -> None:
    if import_dir is None:
        return
    for spec in SOURCES.values():
        destination = ORIGINAL_DIR / spec["file"]
        if destination.exists():
            continue
        source = import_dir / spec["download"]
        if not source.exists():
            raise FileNotFoundError(f"Downloaded source not found: {source}")
        shutil.copy2(source, destination)


def render_variant(spec: dict, decoded: dict[str, np.ndarray]) -> dict:
    output_count = seconds_to_samples(OUTPUT_SECONDS)

    breath = slice_seconds(decoded["croc_hiss"], *spec["hiss_window"])
    breath = rate_shift(breath, spec["hiss_rate"])
    breath = fft_filter(breath, 280, 7_600, 180)
    breath = trim_leading(breath, 0.018, 12)
    breath = fit_length(breath, seconds_to_samples(0.56))
    breath = normalize_rms(breath, -22.5)
    breath *= shaped_envelope(len(breath), ((0, 0), (0.09, 0.42), (0.23, 1), (0.42, 0.32), (0.56, 0)))
    breath_stem = place(breath, output_count, 0.0)

    cry = slice_seconds(decoded["croc_chirp"], *spec["chirp_window"])
    cry = rate_shift(cry, spec["chirp_rate"])
    cry = fft_filter(cry, 125, 8_800, 180)
    cry = trim_leading(cry, 0.026, 14)
    cry = fit_length(cry, seconds_to_samples(1.48))
    cry = normalize_rms(cry, -16.8)
    cry *= shaped_envelope(len(cry), ((0, 0), (0.035, 0.35), (0.13, 0.92), (0.92, 1), (1.28, 0.55), (1.48, 0)))
    cry_stem = place(cry, output_count, 0.20)

    throat = slice_seconds(decoded["gecko"], *spec["gecko_window"])
    throat = rate_shift(throat, spec["gecko_rate"])
    throat = fft_filter(throat, 78, 2_850, 130)
    throat = trim_leading(throat, 0.018, 20)
    throat = fit_length(throat, seconds_to_samples(1.52))
    throat = normalize_rms(throat, -20.5)
    throat = np.tanh(throat * 1.12) / math.tanh(1.12)
    throat *= shaped_envelope(len(throat), ((0, 0), (0.08, 0.36), (0.26, 0.88), (0.98, 1), (1.34, 0.38), (1.52, 0)))
    throat_stem = place(throat, output_count, 0.16)

    cry_gain, throat_gain, breath_gain = spec["gains"]
    layers = (
        ("strained_breath_edge", breath_stem * breath_gain),
        ("tiny_croc_distress_contour", cry_stem * cry_gain),
        ("gecko_throat_body", throat_stem * throat_gain),
    )
    mix = sum(signal for _, signal in layers)
    mix = fft_filter(remove_dc(mix), 68, 9_100, 150)
    mix = np.tanh(mix * 1.13) / math.tanh(1.13)
    mix = apply_fades(remove_dc(mix), 10, 90)
    mix = normalize_peak(mix, db_to_linear(TARGET_PEAK_DB))

    stem_paths = []
    variant_dir = STEM_DIR / f"variant_{spec['id']}"
    for index, (name, signal) in enumerate(layers, start=1):
        path = variant_dir / f"{index:02d}_{name}.wav"
        write_pcm_wav(path, signal, 24)
        stem_paths.append(path)

    asset_id = f"baby_wyvern_first_cry_{spec['id']}"
    master_path = MASTER_DIR / f"{asset_id}_master.wav"
    runtime_path = RUNTIME_DIR / f"{asset_id}.wav"
    reference_path = SESSION_DIR / f"{asset_id}_reference_mix.wav"
    write_pcm_wav(master_path, mix, 24)
    write_pcm_wav(runtime_path, mix, 16)
    write_pcm_wav(reference_path, mix, 24)
    result = analyze(mix)
    result.update({
        "id": asset_id,
        "runtimeFile": relative(runtime_path),
        "runtimeSha256": hashlib.sha256(runtime_path.read_bytes()).hexdigest(),
        "masterFile": relative(master_path),
        "masterSha256": hashlib.sha256(master_path.read_bytes()).hexdigest(),
        "stemFiles": [relative(path) for path in stem_paths],
        "sourceSegments": [
            {"sourceId": "croc_hiss", "startSeconds": spec["hiss_window"][0], "endSeconds": spec["hiss_window"][1], "rate": spec["hiss_rate"]},
            {"sourceId": "croc_chirp", "startSeconds": spec["chirp_window"][0], "endSeconds": spec["chirp_window"][1], "rate": spec["chirp_rate"]},
            {"sourceId": "gecko", "startSeconds": spec["gecko_window"][0], "endSeconds": spec["gecko_window"][1], "rate": spec["gecko_rate"]},
        ],
        "process": [
            "short real crocodile hiss shaped as a strained pre-cry breath edge",
            "tiny-croc distress contour retained as the dominant newborn identity",
            "separate gecko recording supplies restrained irregular throat/chest body",
            "68 Hz high-pass, 9.1 kHz low-pass, mild saturation, 10/90 ms fades, -3.6 dBFS peak",
            "no oscillator, generated noise, Mama source, generic dragon roar, or baked egg filter",
        ],
        "_signal": mix,
    })
    return result


def load_legacy_mama_reference() -> np.ndarray:
    path = RUNTIME_DIR / "mama_wyvern_distant_roar_direct_mono_01.wav"
    signal = decode_mono(path)
    return fit_length(signal, seconds_to_samples(OUTPUT_SECONDS))


def write_audacity_session(rendered: list[dict]) -> None:
    lines = [
        "# Black Sky Bound - Baby Wyvern First Cry v1",
        "# Normal mono point-source performances. Egg perspective is applied live by the enclosure.",
        f"# Every stem is aligned to a {OUTPUT_SECONDS:.2f} second session window.",
    ]
    for entry in rendered:
        lines.append(f"window offset 0 duration {OUTPUT_SECONDS}")
        for stem in entry["stemFiles"]:
            source = ROOT / stem
            destination = SESSION_DIR / f"{entry['id']}_{source.name}"
            shutil.copy2(source, destination)
            lines.append(f'file "{destination.name}"')
        lines.append(f'file "{entry["id"]}_reference_mix.wav"')
    (SESSION_DIR / "baby_wyvern_first_cry_v1.lof").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_comparison_reel(legacy: np.ndarray, rendered: list[dict]) -> None:
    silence = np.zeros(seconds_to_samples(0.65), dtype=np.float64)
    signals = [normalize_peak(legacy, db_to_linear(-5.5)), silence]
    for entry in rendered:
        signals.extend((entry["_signal"], silence))
    write_pcm_wav(REPORT_DIR / "mama-vs-hatchling-comparison-reel.wav", np.concatenate(signals), 16)


def write_contact_sheet(legacy: np.ndarray, rendered: list[dict]) -> None:
    rows = [("legacy opening Mama identity", legacy)] + [(entry["id"], entry["_signal"]) for entry in rendered]
    width, row_height = 1480, 230
    image = Image.new("RGB", (width, 82 + row_height * len(rows)), "#081018")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    draw.text((24, 22), "BLACK SKY BOUND - BABY WYVERN FIRST CRY v1", fill="#f2d8aa", font=font)
    draw.text((24, 44), "Waveform + log spectrum / legacy Mama first, hatchling variants below", fill="#9fb6c7", font=font)
    for row_index, (name, signal) in enumerate(rows):
        top = 72 + row_index * row_height
        left, right = 235, width - 26
        draw.text((24, top + 4), name, fill="#e6edf3", font=font)
        wave_top, wave_bottom = top + 6, top + 108
        spectrum_top, spectrum_bottom = top + 122, top + 214
        draw.rectangle((left, wave_top, right, wave_bottom), outline="#284052")
        draw.rectangle((left, spectrum_top, right, spectrum_bottom), outline="#284052")
        for x in range(right - left):
            start = int(x * len(signal) / (right - left))
            end = max(start + 1, int((x + 1) * len(signal) / (right - left)))
            level = float(np.max(np.abs(signal[start:end])))
            mid = (wave_top + wave_bottom) // 2
            height = int(level * (wave_bottom - wave_top) * 0.46)
            draw.line((left + x, mid - height, left + x, mid + height), fill="#58c3bf")
        spectrum = np.abs(np.fft.rfft(signal * np.hanning(len(signal))))
        frequencies = np.fft.rfftfreq(len(signal), 1 / SAMPLE_RATE)
        maximum = max(float(np.max(spectrum)), 1e-12)
        points = []
        for x in range(right - left):
            frequency = 45 * ((10_500 / 45) ** (x / max(1, right - left - 1)))
            index = int(np.argmin(np.abs(frequencies - frequency)))
            db = 20 * math.log10(max(float(spectrum[index]) / maximum, 1e-5))
            y = spectrum_bottom - int((max(-60, db) + 60) / 60 * (spectrum_bottom - spectrum_top))
            points.append((left + x, y))
        draw.line(points, fill="#b98cff", width=2)
    path = REPORT_DIR / "waveform-spectral-contact-sheet.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def build_report(source_paths: dict[str, Path], decoded: dict[str, np.ndarray], rendered: list[dict]) -> dict:
    sources = []
    for source_id, spec in SOURCES.items():
        path = source_paths[source_id]
        sources.append({
            "id": source_id,
            "role": spec["role"],
            "file": relative(path),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "durationSeconds": round(len(decoded[source_id]) / SAMPLE_RATE, 4),
            "provider": "Pixabay",
            "artist": spec["artist"],
            "pageUrl": spec["url"],
            "license": "Pixabay Content License",
        })
    return {
        "contract": "black-sky-bound.baby-wyvern-first-cry-production.v1",
        "sampleRate": SAMPLE_RATE,
        "generator": relative(Path(__file__)),
        "designIntent": "A newborn, effortful reptilian first lung-call: brief strained air, tiny-croc distress contour, and quiet irregular throat body; vulnerable rather than dominant.",
        "runtimeCueId": "player.voice.first_cry",
        "runtimeOwnership": "player actor voice emitter; opening phase owns timing; live egg enclosure owns perspective",
        "syntheticLayersInProductionAssets": 0,
        "mamaSourceLayers": 0,
        "bakedEggPerspectiveLayers": 0,
        "sources": sources,
        "variants": [{key: value for key, value in entry.items() if key != "_signal"} for entry in rendered],
        "audacitySession": relative(SESSION_DIR / "baby_wyvern_first_cry_v1.lof"),
        "comparisonReel": relative(REPORT_DIR / "mama-vs-hatchling-comparison-reel.wav"),
        "contactSheet": relative(REPORT_DIR / "waveform-spectral-contact-sheet.png"),
    }


if __name__ == "__main__":
    main()
