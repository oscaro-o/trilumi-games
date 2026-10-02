"""Replay a recorded share card onto a real image.

The canvas stub cannot rasterise, so ao-dump-card.js records the operations and
this paints them. Fonts are the closest Windows equivalents of what the card
asks for, so text metrics differ slightly from a browser; geometry, colours and
composition are exact. That is enough to judge whether the card is laid out.

Usage:  python brand/render-card.py <card.json> <out.png> [scale]
"""
import sys, os, json, base64, io
from PIL import Image, ImageDraw, ImageFont

card = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5

W, H = card["width"], card["height"]
img = Image.new("RGB", (W, H), (255, 255, 255))
d = ImageDraw.Draw(img)

SERIF_CJK = r"C:\Windows\Fonts\simsun.ttc"
SERIF_LAT = r"C:\Windows\Fonts\georgia.ttf"
SANS_LAT = r"C:\Windows\Fonts\segoeui.ttf"
SANS_CJK = r"C:\Windows\Fonts\msyh.ttc"

_cache = {}


def has_cjk(s):
    return any("\u2e80" <= ch <= "\u9fff" or "\uff00" <= ch <= "\uffef" for ch in s)


def font_for(spec, text):
    """Pick a face from a CSS font string, by script.

    The size must come from the token that actually ends in "px". Taking the
    first numeric token instead picks up the font weight, and a 700-weight face
    gets drawn at 700px.
    """
    size = 16
    for tok in str(spec).split():
        if tok.endswith("px"):
            try:
                size = int(round(float(tok[:-2])))
                break
            except ValueError:
                pass
    weight = "700" if "700" in str(spec) else "400"
    sans = "Segoe UI" in str(spec) or "Helvetica" in str(spec) or "Arial" in str(spec)
    if sans:
        path = SANS_CJK if has_cjk(text) else SANS_LAT
    else:
        path = SERIF_CJK if has_cjk(text) else SERIF_LAT
    key = (path, size, weight)
    if key not in _cache:
        try:
            f = ImageFont.truetype(path, size)
        except Exception:
            f = ImageFont.load_default()
        _cache[key] = f
    return _cache[key]


# ---------------------------------------------------------------- transform --
IDENT = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def mul(m, n):
    a1, b1, c1, d1, e1, f1 = m
    a2, b2, c2, d2, e2, f2 = n
    return (a1 * a2 + c1 * b2, b1 * a2 + d1 * b2,
            a1 * c2 + c1 * d2, b1 * c2 + d1 * d2,
            a1 * e2 + c1 * f2 + e1, b1 * e2 + d1 * f2 + f1)


def apply(m, x, y):
    a, b, c, d_, e, f = m
    return (a * x + c * y + e, b * x + d_ * y + f)


# ------------------------------------------------------------------- replay --
ctm = IDENT
stack = []
path = []
fill_style = "#000000"
stroke_style = "#000000"
line_width = 1


def style_for(v, default="#000000"):
    if not v:
        return default
    return str(v)


for op in card["ops"]:
    name, args = op["op"], op["args"]
    f, s = style_for(op.get("fill"), fill_style), stroke_style

    if name == "save":
        stack.append((ctm, fill_style, stroke_style, line_width))
    elif name == "restore":
        if stack:
            ctm, fill_style, stroke_style, line_width = stack.pop()
    elif name == "translate":
        ctm = mul(ctm, (1, 0, 0, 1, float(args[0]), float(args[1])))
    elif name == "scale":
        ctm = mul(ctm, (float(args[0]), 0, 0, float(args[1]), 0, 0))
    elif name == "beginPath":
        path = []
    elif name == "moveTo":
        path.append(("m", float(args[0]), float(args[1])))
    elif name == "lineTo":
        path.append(("l", float(args[0]), float(args[1])))
    elif name == "quadraticCurveTo":
        path.append(("q", float(args[0]), float(args[1]), float(args[2]), float(args[3])))
    elif name == "bezierCurveTo":
        path.append(("b", float(args[0]), float(args[1]), float(args[2]), float(args[3]),
                     float(args[4]), float(args[5])))
    elif name == "closePath":
        path.append(("z",))
    elif name == "fillRect":
        x, y, w_, h_ = [float(v) for v in args[:4]]
        p0, p1 = apply(ctm, x, y), apply(ctm, x + w_, y + h_)
        d.rectangle([min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])],
                    fill=f)
    elif name == "strokeRect":
        x, y, w_, h_ = [float(v) for v in args[:4]]
        p0, p1 = apply(ctm, x, y), apply(ctm, x + w_, y + h_)
        d.rectangle([min(p0[0], p1[0]), min(p0[1], p1[1]), max(p0[0], p1[0]), max(p0[1], p1[1])],
                    outline=s, width=max(1, int(round(line_width))))
    elif name == "drawImage":
        src = str(args[0])
        dx, dy, dw, dh = [float(v) for v in args[1:5]]
        if src.startswith("data:image/") and "," in src:
            raw = base64.b64decode(src.split(",", 1)[1])
            im = Image.open(io.BytesIO(raw)).convert("RGB").resize(
                (int(dw), int(dh)), Image.LANCZOS)
            img.paste(im, (int(dx), int(dy)))
            d = ImageDraw.Draw(img)
    elif name == "fillText":
        text, x, y = str(args[0]), float(args[1]), float(args[2])
        px, py = apply(ctm, x, y)
        fnt = font_for(op.get("font"), text)
        try:
            d.text((px, py), text, fill=f, font=fnt, anchor="ls")
        except Exception:
            d.text((px, py), text, fill=f, font=fnt)
    elif name == "strokeText":
        text, x, y = str(args[0]), float(args[1]), float(args[2])
        px, py = apply(ctm, x, y)
        d.text((px, py), text, fill=s, font=font_for(op.get("font"), text))
    elif name == "fill":
        pts = []
        for seg in path:
            if seg[0] == "m" or seg[0] == "l":
                pts.append(apply(ctm, seg[1], seg[2]))
            elif seg[0] == "q":
                pts.append(apply(ctm, seg[1], seg[2]))
                pts.append(apply(ctm, seg[3], seg[4]))
            elif seg[0] == "b":
                pts.append(apply(ctm, seg[1], seg[2]))
                pts.append(apply(ctm, seg[5], seg[6]))
        if len(pts) >= 3:
            d.polygon(pts, fill=f)
    elif name == "stroke":
        pts = [apply(ctm, seg[1], seg[2]) for seg in path if seg[0] in ("m", "l")]
        if len(pts) >= 2:
            d.line(pts, fill=s, width=max(1, int(round(line_width))))

if scale != 1.0:
    img = img.resize((int(W * scale), int(H * scale)), Image.LANCZOS)

img.save(out)
print("wrote %s  %s" % (out, img.size))
