"""Build a labelled contact sheet from a directory of images.

Reading six 1.8MB PNGs one at a time is slow and expensive; one downscaled
grid lets me verify every caption in a single look. Each cell is labelled with
the source filename so I can map images back to the prompt that produced them.

Usage:  python brand/make-sheet.py <src-dir> <out.png> [cols] [cell]
"""
import sys, os, glob
from PIL import Image, ImageDraw, ImageFont

src = sys.argv[1]
out = sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
cell = int(sys.argv[4]) if len(sys.argv) > 4 else 420

FONT = r"C:\Windows\Fonts\msyh.ttc"
LABEL_H = 26

files = sorted(glob.glob(os.path.join(src, "*.png")))
files = [f for f in files if os.path.basename(f) != "source.png"]
if not files:
    print("no images found in", src)
    sys.exit(1)

rows = (len(files) + cols - 1) // cols
W = cols * cell
H = rows * (cell + LABEL_H)

sheet = Image.new("RGB", (W, H), (24, 24, 28))
try:
    font = ImageFont.truetype(FONT, 15)
except Exception:
    font = ImageFont.load_default()
d = ImageDraw.Draw(sheet)

for i, f in enumerate(files):
    r, c = divmod(i, cols)
    x = c * cell
    y = r * (cell + LABEL_H)
    im = Image.open(f).convert("RGB")
    im.thumbnail((cell - 8, cell - 8))
    ox = x + (cell - im.width) // 2
    oy = y + LABEL_H + (cell - LABEL_H - im.height) // 2
    sheet.paste(im, (ox, oy))
    # label: the timestamp tail, which is what distinguishes these files
    name = os.path.basename(f)
    stamp = name.replace("Classic_internet_meme_format___", "").replace(".png", "")
    d.text((x + 6, y + 5), "%d) %s" % (i + 1, stamp), fill=(235, 235, 240), font=font)

sheet.save(out)
print("wrote", out, sheet.size, "from", len(files), "images")
for i, f in enumerate(files):
    print("  %d) %s" % (i + 1, os.path.basename(f)))
