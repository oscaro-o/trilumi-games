/* ============================================================================
   ao-check-share.js — does the Art of War share card actually reach a player?

   The reported symptom was "the share card is not there". The card code was
   fine; what was wrong was that it only existed after a full playthrough and
   then only downloaded a file without showing anything. This drives the real
   game and asserts the three things that make it reachable:

     1. the share button is in the page furniture and wired;
     2. pressing it produces a card, with the meme drawn on it;
     3. the share sheet opens, so the card is visible rather than merely saved.

   Run:  node brand/ao-check-share.js
   ========================================================================== */
'use strict';

const { run } = require('./ao-harness');

const FILE = '_gh/sunzi-13/index.html';
const LANGS = ['simp', 'trad', 'en'];

/* ending() derives the code from state, so pick state rather than stubbing it.
   Codes: luan / beng / shan / gong / jiu. */
const ENDING_STATES = {
  luan: { flags: { obeyed: 1 } },
  beng: { bing: 5, flags: {} },
  shan: { bing: 60, jun: 40, flags: { subvert: 1 } },
  gong: { bing: 60, jun: 20, flags: {} },
  jiu:  { bing: 60, jun: 40, liang: 20, flags: {} },
};

function fakeState(over) {
  const lines = [];
  for (let i = 0; i < 13; i++) {
    lines.push({ mine: '三十里而争利，则三分之二至。这是第' + (i + 1) + '条我自己写的判断。', n: i + 1 });
  }
  return Object.assign({
    idx: 13, phase: 'final', done: true,
    t0: Date.now() - 600000, sec: 600,
    lines, liang: 62, bing: 60, shi: 8, jun: 40, flags: {},
    /* deliberately long: this is the worst case for the card's tail, and the
       case that would collide with the footer if the allowance were too small */
    r14: '凡事先问一句：这一步究竟是谁在替我承担风险，又是谁在替对手承担风险；如果两个答案都是同一个人，那么这一仗不打也罢，因为胜负早已不在战场之上。',
    lang: 'simp', tone: 'bai',
  }, over || {});
}

/* let the stubbed Image's setTimeout fire, plus the paint that follows */
const flush = () => new Promise((r) => setTimeout(r, 5));

async function one(lang, ending) {
  const r = run(FILE);
  const w = r.sandbox.window;
  const doc = r.doc;

  if (typeof w.setLang === 'function') w.setLang(lang);
  if (typeof w.setTone === 'function') w.setTone('bai');
  w.__setState(fakeState(Object.assign({ lang }, ENDING_STATES[ending] || {})));
  const got = typeof w.ending === 'function' ? w.ending() : '?';

  const app = doc.getElementById('app');
  const html = app.innerHTML || '';
  const endBtn = /id="sharebtn"/.test(html);
  const memeFig = /class="meme"/.test(html);
  const footBtn = doc.getElementById('trishbtn');
  const footVisible = !!footBtn && footBtn.style.display !== 'none';
  const footLabel = footBtn ? footBtn.textContent : '';

  /* press the always-available button in the page furniture */
  let threw = null;
  const cv = doc.getElementById('share');
  const ctx = cv.getContext('2d');
  const before = ctx.runs.length;
  const opsBefore = ctx.ops.length;
  try {
    if (footBtn && footBtn.onclick) footBtn.onclick();
  } catch (e) {
    threw = e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e);
  }
  await flush();

  const newOps = ctx.ops.slice(opsBefore);
  const drew = newOps.some((o) => o.op === 'drawImage');
  const runs = ctx.runs.slice(before);
  const texts = runs.map((x) => x.text);
  const sheet = (doc.body.children || []).some((c) => /trish/.test(c.className || ''));

  /* layout: nothing may fall outside the drawn border, and the fourteenth rule
     must not run into the footer. A tall card is fine; a collided one is not. */
  const W = 1080, H = cv.height, M = 30;
  const outside = runs.filter((r) => r.y > H - M || r.y < M || r.x < M - 1 || r.x + r.w > W - M + 1);

  const cta = runs.find((r) => /→/.test(r.text));
  let gap = null;
  if (cta) {
    const above = runs.filter((r) => r.y < cta.y - 4);
    const lowest = above.reduce((m, r) => Math.max(m, r.y), 0);
    gap = cta.y - lowest;
  }

  return {
    lang, ending, got,
    endBtn, memeFig, footVisible, footLabel,
    threw, drew, sheet,
    cardH: cv.height,
    glyphRuns: runs.length,
    outside: outside.map((r) => r.text + '@y' + r.y + ',x' + r.x + ',w' + Math.round(r.w)),
    gap, cta: !!cta,
    texts,
  };
}

async function main() {
  const results = [];
  for (const lang of LANGS) {
    for (const e of Object.keys(ENDING_STATES)) {
      results.push(await one(lang, e));
    }
  }

  let fail = 0;
  for (const r of results) {
    const layoutOk = r.outside.length === 0 && r.gap !== null && r.gap >= 30;
    const ok = r.footVisible && r.endBtn && !r.threw && r.drew && r.sheet &&
               r.glyphRuns > 0 && layoutOk;
    if (!ok) fail++;
    console.log(
      (ok ? 'ok   ' : 'FAIL ') + r.lang + '/' + r.ending + '(got ' + r.got + ')' +
      '  footbtn=' + (r.footVisible ? 'y' : 'n') +
      '  endbtn=' + (r.endBtn ? 'y' : 'n') +
      '  memefig=' + (r.memeFig ? 'y' : 'n') +
      '  drew=' + (r.drew ? 'y' : 'n') +
      '  sheet=' + (r.sheet ? 'y' : 'n') +
      '  cardH=' + r.cardH +
      '  runs=' + r.glyphRuns +
      '  gap=' + r.gap
    );
    if (r.threw) console.log('       ' + r.threw);
    if (r.outside.length) console.log('       OUTSIDE: ' + r.outside.join(' | '));
  }

  /* the title screen: no state, so the button should stay out of the way */
  {
    const r = run(FILE);
    const doc = r.doc;
    const b = doc.getElementById('trishbtn');
    console.log('\ntitle screen: button ' + (b.style.display === 'none' ? 'hidden (correct)' : 'VISIBLE (wrong)'));
    if (b.style.display !== 'none') fail++;
  }

  /* show one card's text so the content can be eyeballed */
  const one_ = results.find((x) => x.lang === 'en' && x.ending === 'shan') || results[0];
  console.log('\n--- card text, ' + one_.lang + '/' + one_.ending + ' ---');
  one_.texts.forEach((t) => console.log('   ' + JSON.stringify(t)));

  console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED'));
  process.exit(fail === 0 ? 0 : 1);
}

main();
