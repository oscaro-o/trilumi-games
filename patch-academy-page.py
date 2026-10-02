#!/usr/bin/env python3
"""
patch-academy-page.py — Trilumi Academy (NekoBite/TrilumiWebsite, site-academy/)

Three changes, all asserted and idempotent:

  1. Self-host the typefaces. The page was the only one in the family with a
     third-party dependency (fonts.googleapis.com / fonts.gstatic.com). It now
     serves the same two variable fonts (Cormorant Garamond v21, Inter v20,
     latin subset) from its own origin.

  2. Add the first-party beacon. All four games report to /_e/p.gif; the
     Academy — the page every ending card points at — reported nothing, so the
     middle hop of "card -> Academy -> game" was invisible. Also records which
     exhibit gets walked into.

  3. Say on the page that the games end in a shareable card. The boards read
     like a museum catalogue and never mentioned the one mechanic that can
     travel through a 600-person WhatsApp group.

Run:  python patch-academy-page.py
"""

import pathlib
import shutil
import sys

HERE = pathlib.Path(__file__).resolve().parent
WS = HERE.parent

REPO = WS / "_gh" / "TrilumiWebsite"
PAGE = REPO / "site-academy" / "index.html"
FONTS_SRC = WS / ".fonts" / "woff"
GIF_SRC = WS / ".fonts" / "p.gif"

counts = {"ok": 0, "skip": 0}


def sub_once(text, old, new, label, marker=None):
    """Replace `old` with `new` exactly once.

    Idempotency is decided by `marker` — a string that only exists after the
    patch — not by the anchor. Two of the payloads below are anchored on a
    string they also reproduce (the @font-face block keeps `<style>`, the
    beacon keeps `</body>`), so guarding on the anchor would let a re-run
    insert a second copy.
    """
    marker = marker or new
    if marker in text:
        counts["skip"] += 1
        print(f"  skip   {label} (already applied)")
        return text
    n = text.count(old)
    if n != 1:
        raise SystemExit(f"  FAIL   {label}: anchor found {n} times, expected 1")
    counts["ok"] += 1
    print(f"  ok     {label}")
    return text.replace(old, new, 1)


# ── 1. Typefaces ────────────────────────────────────────────────────────────
# Google's own declarations, with the two render-blocking preconnects and the
# stylesheet link replaced by local files. Both families ship as variable
# fonts, so one file per style covers every weight the page asks for
# (Cormorant 500/600 + italic 500, Inter 400/500/600).
LATIN = ("U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, "
         "U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, "
         "U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD")

FONT_LINKS_OLD = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">"""

FONT_LINKS_NEW = """<link rel="preload" href="fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="fonts/cormorant.woff2" as="font" type="font/woff2" crossorigin>"""

FONTFACE_ANCHOR = "<script>document.documentElement.classList.add('js')</script>\n<style>\n"

FONTFACE_NEW = FONTFACE_ANCHOR + """/* ────────────────────────────────────────────────────────────────
   Typefaces, served from this origin.

   The Academy used to fetch these from Google Fonts, which made it the
   only page in the family that needed the network to look right — and
   the one that hangs behind a firewall. Same two families, same
   versions, latin subset, now in fonts/.

   Both are variable fonts, so a single file per style covers every
   weight the page uses. The unicode-range is unchanged, so Chinese and
   Thai still fall through to the system fonts exactly as before.
   ──────────────────────────────────────────────────────────────── */
@font-face{font-family:'Cormorant Garamond';font-style:normal;font-weight:500 600;font-display:swap;
  src:url(fonts/cormorant.woff2) format('woff2');unicode-range:""" + LATIN + """}
@font-face{font-family:'Cormorant Garamond';font-style:italic;font-weight:500;font-display:swap;
  src:url(fonts/cormorant-italic.woff2) format('woff2');unicode-range:""" + LATIN + """}
@font-face{font-family:'Inter';font-style:normal;font-weight:400 600;font-display:swap;
  src:url(fonts/inter.woff2) format('woff2');unicode-range:""" + LATIN + """}
"""


# ── 2. Beacon ───────────────────────────────────────────────────────────────
BEACON_ANCHOR = "</script>\n</body>\n</html>"

BEACON_NEW = """</script>

<script>
/* ── First-party beacon ─────────────────────────────────────────────
   Same 1x1 GIF and same query shape the four games already send, so one
   report reads the whole family:

     /_e/p.gif?e=<event>&s=<session>&g=academy&l=en&r=<referrer>&n=<new>

   The Academy is the page every ending card points at. It had no beacon,
   so "card -> Academy -> game" was blind in the middle: the games could
   count sessions, but nothing could see who arrived, or which exhibit
   they walked into.

   No cookie, no third party, nothing that executes — the web server just
   writes the line to its access log. Only runs on *.trilumi.xyz, so a
   local copy or the GitHub Pages mirror stays silent.
   ─────────────────────────────────────────────────────────────────── */
(function(){
  if(!/(^|\\.)trilumi\\.xyz$/.test(location.hostname)) return;

  var SID;
  try{
    SID=sessionStorage.getItem('tri_sid');
    if(!SID){
      SID=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
      sessionStorage.setItem('tri_sid',SID);
    }
  }catch(e){SID='n'+Math.random().toString(36).slice(2,8);}

  function send(ev,extra){
    var q='?e='+ev+'&s='+SID+'&g=academy&l=en';
    if(extra)for(var k in extra)q+='&'+k+'='+encodeURIComponent(extra[k]);
    try{new Image().src='/_e/p.gif'+q+'&_='+Date.now();}catch(e){}
  }

  function refHost(){
    try{
      if(!document.referrer)return 'direct';
      var h=new URL(document.referrer).hostname;
      return (h===location.hostname)?'self':h;
    }catch(e){return 'unknown';}
  }
  function newVisitor(){
    try{
      if(localStorage.getItem('tri_seen'))return 0;
      localStorage.setItem('tri_seen','1');return 1;
    }catch(e){return 1;}
  }

  var d={r:refHost(),n:newVisitor()};
  try{
    var u=new URLSearchParams(location.search).get('utm_source');
    if(u)d.u=u;
  }catch(e){}
  send('load',d);

  /* Which exhibit gets walked into. This is the number the Academy could
     never see before, and the only honest way to tell whether a board's
     wording is doing its job. */
  document.addEventListener('click',function(ev){
    var t=ev.target;
    if(!t||!t.closest)return;
    var art=t.closest('.exhibit');
    if(!art||!t.closest('a[href]'))return;
    send('exhibit',{x:art.id||'unknown'});
  },true);
})();
</script>
</body>
</html>"""


# ── 3. Copy: the ending card ────────────────────────────────────────────────
ROOMHEAD_OLD = "<p>Four worlds by Oscar, beginning with the two parts of his Invent series. Walk up to one and its light comes on.</p>"
ROOMHEAD_NEW = "<p>Four worlds by Oscar, beginning with the two parts of his Invent series. Walk up to one and its light comes on. Each one ends with a card of how you played — keep it, or send it on.</p>"

CARD_ROW = "<dt>Ending card</dt>"

DL_HETU_OLD = "<dl><dt>Built by</dt><dd>Oscar</dd><dt>Languages</dt><dd>繁體 · 简体 · English</dd><dt>Plays</dt><dd>In the browser, installable, works offline</dd></dl>"
DL_HETU_NEW = DL_HETU_OLD.replace("</dl>", CARD_ROW + "<dd>A card of how you played</dd></dl>")

DL_WAR_OLD = "<dl><dt>Built by</dt><dd>Oscar</dd><dt>Languages</dt><dd>简体 · 繁體 · English</dd><dt>Voices</dt><dd>Classical · Vernacular · Slang</dd><dt>Length</dt><dd>About 20 minutes</dd></dl>"
DL_WAR_NEW = DL_WAR_OLD.replace("</dl>", CARD_ROW + "<dd>One of five endings, with a picture to match</dd></dl>")

DL_HAMMER_OLD = "<dl><dt>Built by</dt><dd>Oscar</dd><dt>Languages</dt><dd>English · 简体 · 繁體</dd><dt>Length</dt><dd>Six chapters</dd></dl>"
DL_HAMMER_NEW = DL_HAMMER_OLD.replace("</dl>", CARD_ROW + "<dd>A card of how you played</dd></dl>")

DL_EARTH_OLD = "<dl><dt>Built by</dt><dd>Oscar</dd><dt>Format</dt><dd>Browser game</dd></dl>"
DL_EARTH_NEW = DL_EARTH_OLD.replace("</dl>", CARD_ROW + "<dd>A card of how you played</dd></dl>")

WAR_TEXT_OLD = "By the end, the thirteen lines on your scroll are an Art of War you wrote yourself. Then comes the fourteenth chapter.</p>"
WAR_TEXT_NEW = "By the end, the thirteen lines on your scroll are an Art of War you wrote yourself. Then comes the fourteenth chapter. Finish it and the last screen hands you a card of your own ending to keep or send.</p>"


def main():
    if not PAGE.exists():
        raise SystemExit(f"page not found: {PAGE}")

    text = PAGE.read_text(encoding="utf-8")   # universal newlines: CRLF -> LF
    before = len(text)

    print("1. typefaces")
    text = sub_once(text, FONT_LINKS_OLD, FONT_LINKS_NEW, "google fonts link -> local preload",
                    marker="fonts/inter.woff2")
    text = sub_once(text, FONTFACE_ANCHOR, FONTFACE_NEW, "insert @font-face block",
                    marker="@font-face")

    print("2. beacon")
    text = sub_once(text, BEACON_ANCHOR, BEACON_NEW, "insert beacon script",
                    marker="g=academy")

    print("3. copy")
    text = sub_once(text, ROOMHEAD_OLD, ROOMHEAD_NEW, "Games Wing intro mentions the card")
    text = sub_once(text, WAR_TEXT_OLD, WAR_TEXT_NEW, "Exhibit II mentions its card")
    text = sub_once(text, DL_HETU_OLD, DL_HETU_NEW, "Exhibit I dl row")
    text = sub_once(text, DL_WAR_OLD, DL_WAR_NEW, "Exhibit II dl row")
    text = sub_once(text, DL_HAMMER_OLD, DL_HAMMER_NEW, "Exhibit III dl row")
    text = sub_once(text, DL_EARTH_OLD, DL_EARTH_NEW, "Exhibit IV dl row")

    # Fonts and the beacon GIF ride along in the same directory, so the
    # artifact picks them up and rsync --delete keeps them in place.
    #
    # The sources are scratch (downloaded from Google once); the copies in the
    # repo are now the real ones, so a missing source is not an error — it just
    # means this run has nothing to refresh.
    print("4. assets")
    fonts_dst = REPO / "site-academy" / "fonts"
    fonts_dst.mkdir(parents=True, exist_ok=True)
    found = sorted(FONTS_SRC.glob("*.woff2")) if FONTS_SRC.is_dir() else []
    if not found:
        print(f"  skip   {FONTS_SRC} not present; repo copies are authoritative")
    for f in found:
        shutil.copyfile(f, fonts_dst / f.name)
        print(f"  ok     fonts/{f.name} ({f.stat().st_size:,} B)")

    e_dst = REPO / "site-academy" / "_e"
    e_dst.mkdir(parents=True, exist_ok=True)
    if GIF_SRC.is_file():
        shutil.copyfile(GIF_SRC, e_dst / "p.gif")
        print(f"  ok     _e/p.gif ({GIF_SRC.stat().st_size} B)")
    else:
        print(f"  skip   {GIF_SRC} not present; repo copy is authoritative")

    # Write LF explicitly: the repo stores LF, and the checkout was converted
    # to CRLF by core.autocrlf, so letting the platform decide would rewrite
    # every line of the file.
    data = text.encode("utf-8")
    PAGE.write_bytes(data)

    print()
    print(f"applied {counts['ok']}, skipped {counts['skip']}")
    print(f"page {before:,} -> {len(text):,} chars; on disk {len(data):,} bytes")


if __name__ == "__main__":
    main()
