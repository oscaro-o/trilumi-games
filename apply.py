#!/usr/bin/env python3
"""
Apply the trilumi brand signature to every game in the family.

    python brand/apply.py            # patch in place
    python brand/apply.py --check    # report only
    python brand/apply.py --only sunzi-13

Four games, four repos, four palettes, four internal conventions. Every module
is inlined because each game is a single file with no dependencies. Anchors are
asserted, so a silent miss is impossible; every patch is idempotent, so running
twice is a no-op rather than a mess.

What each game gets, and why it differs:

  thor-hammer   brand lockup in the page + on its existing share card, beacon
  sunzi-13      brand lockup in the page + on its existing share card, beacon
  hetu-luoshu   brand lockup, a NEW share card, no beacon — it already has one,
                and a second tracker would double-count every event
  whereami      brand lockup, a NEW share card, beacon
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "brand"

HREF = "https://trilumi.xyz/games/"

MARK_SVG = (
    '<svg viewBox="0 0 100 106" aria-hidden="true" focusable="false">'
    '<polygon points="57,0 68.5,21 40,76 18,76"></polygon>'
    '<polygon points="9,80 63,80 73,98 0,98"></polygon>'
    '<polygon points="66,33 55,55 79,106 100,106"></polygon>'
    "</svg>"
)


class PatchError(RuntimeError):
    pass


def footer_html(indent):
    p = " " * indent
    return (
        f'{p}<a class="tribrand" href="{HREF}" target="_blank" rel="noopener">\n'
        f"{p}  {MARK_SVG}\n"
        f'{p}  <span class="tbn">TRILUMI</span>\n'
        f'{p}  <span class="tbu">trilumi.xyz/games</span>\n'
        f"{p}</a>"
    )


def footer_css(line, muted):
    return f"""
/* ---------------------------------------------------------------
   trilumi signature — one lockup, four games.
   The mark and the wordmark are copied from the header of trilumi.xyz
   so the family reads as one publisher rather than four orphans.
   Deliberately not translated: a mark that changes with the interface
   language is not a mark.
   --------------------------------------------------------------- */
.tribrand{{display:flex;align-items:center;justify-content:center;gap:9px;
  margin:40px auto 4px;padding-top:14px;border-top:1px solid {line};
  font-family:"Segoe UI",Helvetica,Arial,"Microsoft YaHei","PingFang SC",
    "Hiragino Sans GB",sans-serif;line-height:1;text-decoration:none;
  opacity:.72;transition:opacity .18s ease;-webkit-tap-highlight-color:transparent}}
.tribrand:hover,.tribrand:focus-visible{{opacity:1}}
.tribrand svg{{display:block;flex:none;width:11px;height:11.7px;fill:#004AAD}}
.tribrand .tbn{{font-size:11px;font-weight:700;letter-spacing:.22em;color:#004AAD;
  padding-left:.11em}}
.tribrand .tbu{{font-size:11px;font-weight:400;letter-spacing:.02em;color:{muted}}}
.tribrand .tbu::before{{content:"·";margin:0 9px;color:{muted}}}
@media (max-width:430px){{.tribrand{{flex-wrap:wrap;gap:5px}}
  .tribrand .tbu::before{{margin:0 6px}}}}
"""


def sub_once(text, old, new, label):
    """Replace old with new, asserting old appears exactly once.

    The idempotency guard has to come first: on a re-run the anchor is still
    there, so without it every patch would stack a second copy on top.
    """
    if new and new in text:
        return text, False
    n = text.count(old)
    if n == 0:
        raise PatchError(f"anchor not found: {label}")
    if n > 1:
        raise PatchError(f"anchor ambiguous ({n}x): {label}")
    return text.replace(old, new), True


def inject_before(text, anchor, payload, label):
    if payload.strip() in text:
        return text, False
    return sub_once(text, anchor, payload + anchor, label)


def mod(name):
    return (BRAND / name).read_text(encoding="utf-8").rstrip() + "\n"


def modules(*names):
    return "\n" + "\n".join(mod(n) for n in names)


# ==========================================================================
# 1 · thor-hammer — brand on the page and on the card it already had
# ==========================================================================

TH_CARD_OLD = """  const blockH = qPad * 2 + ql.length * qLh - 20;
  const blockBottom = H - 132;"""

TH_CARD_NEW = """  const blockH = qPad * 2 + ql.length * qLh - 20;
  /* lifted from H - 132 to open a band for the publisher's signature */
  const blockBottom = H - 196;"""

TH_FOOT_OLD = """  /* footer */
  c.font = '400 23px ' + F_SANS;
  c.fillStyle = '#8c8478';
  c.fillText(u.cardFooter, PAD, blockBottom + 68);"""

TH_FOOT_NEW = """  /* footer — the game's own line right, the publisher left.
     The stamp reports its own width so the columns cannot collide. */
  const fTop = H - 114;
  c.strokeStyle = '#e2dbcf'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(PAD, fTop - 30); c.lineTo(W - PAD, fTop - 30); c.stroke();

  const stampW = TRILUMI.stamp(c, PAD, fTop, { badge: 34, word: 19, muted: '#8c8478' });

  c.font = '400 20px ' + F_SANS;
  c.fillStyle = '#8c8478';
  const fl = wrapLines(c, u.cardFooter, maxW - stampW - 60).slice(-2);
  fl.forEach(function (ln, i) {
    c.fillText(ln, W - PAD - c.measureText(ln).width, fTop + 24 + i * 28);
  });"""


def patch_thor_hammer(t):
    t, _ = inject_before(t, "</style>", footer_css("#e2dbcf", "#8c8478"), "th css")
    t, _ = sub_once(t, '  <div id="stage"></div>\n',
                    '  <div id="stage"></div>\n' + footer_html(2) + "\n", "th dom")
    t, _ = inject_before(t, "</script>", modules("tribrand.js", "tribeacon.js") + """
/* ---- thor-hammer's settings for the modules above ------------------- */
TRI.configure({ game: 'thor-hammer', lang: function () { return lang; } });
TRI.ready();
""", "th js")

    t, _ = sub_once(t, TH_CARD_OLD, TH_CARD_NEW, "th card bottom")
    t, _ = sub_once(t, TH_FOOT_OLD, TH_FOOT_NEW, "th card footer")
    # re-balance the upper card so the worst case — a four-line description —
    # still clears the question panel with room to spare
    for old, new, label in [
        ("spacedText(c, u.finishedAs.toUpperCase(), PAD, 296, ls);",
         "spacedText(c, u.finishedAs.toUpperCase(), PAD, 286, ls);", "th finishedAs"),
        ("  c.fillText(rank.name, PAD, 458);",
         "  c.fillText(rank.name, PAD, 444);", "th rank"),
        ("  const DESC_TOP = 540, MAX_LINES = 4;",
         "  const DESC_TOP = 524, MAX_LINES = 4;", "th desc"),
        ("c.fillText(line, PAD, descEnd + 56);",
         "c.fillText(line, PAD, descEnd + 50);", "th numbers"),
    ]:
        t, _ = sub_once(t, old, new, label)
    return t


# ==========================================================================
# 2 · sunzi-13 — brand on the page and on the card it already had
# ==========================================================================

SZ_FOOT_OLD = """  ctx.fillStyle="#5a5348"; ctx.font="20px "+F;
  ctx.fillText(t("ui.title")+" · "+t("ui.sub"), 70, H-70);"""

SZ_FOOT_NEW = """  /* footer: the game's own line, then the publisher's signature */
  ctx.fillStyle="#5a5348"; ctx.font="20px "+F;
  ctx.fillText(t("ui.title")+" · "+t("ui.sub"), 70, H-160);
  ctx.strokeStyle="#cfc4ad"; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(70,H-132);ctx.lineTo(W-70,H-132);ctx.stroke();
  TRILUMI.stamp(ctx,70,H-108,{badge:30,word:17,muted:"#8a8073"});"""


def patch_sunzi(t):
    t, _ = inject_before(t, "</style>", footer_css("var(--line)", "var(--ink2)"), "sz css")
    # note: this footer sits at column 0, unlike the other games
    t, _ = sub_once(t, '<footer id="foot"></footer>\n',
                    '<footer id="foot"></footer>\n' + footer_html(0) + "\n", "sz dom")
    t, _ = inject_before(t, "</script>", modules("tribrand.js", "tribeacon.js") + """
/* ---- sunzi-13's settings for the modules above ----------------------
   LANG here is 'simp' / 'trad' / 'en'; map it to the beacon's vocabulary. */
TRI.configure({ game: 'sunzi-13', lang: function () {
  return LANG === 'simp' ? 'zh-Hans' : (LANG === 'trad' ? 'zh-Hant' : 'en');
} });
TRI.ready();
""", "sz js")

    t, _ = sub_once(t, "+r14lines*38+140);", "+r14lines*38+204);", "sz card height")
    t, _ = sub_once(t, SZ_FOOT_OLD, SZ_FOOT_NEW, "sz card footer")
    return t


# ==========================================================================
# 3 · hetu-luoshu — brand on the page, plus a share card it never had
# ==========================================================================

HL_END_OLD = """  +'<div class="row" style="justify-content:center"><button class="btn ghost small" onclick="restart()">'+t("end_restart")+'</button></div></div>';"""

HL_END_NEW = """  +'<div class="row" style="justify-content:center;gap:10px">'
  +'<button class="btn ghost small" onclick="shareCard()">'+t("end_share")+'</button>'
  +'<button class="btn ghost small" onclick="restart()">'+t("end_restart")+'</button></div></div>';"""

HL_CARD = """
/* ---- share card -----------------------------------------------------
   Built from the same four numbers the end screen shows, so what a player
   sends is what a player saw. Uses this game's own tracker — adding a second
   one would double-count every event in the log. */
function shareCard(){
  var spec={
    paper:"#f7f2e7", ink:"#1c1a17", accent:"#9e2b25",
    muted:"#8a8073", line:"#d6cdb9", panel:"#1c1a17", panelInk:"#f2ece2",
    serif:'"Songti SC","STSong","Noto Serif CJK SC",Georgia,serif',
    sans:'"Segoe UI",Helvetica,"Microsoft YaHei",sans-serif',
    kicker:t("gtitle"),
    title:t("end_line"),
    body:t("end_p1"),
    stats:[
      {k:t("end_t1"), v:fmtTime(Date.now()-(S.t0||Date.now()))},
      {k:t("end_t2"), v:S.giveUps},
      {k:t("end_t3"), v:S.bad},
      {k:t("end_t4"), v:soloRate()+"%"}
    ],
    quote:t("end_p2"),
    footer:t("end_restart"),
    mark:function(c,x,y,h){TRILUMI.path(c,x,y,h,"#9e2b25");}
  };
  var cv=TRICARD.draw(spec);
  TRISHARE.open(cv,TRICARD.text(spec),{
    lang:(LANG==="hant")?"hant":(LANG==="en"?"en":"hans"),
    filename:"hetu-luoshu.png"
  });
  track("share");
}
"""


def patch_hetu(t):
    t, _ = inject_before(t, "</style>", footer_css("var(--line)", "var(--ink3)"), "hl css")
    t, _ = sub_once(t, "  </footer>\n</div>\n",
                    "  </footer>\n" + footer_html(2) + "\n</div>\n", "hl dom")
    t, _ = inject_before(t, "</script>",
                         modules("tribrand.js", "tricard.js", "trishare.js") + HL_CARD,
                         "hl js")

    for anchor, add, label in [
        ('  a1w_done:"你刚刚发明了两个东西。",',
         '  end_share:"生成分享卡",', "hl zh label"),
        ('  a1w_done:"你剛剛發明了兩個東西。",',
         '  end_share:"產生分享卡片",', "hl hant label"),
        ('  a1w_done:"You have just invented two things.",',
         '  end_share:"Make a share card",', "hl en label"),
    ]:
        t, _ = sub_once(t, anchor, anchor + "\n" + add, label)

    t, _ = sub_once(t, HL_END_OLD, HL_END_NEW, "hl end row")
    return t


# ==========================================================================
# 4 · whereami — brand on the page, plus a share card it never had
# ==========================================================================

WG_BTN_OLD = '    <p class="foot" data-i18n="cl.foot"></p>'

WG_BTN_NEW = """    <div class="sharerow">
      <button class="btn" id="sharebtn" data-i18n="cl.share"></button>
    </div>
    <p class="foot" data-i18n="cl.foot"></p>
""" + footer_html(4)

WG_CARD = """
  /* ---- share card ---------------------------------------------------
     Six sheets, and which of them the player finished. Sits inside this
     IIFE because the copy table, the state and the language all live here. */
  function shareCard(){
    var n=0;
    SHEET_IDS.forEach(function(id){ if(done[id]){ n++; } });
    var spec={
      paper:"#E9EDE6", ink:"#1B241C", accent:"#3F6B4A",
      muted:"#77857A", line:"#C0CDB9", panel:"#1B241C", panelInk:"#EDF2EA",
      serif:'"IBM Plex Serif","Noto Serif SC",Georgia,serif',
      sans:'"IBM Plex Sans","Noto Sans SC","Segoe UI",sans-serif',
      kicker:t("docTitle"),
      title:tf("cl.cardTitle",{n:n}),
      body:t("cl.h2"),
      stats:SHEET_IDS.map(function(id,i){
        return {k:"0"+(i+1), v:done[id]?"\\u2713":"\\u00b7"};
      }),
      quote:t("cl.q1"),
      footer:t("cl.tailH"),
      mark:function(c,x,y,h){TRILUMI.path(c,x,y,h,"#3F6B4A");}
    };
    var cv=TRICARD.draw(spec);
    TRISHARE.open(cv,TRICARD.text(spec),{
      lang:(LANG==="zh-Hant")?"hant":(LANG==="en"?"en":"hans"),
      filename:"whereami.png"
    });
    TRI.track("share",{n:n});
  }
"""

# Deliberately anchor-free: it must not contain "</script>", or the beacon
# insert (which also sits next to that tag) would invalidate it on a re-run.
WG_WIRE = """
  TRI.configure({ game: 'whereami', lang: function () { return LANG; } });
  (function(){
    function wire(){
      var b=document.getElementById("sharebtn");
      if(!b){ return false; }
      b.addEventListener("click",shareCard);
      TRI.ready();
      return true;
    }
    if(!wire()){ document.addEventListener("DOMContentLoaded",wire); }
  })();
"""

WG_KEYS = [
    ('    "cl.foot":"镓的数据出自',
     '    "cl.share":"生成分享卡",\n    "cl.cardTitle":"6 个图幅，你走完 {n} 个",\n', "wg hans keys"),
    ('    "cl.foot":"鎵的數據出自',
     '    "cl.share":"產生分享卡片",\n    "cl.cardTitle":"6 個圖幅，你走完 {n} 個",\n', "wg hant keys"),
    ('    "cl.foot":"Gallium figures come from',
     '    "cl.share":"Make a share card",\n    "cl.cardTitle":"Six sheets, {n} of them done",\n', "wg en keys"),
]


def patch_whereami(t):
    t, _ = inject_before(t, "</style>", footer_css("var(--rule)", "var(--ink-3)") + """
.sharerow{display:flex;justify-content:center;margin-top:30px}
.sharerow .btn{min-width:180px}
""", "wg css")

    t, _ = sub_once(t, WG_BTN_OLD + "\n", WG_BTN_NEW + "\n", "wg dom")

    # The game's whole script is one IIFE. The modules and the beacon go
    # outside it; the card and its wiring go inside, where t/tf/LANG/SHEET_IDS
    # and the completion record actually exist.
    #
    # Two separate inserts, and neither payload may contain its own anchor —
    # otherwise the second insert invalidates the first one's guard on a
    # re-run and the patch stacks.
    t, _ = inject_before(t, "\n})();\n</script>", WG_CARD + WG_WIRE, "wg card")
    t, _ = inject_before(t, "</script>",
                         modules("tribrand.js", "tricard.js", "trishare.js")
                         + mod("tribeacon.js"), "wg js")

    for anchor, add, label in WG_KEYS:
        t, _ = sub_once(t, anchor, add + anchor, label)
    return t


PATCHERS = {
    "thor-hammer": ("thor-hammer/index.html", patch_thor_hammer),
    "sunzi-13": ("_gh/sunzi-13/index.html", patch_sunzi),
    "hetu-luoshu": ("_gh/hetu-luoshu/index.html", patch_hetu),
    "whereami": ("_gh/coordinate-thinking-game/index.html", patch_whereami),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--only")
    args = ap.parse_args()

    failed = 0
    for slug, (rel, fn) in PATCHERS.items():
        if args.only and slug != args.only:
            continue
        path = ROOT / rel
        if not path.exists():
            print(f"  !!  {slug}: missing {rel}")
            failed += 1
            continue
        before = path.read_text(encoding="utf-8")
        try:
            after = fn(before)
        except PatchError as e:
            print(f"  !!  {slug}: {e}")
            failed += 1
            continue
        if after == before:
            print(f"  =   {slug}: already patched")
            continue
        delta = len(after) - len(before)
        if args.check:
            print(f"  ok  {slug}: would patch ({delta:+,} bytes)")
        else:
            # newline="\n" is load-bearing. read_text() uses universal newlines,
            # so `before` is LF-only; write_text() with the default newline=None
            # then translates every \n to os.linesep — CRLF on Windows. That is
            # how thor-hammer, hetu-luoshu and whereami ended up CRLF in the
            # working tree while their git blobs were LF: .gitattributes declares
            # `*.html text eol=lf`, so git normalises on commit and `git status`
            # reports nothing. The only visible symptom is that the live file is
            # a few hundred bytes larger than the local one — which is exactly
            # the comparison anyone makes first when a deploy looks broken.
            path.write_text(after, encoding="utf-8", newline="\n")
            print(f"  ok  {slug}: patched ({delta:+,} bytes)")

    print()
    if failed:
        print(f"{failed} game(s) failed — nothing written for those.")
    else:
        print("all four games carry the signature.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
