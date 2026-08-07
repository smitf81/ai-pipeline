from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
import wave
from pathlib import Path

import miniaudio
import numpy as np
from PIL import Image, ImageDraw, ImageFont


SAMPLE_RATE = 48_000
ROOT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = ROOT / "assets" / "audio" / "sources" / "player_bite_v2"
ORIGINAL_DIR = SOURCE_ROOT / "originals"
STEM_DIR = SOURCE_ROOT / "processed_stems"
SESSION_DIR = SOURCE_ROOT / "audacity_session"
LEGACY_DIR = SOURCE_ROOT / "legacy_procedural"
MASTER_DIR = ROOT / "assets" / "audio" / "masters"
RUNTIME_DIR = ROOT / "assets" / "audio" / "production"
REPORT_DIR = ROOT / "artifacts" / "player-bite-v2"
TARGET_PEAK_DB = -3.8
CONTACT_SECONDS = 0.195
OUTPUT_SECONDS = 0.48

SOURCES = {
    "snarl": ORIGINAL_DIR / "dog-snarl-self-made-105738.mp3",
    "jaw": ORIGINAL_DIR / "dog-eating-a-bone-and-growling-76746.mp3",
    "wet": ORIGINAL_DIR / "eating-juicy-meat-7024.mp3",
}

VARIANTS = (
    {
        "id": "01",
        "snarl_window": (2.06, 2.72),
        "snarl_rate": 0.82,
        "jaw_peak": 14.33,
        "jaw_rate": 0.78,
        "wet_peak": 5.73,
        "wet_rate": 0.86,
        "gains": (0.31, 0.92, 0.12),
    },
    {
        "id": "02",
        "snarl_window": (2.38, 3.08),
        "snarl_rate": 0.76,
        "jaw_peak": 19.29,
        "jaw_rate": 0.84,
        "wet_peak": 3.28,
        "wet_rate": 0.79,
        "gains": (0.34, 0.88, 0.105),
    },
    {
        "id": "03",
        "snarl_window": (2.72, 3.24),
        "snarl_rate": 0.88,
        "jaw_peak": 20.11,
        "jaw_rate": 0.73,
        "wet_peak": 7.72,
        "wet_rate": 0.92,
        "gains": (0.29, 0.96, 0.095),
    },
)


def main() -> None:
    for directory in (STEM_DIR, SESSION_DIR, LEGACY_DIR, MASTER_DIR, RUNTIME_DIR, REPORT_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    missing = [str(path) for path in SOURCES.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing retained source recordings: {missing}")

    decoded = {name: decode_mono(path) for name, path in SOURCES.items()}
    legacy = preserve_legacy_runtime()
    rendered = [render_variant(spec, decoded) for spec in VARIANTS]
    write_audacity_session(rendered)
    write_comparison_reel(legacy, rendered)
    render_contact_sheet(legacy, rendered, REPORT_DIR / "waveform-spectral-contact-sheet.png")

    report = {
        "contract": "black-sky-bound.player-bite-production.v2",
        "sampleRate": SAMPLE_RATE,
        "generator": relative(Path(__file__)),
        "designIntent": (
            "A small predatory reptile: a restrained real breath/snarl load, organic jaw-and-bone closure at animation contact, "
            "and a quiet wet mouth detail. Confirmed damage remains owned by combat.enemy.hit.flesh."
        ),
        "contactSeconds": CONTACT_SECONDS,
        "animationContactSeconds": round(0.34 * 0.58, 4),
        "syntheticLayersInProductionAssets": 0,
        "sourceCount": len(SOURCES),
        "sources": [source_entry(name, path, decoded[name]) for name, path in SOURCES.items()],
        "legacyProceduralReferences": [entry[0] for entry in legacy],
        "variants": [{key: value for key, value in entry.items() if key != "_signal"} for entry in rendered],
        "audacitySession": relative(SESSION_DIR / "player_bite_v2.lof"),
        "comparisonReel": relative(REPORT_DIR / "legacy-vs-production-comparison-reel.wav"),
        "contactSheet": relative(REPORT_DIR / "waveform-spectral-contact-sheet.png"),
        "trackedAnalysis": relative(SOURCE_ROOT / "PRODUCTION_ANALYSIS.json"),
    }
    report_text = json.dumps(report, indent=2) + "\n"
    (REPORT_DIR / "audio-analysis.json").write_text(report_text, encoding="utf-8")
    (SOURCE_ROOT / "PRODUCTION_ANALYSIS.json").write_text(report_text, encoding="utf-8")
    print(json.dumps(report, indent=2))


def render_variant(spec: dict, decoded: dict[str, np.ndarray]) -> dict:
    output_count = seconds_to_samples(OUTPUT_SECONDS)

    snarl = slice_seconds(decoded["snarl"], *spec["snarl_window"])
    snarl = rate_shift(snarl, spec["snarl_rate"])
    snarl = fft_filter(snarl, 95, 3_300, edge_hz=120)
    snarl = np.tanh(normalize_rms(snarl, -19.0) * 1.08)
    snarl = trim_leading(snarl, relative_threshold=0.018, pre_roll_ms=3)
    snarl = fit_length(snarl, seconds_to_samples(0.29))
    snarl *= shaped_envelope(len(snarl), ((0.0, 0.0), (0.035, 0.28), (0.13, 0.78), (0.185, 1.0), (0.29, 0.0)))
    snarl_stem = place(snarl, output_count, 0.0)

    jaw_source = slice_seconds(decoded["jaw"], spec["jaw_peak"] - 0.075, spec["jaw_peak"] + 0.155)
    jaw = rate_shift(jaw_source, spec["jaw_rate"])
    jaw = fft_filter(jaw, 52, 5_400, edge_hz=150)
    jaw = np.tanh(normalize_peak(jaw, 0.92) * 1.22)
    jaw_peak_index = transient_index(jaw, search_seconds=0.18)
    jaw_start = CONTACT_SECONDS - jaw_peak_index / SAMPLE_RATE
    jaw_stem = place(jaw, output_count, jaw_start)

    wet_source = slice_seconds(decoded["wet"], spec["wet_peak"] - 0.065, spec["wet_peak"] + 0.16)
    wet = rate_shift(wet_source, spec["wet_rate"])
    wet = fft_filter(wet, 105, 2_650, edge_hz=120)
    wet = np.tanh(normalize_rms(wet, -20.0) * 1.25)
    wet *= shaped_envelope(len(wet), ((0.0, 0.0), (0.012, 0.75), (0.06, 1.0), (0.18, 0.24), (0.28, 0.0)))
    wet_peak_index = transient_index(wet, search_seconds=0.14)
    wet_start = CONTACT_SECONDS + 0.018 - wet_peak_index / SAMPLE_RATE
    wet_stem = place(wet, output_count, wet_start)

    snarl_gain, jaw_gain, wet_gain = spec["gains"]
    mix = snarl_stem * snarl_gain + jaw_stem * jaw_gain + wet_stem * wet_gain
    mix = fft_filter(remove_dc(mix), 38, 7_200, edge_hz=100)
    mix = np.tanh(mix * 1.2) / math.tanh(1.2)
    mix = apply_fades(mix, 4, 30)
    mix = remove_dc(mix)
    mix = apply_fades(mix, 1, 8)
    mix = normalize_peak(mix, db_to_linear(TARGET_PEAK_DB))

    variant_id = spec["id"]
    stem_paths = []
    for layer_index, (layer_name, signal) in enumerate(
        (("breath_snarl_load", snarl_stem * snarl_gain), ("jaw_bone_closure", jaw_stem * jaw_gain), ("wet_mouth_detail", wet_stem * wet_gain)),
        start=1,
    ):
        path = STEM_DIR / f"{variant_id}_{layer_index:02d}_{layer_name}.wav"
        write_pcm_wav(path, signal, bits=24)
        stem_paths.append(relative(path))

    master_path = MASTER_DIR / f"player_bite_snap_{variant_id}_master.wav"
    runtime_path = RUNTIME_DIR / f"player_bite_snap_{variant_id}.wav"
    session_mix_path = SESSION_DIR / f"player_bite_snap_{variant_id}_reference_mix.wav"
    write_pcm_wav(master_path, mix, bits=24)
    write_pcm_wav(runtime_path, mix, bits=16)
    write_pcm_wav(session_mix_path, mix, bits=24)

    analysis = analyze(mix)
    analysis.update(
        {
            "id": f"player_bite_snap_{variant_id}",
            "runtimeFile": relative(runtime_path),
            "runtimeSha256": hashlib.sha256(runtime_path.read_bytes()).hexdigest(),
            "masterFile": relative(master_path),
            "stemFiles": stem_paths,
            "contactSeconds": CONTACT_SECONDS,
            "jawSourcePeakSeconds": spec["jaw_peak"],
            "wetSourcePeakSeconds": spec["wet_peak"],
            "process": [
                "real recorded animal breath/snarl pitch-shaped and band-limited for a smaller reptilian throat load",
                "real recorded jaw-on-bone transient aligned to the 195 ms animation contact point",
                "restrained real recorded wet-food detail after closure; intentionally below the separate confirmed-hit cue",
                "38 Hz high-pass, 7.2 kHz low-pass, mild soft saturation, 4/30 ms fades, -3.8 dBFS peak",
            ],
            "_signal": mix,
        }
    )
    return analysis


def preserve_legacy_runtime() -> list[tuple[str, np.ndarray]]:
    preserved = []
    for variant_id in ("01", "02"):
        source = RUNTIME_DIR / f"player_bite_snap_{variant_id}.wav"
        artifact_copy = REPORT_DIR / f"legacy-procedural-player_bite_snap_{variant_id}.wav"
        canonical = LEGACY_DIR / f"player_bite_snap_{variant_id}_rejected_v1.wav"
        if not canonical.exists():
            recovery_source = artifact_copy if artifact_copy.exists() else source
            if not recovery_source.exists():
                continue
            shutil.copyfile(recovery_source, canonical)
        shutil.copyfile(canonical, artifact_copy)
        preserved.append((relative(canonical), read_pcm_wav(canonical)))
    return preserved


def write_audacity_session(rendered: list[dict]) -> None:
    lines = [
        "# Black Sky Bound player bite v2 - aligned real-source stems and reference mixes",
        "# Open this LOF in Audacity; every stem is full-length and already aligned to animation contact.",
        f"# Jaw closure target: {CONTACT_SECONDS:.3f} seconds",
    ]
    for entry in rendered:
        lines.append(f"window offset 0 duration {OUTPUT_SECONDS}")
        for stem_path in entry["stemFiles"]:
            source = ROOT / stem_path
            destination = SESSION_DIR / source.name
            shutil.copyfile(source, destination)
            lines.append(f'file "{destination.name}"')
        mix_name = Path(entry["runtimeFile"]).stem + "_reference_mix.wav"
        lines.append(f'file "{mix_name}"')
    (SESSION_DIR / "player_bite_v2.lof").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_comparison_reel(legacy: list[tuple[str, np.ndarray]], rendered: list[dict]) -> None:
    silence = np.zeros(seconds_to_samples(0.55), dtype=np.float64)
    segments = []
    for _, signal in legacy:
        segments.extend((signal, silence))
    segments.append(np.zeros(seconds_to_samples(0.65), dtype=np.float64))
    for entry in rendered:
        segments.extend((entry["_signal"], silence))
    write_pcm_wav(REPORT_DIR / "legacy-vs-production-comparison-reel.wav", np.concatenate(segments), bits=16)


def render_contact_sheet(legacy: list[tuple[str, np.ndarray]], rendered: list[dict], path: Path) -> None:
    rows = [(Path(name).stem, signal) for name, signal in legacy]
    rows.extend((entry["id"], entry["_signal"]) for entry in rendered)
    width, row_height = 1500, 245
    image = Image.new("RGB", (width, 88 + row_height * len(rows)), "#081018")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    draw.text((28, 24), "BLACK SKY BOUND - PLAYER BITE v2 / LEGACY vs REAL-SOURCE PRODUCTION", fill="#f2d8aa", font=font)
    draw.text((28, 48), "Waveform (top) + log-frequency spectrum (bottom); gold line = 195 ms contact", fill="#9fb6c7", font=font)
    for row_index, (name, signal) in enumerate(rows):
        top = 78 + row_index * row_height
        draw.text((28, top + 5), name, fill="#e6edf3", font=font)
        graph_left, graph_right = 230, width - 28
        waveform_top, waveform_bottom = top + 8, top + 112
        spectrum_top, spectrum_bottom = top + 126, top + 226
        draw.rectangle((graph_left, waveform_top, graph_right, waveform_bottom), outline="#284052")
        draw.rectangle((graph_left, spectrum_top, graph_right, spectrum_bottom), outline="#284052")
        mono = signal if signal.ndim == 1 else np.mean(signal, axis=1)
        bucket_count = graph_right - graph_left
        for x in range(bucket_count):
            start = int(x * len(mono) / bucket_count)
            end = max(start + 1, int((x + 1) * len(mono) / bucket_count))
            level = float(np.max(np.abs(mono[start:end])))
            y_mid = (waveform_top + waveform_bottom) // 2
            height = int(level * (waveform_bottom - waveform_top) * 0.46)
            draw.line((graph_left + x, y_mid - height, graph_left + x, y_mid + height), fill="#58c3bf")
        contact_x = graph_left + int(CONTACT_SECONDS / OUTPUT_SECONDS * bucket_count)
        draw.line((contact_x, waveform_top, contact_x, waveform_bottom), fill="#f0b45e", width=2)
        window = np.hanning(len(mono))
        spectrum = np.abs(np.fft.rfft(mono * window))
        spectrum_db = 20 * np.log10(np.maximum(spectrum / max(np.max(spectrum), 1e-12), 1e-6))
        frequencies = np.fft.rfftfreq(len(mono), 1 / SAMPLE_RATE)
        log_freqs = np.geomspace(35, 12_000, bucket_count)
        values = np.interp(log_freqs, frequencies, spectrum_db)
        points = []
        for x, value in enumerate(values):
            y = spectrum_bottom - int(np.clip((value + 60) / 60, 0, 1) * (spectrum_bottom - spectrum_top))
            points.append((graph_left + x, y))
        draw.line(points, fill="#b98cff", width=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def source_entry(name: str, path: Path, signal: np.ndarray) -> dict:
    return {
        "role": name,
        "file": relative(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "durationSeconds": round(len(signal) / SAMPLE_RATE, 4),
        "provider": "Pixabay",
        "license": "Pixabay Content License",
    }


def decode_mono(path: Path) -> np.ndarray:
    decoded = miniaudio.decode_file(
        str(path),
        output_format=miniaudio.SampleFormat.FLOAT32,
        nchannels=1,
        sample_rate=SAMPLE_RATE,
    )
    signal = np.asarray(decoded.samples, dtype=np.float64)
    return remove_dc(signal)


def slice_seconds(signal: np.ndarray, start: float, end: float) -> np.ndarray:
    return signal[max(0, seconds_to_samples(start)):min(len(signal), seconds_to_samples(end))].copy()


def rate_shift(signal: np.ndarray, rate: float) -> np.ndarray:
    output_length = max(1, int(round(len(signal) / rate)))
    positions = np.arange(output_length, dtype=np.float64) * rate
    return np.interp(positions, np.arange(len(signal)), signal, left=0.0, right=0.0)


def fft_filter(signal: np.ndarray, low_hz: float, high_hz: float, edge_hz: float) -> np.ndarray:
    spectrum = np.fft.rfft(signal)
    frequencies = np.fft.rfftfreq(len(signal), 1 / SAMPLE_RATE)
    mask = np.ones_like(frequencies)
    if low_hz > 0:
        lower_start = max(0.0, low_hz - edge_hz)
        mask[frequencies <= lower_start] = 0
        transition = (frequencies > lower_start) & (frequencies < low_hz)
        mask[transition] = 0.5 - 0.5 * np.cos(np.pi * (frequencies[transition] - lower_start) / max(low_hz - lower_start, 1))
    upper_end = high_hz + edge_hz
    mask[frequencies >= upper_end] = 0
    transition = (frequencies > high_hz) & (frequencies < upper_end)
    mask[transition] = 0.5 + 0.5 * np.cos(np.pi * (frequencies[transition] - high_hz) / max(upper_end - high_hz, 1))
    return np.fft.irfft(spectrum * mask, n=len(signal))


def shaped_envelope(count: int, points: tuple[tuple[float, float], ...]) -> np.ndarray:
    times = np.arange(count) / SAMPLE_RATE
    return np.interp(times, [point[0] for point in points], [point[1] for point in points], left=0.0, right=0.0)


def place(signal: np.ndarray, output_count: int, start_seconds: float) -> np.ndarray:
    output = np.zeros(output_count, dtype=np.float64)
    start = seconds_to_samples(start_seconds)
    source_start = max(0, -start)
    destination_start = max(0, start)
    copy_count = min(len(signal) - source_start, output_count - destination_start)
    if copy_count > 0:
        output[destination_start:destination_start + copy_count] = signal[source_start:source_start + copy_count]
    return output


def transient_index(signal: np.ndarray, search_seconds: float) -> int:
    search_count = min(len(signal), seconds_to_samples(search_seconds))
    window = max(1, seconds_to_samples(0.002))
    energy = np.convolve(np.abs(signal[:search_count]), np.ones(window) / window, mode="same")
    return int(np.argmax(energy))


def fit_length(signal: np.ndarray, count: int) -> np.ndarray:
    if len(signal) >= count:
        return signal[:count].copy()
    return np.pad(signal, (0, count - len(signal)))


def trim_leading(signal: np.ndarray, relative_threshold: float, pre_roll_ms: float) -> np.ndarray:
    peak = float(np.max(np.abs(signal)))
    indices = np.flatnonzero(np.abs(signal) >= peak * relative_threshold)
    if not len(indices):
        return signal
    start = max(0, int(indices[0]) - int(round(pre_roll_ms * SAMPLE_RATE / 1000)))
    return signal[start:].copy()


def remove_dc(signal: np.ndarray) -> np.ndarray:
    return signal - np.mean(signal, axis=0)


def normalize_peak(signal: np.ndarray, target: float) -> np.ndarray:
    peak = float(np.max(np.abs(signal)))
    return signal if peak <= 1e-12 else signal * (target / peak)


def normalize_rms(signal: np.ndarray, target_db: float) -> np.ndarray:
    rms = float(np.sqrt(np.mean(np.square(signal))))
    target = db_to_linear(target_db)
    return signal if rms <= 1e-12 else signal * (target / rms)


def apply_fades(signal: np.ndarray, fade_in_ms: float, fade_out_ms: float) -> np.ndarray:
    output = signal.copy()
    fade_in = min(len(output), int(round(fade_in_ms * SAMPLE_RATE / 1000)))
    fade_out = min(len(output), int(round(fade_out_ms * SAMPLE_RATE / 1000)))
    if fade_in:
        output[:fade_in] *= np.sin(np.linspace(0, np.pi / 2, fade_in)) ** 2
    if fade_out:
        output[-fade_out:] *= np.cos(np.linspace(0, np.pi / 2, fade_out)) ** 2
    return output


def analyze(signal: np.ndarray) -> dict:
    peak = float(np.max(np.abs(signal)))
    rms = float(np.sqrt(np.mean(np.square(signal))))
    threshold = db_to_linear(-50)
    indices = np.flatnonzero(np.abs(signal) >= threshold)
    first_signal_ms = float(indices[0] / SAMPLE_RATE * 1000) if len(indices) else None
    return {
        "durationSeconds": round(len(signal) / SAMPLE_RATE, 4),
        "channels": 1,
        "peakDbfs": round(20 * math.log10(max(peak, 1e-12)), 3),
        "rmsDbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
        "dcOffset": round(float(abs(np.mean(signal))), 8),
        "clippedSampleCount": int(np.count_nonzero(np.abs(signal) >= 0.999)),
        "firstSignalMs": round(first_signal_ms, 3) if first_signal_ms is not None else None,
    }


def read_pcm_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        sample_width = handle.getsampwidth()
        if handle.getframerate() != SAMPLE_RATE or sample_width != 2:
            raise ValueError(f"Legacy reference must be 48 kHz 16-bit PCM: {path}")
        raw = handle.readframes(handle.getnframes())
    signal = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
    if channels > 1:
        signal = signal.reshape(-1, channels).mean(axis=1)
    return signal


def write_pcm_wav(path: Path, signal: np.ndarray, bits: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(signal, -1.0, 1.0 - 1 / (2 ** (bits - 1)))
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(bits // 8)
        handle.setframerate(SAMPLE_RATE)
        if bits == 16:
            payload = np.round(clipped * 32767).astype("<i2").tobytes()
        elif bits == 24:
            values = np.round(clipped * 8_388_607).astype(np.int32)
            payload = b"".join(struct.pack("<i", int(value))[:3] for value in values)
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
