/* ============================================================================
   ao-dump-card.js — record one share card as JSON so it can be rendered.

   The stub canvas cannot rasterise, so instead of guessing what the card looks
   like we record every operation and every glyph run, then replay them with
   Pillow. Approximate fonts, exact geometry: good enough to see whether the
   thing is laid out correctly, which is the only question that matters here.

   Run:  node brand/ao-dump-card.js <lang> <ending> <out.json>
   ========================================================================== */
'use strict';

const fs = require('fs');
const { run } = require('./ao-harness');

const FILE = '_gh/sunzi-13/index.html';

const ENDING_STATES = {
  luan: { flags: { obeyed: 1 } },
  beng: { bing: 5, flags: {} },
  shan: { bing: 60, jun: 40, flags: { subvert: 1 } },
  gong: { bing: 60, jun: 20, flags: {} },
  jiu:  { bing: 60, jun: 40, liang: 20, flags: {} },
};

const lang = process.argv[2] || 'en';
const ending = process.argv[3] || 'shan';
const out = process.argv[4] || 'brand/card.json';

const r = run(FILE);
const w = r.sandbox.window;
if (typeof w.setLang === 'function') w.setLang(lang);
if (typeof w.setTone === 'function') w.setTone('bai');

const lines = [];
for (let i = 0; i < 13; i++) {
  lines.push({
    mine: lang === 'en'
      ? 'Force the march thirty li and two thirds arrive. That is line ' + (i + 1) + ' of my own judgement.'
      : '三十里而争利，则三分之二至。这是第' + (i + 1) + '条我自己写的判断。',
    n: i + 1,
  });
}

w.__setState(Object.assign({
  idx: 13, phase: 'final', done: true,
  t0: Date.now() - 600000, sec: 600,
  lines, liang: 62, bing: 60, shi: 8, jun: 40, flags: {},
  r14: lang === 'en'
    ? 'Ask first who is carrying the risk for this step — and whether the answer is the same person as for your opponent.'
    : '凡事先问一句：这一步究竟是谁在替我承担风险，又是谁在替对手承担风险；如果两个答案都是同一个人，那么这一仗不打也罢。',
  lang, tone: 'bai',
}, ENDING_STATES[ending] || {}));

const cv = r.doc.getElementById('share');
const ctx = cv.getContext('2d');

const btn = r.doc.getElementById('trishbtn');
if (btn && btn.onclick) btn.onclick();

setTimeout(() => {
  const payload = {
    lang, ending,
    width: 1080,
    height: cv.height,
    ops: ctx.ops.map((o) => ({
      op: o.op,
      args: o.args.map((a) => (typeof a === 'number' ? Math.round(a * 1000) / 1000 : String(a))),
      fill: o.fill,
      font: o.font,
    })),
    runs: ctx.runs.map((x) => ({
      text: x.text, x: x.x, y: x.y, w: x.w, font: x.font, fill: x.fill,
    })),
  };
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log('wrote ' + out + '  ' + payload.width + 'x' + payload.height +
              '  ops=' + payload.ops.length + '  runs=' + payload.runs.length);
}, 20);
