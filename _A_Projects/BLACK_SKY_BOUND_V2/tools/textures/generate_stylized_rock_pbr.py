"""Build the stylized-rock runtime PBR set from the retained generated albedo source.

The input is an AI-generated, neutral-lit albedo derived from the user-provided
reference sheet.  This deterministic pass removes broad illumination drift,
softens the wrap boundary, and derives every scalar/normal channel from one
shared periodic height interpretation.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


DEFAULT_SIZE = 1024
EDGE_BLEND_PIXELS = 48


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE)
    return parser.parse_args()


def image_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0


def pil_rgb(values: np.ndarray) -> Image.Image:
    return Image.fromarray(np.uint8(np.clip(values, 0.0, 1.0) * 255.0 + 0.5), "RGB")


def pil_gray(values: np.ndarray) -> Image.Image:
    return Image.fromarray(np.uint8(np.clip(values, 0.0, 1.0) * 255.0 + 0.5), "L")


def blur(values: np.ndarray, radius: float) -> np.ndarray:
    if values.ndim == 2:
        return np.asarray(pil_gray(values).filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0
    return image_array(pil_rgb(values).filter(ImageFilter.GaussianBlur(radius)))


def smoothstep(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, 0.0, 1.0)
    return values * values * (3.0 - 2.0 * values)


def quiet_periodic_edges(values: np.ndarray, width: int) -> np.ndarray:
    """Average opposite edge pairs, tapering the correction into the source."""
    result = values.copy()
    width = max(2, min(width, result.shape[0] // 4, result.shape[1] // 4))
    for distance in range(width):
        retain = smoothstep(np.asarray(distance / max(1, width - 1), dtype=np.float32)).item()
        left = result[:, distance].copy()
        right = result[:, -distance - 1].copy()
        average = (left + right) * 0.5
        result[:, distance] = average * (1.0 - retain) + left * retain
        result[:, -distance - 1] = average * (1.0 - retain) + right * retain
    for distance in range(width):
        retain = smoothstep(np.asarray(distance / max(1, width - 1), dtype=np.float32)).item()
        top = result[distance].copy()
        bottom = result[-distance - 1].copy()
        average = (top + bottom) * 0.5
        result[distance] = average * (1.0 - retain) + top * retain
        result[-distance - 1] = average * (1.0 - retain) + bottom * retain
    return result


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def percentile_normalize(values: np.ndarray, low: float = 2.0, high: float = 98.0) -> np.ndarray:
    floor, ceiling = np.percentile(values, [low, high])
    return np.clip((values - floor) / max(1e-6, ceiling - floor), 0.0, 1.0)


def derive_albedo(source: np.ndarray) -> np.ndarray:
    periodic = quiet_periodic_edges(source, EDGE_BLEND_PIXELS)
    broad_luminance = np.maximum(0.04, luminance(blur(periodic, 44.0)))
    target_luminance = float(np.median(broad_luminance))
    illumination_correction = np.power(target_luminance / broad_luminance, 0.34)
    flattened = periodic * illumination_correction[..., None]
    # Slightly cool and compress the source into BSB's restrained moonlit palette.
    grade = np.asarray([0.96, 0.985, 1.015], dtype=np.float32)
    flattened = np.power(np.clip(flattened * grade, 0.0, 1.0), 1.04)
    return quiet_periodic_edges(flattened, EDGE_BLEND_PIXELS)


def derive_height(albedo: np.ndarray) -> np.ndarray:
    lightness = luminance(albedo)
    slab_mass = blur(lightness, 3.4)
    bevel_detail = lightness - blur(lightness, 11.0)
    height = percentile_normalize(slab_mass + bevel_detail * 0.32, 1.5, 99.0)
    height = 0.055 + smoothstep(height) * 0.89
    return quiet_periodic_edges(blur(height, 0.72), EDGE_BLEND_PIXELS)


def derive_normal(height: np.ndarray, strength: float = 8.4) -> np.ndarray:
    derivative_x = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    derivative_y = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    normal = np.stack((-derivative_x * strength, -derivative_y * strength, np.ones_like(height)), axis=-1)
    normal /= np.maximum(1e-6, np.linalg.norm(normal, axis=-1, keepdims=True))
    return normal * 0.5 + 0.5


def derive_channels(albedo: np.ndarray, height: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    cavity = 1.0 - smoothstep(np.clip((height - 0.04) / 0.9, 0.0, 1.0))
    local_detail = np.abs(luminance(albedo) - blur(luminance(albedo), 3.0))
    ambient_occlusion = np.clip(0.94 - cavity * 0.39 - local_detail * 0.12, 0.5, 0.96)
    roughness = np.clip(0.76 + cavity * 0.18 + local_detail * 0.24, 0.74, 0.97)
    metallic = np.zeros_like(height)
    return ambient_occlusion, roughness, metallic


def save(image: Image.Image, path: Path) -> None:
    image.save(path, optimize=True, compress_level=9)


def edge_error(values: np.ndarray) -> dict[str, float]:
    return {
        "uMean": float(np.mean(np.abs(values[:, 0] - values[:, -1]))),
        "vMean": float(np.mean(np.abs(values[0] - values[-1]))),
        "uMax": float(np.max(np.abs(values[:, 0] - values[:, -1]))),
        "vMax": float(np.max(np.abs(values[0] - values[-1]))),
    }


def main() -> None:
    args = parse_args()
    if args.size < 256 or args.size > 2048 or args.size & (args.size - 1):
        raise SystemExit("size must be a power of two from 256 through 2048")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    source_image = Image.open(args.input).convert("RGB").resize((args.size, args.size), Image.Resampling.LANCZOS)
    albedo = derive_albedo(image_array(source_image))
    height = derive_height(albedo)
    normal = derive_normal(height)
    ao, roughness, metallic = derive_channels(albedo, height)
    orm = np.stack((ao, roughness, metallic), axis=-1)

    save(pil_rgb(albedo), args.out_dir / "albedo.png")
    save(pil_rgb(normal), args.out_dir / "normal-open-gl.png")
    save(pil_rgb(orm), args.out_dir / "orm.png")
    save(pil_gray(roughness), args.out_dir / "roughness.png")
    save(pil_gray(ao), args.out_dir / "ambient-occlusion.png")
    save(pil_gray(height), args.out_dir / "height.png")
    save(pil_gray(metallic), args.out_dir / "metallic.png")

    print({
        "size": args.size,
        "albedoEdgeError": edge_error(albedo),
        "heightEdgeError": edge_error(height),
        "roughnessRange": [float(roughness.min()), float(roughness.max())],
        "aoRange": [float(ao.min()), float(ao.max())],
        "normalZRange": [float(normal[..., 2].min()), float(normal[..., 2].max())],
    })


if __name__ == "__main__":
    main()
