#!/usr/bin/env python3
"""Build brand SVG logos from PNG sources — traced from real artwork, not redrawn text."""

from __future__ import annotations

import base64
import re
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
POTRACE = "/opt/homebrew/bin/potrace"
BANNER_FILL = "#d8dcd7"


def potrace_paths(bitmap: Image.Image, turdsize: int = 2) -> tuple[str, str]:
    with tempfile.TemporaryDirectory() as td:
        pbm = Path(td) / "in.pbm"
        out = Path(td) / "out.svg"
        bitmap.save(pbm)
        subprocess.run(
            [
                POTRACE,
                "-s",
                "-o",
                str(out),
                "--turdsize",
                str(turdsize),
                "--opttolerance",
                "0.35",
                str(pbm),
            ],
            check=True,
        )
        raw = out.read_text(encoding="utf-8")

    match = re.search(r'<g transform="([^"]+)"[^>]*>(.*)</g>', raw, re.S)
    if not match:
        raise RuntimeError("Could not parse potrace output")
    return match.group(1), match.group(2).strip()


def layer_bitmap(im: Image.Image, mask_fn) -> Image.Image:
    w, h = im.size
    bitmap = Image.new("1", (w, h), 1)
    src = im.load()
    dst = bitmap.load()
    for y in range(h):
        for x in range(w):
            dst[x, y] = 0 if mask_fn(src[x, y]) else 1
    return bitmap


def traced_color_layers_svg(png: Path, layers: list[tuple[str, callable, int]], turdsize: int = 2) -> str:
    im = Image.open(png).convert("RGBA")
    w, h = im.size
    groups: list[str] = []
    transform = None

    for fill, mask_fn, layer_turd in layers:
        bitmap = layer_bitmap(im, mask_fn)
        layer_transform, paths = potrace_paths(bitmap, turdsize=layer_turd)
        transform = transform or layer_transform
        if paths.strip():
            groups.append(f'  <g fill="{fill}" stroke="none">\n{paths}\n  </g>')

    if not transform or not groups:
        raise RuntimeError(f"No traced paths for {png}")

    body = "\n".join(groups)
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="The Man Store">
  <g transform="{transform}">
{body}
  </g>
</svg>
"""


def circle_layers() -> list[tuple[str, callable, int]]:
    def is_opaque(px: tuple[int, int, int, int]) -> bool:
        return px[3] >= 32

    def is_green(px: tuple[int, int, int, int]) -> bool:
        if not is_opaque(px):
            return False
        r, g, b, _ = px
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        return lum < 185 and g >= r - 20

    def is_light(px: tuple[int, int, int, int]) -> bool:
        if not is_opaque(px):
            return False
        r, g, b, _ = px
        lum = 0.299 * r + 0.587 * g + 0.114 * b
        return lum >= 185

    return [
        ("#64756b", is_green, 4),
        ("#ebebea", is_light, 2),
    ]


def banner_layers() -> list[tuple[str, callable, int]]:
    def is_opaque(px: tuple[int, int, int, int]) -> bool:
        return px[3] >= 32

    def is_ink(px: tuple[int, int, int, int]) -> bool:
        if not is_opaque(px):
            return False
        lum = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2]
        return lum < 238

    return [(BANNER_FILL, is_ink, 8)]


def raster_reference_svg(png: Path, width: int, height: int) -> str:
    """Pixel-perfect SVG wrapper — keeps the real logo exactly as designed."""
    data = base64.b64encode(png.read_bytes()).decode("ascii")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {width} {height}" role="img" aria-label="The Man Store">
  <image width="{width}" height="{height}" href="data:image/png;base64,{data}" />
</svg>
"""


def main() -> None:
    circle_png = ROOT / "backend/public/logo-circle.png"
    banner_png = ROOT / "backend/public/logo.png"
    frontend_public = ROOT / "frontend/public"

    try:
        circle_svg = traced_color_layers_svg(circle_png, circle_layers())
    except RuntimeError:
        im = Image.open(circle_png)
        circle_svg = raster_reference_svg(circle_png, im.width, im.height)

    banner_svg = traced_color_layers_svg(banner_png, banner_layers())

    frontend_public.mkdir(parents=True, exist_ok=True)
    (frontend_public / "logo-circle.svg").write_text(circle_svg, encoding="utf-8")
    (frontend_public / "logo.svg").write_text(banner_svg, encoding="utf-8")
    (frontend_public / "favicon.svg").write_text(circle_svg, encoding="utf-8")
    print("wrote", frontend_public / "logo-circle.svg")
    print("wrote", frontend_public / "logo.svg")
    print("wrote", frontend_public / "favicon.svg")


if __name__ == "__main__":
    main()
