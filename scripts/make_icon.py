"""Render the app icon source (1024x1024 PNG) from the legacy favicon design.

The legacy favicon (server/public/index.html) is a 32x32 SVG: a #3A2FE0 rounded square with a
white open-book outline. This redraws it at 1024 px so `tauri icon` can derive every platform size.

    python scripts/make_icon.py app/src-tauri/icon-source.png
    (cd app && npx tauri icon src-tauri/icon-source.png)

Needs Pillow (already a legacy dependency). Replace the output with real artwork whenever you have it.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
SCALE = SIZE / 32          # the SVG viewBox is 32 units wide
BRAND = (0x3A, 0x2F, 0xE0, 255)


def main(out: Path) -> None:
    # Draw at 4x and downsample for smooth edges.
    ss = 4
    img = Image.new("RGBA", (SIZE * ss, SIZE * ss), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    unit = SCALE * ss

    draw.rounded_rectangle((0, 0, SIZE * ss - 1, SIZE * ss - 1), radius=int(9 * unit), fill=BRAND)

    # M9 8 h14 v13 H11 a2 2 0 0 0-2 2 z  ->  polygon outline (the arc is approximated by a bevel)
    pts = [(9, 8), (23, 8), (23, 21), (11, 21), (9.6, 21.6), (9, 23), (9, 8)]
    draw.line([(x * unit, y * unit) for x, y in pts], fill=(255, 255, 255, 255),
              width=int(2.2 * unit), joint="curve")
    for x, y in pts[:-1]:  # round the joints
        r = 1.1 * unit
        draw.ellipse((x * unit - r, y * unit - r, x * unit + r, y * unit + r), fill=(255, 255, 255, 255))

    out.parent.mkdir(parents=True, exist_ok=True)
    img.resize((SIZE, SIZE), Image.LANCZOS).save(out, "PNG")
    print(f"wrote {out} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
