/* ==========================================================================
   TRICARD — one share-card renderer for the whole family
   --------------------------------------------------------------------------
   The first two games each grew their own card code. That does not scale to
   four, and it guarantees the four cards drift apart. This is the single
   renderer: a game hands over a plain description of what is on its card and
   gets a canvas back.

   Depends on TRILUMI for the brand stamp. Everything else is self-contained.

     TRICARD.draw({
       paper, ink, accent, muted, line, panel, panelInk,   // palette
       serif, sans,                                        // font stacks
       kicker,                                             // small caps line
       title, body,                                        // wrapped + fitted
       stats: [{k, v}],                                    // 2-4 inline
       quote,                                              // dark panel
       footer,                                             // game's own line
       mark: function (c, x, y, h) {}                      // optional game mark
     })

   Returns a canvas. The caller downloads it.

   Layout rule: the card is a fixed 1080 wide and grows downwards. Every block
   is measured before anything is painted, so the canvas is created at the
   height the content actually needs — a game cannot overflow by handing over
   a long string. Titles WRAP rather than shrink; a long title set small to
   stay on one line reads as a mistake, a long title set on three lines reads
   as a title.
   ========================================================================== */
var TRICARD = (function () {
  var W = 1080;
  var PAD = 96;
  var MAXW = W - PAD * 2;

  /* closing punctuation must not be pushed to the start of a line */
  var NO_START = '。，、；：？！）》」』】”’…·.,;:?!)]}';

  /* CJK glyphs break anywhere; Latin words stay whole */
  function tokens(s) {
    var out = [], buf = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (/[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch)) {
        if (buf) { out.push(buf); buf = ''; }
        out.push(ch);
      } else if (ch === ' ' || ch === '\n') {
        if (buf) { out.push(buf); buf = ''; }
        out.push(ch);
      } else {
        buf += ch;
      }
    }
    if (buf) out.push(buf);
    return out;
  }

  function wrapLines(c, text, maxW) {
    var tk = tokens(String(text || '')), lines = [], cur = '';
    for (var i = 0; i < tk.length; i++) {
      var t = tk[i];
      if (t === '\n') { lines.push(cur); cur = ''; continue; }
      var test = cur + t;
      if (cur && c.measureText(test).width > maxW) {
        /* never open a line with closing punctuation — pull it back down */
        if (NO_START.indexOf(t) >= 0) {
          lines.push(cur + t);
          cur = '';
          continue;
        }
        lines.push(cur);
        cur = (t === ' ') ? '' : t;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /* canvas has no letter-spacing */
  function spaced(c, text, x, y, sp) {
    var tx = x;
    for (var i = 0; i < text.length; i++) {
      c.fillText(text[i], tx, y);
      tx += c.measureText(text[i]).width + sp;
    }
    return tx - sp - x;
  }

  function fitOneLine(c, text, weight, stack, max, min, maxW, step) {
    var s = max;
    while (s > min) {
      c.font = weight + ' ' + s + 'px ' + stack;
      if (c.measureText(text).width <= maxW) break;
      s -= (step || 1);
    }
    c.font = weight + ' ' + s + 'px ' + stack;
    return s;
  }

  /* wrap to at most `maxLines`, shrinking the type until it fits that budget */
  function fitBlock(c, text, weight, stack, max, min, maxW, maxLines, step) {
    var s = max, lines = [];
    while (s >= min) {
      c.font = weight + ' ' + s + 'px ' + stack;
      lines = wrapLines(c, text, maxW);
      if (lines.length <= maxLines) break;
      s -= (step || 2);
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S{0,4}$/, '') + '…';
    }
    c.font = weight + ' ' + s + 'px ' + stack;
    return { size: s, lines: lines };
  }

  function draw(spec) {
    var c = document.createElement('canvas').getContext('2d');
    var serif = spec.serif, sans = spec.sans;
    var ink = spec.ink || '#191713';
    var accent = spec.accent || '#a8542a';
    var muted = spec.muted || '#8c8478';
    var line = spec.line || '#e2dbcf';
    var paper = spec.paper || '#f7f4ef';
    var bodyInk = spec.bodyInk || '#4c463d';
    var ls = spec.ls == null ? 3.2 : spec.ls;

    var stats = spec.stats || [];
    var quote = spec.quote || '';
    var footer = spec.footer || '';

    /* ================= layout pass — nothing is painted yet ============== */

    /* title: wrapped, then shrunk until it fits three lines */
    var T = fitBlock(c, spec.title || '', '700', serif, 104, 44, MAXW, 3, 2);
    var tLh = Math.round(T.size * 1.16);
    var tBase = 182 + 56 + Math.round(T.size * 0.72);
    var tBottom = tBase + (T.lines.length - 1) * tLh;

    /* body: wrapped, at most five lines */
    var B = fitBlock(c, spec.body || '', '400', serif, 32, 21, MAXW, 5, 1);
    var bLh = Math.round(B.size * 1.62);
    var bBase = tBottom + 46 + Math.round(B.size * 0.72);
    var bBottom = bBase + (B.lines.length - 1) * bLh;

    /* stats: one inline row, shrunk to fit the column */
    var statBase = 0, statSize = 0, statLine = '';
    var y = bBottom;
    if (stats.length) {
      statLine = stats.map(function (s) { return s.k + ' ' + s.v; }).join('   ·   ');
      statSize = fitOneLine(c, statLine, '600', sans, 28, 15, MAXW, 1);
      statBase = bBottom + 34 + Math.round(statSize * 0.78);
      y = statBase;
    }

    /* quote: a dark panel */
    var Q = null;
    if (quote) {
      var qPad = 54;
      Q = fitBlock(c, quote, '400', serif, 44, 24, MAXW - qPad * 2, 4, 2);
      Q.lh = Math.round(Q.size * 1.45);
      Q.pad = qPad;
      Q.top = y + 96;
      Q.h = qPad * 2 + (Q.lines.length - 1) * Q.lh;
      y = Q.top + Q.h;
    }

    /* footer band: badge + wordmark, with the game's own line on the right */
    var fTop = y + 104;
    var fH = 34 + 19 * 1.16 + 8;
    var H = Math.round(fTop + fH + 74);
    if (H < 900) H = 900;

    /* ================= paint pass ======================================== */
    var cv = c.canvas;
    cv.width = W; cv.height = H;
    c = cv.getContext('2d');

    c.fillStyle = paper; c.fillRect(0, 0, W, H);
    c.strokeStyle = line; c.lineWidth = 2;
    c.strokeRect(20, 20, W - 40, H - 40);

    /* the game's own mark, top right */
    if (typeof spec.mark === 'function') {
      c.save();
      spec.mark(c, W - PAD - 78, 106, 36);
      c.restore();
    }

    /* kicker */
    c.font = '700 23px ' + sans;
    c.fillStyle = accent;
    spaced(c, String(spec.kicker || '').toUpperCase(), PAD, 132, ls);
    c.strokeStyle = line; c.lineWidth = 2;
    c.beginPath(); c.moveTo(PAD, 182); c.lineTo(W - PAD, 182); c.stroke();

    /* title */
    c.font = '700 ' + T.size + 'px ' + serif;
    c.fillStyle = ink;
    T.lines.forEach(function (ln, i) { c.fillText(ln, PAD, tBase + i * tLh); });

    /* body */
    c.font = '400 ' + B.size + 'px ' + serif;
    c.fillStyle = bodyInk;
    B.lines.forEach(function (ln, i) { c.fillText(ln, PAD, bBase + i * bLh); });

    /* stats */
    if (stats.length) {
      c.font = '600 ' + statSize + 'px ' + sans;
      c.fillStyle = bodyInk;
      c.fillText(statLine, PAD, statBase);
    }

    /* quote panel */
    if (Q) {
      c.strokeStyle = line; c.lineWidth = 2;
      c.beginPath(); c.moveTo(PAD, Q.top - 64); c.lineTo(W - PAD, Q.top - 64); c.stroke();

      TRILUMI.rr(c, PAD, Q.top, MAXW, Q.h, 6);
      c.fillStyle = spec.panel || '#191713';
      c.fill();

      c.font = '400 ' + Q.size + 'px ' + serif;
      c.fillStyle = spec.panelInk || '#f2ece2';
      Q.lines.forEach(function (ln, i) {
        c.fillText(ln, PAD + Q.pad, Q.top + Q.pad + Math.round(Q.size * 0.92) + i * Q.lh);
      });
    }

    /* footer: the publisher left, the game's own line right */
    c.strokeStyle = line; c.lineWidth = 2;
    c.beginPath(); c.moveTo(PAD, fTop - 30); c.lineTo(W - PAD, fTop - 30); c.stroke();

    var stampW = TRILUMI.stamp(c, PAD, fTop, { badge: 34, word: 19, muted: muted });
    if (footer) {
      c.font = '400 20px ' + sans;
      c.fillStyle = muted;
      var fl = wrapLines(c, footer, MAXW - stampW - 60).slice(-2);
      var fy = fTop + 34 + (fl.length > 1 ? -8 : 10);
      fl.forEach(function (ln, i) {
        c.fillText(ln, W - PAD - c.measureText(ln).width, fy + i * 28);
      });
    }

    return cv;
  }

  /* plain-text twin, for the clipboard button */
  function text(spec) {
    var out = [spec.kicker, '', spec.title];
    if (spec.body) out.push('', spec.body);
    if (spec.stats && spec.stats.length) {
      out.push('', spec.stats.map(function (s) { return s.k + ' ' + s.v; }).join('  ·  '));
    }
    if (spec.quote) out.push('', spec.quote);
    if (spec.footer) out.push('', spec.footer);
    out.push('', 'academy.trilumi.xyz');
    return out.join('\n');
  }

  /* download / share, wired the same way in every game */
  function save(cv, filename, onDone, onFail) {
    function go(href, revoke) {
      var a = document.createElement('a');
      a.href = href; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      if (revoke) setTimeout(function () { URL.revokeObjectURL(href); }, 2000);
      if (onDone) onDone();
    }
    try {
      if (cv.toBlob) {
        cv.toBlob(function (b) { go(URL.createObjectURL(b), true); }, 'image/png');
      } else {
        go(cv.toDataURL('image/png'), false);
      }
    } catch (e) { if (onFail) onFail(e); }
  }

  function copy(txt, ok, fail) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(ok, function () { legacy(txt, ok, fail); });
    } else {
      legacy(txt, ok, fail);
    }
  }

  function legacy(txt, ok, fail) {
    try {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select(); ta.setSelectionRange(0, txt.length);
      var done = document.execCommand('copy');
      ta.remove();
      done ? ok() : fail();
    } catch (e) { fail(); }
  }

  return {
    draw: draw, text: text, save: save, copy: copy,
    wrapLines: wrapLines, fitBlock: fitBlock, W: W, PAD: PAD
  };
})();
