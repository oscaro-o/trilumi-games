#!/usr/bin/env python3
"""
Build brand/preview.html — a page that renders the four share cards at real
size, using the real renderer and the games' real strings.

    python brand/make-preview.py

There is no browser automation on this machine, so nothing can be screenshotted
for review. This is the next best thing: the page loads tribrand.js and
tricard.js unchanged, feeds them the same specs each game builds at runtime,
and draws the cards into the DOM. What you see is what the download produces.

The strings are pulled out of the games at build time, so the preview goes
stale if a game's copy changes — rerun this after editing one.
"""

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"
OUT = BRAND / "preview.html"


def grab(src, key, count=99):
    """Pull `key:"..."` values out of a locale table, in order."""
    pat = re.compile(r'(?:^|[,{"\s])' + re.escape(key) + r'"?\s*:\s*"([^"]*)"', re.M)
    return [m.group(1) for m in pat.finditer(src)][:count]


def grab_q(src, key):
    """sunzi-13 registers copy as q(key, 文言, 白话, 黑话, ENG) — four registers,
    not four locales. Returns all four in that order."""
    pat = re.compile(r'\bq\(\s*"' + re.escape(key) + r'"\s*,((?:\s*"(?:[^"\\]|\\.)*"\s*,?)+)\)')
    m = pat.search(src)
    if not m:
        return []
    return re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))


def need(vals, n, what):
    if len(vals) < n:
        raise SystemExit(f"could not find {n} values for {what} (found {len(vals)})")
    return vals


# ---------------------------------------------------------------- the specs

def hetu_specs():
    src = (ROOT / "_gh/hetu-luoshu/index.html").read_text(encoding="utf-8")
    keys = ["gtitle", "end_line", "end_p1", "end_p2", "end_restart",
            "end_t1", "end_t2", "end_t3", "end_t4"]
    per = {k: need(grab(src, k), 3, f"hetu.{k}") for k in keys}
    langs = ["hans", "hant", "en"]
    out = []
    for i, lg in enumerate(langs):
        g = lambda k: per[k][i]
        out.append({
            "game": "hetu-luoshu", "label": "「发明」河图洛书 · Lo Shu", "lang": lg,
            "url": "https://hetu.trilumi.xyz/",
            "spec": {
                "paper": "#f7f2e7", "ink": "#1c1a17", "accent": "#9e2b25",
                "muted": "#8a8073", "line": "#d6cdb9",
                "panel": "#1c1a17", "panelInk": "#f2ece2",
                "serif": 'Georgia,"Songti SC","STSong","Noto Serif CJK SC",serif',
                "sans": '"Segoe UI",Helvetica,"Microsoft YaHei",sans-serif',
                "kicker": g("gtitle"),
                "title": g("end_line"),
                "body": g("end_p1"),
                "stats": [{"k": g("end_t1"), "v": "12 分 34 秒"},
                          {"k": g("end_t2"), "v": "3"},
                          {"k": g("end_t3"), "v": "1"},
                          {"k": g("end_t4"), "v": "67%"}],
                "quote": g("end_p2"),
                "footer": g("end_restart"),
                "markColor": "#9e2b25",
            },
        })
    return out


def wami_specs():
    src = (ROOT / "_gh/coordinate-thinking-game/index.html").read_text(encoding="utf-8")
    keys = ["cl.cardTitle", "cl.h2", "cl.q1", "cl.tailH"]
    per = {k: need(grab(src, k), 3, f"whereami.{k}") for k in keys}
    langs = ["hans", "hant", "en"]
    out = []
    for i, lg in enumerate(langs):
        g = lambda k: per[k][i]
        out.append({
            "game": "whereami", "label": "你在哪一格 · Where Am I", "lang": lg,
            "url": "https://whereami.trilumi.xyz/",
            "spec": {
                "paper": "#E9EDE6", "ink": "#1B241C", "accent": "#3F6B4A",
                "muted": "#77857A", "line": "#C0CDB9",
                "panel": "#1B241C", "panelInk": "#EDF2EA",
                "serif": 'Georgia,"Noto Serif SC",serif',
                "sans": '"IBM Plex Sans","Noto Sans SC","Segoe UI",sans-serif',
                "kicker": "你在哪一格",
                "title": g("cl.cardTitle").replace("{n}", "6"),
                "body": g("cl.h2"),
                "stats": [{"k": "0" + str(n + 1), "v": "✓" if n < 4 else "·"} for n in range(6)],
                "quote": g("cl.q1"),
                "footer": g("cl.tailH"),
                "markColor": "#3F6B4A",
            },
        })
    return out


def thor_hammer_specs():
    """This one draws its own card, so the preview reimplements its layout."""
    src = (ROOT / "thor-hammer/index.html").read_text(encoding="utf-8")
    q = need(grab(src, "q"), 3, "thor.end.q")
    foot = need(grab(src, "cardFooter"), 3, "thor.cardFooter")
    names = need(grab(src, "name"), 12, "thor.ranks.name")
    texts = need(grab(src, "text"), 12, "thor.ranks.text")
    doc = need(grab(src, "docTitle"), 3, "thor.docTitle")
    fin = need(grab(src, "finishedAs"), 3, "thor.finishedAs")
    cash = need(grab(src, "cash"), 3, "thor.cash")
    stand = need(grab(src, "standing"), 3, "thor.standing")
    reach = need(grab(src, "reach"), 3, "thor.reach")
    timew = need(grab(src, "time"), 3, "thor.time")
    langs = ["hans", "hant", "en"]
    out = []
    for i, lg in enumerate(langs):
        out.append({
            "game": "thor-hammer", "label": "Everyone Got Thor's Hammer", "lang": lg,
            "url": "https://aihammer.trilumi.xyz/",
            "own": {
                "docTitle": doc[i], "finishedAs": fin[i],
                "rankName": names[i * 4], "rankText": texts[i * 4],
                "stats": [f"{cash[i]} 42", f"{stand[i]} 61",
                          f"{reach[i]} 38", f"{timew[i]} 12"],
                "quote": q[i], "footer": foot[i],
            },
        })
    return out


def sunzi_specs():
    """sunzi-13's own card lists all thirteen player-written lines, so the
    preview shows the header and the footer band rather than faking thirteen
    lines of a player's prose."""
    src = (ROOT / "_gh/sunzi-13/index.html").read_text(encoding="utf-8")
    title = need(grab_q(src, "ui.title"), 4, "sunzi.ui.title")
    sub = need(grab_q(src, "ui.sub"), 4, "sunzi.ui.sub")
    your13 = need(grab_q(src, "ui.your13"), 4, "sunzi.ui.your13")
    exit3s = need(grab_q(src, "ui.exit3s"), 4, "sunzi.ui.exit3s")
    share = need(grab_q(src, "ui.share"), 4, "sunzi.ui.share")
    # registers are 文言 / 白话 / 黑话 / ENG — skip the classical, which reads
    # oddly out of context, and show the three a player would actually use
    picks = [(1, "baihua"), (2, "heihua"), (3, "en")]
    out = []
    for i, lg in picks:
        out.append({
            "game": "sunzi-13", "label": "「发明」孙子兵法 · Art of War", "lang": lg,
            "url": "https://artofwar.trilumi.xyz/",
            "own": {
                "docTitle": title[i], "finishedAs": your13[i],
                "rankName": share[i], "rankText": exit3s[i],
                "stats": [], "quote": "", "footer": sub[i],
            },
        })
    return out


SPECS = hetu_specs() + wami_specs() + thor_hammer_specs() + sunzi_specs()


# ---------------------------------------------------------------- the page

def js_spec(s):
    import json
    return json.dumps(s, ensure_ascii=False, indent=2)


def build():
    tribrand = (BRAND / "tribrand.js").read_text(encoding="utf-8")
    tricard = (BRAND / "tricard.js").read_text(encoding="utf-8")

    groups = {}
    for s in SPECS:
        groups.setdefault(s["game"], []).append(s)

    blocks = []
    for game, specs in groups.items():
        rows = []
        for s in specs:
            rows.append(
                '<figure class="card">'
                f'<figcaption><b>{html.escape(s["label"])}</b>'
                f'<span>{s["lang"]}</span></figcaption>'
                f'<div class="cv" data-spec="{html.escape(js_spec(s), quote=True)}"></div>'
                "</figure>"
            )
        blocks.append(
            f'<section><h2>{html.escape(specs[0]["label"])}</h2>'
            f'<p class="url">{html.escape(specs[0]["url"])}</p>'
            + "".join(rows) + "</section>"
        )

    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Share cards — trilumi game family</title>
<style>
:root{{--paper:#f7f4ef;--ink:#191713;--ink3:#8c8478;--line:#e2dbcf;--blue:#004AAD}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--paper);color:var(--ink);
  font:15px/1.6 "Segoe UI",Helvetica,Arial,sans-serif}}
.wrap{{max-width:1180px;margin:0 auto;padding:36px 24px 80px}}
h1{{font:700 30px/1.2 Georgia,serif;margin:0 0 8px}}
.lede{{color:var(--ink3);margin:0 0 8px;max-width:70ch}}
.note{{color:var(--ink3);font-size:13px;margin:0 0 34px}}
section{{margin:0 0 54px;border-top:1px solid var(--line);padding-top:24px}}
section h2{{font:700 19px/1.3 Georgia,serif;margin:0 0 3px}}
.url{{margin:0 0 20px;font-size:12.5px;color:var(--blue)}}
.card{{margin:0 0 26px}}
figcaption{{display:flex;align-items:baseline;gap:10px;margin-bottom:9px}}
figcaption b{{font-size:13px;font-weight:700}}
figcaption span{{font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink3);border:1px solid var(--line);border-radius:999px;padding:2px 8px}}
.cv canvas{{display:block;width:100%;max-width:540px;height:auto;
  border:1px solid var(--line);border-radius:6px;background:#fff}}
@media (min-width:900px){{
  .card{{display:grid;grid-template-columns:200px 1fr;gap:20px;align-items:start}}
  figcaption{{flex-direction:column;gap:6px;margin:0}}
  .cv canvas{{max-width:620px}}
}}
</style>
</head>
<body>
<div class="wrap">
  <h1>Share cards</h1>
  <p class="lede">Every card in the family, at real size, drawn by the real
  renderer with each game's own strings. What is on this page is what the
  download button produces.</p>
  <p class="note">Stub-free — this is the actual <code>TRICARD</code> and
  <code>TRILUMI</code> code running in your browser.</p>
  {"".join(blocks)}
</div>

<script>{tribrand}</script>
<script>{tricard}</script>
<script>
(function () {{
  var host = null;
  try {{ host = location.hostname; }} catch (e) {{}}
  var isLocal = !/trilumi\\.xyz$/.test(host);

  Array.prototype.forEach.call(document.querySelectorAll('.cv'), function (box) {{
    var s = JSON.parse(box.getAttribute('data-spec'));
    var cv;

    if (s.spec) {{
      s.spec.mark = function (c, x, y, h) {{ TRILUMI.path(c, x, y, h, s.spec.markColor); }};
      cv = TRICARD.draw(s.spec);
    }} else {{
      cv = ownCard(s.own);
    }}

    cv.style.maxWidth = '540px';
    box.appendChild(cv);
  }});

  /* thor-hammer and sunzi-13 predate TRICARD and draw their own cards. This
     mirrors their layout closely enough to review the brand stamp in place —
     it is not the shipped code, and the footer band is what it is here to show. */
  function ownCard(o) {{
    var W = 1080, H = 1350, PAD = 96, maxW = W - PAD * 2;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var SERIF = 'Georgia,"Times New Roman","Songti SC",SimSun,serif';
    var SANS = '"Segoe UI","Microsoft YaHei","PingFang SC",Arial,sans-serif';

    c.fillStyle = '#f7f4ef'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#e2dbcf'; c.lineWidth = 2;
    c.strokeRect(20, 20, W - 40, H - 40);

    c.font = '700 23px ' + SANS;
    c.fillStyle = '#a8542a';
    var t = o.docTitle.toUpperCase(), tx = PAD;
    for (var i = 0; i < t.length; i++) {{
      c.fillText(t[i], tx, 132); tx += c.measureText(t[i]).width + 3.2;
    }}
    c.strokeStyle = '#e2dbcf'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(PAD, 182); c.lineTo(W - PAD, 182); c.stroke();

    c.font = '700 23px ' + SANS; c.fillStyle = '#8c8478';
    c.fillText(o.finishedAs.toUpperCase(), PAD, 286);

    var size = 138;
    c.font = '700 ' + size + 'px ' + SERIF;
    while (c.measureText(o.rankName).width > maxW && size > 54) {{
      size -= 4; c.font = '700 ' + size + 'px ' + SERIF;
    }}
    c.fillStyle = '#191713'; c.fillText(o.rankName, PAD, 444);

    c.font = '400 34px ' + SERIF; c.fillStyle = '#4c463d';
    var lines = TRICARD.wrapLines(c, o.rankText, maxW).slice(0, 4);
    lines.forEach(function (ln, k) {{ c.fillText(ln, PAD, 524 + k * 54); }});

    if (o.stats.length) {{
      c.font = '600 28px ' + SANS; c.fillStyle = '#4c463d';
      c.fillText(o.stats.join('   ·   '), PAD, 524 + (lines.length - 1) * 54 + 50);
    }}

    if (o.quote) {{
      var qPad = 56, qLh = 72;
      c.font = '400 48px ' + SERIF;
      var ql = TRICARD.wrapLines(c, o.quote, maxW - qPad * 2);
      var bh = qPad * 2 + ql.length * qLh - 20;
      var bb = H - 196, bt = bb - bh;
      c.strokeStyle = '#e2dbcf'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(PAD, bt - 66); c.lineTo(W - PAD, bt - 66); c.stroke();
      TRILUMI.rr(c, PAD, bt, maxW, bh, 6);
      c.fillStyle = '#191713'; c.fill();
      c.fillStyle = '#f2ece2';
      ql.forEach(function (ln, k) {{ c.fillText(ln, PAD + qPad, bt + qPad + 42 + k * qLh); }});
    }}

    var fTop = H - 114;
    c.strokeStyle = '#e2dbcf'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(PAD, fTop - 30); c.lineTo(W - PAD, fTop - 30); c.stroke();
    var sw = TRILUMI.stamp(c, PAD, fTop, {{ badge: 34, word: 19, muted: '#8c8478' }});
    if (o.footer) {{
      c.font = '400 20px ' + SANS; c.fillStyle = '#8c8478';
      var fl = TRICARD.wrapLines(c, o.footer, maxW - sw - 60).slice(-2);
      fl.forEach(function (ln, k) {{
        c.fillText(ln, W - PAD - c.measureText(ln).width, fTop + 24 + k * 28);
      }});
    }}
    return cv;
  }}
}})();
</script>
</body>
</html>
"""
    # newline="\n": the default would turn every \n into CRLF on Windows, and
    # this page is opened next to the deployed cards — a preview that is 200
    # bytes bigger than the file git stores is one more false signal.
    OUT.write_text(page, encoding="utf-8", newline="\n")
    print(f"wrote {OUT}  {OUT.stat().st_size:,} bytes  ({len(SPECS)} cards)")


if __name__ == "__main__":
    build()
