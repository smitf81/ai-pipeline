"""Build the stylized-grass runtime PBR set from the retained generated albedo.

The grass source is AI-generated from the project's rock material as a style
reference. This deterministic pass removes broad baked-light drift, enforces a
quiet wrap, and derives coherent PBR channels using vegetation-aware height.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


DEFAULT_SIZE = 1024
EDGE_BLEND_PIXELS = 12


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
        image = pil_gray(values).filter(ImageFilter.GaussianBlur(radius))
        return np.asarray(image, dtype=np.float32) / 255.0
    return image_array(pil_rgb(values).filter(ImageFilter.GaussianBlur(radius)))


def smoothstep(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, 0.0, 1.0)
    return values * values * (3.0 - 2.0 * values)


def quiet_periodic_edges(values: np.ndarray, width: int) -> np.ndarray:
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
    broad_luminance = np.maximum(0.035, luminance(blur(periodic, 46.0)))
    target_luminance = float(np.median(broad_luminance))
    correction = np.power(target_luminance / broad_luminance, 0.3)
    flattened = periodic * correction[..., None]
    # Keep the grass dark and cool enough for BSB while retaining green hue separation.
    grade = np.asarray([0.91, 1.015, 0.94], dtype=np.float32)
    flattened = np.power(np.clip(flattened * grade, 0.0, 1.0), 1.025)
    return quiet_periodic_edges(flattened, EDGE_BLEND_PIXELS)


def derive_height(albedo: np.ndarray) -> np.ndarray:
    red, green, blue = albedo[..., 0], albedo[..., 1], albedo[..., 2]
    vegetation = green * 0.62 + np.maximum(0.0, green - red) * 0.26 + np.maximum(0.0, green - blue) * 0.12
    turf_mass = blur(vegetation, 1.55)
    fibre_detail = vegetation - blur(vegetation, 5.0)
    height = percentile_normalize(turf_mass + fibre_detail * 0.34, 2.0, 98.5)
    height = 0.18 + smoothstep(height) * 0.69
    return quiet_periodic_edges(blur(height, 0.55), EDGE_BLEND_PIXELS)


def derive_normal(height: np.ndarray, strength: float = 5.2) -> np.ndarray:
    derivative_x = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    derivative_y = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    normal = np.stack((-derivative_x * strength, -derivative_y * strength, np.ones_like(height)), axis=-1)
    normal /= np.maximum(1e-6, np.linalg.norm(normal, axis=-1, keepdims=True))
    return normal * 0.5 + 0.5


def derive_channels(albedo: np.ndarray, height: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    soil_cavity = 1.0 - smoothstep(np.clip((height - 0.16) / 0.72, 0.0, 1.0))
    local_detail = np.abs(luminance(albedo) - blur(luminance(albedo), 2.8))
    ambient_occlusion = np.clip(0.94 - soil_cavity * 0.27 - local_detail * 0.16, 0.63, 0.96)
    roughness = np.clip(0.86 + soil_cavity * 0.08 + local_detail * 0.2, 0.84, 0.98)
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
    source = Image.open(args.input).convert("RGB").resize((args.size, args.size), Image.Resampling.LANCZOS)
    albedo = derive_albedo(image_array(source))
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
