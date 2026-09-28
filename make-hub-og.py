#!/usr/bin/env python3
"""
Render brand/games/og.png — the 1200x630 preview for the games hub.

    python brand/make-hub-og.py

Uses Pillow, which is already in the isolated venv. The mark geometry is the
same three polygons as tribrand.js and trilumi.xyz's own header, so the social
card and the page cannot drift apart.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "brand" / "games" / "og.png"

W, H = 1200, 630
PAD = 72

PAPER = (247, 244, 239)
INK = (25, 23, 19)
INK2 = (76, 70, 61)
INK3 = (140, 132, 120)
LINE = (226, 219, 207)
BLUE = (0, 74, 173)

FONTS = Path(r"C:\Windows\Fonts")
SERIF_B = FONTS / "georgiab.ttf"
SERIF_R = FONTS / "georgia.ttf"
SANS_B = FONTS / "segoeuib.ttf"
SANS_R = FONTS / "segoeui.ttf"

# the official mark, in its 100 x 106 space
POLY = [
    [(57, 0), (68.5, 21), (40, 76), (18, 76)],
    [(9, 80), (63, 80), (73, 98), (0, 98)],
    [(66, 33), (55, 55), (79, 106), (100, 106)],
]


def font(path, size):
    return ImageFont.truetype(str(path), size)


def draw_mark(d, x, y, h, colour):
    s = h / 106.0
    for poly in POLY:
        pts = [(x + px * s, y + py * s) for px, py in poly]
        d.polygon(pts, fill=colour)
    return 100 * s


def draw_wordmark(d, x, y, size, colour, tracking=0.22):
    """TRILUMI, uppercase, letterspaced — PIL has no letter-spacing either."""
    f = font(SANS_B, size)
    cx = x
    for ch in "TRILUMI":
        d.text((cx, y), ch, font=f, fill=colour)
        cx += d.textlength(ch, font=f) + size * tracking
    return cx - size * tracking - x


def main():
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    # inset hairline, same as the share cards
    d.rectangle([14, 14, W - 15, H - 15], outline=LINE, width=2)

    # ---- lockup, top left -------------------------------------------------
    draw_mark(d, PAD, PAD - 4, 30, BLUE)
    draw_wordmark(d, PAD + 30 + 13, PAD + 1, 17, BLUE)

    # ---- title ------------------------------------------------------------
    TITLE = "Games about judgement"
    size = 82
    while size > 40:
        f = font(SERIF_B, size)
        if d.textlength(TITLE, font=f) <= W - PAD * 2:
            break
        size -= 2
    f_title = font(SERIF_B, size)
    d.text((PAD, 176), TITLE, font=f_title, fill=INK)

    # ---- rule -------------------------------------------------------------
    d.line([(PAD, 322), (W - PAD, 322)], fill=LINE, width=2)

    # ---- lede -------------------------------------------------------------
    LEDE = "Four short games from Trilumi."
    LEDE2 = "None of them test what you know."
    f_lede = font(SERIF_R, 34)
    d.text((PAD, 366), LEDE, font=f_lede, fill=INK2)
    d.text((PAD, 412), LEDE2, font=f_lede, fill=INK2)

    # ---- the four, along the bottom --------------------------------------
    NAMES = ["Thor's Hammer", "Lo Shu", "Art of War", "Where Am I"]
    f_name = font(SANS_R, 21)
    y = H - PAD - 30
    cx = PAD
    for i, name in enumerate(NAMES):
        if i:
            d.text((cx, y), "·", font=f_name, fill=INK3)
            cx += d.textlength("·", font=f_name) + 16
        d.text((cx, y), name, font=f_name, fill=INK3)
        cx += d.textlength(name, font=f_name) + 16

    # ---- address, bottom right -------------------------------------------
    ADDR = "trilumi.xyz/games"
    f_addr = font(SANS_R, 21)
    d.text((W - PAD - d.textlength(ADDR, font=f_addr), y), ADDR, font=f_addr, fill=INK3)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT}  {OUT.stat().st_size:,} bytes  {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
