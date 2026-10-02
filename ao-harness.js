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
  ctx.quadraticCurveTo = (...a) => rec('quadraticCurveTo', a);
  ctx.bezierCurveTo = (...a) => rec('bezierCurveTo', a);
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

class El {
  constructor(tag, id) {
    this.tagName = (tag || 'div').toUpperCase();
    this.id = id || '';
    this._html = '';
    this.children = [];
    this.style = {};
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
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; }
  remove() { if (this.parent) this.parent.removeChild(this); }
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
   completion would hide the bug where onload is attached after src. */
function makeImage(sandbox) {
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

function buildDocument() {
  const doc = {
    documentElement: new El('html'),
    body: new El('body'),
    head: new El('head'),
    referrer: '',
    title: '',
    readyState: 'complete',
    createElement: (t) => new El(t),
    execCommand: () => true,
    getElementById(id) {
      if (!DOM.byId[id]) DOM.byId[id] = new El('div', id);
      return DOM.byId[id];
    },
    querySelector: (s) => (s && s[0] === '#' ? doc.getElementById(s.slice(1)) : new El('div')),
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
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
function extractScript(html) {
  /* last <script> block is the game; the first one may be structured data */
  const i = html.lastIndexOf('<script>');
  const j = html.lastIndexOf('</script>');
  if (i < 0 || j < 0) throw new Error('no script block found');
  return html.slice(i + '<script>'.length, j);
}

function run(file, opts) {
  opts = opts || {};
  const html = fs.readFileSync(file, 'utf8');
  const js = extractScript(html);

  const doc = buildDocument();
  const warnings = [];
  const errors = [];

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
      search: '',
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
    Image: makeImage(),
    Blob: function Blob() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
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
  return { sandbox, doc, ctx, warnings, errors, js };
}

module.exports = { run, measure, makeContext, El, DOM, makeStorage };

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
