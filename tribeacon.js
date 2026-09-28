/* ==========================================================================
   TRILUMI — first-party beacon
   --------------------------------------------------------------------------
   Lifted from the tracker that has been running on hetu.trilumi.xyz since the
   first game, so all four report the same shape of event and one report script
   can read the whole family.

   Events ride in the query string of a 1x1 GIF; the web server writes them to
   its access log. No cookie, no external script, no third party, no personal
   data, nothing that executes. Swapping the backend means changing send() and
   nothing else.

   OFF by default everywhere except *.trilumi.xyz, so a local copy, a file://
   open, or the GitHub Pages mirror never reports anything.

   To switch it off entirely, set BEACON to false.
   ========================================================================== */
var BEACON = true;

var TRI = (function () {
  var ON = BEACON && /(^|\.)trilumi\.xyz$/.test(location.hostname);
  var ENDPOINT = '/_e/p.gif';
  var SEEN = {};

  /* Each game sets its own slug and language hook. Defaults keep the module
     harmless if a game forgets. */
  var GAME = 'game';
  var lang = function () { return 'en'; };

  var SID = (function () {
    try {
      var k = 'tri_sid';
      var v = sessionStorage.getItem(k);
      if (!v) {
        v = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(k, v);
      }
      return v;
    } catch (e) { return 'n' + Math.random().toString(36).slice(2, 8); }
  })();

  function send(ev, extra) {
    var q = '?e=' + encodeURIComponent(ev) +
            '&s=' + SID +
            '&g=' + encodeURIComponent(GAME) +
            '&l=' + encodeURIComponent(lang());
    if (extra) { for (var k in extra) q += '&' + k + '=' + encodeURIComponent(extra[k]); }
    try { new Image().src = ENDPOINT + q + '&_=' + Date.now(); } catch (e) {}
  }

  /* every call */
  function track(ev, extra) { if (ON) send(ev, extra); }

  /* once per session — for anything a reload would otherwise double-count */
  function trackFirst(ev, extra) {
    if (SEEN[ev]) return;
    SEEN[ev] = 1;
    track(ev, extra);
  }

  function refHost() {
    try {
      if (!document.referrer) return 'direct';
      var h = new URL(document.referrer).hostname;
      return (h === location.hostname) ? 'self' : h;
    } catch (e) { return 'unknown'; }
  }

  function newVisitor() {
    try {
      if (localStorage.getItem('tri_seen')) return 0;
      localStorage.setItem('tri_seen', '1');
      return 1;
    } catch (e) { return 1; }
  }

  function configure(opts) {
    if (opts && opts.game) GAME = opts.game;
    if (opts && opts.lang) lang = opts.lang;
    return { track: track, trackFirst: trackFirst };
  }

  /* the page-open event, fired once the game has told us who it is */
  function ready() {
    if (!ON) return;
    var d = { r: refHost(), n: newVisitor() };
    try {
      var u = new URLSearchParams(location.search).get('utm_source');
      if (u) d.u = u;
    } catch (e) {}
    track('load', d);
  }

  return {
    on: ON, track: track, trackFirst: trackFirst,
    configure: configure, ready: ready, sid: function () { return SID; }
  };
})();
