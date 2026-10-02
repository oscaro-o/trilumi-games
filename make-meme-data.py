"""Pack the fifteen ending memes into a single JS file of base64 data URLs.

Why embed rather than ship fifteen files: the family rule is that each game is
one file with no dependencies, so it can be mailed to someone or opened from
disk. The cost is weight, which is why these are re-encoded to WebP and capped
at 768px — the card draws the meme at 768 and the page never shows it wider
than a phone column, so anything larger would be bytes nobody sees.

The caption is baked into each image by the generator, which is why there are
fifteen and not five: one per ending per language.

Usage:  python brand/make-meme-data.py <memes-dir> <out.js>
"""
import sys, os, io, base64
from PIL import Image

src = sys.argv[1]
out = sys.argv[2]

ENDINGS = ["luan", "beng", "shan", "gong", "jiu"]
LANGS = ["simp", "hant", "en"]
PX = 768
Q = 74

parts = []
total_raw = 0
total_b64 = 0
for code in ENDINGS:
    row = []
    for lang in LANGS:
        p = os.path.join(src, "%s-%s.png" % (code, lang))
        if not os.path.exists(p):
            raise SystemExit("missing image: " + p)
        im = Image.open(p).convert("RGB")
        if im.size != (PX, PX):
            im = im.resize((PX, PX), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=Q, method=6)
        raw = buf.getvalue()
        total_raw += len(raw)
        b64 = base64.b64encode(raw).decode("ascii")
        total_b64 += len(b64)
        row.append('"%s":"data:image/webp;base64,%s"' % (lang, b64))
    parts.append('  "%s":{%s}' % (code, ",".join(row)))

js = (
    "/* ==========================================================================\n"
    "   RESULT MEMES\n"
    "   --------------------------------------------------------------------------\n"
    "   One image per ending, three languages. The punchline is baked into the\n"
    "   picture by the generator, so the same image cannot serve two languages and\n"
    "   there are fifteen of them. They are WebP at %dpx because nothing ever\n"
    "   displays them larger than that.\n"
    "\n"
    "   Loaded lazily and cached by ending+language: a player reaches exactly one\n"
    "   ending, so exactly one image is ever decoded. Decoding all fifteen up\n"
    "   front would cost roughly 60MB of bitmap for no reason.\n"
    "   ========================================================================== */\n"
    "var MEME_DATA = {\n%s\n};\n"
) % (PX, ",\n".join(parts))

with open(out, "w", encoding="utf-8", newline="\n") as f:
    f.write(js)

print("wrote %s" % out)
print("  webp bytes  : %7.0f KB" % (total_raw / 1024))
print("  base64 bytes: %7.0f KB" % (total_b64 / 1024))
print("  js file     : %7.0f KB" % (len(js) / 1024))
