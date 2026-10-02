"""Give sunzi-13 a share card that is reachable, visible, and carries a link home.

What was wrong
--------------
The card code was intact. I proved it by running the game headlessly across
three languages and five endings — fifteen combinations, all clean. The problem
was never that it was broken:

  1. it lived only in phase "final", which needs all thirteen chapters played
     AND a fourteenth line typed into a textarea before the button even exists;
  2. even then it painted into a hidden canvas and silently downloaded a PNG.
     On iOS Safari an <a download> pointing at a data: URL usually does nothing,
     so "the share card is not there" was literally true from the player's side.

What this changes
-----------------
  * a share button in the page furniture, visible from the first chapter on,
    not only at the end;
  * the card is shown on screen through TRISHARE (long-press to save) instead of
    silently downloading;
  * one meme per ending, embedded, drawn on the card and shown at the ending;
  * the card carries both addresses: this game, and academy.trilumi.xyz.

Idempotent: every edit is a no-op on a second run. Run:
    python brand/patch-ao-card.py

Line endings
------------
These game files are CRLF. Anchors here are written with plain newlines and it
still works because read_text/write_text use universal newlines: CRLF collapses
to LF on read, and LF expands back to os.linesep on write. That is exactly what
apply.py relies on, and it is why opening these files with newline="" instead
makes every multi-line anchor miss. It is also why this only round-trips on
Windows — run it on Linux and the whole file silently becomes LF.
"""
import os
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TARGET = os.path.join(ROOT, "_gh", "sunzi-13", "index.html")
MEMEJS = os.path.join(HERE, "meme-data.js")


class PatchError(Exception):
    pass


def sub_once(text, old, new, label):
    """Replace once, or not at all.

    The idempotency guard has to come first. On a re-run the anchor is still
    present, so checking only for the anchor would stack a second copy of every
    patch — the mistake that cost an afternoon on the first pass through these
    four games.
    """
    if new and new in text:
        return text, False
    n = text.count(old)
    if n == 0:
        raise PatchError("anchor not found: " + label)
    if n > 1:
        raise PatchError("anchor ambiguous (%dx): %s" % (n, label))
    return text.replace(old, new, 1), True


# --------------------------------------------------------------------------
# 1. two new strings. Must land before the IIFE that builds L out of Q, or the
#    key exists in Q and not in L and t() returns undefined.
# --------------------------------------------------------------------------
AO_STR_OLD = ('q("ui.finalq","\u8c01\u4e3a\u5c14\u52a0\u6b64\u7b2c\u5341\u56db\u6761\uff1f",'
              '"\u90a3\u4e48\uff0c\u662f\u8c01\u7ed9\u4f60\u52a0\u7684\u7b2c\u5341\u56db\u6761\uff1f",'
              '"\u90a3\u4e48\uff0c\u4f60\u8fd9\u7b2c\u5341\u56db\u6761\uff0c\u662f\u8c01\u7ed9\u4f60\u52a0\u7684\uff1f",'
              '"So \u2014 who added your fourteenth rule?");')

AO_STR_NEW = AO_STR_OLD + """
/* \u5206\u4eab\u5361\u76f8\u5173\uff1a\u6309\u94ae\u6807\u7b7e\u548c\u5361\u7247\u4e0a\u7684\u9080\u8bf7 */
q("ui.cardbtn","\u5206\u4eab\u5361","\u5206\u4eab\u5361","\u51fa\u56fe","Share card");
q("ui.cardcta","\u5c14\u4e4b\u7b2c\u5341\u56db\u6761\u4e3a\u4f55\uff1f",
  "\u4f60\u4e5f\u6765\u5199\u4f60\u7684\u7b2c\u5341\u56db\u6761 \u2192",
  "\u4f60\u7684\u7b2c\u5341\u56db\u6761\u5462 \u2192",
  "Write your own fourteenth rule \u2192");"""

# --------------------------------------------------------------------------
# 2. CSS: the meme figure, and the row that holds the lockup plus the button.
# --------------------------------------------------------------------------
AO_CSS_OLD = 'canvas#share{display:none}'

AO_CSS_NEW = AO_CSS_OLD + """
/* ---- \u7ed3\u5c40\u6897\u56fe ---- */
figure.meme{margin:14px 0 4px;border:1px solid var(--line);border-radius:4px;
  overflow:hidden;background:#fff;line-height:0}
figure.meme img{display:block;width:100%;height:auto}"""

AO_BRAND_CSS_OLD = """.tribrand{display:flex;align-items:center;justify-content:center;gap:9px;
  margin:40px auto 4px;padding-top:14px;border-top:1px solid var(--line);
  font-family:"Segoe UI",Helvetica,Arial,"Microsoft YaHei","PingFang SC",
    "Hiragino Sans GB",sans-serif;line-height:1;text-decoration:none;
  opacity:.72;transition:opacity .18s ease;-webkit-tap-highlight-color:transparent}"""

AO_BRAND_CSS_NEW = """/* The lockup and the share button share one row. The rule above them belongs
   to the row, not to the link, so the button sits inside the same band. */
.trirow{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;
  margin:40px auto 4px;padding-top:14px;border-top:1px solid var(--line)}
.tribrand{display:flex;align-items:center;justify-content:center;gap:9px;
  font-family:"Segoe UI",Helvetica,Arial,"Microsoft YaHei","PingFang SC",
    "Hiragino Sans GB",sans-serif;line-height:1;text-decoration:none;
  opacity:.72;transition:opacity .18s ease;-webkit-tap-highlight-color:transparent}
.trishbtn{font-family:"Segoe UI",Helvetica,Arial,"Microsoft YaHei","PingFang SC",
    "Hiragino Sans GB",sans-serif;font-size:11px;font-weight:700;letter-spacing:.1em;
  color:#004AAD;background:transparent;border:1px solid #004AAD;border-radius:4px;
  padding:6px 11px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.trishbtn:hover,.trishbtn:focus-visible{background:#004AAD;color:#fff}"""

# --------------------------------------------------------------------------
# 3. the footer markup: lockup now points at the academy, and the button joins it
# --------------------------------------------------------------------------
AO_DOM_OLD = """<a class="tribrand" href="https://trilumi.xyz/games/" target="_blank" rel="noopener">
  <svg viewBox="0 0 100 106" aria-hidden="true" focusable="false"><polygon points="57,0 68.5,21 40,76 18,76"></polygon><polygon points="9,80 63,80 73,98 0,98"></polygon><polygon points="66,33 55,55 79,106 100,106"></polygon></svg>
  <span class="tbn">TRILUMI</span>
  <span class="tbu">trilumi.xyz/games</span>
</a>"""

AO_DOM_NEW = """<div class="trirow">
<a class="tribrand" href="https://academy.trilumi.xyz/" target="_blank" rel="noopener">
  <svg viewBox="0 0 100 106" aria-hidden="true" focusable="false"><polygon points="57,0 68.5,21 40,76 18,76"></polygon><polygon points="9,80 63,80 73,98 0,98"></polygon><polygon points="66,33 55,55 79,106 100,106"></polygon></svg>
  <span class="tbn">TRILUMI</span>
  <span class="tbu">academy.trilumi.xyz</span>
</a>
<button class="trishbtn" id="trishbtn" type="button">\u5206\u4eab\u5361</button>
</div>"""

# --------------------------------------------------------------------------
# 4. syncTone also keeps the button labelled and decides whether it shows at all
# --------------------------------------------------------------------------
AO_SYNC_OLD = '  document.getElementById("foot").textContent=t("ui.foot");'

AO_SYNC_NEW = AO_SYNC_OLD + """
  /* The share button is part of the furniture, so its label follows the
     interface language like everything else. It hides only before there is any
     state to put on a card. */
  var shb=document.getElementById("trishbtn");
  if(shb){ shb.textContent=t("ui.cardbtn"); shb.style.display=S?"":"none"; }"""

# --------------------------------------------------------------------------
# 5. the meme module itself, injected ahead of the brand module
# --------------------------------------------------------------------------
AO_MODULE_ANCHOR = """/* ==========================================================================
   TRILUMI \u2014 brand signature"""

AO_MODULE_NEW = """/* ==========================================================================
   RESULT MEMES \u2014 loader
   --------------------------------------------------------------------------
   MEME_DATA is fifteen base64 images, injected below by the build. Only one is
   ever decoded: a player reaches one ending in one language, so decoding all
   fifteen would cost roughly 60MB of bitmap to show one picture.
   ========================================================================== */
var MEME_PX = 768;              /* the size the card draws at */
var MEME_IMG = {};              /* keyed ending+language, so a language switch re-decodes */

function memeLang(){ return LANG==="trad" ? "hant" : (LANG==="en" ? "en" : "simp"); }

function memeSrc(code){
  if(!code) return null;
  var b = MEME_DATA[code];
  if(!b) return null;
  return b[memeLang()] || b.en || null;
}

/* the <img> for the ending screen. No preload needed there \u2014 the browser
   fetches a data URL the moment it is in the document. */
function memeHTML(code){
  var src = memeSrc(code);
  if(!src) return "";
  return '<figure class="meme"><img src="'+src+'" alt=""></figure>';
}

""" + AO_MODULE_ANCHOR

# --------------------------------------------------------------------------
# 6. the ending screen shows the meme
# --------------------------------------------------------------------------
AO_FINAL_OLD = """    +'<p class="quiet">'+nl(t("e."+e+".d"))+'</p></div>'"""

AO_FINAL_NEW = """    +'<p class="quiet">'+nl(t("e."+e+".d"))+'</p></div>'
    + memeHTML(e)"""

# --------------------------------------------------------------------------
# 7. makeCard: split into a loader wrapper and a body that takes the state.
#    `var S=ST` shadows the global, so the body below reads unchanged whether or
#    not the player has started.
# --------------------------------------------------------------------------
AO_CARD_HEAD_OLD = """function makeCard(e){
  var cv=document.getElementById("share"), ctx=cv.getContext("2d");
  var W=1080, F='"Songti SC","Noto Serif CJK SC",Georgia,serif';
  /* \u5148\u91cf\u4e00\u904d\u9ad8\u5ea6 */
  ctx.font="24px "+F;
  var Hy=214;"""

AO_CARD_HEAD_NEW = """function makeCardBody(e,img,ST){
  var S=ST;
  var cv=document.getElementById("share"), ctx=cv.getContext("2d");
  var W=1080, F='"Songti SC","Noto Serif CJK SC",Georgia,serif';
  /* The meme is square and sits under the subtitle. MW is 0 when there is no
     image to draw yet, which simply removes it from the layout. */
  var MW = img ? Math.min(W-140, MEME_PX) : 0;
  var y0 = 214 + (MW ? MW+44 : 0);
  /* \u5148\u91cf\u4e00\u904d\u9ad8\u5ea6 */
  ctx.font="24px "+F;
  var Hy=y0;"""

AO_CARD_H_OLD = "  var H=Math.max(900, Hy+6+52+118+64+38+r14lines*38+204);"
# The tail has to clear three lines of fourteenth rule before the CTA line, the
# rule, the game's own line and the signature. 204 was enough for a footer that
# started at H-160; the CTA now sits at H-206, so the allowance grows with it.
AO_CARD_H_NEW = "  var H=Math.max(900, Hy+6+52+118+64+38+r14lines*38+300);"

AO_CARD_Y_OLD = """  ctx.fillText(t("ui.your13"),70,168);
  var y=214;"""

AO_CARD_Y_NEW = """  ctx.fillText(t("ui.your13"),70,168);
  if(MW){
    var mx=(W-MW)/2;
    ctx.fillStyle="#ffffff"; ctx.fillRect(mx,214,MW,MW);
    try{ ctx.drawImage(img,mx,214,MW,MW); }catch(err){}
    ctx.strokeStyle="#cfc4ad"; ctx.lineWidth=2; ctx.strokeRect(mx,214,MW,MW);
  }
  var y=y0;"""

AO_CARD_FOOT_OLD = """  /* footer: the game's own line, then the publisher's signature */
  ctx.fillStyle="#5a5348"; ctx.font="20px "+F;
  ctx.fillText(t("ui.title")+" \u00b7 "+t("ui.sub"), 70, H-160);
  ctx.strokeStyle="#cfc4ad"; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(70,H-132);ctx.lineTo(W-70,H-132);ctx.stroke();
  TRILUMI.stamp(ctx,70,H-108,{badge:30,word:17,muted:"#8a8073"});"""

AO_CARD_FOOT_NEW = """  /* footer: the invitation, the publisher's signature, and both addresses.
     The card is the thing that travels, so it has to carry a way back \u2014 to
     this game so a viewer can make their own, and to the academy for the rest. */
  ctx.fillStyle="#a8321e"; ctx.font="24px "+F;
  ctx.fillText(t("ui.cardcta"), 70, H-206);
  ctx.strokeStyle="#cfc4ad"; ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(70,H-176);ctx.lineTo(W-70,H-176);ctx.stroke();
  ctx.fillStyle="#5a5348"; ctx.font="20px "+F;
  ctx.fillText(t("ui.title")+" \u00b7 "+t("ui.sub"), 70, H-142);
  TRILUMI.stamp(ctx,70,H-108,{badge:30,word:17,muted:"#8a8073",
    addr:"academy.trilumi.xyz"});
  ctx.font="400 19px "+TRILUMI.SANS; ctx.fillStyle="#8a8073";
  var gaddr="artofwar.trilumi.xyz";
  ctx.fillText(gaddr, W-70-ctx.measureText(gaddr).width, H-108+30/2+17*0.36);"""

AO_CARD_TAIL_OLD = """  try{
    var url=cv.toDataURL("image/png");
    var a=document.createElement("a");
    a.href=url; a.download="sunzi-13.png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    var m=document.getElementById("sharemsg"); if(m)m.textContent=t("ui.shared");
    window.__lastCard=url;
  }catch(err){ try{console.error(err)}catch(e2){} }
}

/* ---------- \u9876\u680f ---------- */"""

AO_CARD_TAIL_NEW = """  /* Show the card instead of silently downloading it. The old code wrote a PNG
     to disk and displayed nothing, and on a phone an <a download> aimed at a
     data: URL frequently does nothing at all \u2014 so the player saw no card and
     reasonably concluded there wasn't one. */
  try{ window.__lastCard=cv.toDataURL("image/png"); }catch(err){}
  try{
    TRISHARE.open(cv, cardText(e,ST), {
      lang: (memeLang()==="simp" ? "hans" : memeLang()),
      filename: "sunzi-13.png",
      title: t("ui.cardbtn")
    });
  }catch(err){ try{console.error(err)}catch(e2){} }
}

/* plain text, for the sheet's copy button and for pasting into a chat */
function cardText(e,ST){
  var out=[t("ui.title")+" \u00b7 "+t("ui.sub")];
  if(e) out.push(t("e."+e));
  if(ST && ST.r14) out.push(t("ui.finalq")+" "+ST.r14);
  out.push("artofwar.trilumi.xyz");
  out.push("academy.trilumi.xyz");
  return out.join("\\n");
}

/* The image has to be decoded before it can be drawn, so the real entry point
   waits for it and then paints exactly once. */
function makeCard(e){
  var ST = S || {lines:[],liang:0,bing:0,shi:0,jun:0,r14:"",sec:0,t0:Date.now()};
  var src = memeSrc(e);
  if(!src){ makeCardBody(e,null,ST); return; }

  var key = e+"|"+memeLang(), im = MEME_IMG[key];
  var fired=false;
  function go(x){ if(fired) return; fired=true; makeCardBody(e,x,ST); }

  if(im && im.complete && im.naturalWidth){ makeCardBody(e,im,ST); return; }
  if(!im){ im = new Image(); MEME_IMG[key] = im; }
  /* handlers go on before src: a data URL already in the cache can finish
     decoding the instant src is assigned, and an onload attached afterwards
     would never run \u2014 the card would simply never appear. */
  im.onload  = function(){ go(im); };
  im.onerror = function(){ go(null); };
  im.src = src;
}

/* ---------- \u9876\u680f ---------- */"""

# --------------------------------------------------------------------------
# 8. the two addresses inside the embedded brand module
# --------------------------------------------------------------------------
AO_HREF_OLD = "  var HREF = 'https://trilumi.xyz/games/';"
AO_HREF_NEW = "  var HREF = 'https://academy.trilumi.xyz/';"

AO_STAMP_OLD = "      c.fillText('trilumi.xyz/games', x, y + bs + ws * 1.16);"
AO_STAMP_NEW = "      c.fillText(opts.addr || 'academy.trilumi.xyz', x, y + bs + ws * 1.16);"

# --------------------------------------------------------------------------
# 9. TRICARD and TRISHARE. sunzi-13 had its own card and so never received
#    either; the share sheet needs both. Injected ahead of the beacon block,
#    which is the first point after the brand module has been defined.
# --------------------------------------------------------------------------
AO_SHARE_ANCHOR = """/* ==========================================================================
   TRILUMI \u2014 first-party beacon"""

# --------------------------------------------------------------------------
# 10. boot: wire the always-present share button
# --------------------------------------------------------------------------
AO_BOOT_OLD = "S=null; render();"

AO_BOOT_NEW = """S=null; render();

/* The card is reachable from the first chapter on, not only after the last one.
   Finishing all thirteen and writing a fourteenth is a lot to ask before you
   are allowed to share anything. */
(function(){
  var b=document.getElementById("trishbtn");
  if(!b) return;
  b.onclick=function(){
    var e=null;
    try{ if(S && S.lines && S.lines.length) e=ending(); }catch(err){ e=null; }
    makeCard(e);
  };
})();"""


def apply():
    text = Path(TARGET).read_text(encoding="utf-8")
    meme = Path(MEMEJS).read_text(encoding="utf-8")
    tricard = Path(HERE, "tricard.js").read_text(encoding="utf-8")
    trishare = Path(HERE, "trishare.js").read_text(encoding="utf-8")

    before = len(text)
    steps = []

    def go(old, new, label):
        nonlocal text
        text, did = sub_once(text, old, new, label)
        steps.append((label, did))

    go(AO_STR_OLD, AO_STR_NEW, "strings")
    go(AO_CSS_OLD, AO_CSS_NEW, "css meme")
    go(AO_BRAND_CSS_OLD, AO_BRAND_CSS_NEW, "css brand row")
    go(AO_DOM_OLD, AO_DOM_NEW, "footer dom")
    go(AO_SYNC_OLD, AO_SYNC_NEW, "syncTone")
    go(AO_MODULE_ANCHOR, AO_MODULE_NEW, "meme module")
    go(AO_FINAL_OLD, AO_FINAL_NEW, "ending screen")
    go(AO_CARD_HEAD_OLD, AO_CARD_HEAD_NEW, "card head")
    go(AO_CARD_H_OLD, AO_CARD_H_NEW, "card height")
    go(AO_CARD_Y_OLD, AO_CARD_Y_NEW, "card y0")
    go(AO_CARD_FOOT_OLD, AO_CARD_FOOT_NEW, "card footer")
    go(AO_CARD_TAIL_OLD, AO_CARD_TAIL_NEW, "card tail")
    go(AO_HREF_OLD, AO_HREF_NEW, "brand href")
    go(AO_STAMP_OLD, AO_STAMP_NEW, "stamp addr")
    go(AO_BOOT_OLD, AO_BOOT_NEW, "boot button")

    # payloads. Note neither payload contains the anchor it is inserted at \u2014 a
    # payload that swallows its own anchor makes the next insertion's assertion
    # fail, which is exactly how the whereami patch broke on the first pass.
    text, did = sub_once(text, AO_MODULE_NEW, meme + "\n" + AO_MODULE_NEW, "meme data")
    steps.append(("meme data", did))

    text, did = sub_once(text, AO_SHARE_ANCHOR,
                         tricard + "\n" + trishare + "\n" + AO_SHARE_ANCHOR,
                         "card+sheet modules")
    steps.append(("card+sheet", did))

    Path(TARGET).write_text(text, encoding="utf-8")

    for label, did in steps:
        print("  %-16s %s" % (label, "applied" if did else "already present"))
    print("size %d -> %d bytes (%+.0f KB)" % (before, len(text), (len(text)-before)/1024))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(apply())
    except PatchError as e:
        print("PATCH FAILED: %s" % e, file=sys.stderr)
        sys.exit(1)
