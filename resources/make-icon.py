"""Rasterise the app icon into a multi-resolution Windows .ico (and a 256px .png).

Run from the project root:

    python resources/make-icon.py

Uses only the Python standard library — no Pillow, no ImageMagick, no npm packages — so
regenerating the icon never requires an install. The trade-off is that icon.svg's geometry
is duplicated as the constants below: **if you edit icon.svg, mirror the change here and
re-run this script.** Shapes are sampled at 4x4 per pixel to anti-alias the edges.

Windows shows the 16px and 32px entries in Explorer and the taskbar, and the 256px entry
in the installer and large-icon views.
"""

import math
import struct
import zlib
from pathlib import Path

# ─── Geometry, mirroring icon.svg ─────────────────────────────────────────────

TILE = 64.0  # icon.svg's viewBox is 0 0 64 64
TILE_RADIUS = 11.0
RED = (0xC8, 0x10, 0x2E)

# The Canvas dot ring lives in a 100-unit box and is placed by `translate(8.5,-4) scale(0.47)`.
MARK_SCALE = 0.47
MARK_DX, MARK_DY = 8.5, -4.0
MARK_CX = MARK_CY = 50.0

# One petal is the lower half of a radius-12 circle centred at (50,14); eight copies are
# rotated by 45 degree steps about the ring centre.
PETAL_CY, PETAL_R = 14.0, 12.0
# One dot is a radius-5 circle at (50,28), eight copies offset 22.5 degrees between petals.
DOT_CY, DOT_R = 28.0, 5.0

# Distance bands from the ring centre, used to reject samples before any rotation:
# petals reach furthest at their chord ends, sqrt(12^2 + 36^2); dots start at 22 - 5.
MARK_OUTER_SQ = (PETAL_R**2 + (MARK_CY - PETAL_CY) ** 2) + 0.5
MARK_INNER_SQ = (MARK_CY - DOT_CY - DOT_R) ** 2 - 0.5

# Rotations are inverted (negated) because we transform each sample point back onto the
# base shape rather than transforming the shape.
PETAL_TRIG = [(math.cos(math.radians(-45.0 * k)), math.sin(math.radians(-45.0 * k))) for k in range(8)]
DOT_TRIG = [
    (math.cos(math.radians(-(22.5 + 45.0 * k))), math.sin(math.radians(-(22.5 + 45.0 * k))))
    for k in range(8)
]

# Download arrow, in tile coordinates.
SHAFT = (29.6, 41.5, 4.8, 8.2, 0.6)  # x, y, w, h, corner radius
BAR = (23.0, 58.0, 18.0, 3.4, 1.5)
HEAD_TOP, HEAD_BOTTOM = 48.6, 56.4
HEAD_X0, HEAD_X1 = 25.2, 38.8

SUBSAMPLES = 4
SIZES = (256, 128, 64, 48, 32, 16)

# electron-builder refuses a macOS icon smaller than this, so the standalone PNG is rendered
# separately from the .ico entries rather than reusing the 256px one.
PNG_SIZE = 512


def in_rrect(x: float, y: float, x0: float, y0: float, w: float, h: float, r: float) -> bool:
    """Point-in-rounded-rectangle."""
    if not (x0 <= x <= x0 + w and y0 <= y <= y0 + h):
        return False
    qx = max(x0 + r - x, x - (x0 + w - r), 0.0)
    qy = max(y0 + r - y, y - (y0 + h - r), 0.0)
    return qx * qx + qy * qy <= r * r


def in_mark(x: float, y: float) -> bool:
    """Point-in-Canvas-dot-ring, after undoing the SVG placement transform."""
    px = (x - MARK_DX) / MARK_SCALE
    py = (y - MARK_DY) / MARK_SCALE
    dx, dy = px - MARK_CX, py - MARK_CY
    d2 = dx * dx + dy * dy
    if d2 > MARK_OUTER_SQ or d2 < MARK_INNER_SQ:
        return False

    for ca, sa in PETAL_TRIG:
        ry = MARK_CY + dx * sa + dy * ca
        if ry < PETAL_CY:
            continue
        rx = MARK_CX + dx * ca - dy * sa
        ex, ey = rx - MARK_CX, ry - PETAL_CY
        if ex * ex + ey * ey <= PETAL_R * PETAL_R:
            return True

    for ca, sa in DOT_TRIG:
        rx = MARK_CX + dx * ca - dy * sa
        ry = MARK_CY + dx * sa + dy * ca
        ex, ey = rx - MARK_CX, ry - DOT_CY
        if ex * ex + ey * ey <= DOT_R * DOT_R:
            return True

    return False


def in_arrow(x: float, y: float) -> bool:
    if in_rrect(x, y, *SHAFT) or in_rrect(x, y, *BAR):
        return True
    if HEAD_TOP <= y <= HEAD_BOTTOM:
        taper = 1.0 - (y - HEAD_TOP) / (HEAD_BOTTOM - HEAD_TOP)
        return abs(x - (HEAD_X0 + HEAD_X1) / 2.0) <= (HEAD_X1 - HEAD_X0) / 2.0 * taper
    return False


def render(size: int) -> bytes:
    """Render one square RGBA bitmap at `size` pixels."""
    step = TILE / size
    total = SUBSAMPLES * SUBSAMPLES
    offsets = [(i + 0.5) / SUBSAMPLES for i in range(SUBSAMPLES)]
    out = bytearray()

    for row in range(size):
        ys = [(row + o) * step for o in offsets]
        for col in range(size):
            xs = [(col + o) * step for o in offsets]
            covered = white = 0
            for y in ys:
                for x in xs:
                    if not in_rrect(x, y, 0.0, 0.0, TILE, TILE, TILE_RADIUS):
                        continue
                    covered += 1
                    if in_mark(x, y) or in_arrow(x, y):
                        white += 1
            if covered == 0:
                out += b'\x00\x00\x00\x00'
                continue
            # Average the colour over covered subsamples only, so edge pixels blend
            # against the tile rather than against transparent black.
            f = white / covered
            out += bytes(
                (
                    round(RED[0] + (255 - RED[0]) * f),
                    round(RED[1] + (255 - RED[1]) * f),
                    round(RED[2] + (255 - RED[2]) * f),
                    round(255 * covered / total),
                )
            )
    return bytes(out)


def to_png(size: int, rgba: bytes) -> bytes:
    stride = size * 4
    raw = b''.join(b'\x00' + rgba[r * stride : (r + 1) * stride] for r in range(size))

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


def to_ico(images: list[tuple[int, bytes]]) -> bytes:
    """Pack PNG-compressed entries into an .ico. PNG entries need Vista or newer."""
    header = struct.pack('<HHH', 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries, body = b'', b''
    for size, png in images:
        dim = 0 if size >= 256 else size  # 0 means 256 in the ICO directory
        entries += struct.pack('<BBBBHHII', dim, dim, 0, 0, 1, 32, len(png), offset)
        offset += len(png)
        body += png
    return header + entries + body


def main() -> None:
    here = Path(__file__).resolve().parent
    images = []
    for size in SIZES:
        png = to_png(size, render(size))
        images.append((size, png))
        print(f'  rendered {size}x{size} ({len(png):,} bytes)')

    ico = here / 'icon.ico'
    ico.write_bytes(to_ico(images))
    print(f'wrote {ico} ({ico.stat().st_size:,} bytes)')

    png = here / 'icon.png'
    png.write_bytes(to_png(PNG_SIZE, render(PNG_SIZE)))
    print(f'wrote {png} at {PNG_SIZE}x{PNG_SIZE} ({png.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
