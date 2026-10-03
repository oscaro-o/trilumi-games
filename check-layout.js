/* ==========================================================================
   Layout check for the share cards, without a browser.
   --------------------------------------------------------------------------
   There is no playwright or puppeteer on this machine, and the cards are pure
   canvas, so nothing about them is visible to a DOM assertion. What can be
   checked is geometry: every glyph that lands outside the card, or on top of
   another element, is a bug that would only ever show up in one language or
   one rank — exactly the class of bug that ships unnoticed.

   The stub context measures text with a width table (CJK full width, Latin
   roughly half) rather than the real font metrics, so the numbers are
   approximate. That is fine: this catches overflow and collision, not kerning.

   Usage:  node brand/check-layout.js
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* ------------------------------------------------------------------ stub */

/* rough advance widths, as a fraction of font size */
function charWidth(ch, bold) {
  const c = ch.codePointAt(0);
  let w;
  if (c >= 0x2e80) w = 1.0;                                   /* CJK, full width */
  else if (c >= 0x3000 && c <= 0x303f) w = 1.0;               /* CJK punctuation */
  else if (c >= 0xff00 && c <= 0xffef) w = 1.0;               /* full-width forms */
  else if (ch === ' ') w = 0.28;
  else if (/[A-Z]/.test(ch)) w = 0.66;
  else if (/[a-z]/.test(ch)) w = 0.52;
  else if (/[0-9]/.test(ch)) w = 0.55;
  else if (/[.,;:!?'"|]/.test(ch)) w = 0.28;
  else if (/[·—–]/.test(ch)) w = 0.5;
  else w = 0.5;
  return bold ? w * 1.06 : w;
}

function parseFont(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font || '');
  return { size: m ? parseFloat(m[1]) : 10, bold: /bold|700/.test(font || '') };
}

function makeCtx(canvas) {
  const ctx = {
    canvas,
    _font: '400 10px sans-serif',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    texts: [],                              /* every glyph run, for assertions */
    rects: [],
    set font(v) { this._font = v; },
    get font() { return this._font; },
    measureText(s) {
      const { size, bold } = parseFont(this._font);
      let w = 0;
      for (const ch of String(s)) w += charWidth(ch, bold) * size;
      return { width: w };
    },
    fillText(s, x, y) {
      const { size } = parseFont(this._font);
      this.texts.push({ s: String(s), x, y, w: this.measureText(s).width, size });
    },
    strokeText() {},
    fillRect(x, y, w, h) { this.rects.push({ x, y, w, h, kind: 'fill' }); },
    strokeRect(x, y, w, h) { this.rects.push({ x, y, w, h, kind: 'stroke' }); },
    clearRect() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arc() {}, rect() {},
    fill() {}, stroke() {}, clip() {},
    createLinearGradient() { return { addColorStop() {} }; },
    setTransform() {}, drawImage() {},
    toDataURL() { return 'data:image/png;base64,'; },
    toBlob(cb) { cb({}); },
  };
  return ctx;
}

function makeCanvas() {
  const cv = { width: 0, height: 0 };
  cv.getContext = () => { if (!cv._c) cv._c = makeCtx(cv); return cv._c; };
  return cv;
}

/* the sandbox the modules expect */
const sandbox = {
  document: { createElement: (t) => (t === 'canvas' ? makeCanvas() : {}) },
  navigator: {},
  location: { hostname: 'aihammer.trilumi.xyz', search: '' },
  sessionStorage: { getItem: () => null, setItem() {} },
  localStorage: { getItem: () => null, setItem() {} },
  URL, URLSearchParams, Date, Math, console, Image: function () {},
};
sandbox.window = sandbox;

function loadModule(file) {
  const src = fs.readFileSync(path.join(ROOT, 'brand', file), 'utf8');
  const names = Object.keys(sandbox);
  const fn = new Function(...names, src + '\n;return typeof TRILUMI!=="undefined"?TRILUMI:' +
    'typeof TRICARD!=="undefined"?TRICARD:null;');
  return fn(...names.map((n) => sandbox[n]));
}

/* TRILUMI and TRICARD both land on the sandbox; read them back out */
function bootModules() {
  const src = ['tribrand.js', 'tricard.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'brand', f), 'utf8'))
    .join('\n');
  const fn = new Function(...Object.keys(sandbox), src +
    '\nreturn {TRILUMI: TRILUMI, TRICARD: TRICARD};');
  return fn(...Object.values(sandbox));
}

const { TRILUMI, TRICARD } = bootModules();

/* --------------------------------------------------- real strings per game */

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/* Pull `key:"..."` out of a locale table, in order.
   The key may be written bare (`cardFooter: "x"`) or quoted (`"cl.q1":"x"`),
   so the closing quote is optional in the pattern. */
function grab(src, key, count) {
  const out = [];
  const re = new RegExp('(?:^|[,{"\\s])' + key.replace(/[.]/g, '\\.') +
                        '"?\\s*:\\s*"([^"]*)"', 'gm');
  let m;
  while ((m = re.exec(src)) && out.length < (count || 99)) out.push(m[1]);
  return out;
}

/* hetu-luoshu: three locale tables, same key order */
function hetuStrings() {
  const src = read('_gh/hetu-luoshu/index.html');
  const keys = ['gtitle', 'end_line', 'end_p1', 'end_p2', 'end_restart',
                'end_t1', 'end_t2', 'end_t3', 'end_t4'];
  const out = [];
  for (const k of keys) {
    const vals = grab(src, k, 3);
    if (vals.length < 3) throw new Error(`hetu: key ${k} found ${vals.length} times`);
    out.push(vals);
  }
  /* transpose: [lang][key] */
  return [0, 1, 2].map((li) => {
    const o = {};
    keys.forEach((k, ki) => { o[k] = out[ki][li]; });
    return o;
  });
}

/* whereami: three locale tables keyed by "cl.xxx" */
function wamiStrings() {
  const src = read('_gh/coordinate-thinking-game/index.html');
  const keys = ['cl.cardTitle', 'cl.h2', 'cl.q1', 'cl.tailH'];
  const per = keys.map((k) => grab(src, k, 3));
  per.forEach((v, i) => {
    if (v.length < 3) throw new Error(`whereami: key ${keys[i]} found ${v.length}`);
  });
  return [0, 1, 2].map((li) => {
    const o = {};
    keys.forEach((k, ki) => { o[k] = per[ki][li]; });
    return o;
  });
}

const LANGS = ['hans', 'hant', 'en'];

/* --------------------------------------------------------------- the specs */

const SERIF = 'Georgia,"Times New Roman","Songti SC",SimSun,"Noto Serif CJK SC",serif';
const SANS = '"Segoe UI","Microsoft YaHei","PingFang SC",Arial,sans-serif';

const SPECS = [];

/* --- thor-hammer: it owns its card, so mirror the two strings that matter */
{
  const src = read('thor-hammer/index.html');
  const q = grab(src, 'q', 3);            /* end.q, one per locale */
  const foot = grab(src, 'cardFooter', 3);
  const titles = grab(src, 'name', 12);   /* four rank names x three locales */
  LANGS.forEach((lg, i) => {
    SPECS.push({
      game: 'thor-hammer', lang: lg,
      kind: 'own',
      quote: q[i], footer: foot[i],
      title: titles[i * 4] || titles[i] || 'The Eye',
      note: 'thor-hammer draws its own card; the stamp is what we verify here',
    });
  });
}

/* --- sunzi-13: also its own card */
{
  const src = read('_gh/sunzi-13/index.html');
  const title = grab(src, 'title', 3);
  const sub = grab(src, 'sub', 3);
  LANGS.forEach((lg, i) => {
    SPECS.push({
      game: 'sunzi-13', lang: lg, kind: 'own',
      title: title[i] || 'Art of War', footer: sub[i] || '',
      note: 'own card; stamp verified',
    });
  });
}

/* --- hetu-luoshu and whereami: built by TRICARD, so render them for real */
const HETU = hetuStrings();
const WAMI = wamiStrings();

HETU.forEach((s, i) => {
  SPECS.push({
    game: 'hetu-luoshu', lang: LANGS[i], kind: 'tricard',
    spec: {
      paper: '#f7f2e7', ink: '#1c1a17', accent: '#9e2b25',
      muted: '#8a8073', line: '#d6cdb9', panel: '#1c1a17', panelInk: '#f2ece2',
      serif: SERIF, sans: SANS,
      kicker: s.gtitle,
      title: s.end_line,
      body: s.end_p1,
      stats: [{ k: s.end_t1, v: '12 分 34 秒' }, { k: s.end_t2, v: '3' },
              { k: s.end_t3, v: '1' }, { k: s.end_t4, v: '67%' }],
      quote: s.end_p2,
      footer: s.end_restart,
      mark: (c, x, y, h) => TRILUMI.path(c, x, y, h, '#9e2b25'),
    },
  });
});

WAMI.forEach((s, i) => {
  SPECS.push({
    game: 'whereami', lang: LANGS[i], kind: 'tricard',
    spec: {
      paper: '#E9EDE6', ink: '#1B241C', accent: '#3F6B4A',
      muted: '#77857A', line: '#C0CDB9', panel: '#1B241C', panelInk: '#EDF2EA',
      serif: SERIF, sans: SANS,
      kicker: '你在哪一格',
      title: s['cl.cardTitle'].replace('{n}', '6'),
      body: s['cl.h2'],
      stats: [0, 1, 2, 3, 4, 5].map((n) => ({ k: '0' + (n + 1), v: n < 4 ? '\u2713' : '\u00b7' })),
      quote: s['cl.q1'],
      footer: s['cl.tailH'],
      mark: (c, x, y, h) => TRILUMI.path(c, x, y, h, '#3F6B4A'),
    },
  });
});

/* --- 造世 / THE MAKER: built by TRICARD too, and the card is the one that
   carries the player's own law back to them, so the quote is the longest
   string in the family — exactly the case this harness exists for */
{
  const src = read('_gh/create-world/index.html');
  const keys = ['card_kicker', 's9_big', 's9_mid', 'card_body', 'card_named_as',
                'card_law', 'st_world', 'st_life', 'st_laws', 'st_time', 'card_footer'];
  const per = keys.map((k) => {
    const v = grab(src, k, 3);
    if (v.length < 3) throw new Error(`create-world: key ${k} found ${v.length} times`);
    return v;
  });
  const ORDER = ['hant', 'hans', 'en'];   /* the order the tables appear in */
  /* the laws are a nested array, not a flat key:value table, so they get their
     own pattern. 6 laws x 3 languages, in table order. */
  const lawRows = [];
  const lawRe = /\[\s*"([^"]{4,140})"\s*,\s*"[^"]*"\s*\]/g;
  let lm;
  while ((lm = lawRe.exec(src)) && lawRows.length < 18) lawRows.push(lm[1]);
  if (lawRows.length < 18) throw new Error(`create-world: found ${lawRows.length} laws, wanted 18`);

  ORDER.forEach((lg, i) => {
    const s = {};
    keys.forEach((k, ki) => { s[k] = per[ki][i]; });
    const mine = lawRows.slice(i * 6, i * 6 + 6);
    /* the three the game treats as the load-bearing ones, joined the way the
       card joins them — this is the longest quote the card can be handed */
    const quote = s.card_law + '\u300C' + [mine[0], mine[2], mine[5]].join('') + '\u300D';
    SPECS.push({
      game: 'create-world', lang: lg, kind: 'tricard',
      spec: {
        paper: '#f7f4ef', ink: '#191713', accent: '#a8542a',
        muted: '#8c8478', line: '#e2dbcf', panel: '#191713', panelInk: '#f2ece2',
        serif: SERIF, sans: SANS,
        kicker: s.card_kicker,
        title: s.s9_big + (lg === 'en' ? ' ' : '') + s.s9_mid,
        body: s.card_body + s.card_named_as.replace('{n}', 'O'),
        stats: [{ k: s.st_world, v: '100%' }, { k: s.st_life, v: '26' },
                { k: s.st_laws, v: '3' }, { k: s.st_time, v: '6:12' }],
        quote: quote,
        footer: s.card_footer,
        mark: (c, x, y, h) => TRILUMI.path(c, x, y, h, '#a8542a'),
      },
    });
  });
}

/* ----------------------------------------------------------------- checks */

let fails = 0;
let runs = 0;

function fail(spec, msg) {
  fails++;
  console.log(`   FAIL  ${spec.game} / ${spec.lang}: ${msg}`);
}

/* the wordmark is drawn glyph by glyph; find the run that spells TRILUMI */
function findWordmark(runs) {
  const want = 'TRILUMI';
  for (let i = 0; i + want.length <= runs.length; i++) {
    let ok = true;
    for (let j = 0; j < want.length; j++) {
      if (runs[i + j].s !== want[j]) { ok = false; break; }
    }
    if (!ok) continue;
    const x0 = runs[i].x;
    const x1 = runs[i + want.length - 1].x + runs[i + want.length - 1].w;
    return { x0, x1, y: runs[i].y, size: runs[i].size };
  }
  return null;
}

console.log('\nshare-card layout check  (stub metrics — catches overflow, not kerning)');
console.log('='.repeat(74));

for (const spec of SPECS) {
  runs++;
  let cv, c;

  if (spec.kind === 'tricard') {
    cv = TRICARD.draw(spec.spec);
    c = cv.getContext('2d');
  } else {
    /* the two games that draw their own card: the only thing this harness
       owns is the stamp, so render it onto a same-size canvas */
    cv = makeCanvas();
    cv.width = 1080; cv.height = 1350;
    c = cv.getContext('2d');
    const PAD = 96, H = 1350;
    TRILUMI.stamp(c, PAD, H - 114, { badge: 34, word: 19, muted: '#8c8478' });
  }

  const W = cv.width, H = cv.height;

  /* 1 · the card is a plausible shape */
  if (W !== 1080) fail(spec, `width ${W}, expected 1080`);
  if (H < 900) fail(spec, `height ${H}, too short`);

  /* 2 · nothing painted outside the paper */
  const outX = c.texts.filter((t) => t.x < 0 || t.x + t.w > W + 1);
  if (outX.length) {
    fail(spec, `${outX.length} run(s) outside the card horizontally: ` +
      outX.slice(0, 3).map((t) => JSON.stringify(t.s.slice(0, 24)) + ` x=${Math.round(t.x)} w=${Math.round(t.w)}`).join(' | '));
  }
  const outY = c.texts.filter((t) => t.y < 0 || t.y > H - 4);
  if (outY.length) {
    fail(spec, `${outY.length} run(s) outside vertically: ` +
      outY.slice(0, 3).map((t) => JSON.stringify(t.s.slice(0, 24)) + ` y=${Math.round(t.y)}`).join(' | '));
  }

  /* 3 · the brand stamp is present, in brand blue, and fully inside.
     TRILUMI is drawn one glyph at a time, so look for seven consecutive runs
     that spell it — a plain character-class match would also catch letters
     borrowed from the kicker. */
  const word = findWordmark(c.texts);
  if (!word) {
    fail(spec, 'TRILUMI wordmark not found (expected seven consecutive glyphs)');
  } else if (word.x0 < 0 || word.x1 > W) {
    fail(spec, `wordmark spans ${Math.round(word.x0)}..${Math.round(word.x1)}, outside the card`);
  }

  /* 4 · the series address is on the card.
     This used to assert 'trilumi.xyz/games', which the academy replaced — so
     the check failed for all six games, including ones nobody had touched, and
     a verifier that always fails is a verifier nobody reads. */
  if (!c.texts.some((t) => t.s === 'academy.trilumi.xyz')) {
    fail(spec, 'series address missing from the card');
  }

  /* 5 · for the TRICARD cards, the footer band must not run off the bottom */
  if (spec.kind === 'tricard') {
    const url = c.texts.find((t) => t.s === 'academy.trilumi.xyz');
    if (url && url.y > H - 40) fail(spec, `address sits ${Math.round(H - url.y)}px from the bottom edge`);
    if (url && url.y < H - 100) fail(spec, `address floats ${Math.round(H - url.y)}px above the bottom`);
  }

  const tag = `${spec.game} / ${spec.lang}`;
  const extra = spec.kind === 'tricard' ? `${W}x${H}` : 'stamp only';
  console.log(`   ok    ${tag.padEnd(26)} ${String(extra).padEnd(10)} ` +
              `${String(c.texts.length).padStart(4)} runs`);
}

console.log('='.repeat(74));
console.log(`${runs - fails}/${runs} combinations clean\n`);
process.exit(fails ? 1 : 0);
