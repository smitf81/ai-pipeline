from __future__ import annotations

import json
import math
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


SAMPLE_RATE = 48_000
ROOT = Path(__file__).resolve().parents[2]
MASTER_DIR = ROOT / "assets" / "audio" / "masters"
RUNTIME_DIR = ROOT / "assets" / "audio" / "production"
REPORT_DIR = ROOT / "artifacts" / "production-sfx-v1"
MAMA_SOURCE_DIR = ROOT / "assets" / "audio" / "sources" / "mama_roar_v2"
MAMA_CANDIDATE_DIR = REPORT_DIR / "mama-roar-candidates"


def main() -> None:
    for directory in (MASTER_DIR, RUNTIME_DIR, REPORT_DIR, MAMA_SOURCE_DIR, MAMA_CANDIDATE_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    mama_exploration = render_mama_roar_exploration()
    rendered = [
        render_asset("player_bite_snap_01", make_bite(seed=1401, variant=0), target_peak_db=-2.8),
        render_asset("player_bite_snap_02", make_bite(seed=1402, variant=1), target_peak_db=-2.8),
        render_asset("enemy_hit_flesh_01", make_flesh_impact(seed=2301, variant=0), target_peak_db=-2.3),
        render_asset("enemy_hit_flesh_02", make_flesh_impact(seed=2302, variant=1), target_peak_db=-2.3),
        render_asset(
            "mama_wyvern_distant_roar_01",
            mama_exploration.pop("_selectedSignal"),
            target_peak_db=-3.8,
        ),
    ]

    render_contact_sheet(rendered, REPORT_DIR / "waveform-spectral-contact-sheet.png")
    report = {
        "contract": "black-sky-bound.production-sfx-generation.v1",
        "sampleRate": SAMPLE_RATE,
        "generator": str(Path(__file__).relative_to(ROOT)).replace("\\", "/"),
        "externalComponents": [],
        "assets": rendered,
        "mamaRoarExploration": mama_exploration,
    }
    report_path = REPORT_DIR / "audio-analysis.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


def make_bite(seed: int, variant: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    duration = 0.43
    count = seconds_to_samples(duration)
    t = np.arange(count) / SAMPLE_RATE
    snap_at = 0.128 + variant * 0.014
    signal = np.zeros(count, dtype=np.float64)

    throat_env = envelope(
        count,
        [(0.0, 0.0), (0.018, 0.18), (0.072, 0.72), (snap_at, 0.52), (0.24, 0.12), (0.38, 0.0)],
    )
    throat_noise = spectral_filter(rng.normal(0, 1, count), low_hz=75, high_hz=1180 + variant * 90, order=4)
    throat_tone = chirp(205 + variant * 11, 142 + variant * 6, duration, wobble_hz=24, wobble_depth=0.035)
    signal += throat_env * (throat_noise * 0.24 + throat_tone * 0.22)

    rush_env = envelope(
        count,
        [(0.022, 0.0), (0.052, 0.16), (snap_at - 0.012, 0.62), (snap_at + 0.025, 0.0)],
    )
    rush = spectral_filter(rng.normal(0, 1, count), low_hz=620, high_hz=7200, order=3)
    signal += rush * rush_env * (0.24 + variant * 0.025)

    jaw_noise = spectral_filter(rng.normal(0, 1, seconds_to_samples(0.13)), low_hz=65, high_hz=1850, order=3)
    jaw_noise *= envelope(
        len(jaw_noise),
        [(0.0, 0.0), (0.0015, 1.0), (0.018, 0.55), (0.07, 0.12), (0.13, 0.0)],
    )
    add_at(signal, jaw_noise * 0.58, snap_at)

    resonances = (
        (168 + variant * 9, 0.18, 0.42),
        (476 + variant * 24, 0.095, 0.23),
        (1360 + variant * 70, 0.038, 0.13),
    )
    for frequency, decay, gain in resonances:
        add_at(signal, resonant_hit(frequency, decay, gain), snap_at)

    tooth_gap = 0.008 + variant * 0.002
    for offset, gain in ((0.0, 0.44), (tooth_gap, 0.31), (tooth_gap + 0.007, 0.16)):
        click = spectral_filter(rng.normal(0, 1, seconds_to_samples(0.025)), low_hz=1800, high_hz=12_000, order=2)
        click *= exponential_decay(len(click), 0.006)
        add_at(signal, click * gain, snap_at + offset)

    tail_env = envelope(
        count,
        [(snap_at, 0.0), (snap_at + 0.025, 0.38), (0.25, 0.2), (0.42, 0.0)],
    )
    tail = spectral_filter(rng.normal(0, 1, count), low_hz=110, high_hz=900, order=4)
    signal += tail * tail_env * 0.14
    return finish(signal, highpass_hz=32, saturation=1.45)


def make_flesh_impact(seed: int, variant: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    duration = 0.49
    count = seconds_to_samples(duration)
    signal = np.zeros(count, dtype=np.float64)
    impact_at = 0.006 + variant * 0.003

    thud = chirp(126 - variant * 9, 62 - variant * 3, 0.33, wobble_hz=17, wobble_depth=0.025)
    thud *= envelope(
        len(thud),
        [(0.0, 0.0), (0.002, 1.0), (0.03, 0.82), (0.12, 0.42), (0.25, 0.12), (0.33, 0.0)],
    )
    add_at(signal, thud * 0.58, impact_at)

    wet = spectral_filter(rng.normal(0, 1, seconds_to_samples(0.24)), low_hz=125, high_hz=1850, order=3)
    wet *= envelope(
        len(wet),
        [(0.0, 0.0), (0.001, 1.0), (0.018, 0.78), (0.085, 0.36), (0.18, 0.08), (0.24, 0.0)],
    )
    wet = np.tanh(wet * (1.7 + variant * 0.12))
    add_at(signal, wet * 0.48, impact_at)

    cloth = spectral_filter(rng.normal(0, 1, seconds_to_samples(0.105)), low_hz=850, high_hz=6500, order=3)
    cloth *= envelope(
        len(cloth),
        [(0.0, 0.0), (0.001, 1.0), (0.012, 0.48), (0.04, 0.23), (0.105, 0.0)],
    )
    add_at(signal, cloth * (0.25 + variant * 0.025), impact_at + 0.002)

    for offset, frequency, decay, gain in (
        (0.011, 420 + variant * 35, 0.075, 0.22),
        (0.026, 920 - variant * 55, 0.048, 0.17),
        (0.041 + variant * 0.006, 1720 + variant * 80, 0.024, 0.11),
    ):
        add_at(signal, resonant_hit(frequency, decay, gain), impact_at + offset)

    body_tail = spectral_filter(rng.normal(0, 1, count), low_hz=45, high_hz=380, order=4)
    body_tail *= envelope(
        count,
        [(impact_at, 0.0), (impact_at + 0.014, 0.32), (0.12, 0.2), (0.34, 0.05), (0.49, 0.0)],
    )
    signal += body_tail * 0.19

    grit = np.zeros(count, dtype=np.float64)
    for offset in (0.022, 0.034 + variant * 0.004, 0.057, 0.081):
        burst = spectral_filter(rng.normal(0, 1, seconds_to_samples(0.018)), low_hz=1600, high_hz=9000, order=2)
        burst *= exponential_decay(len(burst), 0.0045)
        add_at(grit, burst * rng.uniform(0.06, 0.12), impact_at + offset)
    signal += grit
    return finish(signal, highpass_hz=28, saturation=1.62)


def render_mama_roar_exploration() -> dict:
    profiles = [
        {
            "id": "candidate_a_clean_chamber_bellow",
            "seed": 8711,
            "bodyGain": 0.46,
            "chamberGain": 0.64,
            "growlGain": 0.24,
            "wetGain": 0.43,
            "tearGain": 0.3,
            "raspGain": 0.025,
            "tailGain": 0.17,
            "instability": 0.024,
            "status": "rejected",
            "reason": "Too stable and harmonically tidy; retained scale but drifted toward a clean generic dragon bellow.",
        },
        {
            "id": "candidate_b_wet_marsh_fury",
            "seed": 8721,
            "bodyGain": 0.52,
            "chamberGain": 0.7,
            "growlGain": 0.34,
            "wetGain": 0.88,
            "tearGain": 0.48,
            "raspGain": 0.045,
            "tailGain": 0.23,
            "instability": 0.052,
            "status": "selected",
            "reason": "Best balance of immense chest weight, unstable multi-chamber warble, wet reptilian decay, tearing exhale, and distant forest scale.",
        },
        {
            "id": "candidate_c_torn_high_fury",
            "seed": 8731,
            "bodyGain": 0.36,
            "chamberGain": 0.52,
            "growlGain": 0.25,
            "wetGain": 0.55,
            "tearGain": 0.86,
            "raspGain": 0.16,
            "tailGain": 0.18,
            "instability": 0.039,
            "status": "rejected",
            "reason": "The torn peak and upper rasp dominated the anatomy, reducing perceived body size and approaching an overly strained scream.",
        },
    ]
    candidate_entries = []
    selected_signal = None
    comparison_segments = []
    for profile in profiles:
        candidate = make_mama_roar_candidate(profile)
        mix = apply_fades(remove_dc(candidate["mix"]), 5, 85)
        mix = scale_to_peak(mix, db_to_linear(-4.5))
        candidate_path = MAMA_CANDIDATE_DIR / f"{profile['id']}.wav"
        write_pcm_wav(candidate_path, mix, bits=16)
        comparison_segments.append(mix)
        if profile["status"] == "selected":
            selected_signal = mix

        stem_entries = []
        stem_dir = MAMA_SOURCE_DIR / profile["id"]
        stem_dir.mkdir(parents=True, exist_ok=True)
        for layer_id, stem in candidate["stems"].items():
            stem_signal = apply_fades(remove_dc(stem), 3, 65)
            stem_signal = scale_to_peak(stem_signal, db_to_linear(-8))
            stem_path = stem_dir / f"{layer_id}.wav"
            write_pcm_wav(stem_path, stem_signal, bits=24)
            stem_analysis = analyze(stem_signal)
            stem_entries.append(
                {
                    "id": layer_id,
                    "sourceFile": str(stem_path.relative_to(ROOT)).replace("\\", "/"),
                    "sourceType": "procedural_original_no_recordings_or_external_samples",
                    "process": candidate["layerProcesses"][layer_id],
                    "analysis": stem_analysis,
                }
            )

        candidate_analysis = analyze(mix)
        candidate_entries.append(
            {
                "name": profile["id"],
                "durationSeconds": candidate_analysis["durationSeconds"],
                "channels": candidate_analysis["channels"],
                "peakDbfs": candidate_analysis["peakDbfs"],
                "rmsDbfs": candidate_analysis["rmsDbfs"],
                "_signal": mix,
                "id": profile["id"],
                "status": profile["status"],
                "decision": profile["reason"],
                "candidateFile": str(candidate_path.relative_to(ROOT)).replace("\\", "/"),
                "analysis": candidate_analysis,
                "layers": stem_entries,
                "mixProcessing": [
                    "layer gains from candidate profile",
                    "nonlinear soft saturation",
                    "23 Hz high-pass and 15.5 kHz low-pass",
                    "asymmetric multi-tap forest reflections",
                    "stereo side rasp decorrelation",
                    "85 ms final fade",
                    "-4.5 dBFS comparison peak",
                ],
            }
        )

    if selected_signal is None:
        raise RuntimeError("mama_roar_candidate_selection_missing")
    render_contact_sheet(
        [dict(entry) for entry in candidate_entries],
        REPORT_DIR / "mama-roar-candidate-contact-sheet.png",
    )
    audition_reel = concatenate_with_silence(comparison_segments, silence_seconds=0.8)
    audition_path = MAMA_CANDIDATE_DIR / "mama_roar_candidate_audition_reel.wav"
    write_pcm_wav(audition_path, audition_reel, bits=16)
    exploration = {
        "contract": "black-sky-bound.mama-roar-exploration.v2",
        "selectedCandidateId": "candidate_b_wet_marsh_fury",
        "candidateCount": len(candidate_entries),
        "auditionOrder": [entry["id"] for entry in candidate_entries],
        "auditionReel": str(audition_path.relative_to(ROOT)).replace("\\", "/"),
        "externalComponents": [],
        "candidates": [
            {key: value for key, value in entry.items() if key != "_signal"}
            for entry in candidate_entries
        ],
        "_selectedSignal": selected_signal,
    }
    exploration_path = REPORT_DIR / "mama-roar-exploration.json"
    exploration_path.write_text(
        json.dumps({key: value for key, value in exploration.items() if key != "_selectedSignal"}, indent=2) + "\n",
        encoding="utf-8",
    )
    return exploration


def make_mama_roar_candidate(profile: dict) -> dict:
    rng = np.random.default_rng(profile["seed"])
    duration = 5.2
    count = seconds_to_samples(duration)
    t = np.arange(count) / SAMPLE_RATE
    peak_env = envelope(
        count,
        [
            (0, 0),
            (0.28, 0.04),
            (0.62, 0.22),
            (1.08, 0.62),
            (1.68, 1),
            (2.42, 0.94),
            (3.05, 0.68),
            (3.78, 0.3),
            (4.5, 0.08),
            (5.2, 0),
        ],
    )

    inhale_noise = spectral_filter(rng.normal(0, 1, count), low_hz=68, high_hz=1750, order=4)
    inhale_tone = chirp(57, 83, duration, wobble_hz=5.5, wobble_depth=0.028)
    inhale_env = envelope(count, [(0, 0), (0.08, 0.08), (0.32, 0.48), (0.7, 0.82), (1.0, 0.12), (1.16, 0)])
    inhale = (inhale_noise * 0.72 + inhale_tone * 0.28) * inhale_env * 0.24

    rumble_fundamental = chirp(43, 31, duration, wobble_hz=7.3, wobble_depth=0.026)
    rumble_harmonics = chirp(86, 61, duration, wobble_hz=4.1, wobble_depth=0.018) * 0.42
    rumble_grit = spectral_filter(rng.normal(0, 1, count), low_hz=31, high_hz=240, order=5) * 0.16
    rumble_env = envelope(count, [(0.2, 0), (0.58, 0.25), (1.22, 0.82), (2.62, 0.74), (3.72, 0.26), (4.55, 0)])
    body_rumble = (rumble_fundamental + rumble_harmonics + rumble_grit) * rumble_env

    base_frequency = np.interp(
        t,
        [0, 0.54, 1.25, 1.82, 2.45, 3.2, 4.05, duration],
        [54, 61, 72, 56, 49, 43, 37, 33],
    )
    instability = profile["instability"]
    base_frequency *= (
        1
        + np.sin(2 * np.pi * 2.7 * t + 0.3) * instability
        + np.sin(2 * np.pi * 6.4 * t + 1.1) * instability * 0.46
        + np.sin(2 * np.pi * 11.8 * t + 2.4) * instability * 0.2
    )
    phase = 2 * np.pi * np.cumsum(base_frequency) / SAMPLE_RATE
    chamber_a = np.sin(phase)
    chamber_b = np.sin(phase * 1.493 + np.sin(t * 3.2) * 0.18) * 0.6
    chamber_c = np.sin(phase * 2.07 + np.sin(t * 5.7 + 0.4) * 0.24) * 0.38
    chamber_d = np.sin(phase * 3.14 + 0.8) * 0.17
    chamber_gate = 0.68 + np.sin(2 * np.pi * (4.6 + np.sin(t * 0.9) * 0.8) * t) * 0.13
    chamber_warble = np.tanh((chamber_a + chamber_b + chamber_c + chamber_d) * 1.34)
    chamber_warble *= chamber_gate * peak_env

    growl_noise = spectral_filter(rng.normal(0, 1, count), low_hz=82, high_hz=1180, order=4)
    growl_gate = 0.36 + np.maximum(0, np.sin(phase * 0.48 + np.sin(t * 7.1) * 0.44)) * 0.64
    guttural_growl = np.tanh(growl_noise * 1.55) * growl_gate * peak_env

    wet_gargle = make_wet_gargle(rng, duration, profile["wetGain"])

    tear_noise = spectral_filter(rng.normal(0, 1, count), low_hz=115, high_hz=4300, order=4)
    tear_gate = 0.42 + np.maximum(0, np.sin(2 * np.pi * (17 + np.sin(t * 1.7) * 5) * t)) * 0.58
    tear_env = envelope(count, [(0.92, 0), (1.28, 0.22), (1.72, 1), (2.5, 0.84), (3.18, 0.26), (3.66, 0)])
    tearing_exhale = np.tanh(tear_noise * 1.72) * tear_gate * tear_env

    rasp_noise = spectral_filter(rng.normal(0, 1, count), low_hz=1350, high_hz=7500, order=4)
    rasp_env = envelope(count, [(0.72, 0), (1.22, 0.16), (1.7, 0.74), (2.5, 0.62), (3.44, 0.34), (4.38, 0)])
    upper_rasp = rasp_noise * rasp_env

    stems = {
        "01_throat_load_inhale": inhale,
        "02_body_lung_rumble": body_rumble,
        "03_multi_chamber_warble": chamber_warble,
        "04_guttural_reptile_growl": guttural_growl,
        "05_wet_gargle_decay": wet_gargle,
        "06_tearing_peak_exhale": tearing_exhale,
        "07_upper_rasp_hiss": upper_rasp,
    }
    dry = (
        inhale
        + body_rumble * profile["bodyGain"]
        + chamber_warble * profile["chamberGain"]
        + guttural_growl * profile["growlGain"]
        + wet_gargle * profile["wetGain"]
        + tearing_exhale * profile["tearGain"]
        + upper_rasp * profile["raspGain"]
    )
    dry = spectral_filter(dry, low_hz=23, high_hz=9000, order=3)
    dry = finish(dry, highpass_hz=23, saturation=1.52)
    forest_tail = make_forest_tail(dry, rng, peak_env, profile["tailGain"])
    stems["08_distant_forest_tail"] = forest_tail
    stereo_dry = np.column_stack((dry, dry))
    side_rasp = spectral_filter(rng.normal(0, 1, count), low_hz=420, high_hz=5200, order=3)
    side_rasp *= peak_env * 0.012
    stereo_dry[:, 0] += side_rasp
    stereo_dry[:, 1] -= side_rasp
    mix = finish(stereo_dry + forest_tail, highpass_hz=22, saturation=1.36)
    return {
        "mix": mix,
        "stems": stems,
        "layerProcesses": {
            "01_throat_load_inhale": "Band-limited turbulent breath plus a low upward chirp, shaped as a 1.16-second loading inhale.",
            "02_body_lung_rumble": "31-86 Hz coupled fundamentals/harmonics plus filtered chest noise; limited so size survives small speakers without a sub-only mix.",
            "03_multi_chamber_warble": "Four detuned nonlinear throat chambers following one unstable falling pitch trajectory with independent low-rate modulation.",
            "04_guttural_reptile_growl": "82-1180 Hz saturated noise gated by the subharmonic throat phase to create irregular crocodilian pulses.",
            "05_wet_gargle_decay": "Seeded clusters of downward bubble chirps, moist band noise, and irregular low-frequency bursts concentrated in the decay.",
            "06_tearing_peak_exhale": "115-4300 Hz turbulent exhale with fast uneven tearing gates around the central peak; weighted to the midrange instead of broadband hiss.",
            "07_upper_rasp_hiss": "Restrained 1350-7500 Hz breath rasp, kept well below the body/chamber layers to avoid a human scream read.",
            "08_distant_forest_tail": "Stereo asymmetric multi-tap reflections from low-passed dry roar plus a diffuse filtered canopy-noise response.",
        },
    }


def make_wet_gargle(rng: np.random.Generator, duration: float, amount: float) -> np.ndarray:
    count = seconds_to_samples(duration)
    gargle = np.zeros(count, dtype=np.float64)
    event_time = 0.58
    while event_time < 4.36:
        bubble_duration = rng.uniform(0.035, 0.115)
        start_hz = rng.uniform(105, 260)
        end_hz = start_hz * rng.uniform(0.42, 0.76)
        bubble = chirp(start_hz, end_hz, bubble_duration, wobble_hz=rng.uniform(11, 27), wobble_depth=0.06)
        bubble *= exponential_decay(len(bubble), rng.uniform(0.018, 0.055))
        wet_noise = spectral_filter(rng.normal(0, 1, len(bubble)), low_hz=90, high_hz=980, order=3)
        bubble = bubble * 0.66 + np.tanh(wet_noise * 1.8) * 0.34
        add_at(gargle, bubble * rng.uniform(0.12, 0.32) * amount, event_time)
        event_time += rng.uniform(0.045, 0.15)
    gargle *= envelope(count, [(0.4, 0), (0.82, 0.28), (1.5, 0.72), (2.7, 1), (3.85, 0.62), (4.7, 0)])
    return spectral_filter(gargle, low_hz=52, high_hz=2100, order=4)


def make_forest_tail(dry: np.ndarray, rng: np.random.Generator, peak_env: np.ndarray, gain: float) -> np.ndarray:
    diffuse = spectral_filter(dry, low_hz=34, high_hz=1450, order=4)
    left = multi_tap(diffuse, [(0.17, 0.2), (0.43, 0.13), (0.79, 0.075), (1.28, 0.042), (1.82, 0.022)])
    right = multi_tap(diffuse, [(0.23, 0.19), (0.51, 0.12), (0.92, 0.068), (1.41, 0.039), (1.96, 0.02)])
    tail_noise = spectral_filter(rng.normal(0, 1, len(dry)), low_hz=48, high_hz=820, order=5)
    tail_noise *= envelope(len(dry), [(1.1, 0), (1.8, 0.12), (3.05, 0.18), (5.2, 0)])
    left += tail_noise * 0.045
    right += np.roll(tail_noise, seconds_to_samples(0.037)) * 0.043
    tail = np.column_stack((left, right))
    tail *= envelope(len(dry), [(0, 0), (0.68, 0.05), (1.4, 0.28), (3.1, 0.5), (5.2, 0)])[:, None]
    return tail * gain


def render_asset(name: str, signal: np.ndarray, target_peak_db: float) -> dict:
    signal = remove_dc(signal)
    signal = apply_fades(signal, fade_in_ms=3.5, fade_out_ms=28 if signal.shape[0] > SAMPLE_RATE else 12)
    signal = scale_to_peak(signal, db_to_linear(target_peak_db))

    master_path = MASTER_DIR / f"{name}_master.wav"
    runtime_path = RUNTIME_DIR / f"{name}.wav"
    write_pcm_wav(master_path, signal, bits=24)
    write_pcm_wav(runtime_path, signal, bits=16)

    analysis = analyze(signal)
    analysis.update(
        {
            "name": name,
            "masterFile": str(master_path.relative_to(ROOT)).replace("\\", "/"),
            "runtimeFile": str(runtime_path.relative_to(ROOT)).replace("\\", "/"),
            "masterBits": 24,
            "runtimeBits": 16,
            "masterBytes": master_path.stat().st_size,
            "runtimeBytes": runtime_path.stat().st_size,
            "containsSourcedComponents": False,
        }
    )
    analysis["_signal"] = signal
    return analysis


def finish(signal: np.ndarray, highpass_hz: float, saturation: float) -> np.ndarray:
    output = spectral_filter(signal, low_hz=highpass_hz, high_hz=15_500, order=5)
    output = np.tanh(output * saturation) / math.tanh(saturation)
    return remove_dc(output)


def chirp(
    start_hz: float,
    end_hz: float,
    duration: float,
    wobble_hz: float = 0.0,
    wobble_depth: float = 0.0,
) -> np.ndarray:
    count = seconds_to_samples(duration)
    t = np.arange(count) / SAMPLE_RATE
    frequency = np.linspace(start_hz, end_hz, count)
    if wobble_hz and wobble_depth:
        frequency *= 1 + np.sin(2 * np.pi * wobble_hz * t) * wobble_depth
    phase = 2 * np.pi * np.cumsum(frequency) / SAMPLE_RATE
    return np.sin(phase)


def resonant_hit(frequency_hz: float, decay_seconds: float, gain: float) -> np.ndarray:
    duration = max(0.03, decay_seconds * 5)
    count = seconds_to_samples(duration)
    t = np.arange(count) / SAMPLE_RATE
    return np.sin(2 * np.pi * frequency_hz * t) * np.exp(-t / decay_seconds) * gain


def multi_tap(signal: np.ndarray, taps: list[tuple[float, float]]) -> np.ndarray:
    output = np.array(signal, dtype=np.float64, copy=True)
    for delay_seconds, gain in taps:
        delay = seconds_to_samples(delay_seconds)
        if delay <= 0 or delay >= len(output):
            continue
        output[delay:] += signal[:-delay] * gain
    return output


def concatenate_with_silence(signals: list[np.ndarray], silence_seconds: float) -> np.ndarray:
    if not signals:
        return np.zeros((1, 2), dtype=np.float64)
    channels = max(1 if signal.ndim == 1 else signal.shape[1] for signal in signals)
    silence = np.zeros((seconds_to_samples(silence_seconds), channels), dtype=np.float64)
    segments = []
    for index, signal in enumerate(signals):
        array = signal[:, None] if signal.ndim == 1 else signal
        if array.shape[1] < channels:
            array = np.repeat(array, channels, axis=1)
        segments.append(array)
        if index < len(signals) - 1:
            segments.append(silence)
    return np.concatenate(segments, axis=0)


def spectral_filter(
    signal: np.ndarray,
    low_hz: float | None = None,
    high_hz: float | None = None,
    order: int = 4,
) -> np.ndarray:
    array = np.asarray(signal, dtype=np.float64)
    if array.ndim == 2:
        return np.column_stack(
            [spectral_filter(array[:, channel], low_hz=low_hz, high_hz=high_hz, order=order) for channel in range(array.shape[1])]
        )
    spectrum = np.fft.rfft(array)
    frequencies = np.fft.rfftfreq(len(array), 1 / SAMPLE_RATE)
    response = np.ones_like(frequencies)
    if low_hz and low_hz > 0:
        safe = np.maximum(frequencies, 1e-9)
        response *= 1 / np.sqrt(1 + (low_hz / safe) ** (2 * order))
        response[0] = 0
    if high_hz and high_hz < SAMPLE_RATE * 0.5:
        response *= 1 / np.sqrt(1 + (frequencies / high_hz) ** (2 * order))
    return np.fft.irfft(spectrum * response, n=len(array))


def envelope(count: int, points: list[tuple[float, float]]) -> np.ndarray:
    sample_points = np.array([seconds_to_samples(time) for time, _ in points], dtype=np.int64)
    values = np.array([value for _, value in points], dtype=np.float64)
    sample_points = np.clip(sample_points, 0, max(0, count - 1))
    if sample_points[0] != 0:
        sample_points = np.insert(sample_points, 0, 0)
        values = np.insert(values, 0, values[0])
    if sample_points[-1] != count - 1:
        sample_points = np.append(sample_points, count - 1)
        values = np.append(values, values[-1])
    return np.interp(np.arange(count), sample_points, values)


def exponential_decay(count: int, decay_seconds: float) -> np.ndarray:
    t = np.arange(count) / SAMPLE_RATE
    return np.exp(-t / max(1e-6, decay_seconds))


def add_at(target: np.ndarray, source: np.ndarray, start_seconds: float) -> None:
    start = seconds_to_samples(start_seconds)
    if start >= len(target):
        return
    source_array = np.asarray(source)
    end = min(len(target), start + len(source_array))
    target[start:end] += source_array[: end - start]


def remove_dc(signal: np.ndarray) -> np.ndarray:
    array = np.asarray(signal, dtype=np.float64)
    return array - np.mean(array, axis=0, keepdims=array.ndim > 1)


def apply_fades(signal: np.ndarray, fade_in_ms: float, fade_out_ms: float) -> np.ndarray:
    output = np.array(signal, dtype=np.float64, copy=True)
    fade_in = min(len(output), max(1, int(SAMPLE_RATE * fade_in_ms / 1000)))
    fade_out = min(len(output), max(1, int(SAMPLE_RATE * fade_out_ms / 1000)))
    output[:fade_in] *= np.linspace(0, 1, fade_in)[:, None] if output.ndim == 2 else np.linspace(0, 1, fade_in)
    output[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] if output.ndim == 2 else np.linspace(1, 0, fade_out)
    return output


def scale_to_peak(signal: np.ndarray, target_peak: float) -> np.ndarray:
    peak = float(np.max(np.abs(signal))) if signal.size else 0
    if peak <= 1e-12:
        return signal
    return signal * (target_peak / peak)


def analyze(signal: np.ndarray) -> dict:
    array = np.asarray(signal, dtype=np.float64)
    mono = np.mean(array, axis=1) if array.ndim == 2 else array
    absolute = np.abs(array)
    peak = float(np.max(absolute)) if array.size else 0
    rms = float(np.sqrt(np.mean(np.square(array)))) if array.size else 0
    threshold = db_to_linear(-50)
    non_silent = np.flatnonzero(np.abs(mono) >= threshold)
    first_signal_ms = float(non_silent[0] / SAMPLE_RATE * 1000) if non_silent.size else None
    spectrum = np.abs(np.fft.rfft(mono * np.hanning(len(mono))))
    frequencies = np.fft.rfftfreq(len(mono), 1 / SAMPLE_RATE)
    spectral_centroid = float(np.sum(frequencies * spectrum) / max(1e-12, np.sum(spectrum)))
    return {
        "durationSeconds": round(len(array) / SAMPLE_RATE, 4),
        "sampleRate": SAMPLE_RATE,
        "channels": 1 if array.ndim == 1 else array.shape[1],
        "peakLinear": round(peak, 6),
        "peakDbfs": round(linear_to_db(peak), 3),
        "rmsDbfs": round(linear_to_db(rms), 3),
        "crestDb": round(linear_to_db(peak / max(1e-12, rms)), 3),
        "dcOffset": round(float(np.max(np.abs(np.mean(array, axis=0)))), 8),
        "firstSignalMsAtMinus50Db": round(first_signal_ms, 3) if first_signal_ms is not None else None,
        "clippedSampleCount": int(np.count_nonzero(absolute >= 0.999)),
        "spectralCentroidHz": round(spectral_centroid, 1),
    }


def write_pcm_wav(path: Path, signal: np.ndarray, bits: int) -> None:
    array = np.asarray(signal, dtype=np.float64)
    if array.ndim == 1:
        array = array[:, None]
    channels = array.shape[1]
    clipped = np.clip(array, -1, 1)
    if bits == 16:
        payload = np.round(clipped * 32767).astype("<i2").tobytes()
        sample_width = 2
    elif bits == 24:
        values = np.round(clipped * 8_388_607).astype(np.int32).reshape(-1)
        unsigned = values & 0xFFFFFF
        payload = np.column_stack(
            (
                unsigned & 0xFF,
                (unsigned >> 8) & 0xFF,
                (unsigned >> 16) & 0xFF,
            )
        ).astype(np.uint8).tobytes()
        sample_width = 3
    else:
        raise ValueError(f"unsupported PCM depth: {bits}")
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(sample_width)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(payload)


def render_contact_sheet(rendered: list[dict], output_path: Path) -> None:
    width = 1600
    row_height = 250
    margin = 26
    image = Image.new("RGB", (width, row_height * len(rendered) + margin), (9, 11, 14))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    for row, item in enumerate(rendered):
        signal = item.pop("_signal")
        mono = np.mean(signal, axis=1) if signal.ndim == 2 else signal
        y0 = margin + row * row_height
        draw.text(
            (margin, y0),
            (
                f"{item['name']}  {item['durationSeconds']:.3f}s  "
                f"{item['channels']}ch  peak {item['peakDbfs']:.1f} dBFS  "
                f"RMS {item['rmsDbfs']:.1f} dBFS"
            ),
            font=font,
            fill=(226, 229, 222),
        )
        waveform_box = (margin, y0 + 24, 760, y0 + row_height - 20)
        spectrum_box = (790, y0 + 24, width - margin, y0 + row_height - 20)
        draw.rectangle(waveform_box, outline=(52, 61, 65), fill=(14, 18, 21))
        draw.rectangle(spectrum_box, outline=(52, 61, 65), fill=(14, 18, 21))
        draw_waveform(draw, mono, waveform_box)
        draw_spectrogram(image, mono, spectrum_box)
    image.save(output_path)


def draw_waveform(draw: ImageDraw.ImageDraw, signal: np.ndarray, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    width = x1 - x0
    center = (y0 + y1) / 2
    half = (y1 - y0) * 0.46
    chunk = max(1, len(signal) // width)
    for x in range(width):
        section = signal[x * chunk : min(len(signal), (x + 1) * chunk)]
        if not len(section):
            continue
        lo = float(np.min(section))
        hi = float(np.max(section))
        draw.line(
            (x0 + x, center - hi * half, x0 + x, center - lo * half),
            fill=(218, 123, 62),
        )
    draw.line((x0, center, x1, center), fill=(60, 67, 70))


def draw_spectrogram(image: Image.Image, signal: np.ndarray, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    target_width = x1 - x0
    target_height = y1 - y0
    window_size = 1024
    hop = max(128, (len(signal) - window_size) // max(1, target_width - 1))
    window = np.hanning(window_size)
    frames = []
    for start in range(0, max(1, len(signal) - window_size), hop):
        frame = signal[start : start + window_size]
        if len(frame) < window_size:
            frame = np.pad(frame, (0, window_size - len(frame)))
        frames.append(np.abs(np.fft.rfft(frame * window)))
    matrix = np.array(frames, dtype=np.float64).T
    matrix = 20 * np.log10(matrix / max(1e-12, float(np.max(matrix))) + 1e-9)
    matrix = np.clip((matrix + 78) / 78, 0, 1)
    frequency_limit = int(matrix.shape[0] * min(1.0, 12_000 / (SAMPLE_RATE / 2)))
    matrix = matrix[:frequency_limit]
    matrix = np.flipud(matrix)
    rgb = np.zeros((matrix.shape[0], matrix.shape[1], 3), dtype=np.uint8)
    rgb[..., 0] = np.clip(matrix ** 0.72 * 242, 0, 255)
    rgb[..., 1] = np.clip(matrix ** 1.35 * 142, 0, 255)
    rgb[..., 2] = np.clip(matrix ** 2.4 * 58 + matrix * 24, 0, 255)
    spectral = Image.fromarray(rgb, mode="RGB").resize((target_width, target_height), Image.Resampling.BILINEAR)
    image.paste(spectral, (x0, y0))


def seconds_to_samples(seconds: float) -> int:
    return max(1, int(round(seconds * SAMPLE_RATE)))


def db_to_linear(value: float) -> float:
    return 10 ** (value / 20)


def linear_to_db(value: float) -> float:
    return 20 * math.log10(max(1e-12, value))


if __name__ == "__main__":
    main()
