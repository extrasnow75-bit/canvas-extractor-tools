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
BLUE = (0x00, 0x33, 0xA0)  # Boise State blue

# ─── "LMS" wordmark ───────────────────────────────────────────────────────────
# Proportions are expressed against the cap height so the whole wordmark scales as a unit.
# The literal coordinates in icon.svg are these same numbers, pre-multiplied.

CAP_H, CAP_TOP = 22.0, 9.0
STROKE = 0.16 * CAP_H
W_L, W_M, GAP = 0.55 * CAP_H, 0.82 * CAP_H, 0.10 * CAP_H
# S's width is derived, not chosen: two stacked tangent arc centrelines of radius rc span a
# cap height of 4*rc + STROKE, so rc is fixed and the outer width follows from it.
S_RC = (CAP_H - STROKE) / 4.0
W_S = 2 * S_RC + STROKE

X_L = (TILE - (W_L + W_M + W_S + 2 * GAP)) / 2.0
X_M = X_L + W_L + GAP
X_S = X_M + W_M + GAP

CAP_BOTTOM = CAP_TOP + CAP_H

L_STEM = (X_L, CAP_TOP, STROKE, CAP_H, 0.0)  # x, y, w, h, corner radius
L_FOOT = (X_L, CAP_BOTTOM - STROKE, W_L, STROKE, 0.0)

M_LEFT = (X_M, CAP_TOP, STROKE, CAP_H, 0.0)
M_RIGHT = (X_M + W_M - STROKE, CAP_TOP, STROKE, CAP_H, 0.0)
M_APEX_X, M_APEX_Y = X_M + W_M / 2.0, CAP_TOP + CAP_H * 0.62
M_DIAG_L = (
    (X_M, CAP_TOP),
    (X_M + STROKE, CAP_TOP),
    (M_APEX_X + STROKE / 2, M_APEX_Y),
    (M_APEX_X - STROKE / 2, M_APEX_Y),
)
M_DIAG_R = (
    (X_M + W_M - STROKE, CAP_TOP),
    (X_M + W_M, CAP_TOP),
    (M_APEX_X + STROKE / 2, M_APEX_Y),
    (M_APEX_X - STROKE / 2, M_APEX_Y),
)

S_HALF = STROKE / 2.0
S_CX = X_S + S_HALF + S_RC
S_CY_TOP = CAP_TOP + S_HALF + S_RC
S_CY_BOT = S_CY_TOP + 2 * S_RC
# The bowls open on opposite corners and meet where the arcs are tangent, at (S_CX, S_CY_TOP + S_RC).
S_UPPER_A0, S_UPPER_A1 = 20.0, 270.0
S_LOWER_A0, S_LOWER_A1 = 200.0, 90.0

# Download arrow, in tile coordinates.
SHAFT = (29.6, 38.5, 4.8, 8.2, 0.6)  # x, y, w, h, corner radius
BAR = (23.0, 55.0, 18.0, 3.4, 1.5)
HEAD_TOP, HEAD_BOTTOM = 45.6, 53.4
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


def in_poly(x: float, y: float, pts) -> bool:
    """Point-in-polygon by ray casting."""
    inside = False
    j = len(pts) - 1
    for i, (xi, yi) in enumerate(pts):
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def near_arc(x: float, y: float, cx: float, cy: float, rc: float, a0: float, a1: float) -> bool:
    """Within STROKE/2 of a circular arc centreline — a constant-width stroke with round caps.

    Modelling the S as distance-from-a-path rather than as an annulus sector keeps its weight
    equal to the straight-sided letters. An annulus cannot: at this cap height the stroke is a
    large enough fraction of the bowl radius that the hole would close up into a solid disc.

    Angles are degrees counter-clockwise, 0 = right, 90 = up.
    """
    dx, dy = x - cx, cy - y  # flip y so angles read conventionally
    th = math.degrees(math.atan2(dy, dx)) % 360.0
    within = a0 <= th <= a1 if a0 <= a1 else (th >= a0 or th <= a1)
    if within:
        return abs(math.hypot(dx, dy) - rc) <= S_HALF
    for a in (a0, a1):  # round cap at each terminal
        ex = cx + rc * math.cos(math.radians(a))
        ey = cy - rc * math.sin(math.radians(a))
        if (x - ex) ** 2 + (y - ey) ** 2 <= S_HALF * S_HALF:
            return True
    return False


def in_wordmark(x: float, y: float) -> bool:
    """Point-in-"LMS"."""
    if not (CAP_TOP <= y <= CAP_BOTTOM):
        return False
    if x < X_S:  # L and M
        return (
            in_rrect(x, y, *L_STEM)
            or in_rrect(x, y, *L_FOOT)
            or in_rrect(x, y, *M_LEFT)
            or in_rrect(x, y, *M_RIGHT)
            or in_poly(x, y, M_DIAG_L)
            or in_poly(x, y, M_DIAG_R)
        )
    return near_arc(x, y, S_CX, S_CY_TOP, S_RC, S_UPPER_A0, S_UPPER_A1) or near_arc(
        x, y, S_CX, S_CY_BOT, S_RC, S_LOWER_A0, S_LOWER_A1
    )


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
                    if in_wordmark(x, y) or in_arrow(x, y):
                        white += 1
            if covered == 0:
                out += b'\x00\x00\x00\x00'
                continue
            # Average the colour over covered subsamples only, so edge pixels blend
            # against the tile rather than against transparent black.
            f = white / covered
            out += bytes(
                (
                    round(BLUE[0] + (255 - BLUE[0]) * f),
                    round(BLUE[1] + (255 - BLUE[1]) * f),
                    round(BLUE[2] + (255 - BLUE[2]) * f),
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
