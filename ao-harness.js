/* ============================================================================
   ao-harness.js — run sunzi-13's real script outside a browser.

   Why this exists: the user reported that the Art of War share card "is not
   there". The markup is present in the deployed file, so the question is
   whether the code that builds that markup actually runs, and whether the
   button's click handler survives to the end. Reading the source cannot
   answer that; executing it can.

   There is no playwright / puppeteer / agent-browser on this machine, so we
   stub the browser instead: a tiny DOM that records innerHTML and remembers
   elements by id, a canvas 2D context with approximate metrics, and enough
   of window/navigator/storage to let the module-level code finish.

   Usage:  node brand/ao-harness.js <path-to-index.html>
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------------------------------------------------------------- metrics --
   Canvas has no real text metrics here, so approximate the way the other
   verifier does: CJK is full-width, Latin roughly half. Good enough to catch
   layout blowups, which is all we use it for. */
function advance(ch, size) {
  const c = ch.codePointAt(0);
  if (c >= 0x2e80 && c <= 0x9fff) return size;        // CJK
  if (c >= 0xf900 && c <= 0xfaff) return size;        // compat ideographs
  if (c >= 0xff00 && c <= 0xff60) return size;        // fullwidth forms
  if (c >= 0x3000 && c <= 0x303f) return size;        // CJK punctuation
  if (ch === ' ') return size * 0.28;
  return size * 0.52;
}

function measure(text, fontPx) {
  let w = 0;
  for (const ch of String(text)) w += advance(ch, fontPx);
  return w;
}

function parseFont(font) {
  const m = /(\d+(?:\.\d+)?)px/.exec(font || '');
  return m ? parseFloat(m[1]) : 16;
}

/* ------------------------------------------------------------------- DOM -- */
function makeContext(canvas) {
  const ctx = {
    canvas,
    font: '10px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    ops: [],
    /* record every glyph run so the verifier can assert on the result */
    runs: [],
  };
  const rec = (op, args) => ctx.ops.push({ op, args, font: ctx.font, fill: ctx.fillStyle });
  ctx.measureText = (t) => ({ width: measure(t, parseFont(ctx.font)) });
  ctx.fillText = (t, x, y) => {
    const w = measure(t, parseFont(ctx.font));
    ctx.runs.push({ text: String(t), x, y, w, font: ctx.font, fill: ctx.fillStyle });
    rec('fillText', [t, x, y]);
  };
  ctx.strokeText = (t, x, y) => rec('strokeText', [t, x, y]);
  /* record the image's src rather than the element, so a recorded card can be
     replayed outside the browser */
  ctx.drawImage = (...a) =>
    rec('drawImage', a.map((x) =>
      (x && typeof x === 'object' && typeof x.src === 'string') ? x.src : x));
  ctx.fillRect = (...a) => rec('fillRect', a);
  ctx.strokeRect = (...a) => rec('strokeRect', a);
  ctx.clearRect = (...a) => rec('clearRect', a);
  ctx.beginPath = () => rec('beginPath', []);
  ctx.closePath = () => rec('closePath', []);
  ctx.moveTo = (...a) => rec('moveTo', a);
  ctx.lineTo = (...a) => rec('lineTo', a);
  ctx.arc = (...a) => rec('arc', a);
  ctx.arcTo = (...a) => rec('arcTo', a);
  ctx.ellipse = (...a) => rec('ellipse', a);
  ctx.rect = (...a) => rec('rect', a);
  ctx.roundRect = (...a) => rec('roundRect', a);
  ctx.quadraticCurveTo = (...a) => rec('quadraticCurveTo', a);
  ctx.bezierCurveTo = (...a) => rec('bezierCurveTo', a);
  const grad = () => ({ addColorStop() {} });
  ctx.createLinearGradient = grad;
  ctx.createRadialGradient = grad;
  ctx.createConicGradient = grad;
  ctx.createPattern = () => null;
  ctx.setLineDash = () => {};
  ctx.getLineDash = () => [];
  ctx.getImageData = (x, y, w, h) =>
    ({ width: w || 1, height: h || 1, data: new Uint8ClampedArray((w || 1) * (h || 1) * 4) });
  ctx.putImageData = () => {};
  ctx.createImageData = (w, h) =>
    ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  ctx.isPointInPath = () => false;
  ctx.drawFocusIfNeeded = () => {};
  ctx.fill = () => rec('fill', []);
  ctx.stroke = () => rec('stroke', []);
  ctx.save = () => rec('save', []);
  ctx.restore = () => rec('restore', []);
  ctx.translate = (...a) => rec('translate', a);
  ctx.scale = (...a) => rec('scale', a);
  ctx.rotate = (...a) => rec('rotate', a);
  ctx.clip = () => rec('clip', []);
  ctx.setTransform = (...a) => rec('setTransform', a);
  ctx.measureText = ctx.measureText;
  return ctx;
}

/* CSSStyleDeclaration: pages write both `el.style.foo = x` and
   `el.style.setProperty('--x', y)`, and the second is a method, not a key */
class Style {
  constructor() { this._p = Object.create(null); }
  setProperty(k, v) { this._p[k] = String(v); }
  getPropertyValue(k) { return this._p[k] || ''; }
  removeProperty(k) { const v = this._p[k] || ''; delete this._p[k]; return v; }
  get cssText() { return Object.keys(this._p).map((k) => k + ':' + this._p[k]).join(';'); }
  set cssText(v) { this._p = Object.create(null); }
}

class El {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this._html = '';
    this.children = [];
    this.style = new Style();
    this.attrs = {};
    this.textContent = '';
    this.onclick = null;
    this.href = '';
    this.download = '';
    this.src = '';
    this.className = '';
    this.width = 0;
    this.height = 0;
    this.listeners = {};
    this._ctx = null;
    this.parent = null;
  }
  set innerHTML(v) { this._html = String(v); this._index(); }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  /* every page here opens with classList.add('js'), and the academy's
     lighting depends on it, so it has to be real rather than absent */
  get classList() {
    const self = this;
    const list = () => String(self.className || '').split(/\s+/).filter(Boolean);
    const set = (arr) => { self.className = arr.join(' '); };
    return {
      add(...c) { const s = list(); c.forEach((x) => { if (!s.includes(x)) s.push(x); }); set(s); },
      remove(...c) { set(list().filter((x) => !c.includes(x))); },
      toggle(c, on) {
        const has = list().includes(c);
        const want = on === undefined ? !has : !!on;
        if (want && !has) this.add(c);
        if (!want && has) this.remove(c);
        return want;
      },
      contains: (c) => list().includes(c),
      get length() { return list().length; },
      item: (i) => list()[i] || null,
      toString: () => list().join(' '),
    };
  }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  remove() { if (this.parent) this.parent.removeChild(this); }
  /* the language switcher walks its own buttons; returns a plain array, which
     is enough for .length and indexing */
  getElementsByTagName(tag) {
    const want = String(tag).toUpperCase();
    const out = [];
    const walk = (n) => {
      for (const c of n.children || []) {
        if (c.tagName === want) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  insertBefore(c, ref) {
    c.parent = this;
    const i = this.children.indexOf(ref);
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  removeEventListener(t, f) {
    if (this.listeners[t]) this.listeners[t] = this.listeners[t].filter((x) => x !== f);
  }
  click() { this._clicked = (this._clicked || 0) + 1; }
  /* enough of Element.closest() for delegated click handling: #id, .class,
     tag, and tag[attr]. Walks the parent chain the stubs maintain. */
  closest(sel) {
    let el = this;
    while (el) {
      if (matchesSel(el, sel)) return el;
      el = el.parent;
    }
    return null;
  }
  /* a plausible box: layout is not simulated, but code that reads a size to
     size a canvas needs a number rather than undefined */
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 300,
             width: 390, height: 300, toJSON() { return this; } };
  }
  getContext() { if (!this._ctx) this._ctx = makeContext(this); return this._ctx; }
  toDataURL() { return 'data:image/png;base64,STUB'; }
  toBlob(cb) { if (cb) cb({ size: 1, type: 'image/png' }); }
  /* the share sheet walks its own markup, so these have to return something
     addressable rather than null */
  querySelector(sel) {
    if (!this._q) this._q = Object.create(null);
    if (!this._q[sel]) {
      const el = new El('div');
      el.className = String(sel).replace(/^\./, '');
      el.parent = this;
      this._q[sel] = el;
    }
    return this._q[sel];
  }
  querySelectorAll() { return []; }
  _index() {
    /* remember ids that appear in markup we just wrote, the way a real
       parser would materialise them */
    const re = /id="([A-Za-z0-9_\-]+)"/g;
    let m;
    while ((m = re.exec(this._html))) {
      if (!DOM.byId[m[1]]) DOM.byId[m[1]] = new El('div', m[1]);
    }
  }
}

/* An Image whose load fires asynchronously, like a real one. Synchronous
   completion would hide the bug where onload is attached after src.

   Every src assignment is recorded in `sink`, which is how the first-party
   beacon gets tested: a beacon is nothing but an Image pointed at a URL, so
   the only way to assert it fired is to watch what was requested. */
function makeImage(sink) {
  return function Image() {
    const el = new El('img');
    el.complete = false;
    el.naturalWidth = 0;
    el.naturalHeight = 0;
    el.onload = null;
    el.onerror = null;
    let _src = '';
    Object.defineProperty(el, 'src', {
      get() { return _src; },
      set(v) {
        _src = v;
        if (sink) sink.push(String(v));
        el.complete = false;
        setTimeout(() => {
          if (String(v).indexOf('data:image/') === 0) {
            el.complete = true;
            el.naturalWidth = 768;
            el.naturalHeight = 768;
            if (el.onload) el.onload();
          } else if (el.onerror) {
            el.onerror();
          }
        }, 0);
      },
    });
    return el;
  };
}

const DOM = {
  byId: Object.create(null),
  body: null,
  documentElement: null,
};

/* A deliberately small CSS matcher for `closest`: #id, .class, tag and
   tag[attr]. Anything more elaborate belongs in a real browser. */
function matchesSel(el, sel) {
  const s = String(sel).trim();
  const m = /^([a-z0-9-]*)(#[\w-]+)?(\.[\w-]+)?(\[[\w-]+\])?$/i.exec(s);
  if (!m) return false;
  const [, tag, id, cls, attr] = m;
  if (tag && String(el.tagName || '').toLowerCase() !== tag.toLowerCase()) return false;
  if (id && String(el.id || '') !== id.slice(1)) return false;
  if (cls) {
    const want = cls.slice(1);
    const have = String(el.className || '').split(/\s+/);
    if (!have.includes(want)) return false;
  }
  if (attr && !(attr.slice(1, -1) in (el.attrs || {}))) return false;
  return true;
}

function buildDocument() {
  const doc = {
    documentElement: new El('html'),
    body: new El('body'),
    head: new El('head'),
    referrer: '',
    title: '',
    /* An inline <script> runs while the parser is still working, so a page
       that needs something declared further down its own script block has to
       wait for DOMContentLoaded. Reporting 'complete' here would hide that
       class of ordering bug instead of catching it. */
    readyState: 'loading',
    createElement: (t) => new El(t),
    execCommand: () => true,
    fonts: {
      ready: Promise.resolve(),
      status: 'loaded',
      load: () => Promise.resolve([]),
      check: () => true,
      add() {}, delete() {}, clear() {},
      addEventListener() {}, removeEventListener() {},
      forEach() {}, [Symbol.iterator]() { return [][Symbol.iterator](); },
    },
    getElementById(id) {
      if (!DOM.byId[id]) DOM.byId[id] = new El('div', id);
      return DOM.byId[id];
    },
    querySelector: (s) => (s && s[0] === '#' ? doc.getElementById(s.slice(1)) : new El('div')),
    querySelectorAll: () => [],
    /* a real registry, so delegated listeners (the beacon's click handler)
       can actually be dispatched instead of being silently dropped */
    _listeners: Object.create(null),
    addEventListener(t, f) { (doc._listeners[t] = doc._listeners[t] || []).push(f); },
    removeEventListener(t, f) {
      if (doc._listeners[t]) doc._listeners[t] = doc._listeners[t].filter((x) => x !== f);
    },
    dispatch(t, ev) { (doc._listeners[t] || []).slice().forEach((f) => f(ev)); },
    createTextNode: (t) => ({ nodeType: 3, textContent: t }),
  };
  doc.documentElement.setAttribute('lang', 'zh-Hans');
  DOM.documentElement = doc.documentElement;
  DOM.body = doc.body;
  return doc;
}

/* ------------------------------------------------------------- storage --- */
function makeStorage(seed) {
  const m = Object.assign(Object.create(null), seed || {});
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    clear: () => { for (const k of Object.keys(m)) delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    _raw: m,
  };
}

/* -------------------------------------------------------------- runner --- */
/* Every inline <script> in document order, minus external ones and minus
   non-JS payloads (application/ld+json). A page may have several — the
   academy has three, and its beacon is now the last of them, so taking only
   the final block would silently boot the wrong thing. */
function extractScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const tm = /type\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    if (tm && !/^(text\/javascript|module|application\/javascript)$/i.test(tm[1])) continue;
    if (m[2].trim()) out.push(m[2]);
  }
  return out;
}

function run(file, opts) {
  opts = opts || {};
  const html = fs.readFileSync(file, 'utf8');
  const scripts = extractScripts(html);
  if (!scripts.length) throw new Error('no inline script block found');
  const js = scripts.join('\n;\n');

  const doc = buildDocument();
  if (opts.referrer) doc.referrer = opts.referrer;
  const warnings = [];
  const errors = [];
  const imgRequests = [];

  const localStorage = makeStorage(opts.storage);
  const sessionStorage = makeStorage();

  const sandbox = {
    console: {
      log: (...a) => warnings.push(['log', ...a].join(' ')),
      warn: (...a) => warnings.push(['warn', ...a].join(' ')),
      error: (...a) => errors.push(['error', ...a].join(' ')),
      info: () => {},
    },
    document: doc,
    localStorage,
    sessionStorage,
    location: {
      hostname: opts.host || 'artofwar.trilumi.xyz',
      href: 'https://' + (opts.host || 'artofwar.trilumi.xyz') + '/',
      search: opts.search || '',
      hash: '',
      pathname: '/',
      protocol: 'https:',
    },
    navigator: { userAgent: 'node', language: 'zh-CN', languages: ['zh-CN'], onLine: true },
    screen: { width: 390, height: 844 },
    innerWidth: 390,
    innerHeight: 844,
    devicePixelRatio: 2,
    URL,
    URLSearchParams,
    Image: makeImage(imgRequests),
    Blob: function Blob() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance: { now: () => Date.now(), timeOrigin: Date.now() },
    Date,
    Math,
    JSON,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    parseFloat,
    isNaN,
    String,
    Number,
    Object,
    Array,
    Error,
    RegExp,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = () => {};
  sandbox.window.removeEventListener = () => {};
  sandbox.window.scrollTo = () => {};
  sandbox.window.matchMedia = () => ({ matches: false, addListener() {}, addEventListener() {} });
  sandbox.window.scrollY = 0;

  /* animation loops: a real requestAnimationFrame never returns, so give it a
     frame budget. Without one the harness hangs instead of reporting. */
  let frames = 0;
  const FRAME_BUDGET = opts.frames == null ? 8 : opts.frames;
  sandbox.requestAnimationFrame = (cb) =>
    (++frames <= FRAME_BUDGET) ? setTimeout(() => cb(frames * 16), 0) : 0;
  sandbox.cancelAnimationFrame = () => {};
  sandbox.window.requestAnimationFrame = sandbox.requestAnimationFrame;
  sandbox.window.cancelAnimationFrame = sandbox.cancelAnimationFrame;

  /* IntersectionObserver: nothing ever intersects in a headless page, which is
     exactly the no-JS / reduced-motion path the academy falls back to */
  class IO {
    constructor(cb, o) { this.cb = cb; this.opts = o || {}; this.roots = []; }
    observe(el) { this.roots.push(el); }
    unobserve() {} disconnect() {} takeRecords() { return []; }
  }
  sandbox.IntersectionObserver = IO;
  sandbox.window.IntersectionObserver = IO;

  sandbox.matchMedia = sandbox.window.matchMedia;
  sandbox.devicePixelRatio = 2;

  /* Font Loading API — document.fonts.ready is awaited by anything that wants
     to measure text after the webfont settles */
  sandbox.FontFace = function FontFace() { return { load: () => Promise.resolve() }; };
  sandbox.window.pageYOffset = 0;
  sandbox.window.location = sandbox.location;
  sandbox.window.document = doc;
  sandbox.window.navigator = sandbox.navigator;
  sandbox.window.localStorage = localStorage;
  sandbox.window.sessionStorage = sessionStorage;
  sandbox.window.URL = URL;
  sandbox.window.URLSearchParams = URLSearchParams;
  sandbox.window.Image = sandbox.Image;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(js, ctx, { filename: path.basename(file) });

  /* Parsing is done, so fire the event a browser would: this is the moment
     deferred init code gets to run, and it is where a use-before-definition
     bug in the top level of a script block finally surfaces. */
  doc.readyState = 'interactive';
  doc.dispatch('DOMContentLoaded', { type: 'DOMContentLoaded', target: doc });
  doc.readyState = 'complete';

  return { sandbox, doc, ctx, warnings, errors, js, scripts, imgRequests };
}

module.exports = { run, measure, makeContext, El, DOM, makeStorage, extractScripts };

/* ---------------------------------------------------------------- main --- */
if (require.main === module) {
  const file = process.argv[2] || '_gh/sunzi-13/index.html';
  const r = run(file);
  console.log('booted OK; warnings=' + r.warnings.length + ' errors=' + r.errors.length);
  r.warnings.slice(0, 10).forEach((w) => console.log('  warn: ' + w));
  r.errors.slice(0, 10).forEach((e) => console.log('  ERR:  ' + e));
  const keys = r.sandbox.window.__keycheck ? r.sandbox.window.__keycheck() : null;
  if (keys) console.log('keycheck: ' + keys.count + ' keys, mismatch=' + JSON.stringify(keys.mismatch));
}
