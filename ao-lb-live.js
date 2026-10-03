/* ============================================================================
   ao-lb-live.js — does the leaderboard actually work in production?

   ao-share-test.js runs the page from disk, where there is no server and the
   board can only ever show "this needs a connection". That proves the button
   exists; it proves nothing about whether a run can be recorded. The only way
   to know is to open the real domain, finish a run, press the button, and read
   what comes back.

   Since the share gate landed, "press the button and read what comes back" is
   no longer one step, so this walks the whole loop:

     1. backing out of the share sheet submits NOTHING
     2. taking a route out submits the run, provisionally
     3. the row lands on the board marked 待有人点开
     4. a link-preview fetch (a GET that runs no script) is NOT a visitor
     5. a real browser opening ?c=<token> IS a visitor, and the row is promoted
     6. a phone goes straight through the system sheet in one tap

   Steps 4 and 5 are the point of the whole design. A share cannot be verified;
   an arrival can. If 4 ever starts counting, the board is lying.

   It writes real rows to the live board. They are NOT deleted afterwards — the
   test deliberately does not care how many rows exist or whose they are, so it
   can be run against a board that already has real players on it.

   Usage:  node brand/ao-lb-live.js [domain]
   ========================================================================== */
'use strict';

const path = require('path');
const { chromium, devices } = require('playwright-core');

const DOMAIN = process.argv[2] || 'artofwar.trilumi.xyz';
const BASE = 'https://' + DOMAIN + '/';
const CHROME = 'C:/Users/oscar/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const OUT = path.join(__dirname, '_ao-shots');
const NAME = '检验员';
const NAME2 = '检验员乙';

let fails = 0;
function check(label, ok, extra) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails++;
}

/* A minimal stand-in for the state the game builds after thirteen chapters:
   only the fields these assertions need. */
function finalState() {
  const say = ['先算清再动兵', '粮道比勇气重要', '不打没准备的仗', '耐心是最便宜的兵',
    '怒气不能当将军', '先到的人定规矩', '示弱是为了让他过来', '地形替我省一半人',
    '情报买不到就骗出来', '别把兵放在死地', '赢要赢得便宜', '留他一口气比杀他有用',
    '眼睛比刀更值钱'];
  return {
    liang: 80, bing: 70, shi: 60, jun: 70,
    flags: { spies: 1 }, lines: say.map(t => ({ mine: t })), picks: {}, idx: 13,
    phase: 'final', last: null, t0: Date.now() - 900000, ask12: null,
    r14: '谁替我写了这第十四条？', done: true, sec: 900
  };
}

/* the system sheet, stubbed: resolves, which is what the gate listens for */
const STUB_SHARE = () => {
  window.__shared = [];
  navigator.canShare = function () { return true; };
  navigator.share = function (d) {
    window.__shared.push({ files: (d.files || []).length, text: d.text || '', url: d.url || '' });
    return Promise.resolve();
  };
};

/* The preview sheet's copy route is the desktop fallback the gate relies on,
   and in headless Chromium the real clipboard is permission-gated. Stub it so
   the test is about the gate, not about clipboard policy. */
const STUB_CLIP = () => {
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() }
    });
  } catch (e) {}
};

/* Reloading is the only way to make the board re-read, because lbOpen() only
   loads when it has nothing cached. Reloading also happens to prove that the
   submitted state survives, which is a real user path. */
async function reopenBoard(page) {
  const saved = await page.evaluate(() => window.__game());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  await page.evaluate(s => window.__setState(s), saved);
  await page.waitForTimeout(500);
  await page.locator('#lbtop').click();
  await page.waitForTimeout(1600);
  return page.locator('#lbpanel').innerText();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  await ctx.addInitScript(STUB_CLIP);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log(`\n══ ${BASE} ══`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  check('no page errors on load', errors.length === 0, errors.slice(0, 2).join(' | '));
  check('board button is visible on the live site', await page.locator('#lbbtn').isVisible());

  console.log('\n── 榜单 ───────────────────────────────────────');
  await page.locator('#lbbtn').click();
  await page.waitForTimeout(1200);
  check('board panel opened', await page.locator('#lbwrap').count() === 1);
  const emptyTxt = await page.locator('#lbpanel').innerText();
  /* Deliberately not asserting that the board is empty. It usually is not —
     the board is live and this test must not care how many real players are on
     it. What matters is that the server answered: either a table came back, or
     the empty notice did. Asserting emptiness made the check fail the moment
     somebody actually played the game. */
  const answered = emptyTxt.indexOf('联网') < 0;
  const shaped = emptyTxt.indexOf('名次') >= 0 || emptyTxt.indexOf('第一个') >= 0;
  check('board reached the server (not the offline notice)', answered, JSON.stringify(emptyTxt.slice(0, 50)));
  check('board came back as either a table or the empty notice', shaped,
        JSON.stringify(emptyTxt.slice(0, 60)));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  console.log('\n── 打完一局 ───────────────────────────────────');
  await page.evaluate(s => window.__setState(s), finalState());
  await page.waitForTimeout(800);
  const score = await page.locator('.lbcard .lbscore b').innerText();
  check('ending screen shows a score', score === '3380', score);
  check('ending screen offers a name field', await page.locator('#lbname').count() === 1);
  check('ending screen offers the submit button', await page.locator('#lbsub').count() === 1);
  const slot0 = await page.locator('#lbslot').innerText();
  check('the ending screen states the gate up front', slot0.indexOf('先分享') >= 0,
        JSON.stringify(slot0.slice(0, 44)));

  /* ---------------------------------------------------------- gate: no ---- */
  console.log('\n── 门禁一：分享没走完，不上榜 ─────────────────');
  await page.locator('#lbname').fill(NAME);
  await page.locator('#lbsub').click();
  await page.waitForTimeout(800);
  check('tapping 上榜 opens the share sheet instead of submitting',
        await page.locator('.trish').count() === 1);
  const waHref = await page.locator('.trish .tgs a', { hasText: 'WhatsApp' }).getAttribute('href');
  check('the link in the sheet carries a token', /%3Fc%3D[a-z0-9]{8,}/.test(waHref || ''),
        (waHref || '').slice(0, 90));
  await page.screenshot({ path: path.join(OUT, '8-live-gate-sheet.png') });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const after = await page.locator('#lbslot').innerText();
  check('backing out submits nothing', after.indexOf('上榜了') < 0, JSON.stringify(after.slice(0, 40)));
  check('backing out says why', after.indexOf('还没上榜') >= 0, JSON.stringify(after.slice(0, 60)));
  check('the submit button is live again', await page.locator('#lbsub').isEnabled());
  check('no row was created', await page.locator('#lbcopy').count() === 0);

  /* --------------------------------------------------------- gate: yes ---- */
  console.log('\n── 门禁二：走通一条路，才上榜 ─────────────────');
  await page.locator('#lbsub').click();
  await page.waitForTimeout(800);
  check('the sheet is back', await page.locator('.trish').count() === 1);
  /* the copy route is the desktop fallback — the browser here has no system
     sheet, so this is the route a desktop player actually takes */
  await page.locator('.trish button', { hasText: '复制文字' }).click();
  await page.waitForTimeout(2600);
  const msg = await page.locator('#lbmsg').innerText();
  check('taking a route out submits the run', msg.indexOf('上榜了') >= 0, JSON.stringify(msg));
  check('the form is replaced by the rank, not left sitting there',
        await page.locator('#lbsub').isVisible() === false);
  const rankNote = await page.locator('#lbrank').innerText();
  check('the provisional state is spelled out', rankNote.indexOf('暂') >= 0, JSON.stringify(rankNote));
  check('a copy-my-link button is offered', await page.locator('#lbcopy').count() === 1);
  await page.screenshot({ path: path.join(OUT, '9-live-ending-submitted.png') });

  const tok = await page.evaluate(() => {
    const s = window.__game();
    return (s && s.lbSent && s.lbSent.tok) || '';
  });
  check('the server kept the token', /^[a-z0-9]{8,32}$/.test(tok), String(tok));
  check('no page errors after submitting', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log('\n── 榜上：暂定 ─────────────────────────────────');
  let boardTxt = await reopenBoard(page);
  check('the row is on the board', boardTxt.indexOf(NAME) >= 0, JSON.stringify(boardTxt.slice(0, 80)));
  check('the row carries the score', boardTxt.indexOf('3380') >= 0);
  check('your own row is marked', await page.locator('.lbtable tr.me').count() === 1);
  /* Marked is not the same as visible. The first version of this row was
     #f6efe0 on a #f4efe4 panel: technically highlighted, visually identical.
     So the check is on the rendered colour, not on the class. */
  const contrast = await page.evaluate(() => {
    const me = document.querySelector('.lbtable tr.me td');
    const panel = document.querySelector('#lbpanel');
    if (!me || !panel) return null;
    const lum = c => {
      const m = c.match(/\d+/g).map(Number);
      return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
    };
    return Math.abs(lum(getComputedStyle(me).backgroundColor) - lum(getComputedStyle(panel).backgroundColor));
  });
  check('your own row is actually visible against the panel', contrast !== null && contrast > 8,
        'luminance delta=' + (contrast === null ? 'n/a' : Math.round(contrast)));
  check('a row nobody has opened says so', boardTxt.indexOf('待有人点开') >= 0,
        JSON.stringify(boardTxt.slice(0, 140)));
  await page.screenshot({ path: path.join(OUT, '10-live-board.png') });

  /* --------------------------------------------------- the preview fetch -- */
  console.log('\n── 预览抓取不算到访 ───────────────────────────');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  /* Exactly what WhatsApp and Telegram do when a link is pasted into them: a
     plain GET, no script, no rendering. If this counted, every paste would be
     a visitor and the board's only measured number would be worthless. */
  const preview = await fetch(BASE + '?c=' + tok).then(r => r.text()).catch(() => '');
  check('the preview fetch was served', preview.length > 1000, preview.length + ' bytes');
  boardTxt = await reopenBoard(page);
  check('a preview fetch is NOT counted as a visitor', boardTxt.indexOf('待有人点开') >= 0,
        JSON.stringify(boardTxt.slice(0, 140)));
  check('and no arrival count appeared', boardTxt.indexOf('引来') < 0,
        JSON.stringify(boardTxt.slice(0, 140)));

  /* -------------------------------------------------------- the arrival --- */
  console.log('\n── 转正：真有人点开 ───────────────────────────');
  const vctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  const vpage = await vctx.newPage();
  const verrors = [];
  vpage.on('pageerror', e => verrors.push(String(e)));
  await vpage.goto(BASE + '?c=' + tok, { waitUntil: 'domcontentloaded' });
  await vpage.waitForTimeout(2800);
  check('the visitor page runs clean', verrors.length === 0, verrors.slice(0, 2).join(' | '));
  check('the token is taken out of the address bar once it is recorded',
        vpage.url().indexOf('?c=') < 0, vpage.url());
  await vpage.screenshot({ path: path.join(OUT, '11-live-visitor.png') });
  await vctx.close();

  boardTxt = await reopenBoard(page);
  check('the row is promoted: an arrival is now shown',
        boardTxt.indexOf('引来 1 人') >= 0, JSON.stringify(boardTxt.slice(0, 140)));
  check('and it no longer says 待有人点开', boardTxt.indexOf('待有人点开') < 0);
  await page.screenshot({ path: path.join(OUT, '12-live-board-confirmed.png') });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const promoted = await page.locator('#lbrank').innerText();
  check('the ending screen says so too, without opening the board',
        promoted.indexOf('已转正') >= 0, JSON.stringify(promoted));
  await page.screenshot({ path: path.join(OUT, '13-live-ending-confirmed.png') });

  /* ------------------------------------------------------------- phone ---- */
  console.log('\n── 手机：一按直达系统面板 ─────────────────────');
  const pctx = await browser.newContext({ ...devices['iPhone 13'] });
  await pctx.addInitScript(STUB_SHARE);
  const ppage = await pctx.newPage();
  const perrors = [];
  ppage.on('pageerror', e => perrors.push(String(e)));
  await ppage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await ppage.waitForTimeout(1800);
  await ppage.evaluate(s => window.__setState(s), finalState());
  await ppage.waitForTimeout(1600);

  await ppage.evaluate(n => {
    window.__shared = [];
    document.getElementById('lbname').value = n;
    document.getElementById('lbsub').click();
  }, NAME2);
  await ppage.waitForTimeout(2800);
  const pmsg = await ppage.locator('#lbmsg').innerText();
  check('phone: the gate goes through the system sheet and submits',
        pmsg.indexOf('上榜了') >= 0, JSON.stringify(pmsg));
  const pshared = await ppage.evaluate(() => window.__shared);
  check('phone: exactly one share was handed to the OS', pshared.length === 1,
        JSON.stringify(pshared.map(x => x.files)));
  check('phone: the shared text carried the token',
        pshared.length === 1 && /\?c=[a-z0-9]{8,}/.test(pshared[0].text),
        JSON.stringify((pshared[0] || {}).text || '').slice(0, 120));
  check('phone: no page errors', perrors.length === 0, perrors.slice(0, 2).join(' | '));
  await ppage.screenshot({ path: path.join(OUT, '14-live-phone-submitted.png') });
  await pctx.close();

  /* ------------------------------------------------------------- i18n ----- */
  console.log('\n── 语言切换 ───────────────────────────────────');
  await page.locator('#langseg button[data-lang="en"]').click();
  await page.waitForTimeout(500);
  check('board button is English', (await page.locator('#lbbtn').innerText()).trim() === 'Leaderboard');
  await page.locator('#lbbtn').click();
  await page.waitForTimeout(1400);
  const enTxt = await page.locator('#lbpanel').innerText();
  check('the board renders in English too', enTxt.indexOf('Rank') >= 0, JSON.stringify(enTxt.slice(0, 60)));
  check('the arrival chip is English too', enTxt.indexOf('brought 1') >= 0,
        JSON.stringify(enTxt.slice(0, 160)));
  await page.screenshot({ path: path.join(OUT, '15-live-board-en.png') });

  await ctx.close();
  await browser.close();
  console.log('\nshots -> ' + OUT);
  console.log(fails ? `\n${fails} check(s) failed.` : '\nall checks passed.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
