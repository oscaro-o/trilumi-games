/* ==========================================================================
   TRILUMI — brand signature
   --------------------------------------------------------------------------
   The lockup is copied from the header of trilumi.xyz, which is the
   authoritative source:

     mark   three polygons in a 100 x 106 box, painted in one colour
     word   "TRILUMI", uppercase, letter-spacing .22em

   Both are redrawn by hand here for two reasons: a canvas share card and the
   page itself must use the same geometry, and every game has to stay a single
   file with no dependencies.

   Nothing in this block is translated. A brand mark that changes with the
   interface language is not a brand mark.
   ========================================================================== */
var TRILUMI = (function () {
  var BLUE = '#004AAD';
  var HREF = 'https://academy.trilumi.xyz/';
  var SANS = '"Segoe UI","Helvetica Neue",Helvetica,"Microsoft YaHei",' +
             '"PingFang SC","Hiragino Sans GB",Arial,sans-serif';

  /* the three polygons, in the official 100 x 106 space */
  var POLY = [
    [[57, 0], [68.5, 21], [40, 76], [18, 76]],
    [[9, 80], [63, 80], [73, 98], [0, 98]],
    [[66, 33], [55, 55], [79, 106], [100, 106]]
  ];

  function path(c, x, y, h, color) {
    var s = h / 106;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.fillStyle = color || BLUE;
    c.beginPath();
    for (var i = 0; i < 3; i++) {
      var p = POLY[i];
      c.moveTo(p[0][0], p[0][1]);
      for (var j = 1; j < p.length; j++) c.lineTo(p[j][0], p[j][1]);
      c.closePath();
    }
    c.fill();
    c.restore();
  }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  /* The badge — the form that travels. A share card gets forwarded into chat
     apps and shown as a thumbnail a few hundred pixels wide, so the mark has
     to survive being scaled down and re-compressed. A solid blue square with
     white cut-outs does; a hairline of blue polygons does not. */
  function badge(c, x, y, size) {
    rr(c, x, y, size, size, size * 0.22);
    c.fillStyle = BLUE;
    c.fill();
    var inner = size * 0.60;
    path(c, x + (size - inner * 100 / 106) / 2, y + (size - inner) / 2, inner, '#fff');
  }

  /* "TRILUMI", uppercase, letterspaced. Canvas has no letter-spacing, so the
     glyphs go down one at a time. Returns the advance width. */
  function word(c, x, y, size, color, ls) {
    ls = (ls == null) ? 0.22 : ls;
    var sp = size * ls, tx = x, s = 'TRILUMI';
    c.save();
    c.font = '700 ' + size + 'px ' + SANS;
    c.fillStyle = color || BLUE;
    for (var i = 0; i < s.length; i++) {
      c.fillText(s[i], tx, y);
      tx += c.measureText(s[i]).width + sp;
    }
    c.restore();
    return tx - sp - x;
  }

  function wordW(c, size, ls) {
    ls = (ls == null) ? 0.22 : ls;
    var w = 0, s = 'TRILUMI';
    c.save();
    c.font = '700 ' + size + 'px ' + SANS;
    for (var i = 0; i < s.length; i++) w += c.measureText(s[i]).width + size * ls;
    c.restore();
    return w - size * ls;
  }

  /* The lockup on a share card: badge + wordmark on one line, the series
     address under it. Returns the width used, so the caller can right-align
     the game's own line against it without the two ever colliding. */
  function stamp(c, x, y, opts) {
    opts = opts || {};
    var bs = opts.badge || 34;
    var ws = opts.word || 19;
    var gap = opts.gap || 15;
    badge(c, x, y, bs);
    var cy = y + bs / 2 + ws * 0.36;
    var w = bs + gap + word(c, x + bs + gap, cy, ws, opts.color || BLUE);
    if (opts.url !== false) {
      c.save();
      c.font = '400 ' + Math.round(ws * 0.82) + 'px ' + SANS;
      c.fillStyle = opts.muted || '#8c8478';
      c.fillText(opts.addr || 'academy.trilumi.xyz', x, y + bs + ws * 1.16);
      c.restore();
    }
    return w;
  }

  return {
    BLUE: BLUE, HREF: HREF, SANS: SANS,
    path: path, badge: badge, word: word, wordW: wordW, rr: rr, stamp: stamp
  };
})();
