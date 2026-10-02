"""Lay the fifteen ending memes out as a grid: rows = endings, columns = languages.

This is both the verification pass (every caption legible in one look) and the
artifact we show the user, so the labels carry the ending code and its meaning.

Usage:  python brand/make-meme-grid.py <memes-dir> <out.png>
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

src = sys.argv[1]
out = sys.argv[2]

ENDINGS = [
    ("luan", "\u4e71\u519b\u5f15\u80dc / You Handed Them the Win"),
    ("beng", "\u5175\u8d25\u5982\u5c71\u5012 / The Collapse"),
    ("shan", "\u5584\u4e4b\u5584\u8005 / The Highest Skill"),
    ("gong", "\u529f\u9ad8\u4e0d\u8d4f / No Reward for This"),
    ("jiu",  "\u4e45\u66b4\u5e08\u5219\u56fd\u7528\u4e0d\u8db3 / The State Cannot Pay"),
]
LANGS = [("simp", "简体"), ("hant", "繁體"), ("en", "EN")]

CELL = 360
PAD = 8
HDR = 30
LEFT = 250
FONT = r"C:\Windows\Fonts\msyh.ttc"
FONTB = r"C:\Windows\Fonts\msyhbd.ttc"

W = LEFT + len(LANGS) * (CELL + PAD) + PAD
H = HDR + len(ENDINGS) * (CELL + PAD) + PAD
sheet = Image.new("RGB", (W, H), (22, 22, 26))
d = ImageDraw.Draw(sheet)

def f(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

f_hdr = f(FONTB, 20)
f_row = f(FONT, 17)
f_sm = f(FONT, 13)

for c, (code, label) in enumerate(LANGS):
    x = LEFT + c * (CELL + PAD) + PAD
    d.text((x + 6, 7), label, fill=(240, 240, 245), font=f_hdr)

missing = []
for r, (code, meaning) in enumerate(ENDINGS):
    y = HDR + r * (CELL + PAD)
    d.text((10, y + CELL // 2 - 22), code, fill=(120, 190, 255), font=f_hdr)
    d.text((10, y + CELL // 2 + 4), meaning.split(" / ")[0], fill=(230, 230, 235), font=f_row)
    d.text((10, y + CELL // 2 + 26), meaning.split(" / ")[1], fill=(150, 150, 160), font=f_sm)
    for c, (lang, _) in enumerate(LANGS):
        x = LEFT + c * (CELL + PAD) + PAD
        p = os.path.join(src, "%s-%s.png" % (code, lang))
        if not os.path.exists(p):
            missing.append(p)
            d.rectangle([x, y + PAD, x + CELL, y + PAD + CELL], outline=(200, 60, 60), width=3)
            d.text((x + 20, y + CELL // 2), "MISSING", fill=(255, 90, 90), font=f_hdr)
            continue
        im = Image.open(p).convert("RGB")
        im.thumbnail((CELL, CELL))
        sheet.paste(im, (x + (CELL - im.width) // 2, y + PAD + (CELL - im.height) // 2))

sheet.save(out)
print("wrote", out, sheet.size)
print("missing:", missing if missing else "none")
