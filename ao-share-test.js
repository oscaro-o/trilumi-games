/* ============================================================================
   ao-share-test.js — does the Art of War share button actually do anything?

   Why this exists: the previous round shipped a share button that was only
   reachable from the final screen, so a first-time visitor saw nothing and
   reasonably reported "I don't see the changes". Reading the source cannot
   answer "is the button visible on load" or "does tapping it produce a share
   sheet" — only running it can.

   Runs the real index.html in headless Chromium with a real canvas, twice:
   once as a desktop (the preview sheet is the right answer there) and once as
   a phone (the system sheet is).

   Usage:  node brand/ao-share-test.js [path-to-index.html]
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const HTML = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, '_gh', 'sunzi-13', 'index.html');

const CHROME = 'C:/Users/oscar/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const OUT = path.join(ROOT, 'brand', '_ao-shots');

const { chromium, devices } = require('playwright-core');

let fails = 0;
function check(label, ok, extra) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) fails++;
}

/* the same shape the game builds after thirteen chapters */
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

/* a stub that records what would have been handed to the OS */
const STUB_SHARE = () => {
  window.__shared = [];
  navigator.canShare = function () { return true; };
  navigator.share = function (d) {
    window.__shared.push({ files: (d.files || []).length, text: d.text || '' });
    return Promise.resolve();
  };
};

function track(page, errors) {
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
}

(async () => {
  if (!fs.existsSync(HTML)) { console.error('missing ' + HTML); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME });
  const href = url.pathToFileURL(HTML).href;

  /* ======================================================== desktop ======= */
  console.log('\n══ desktop (preview sheet is the right answer) ══');
  {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    const errors = [];
    track(page, errors);
    await page.goto(href);
    await page.waitForTimeout(900);

    console.log('\n── load ────────────────────────────────────────');
    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    const btn = page.locator('#trishbtn');
    check('share button exists', await btn.count() === 1);
    check('share button visible on load (no state yet)', await btn.isVisible());
    check('share button says 分享', (await btn.innerText()).trim() === '分享',
          JSON.stringify((await btn.innerText()).trim()));
    check('build tag reads v3', (await page.locator('#buildtag').innerText()).trim() === 'v3');
    await page.screenshot({ path: path.join(OUT, '1-landing.png') });

    /* tapping it before the game starts should offer to share the game */
    await btn.click();
    await page.waitForTimeout(400);
    check('cold tap opens the share sheet', await page.locator('.trish').count() === 1);
    check('cold sheet offers WhatsApp',
          await page.locator('.trish .tgs a', { hasText: 'WhatsApp' }).count() === 1);
    await page.screenshot({ path: path.join(OUT, '2-sheet-cold.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Escape closes the sheet', await page.locator('.trish').count() === 0);

    console.log('\n── ending ──────────────────────────────────────');
    await page.evaluate(s => window.__setState(s), finalState());
    await page.waitForTimeout(600);
    check('ending meme is rendered', await page.locator('figure.meme img').count() === 1);
    check('meme decoded (naturalWidth > 100)', await page.evaluate(() => {
      const i = document.querySelector('figure.meme img');
      return !!(i && i.src.startsWith('data:image/webp') && i.naturalWidth > 100);
    }));
    await page.waitForTimeout(1000);
    check('card pre-rendered off-screen (__lastCard is a PNG)',
          await page.evaluate(() => !!window.__lastCard && window.__lastCard.startsWith('data:image/png')));
    await page.screenshot({ path: path.join(OUT, '3-ending.png') });

    console.log('\n── share with a card ───────────────────────────');
    await btn.click();
    await page.waitForTimeout(600);
    check('share sheet opened', await page.locator('.trish').count() === 1);
    check('sheet shows the card image', await page.locator('.trish .cvwrap img').count() === 1);
    const targets = await page.locator('.trish .tgs a').allInnerTexts();
    for (const t of ['WhatsApp', 'Telegram', 'X', 'Facebook', '邮件']) {
      check('target: ' + t, targets.includes(t));
    }
    const waHref = await page.locator('.trish .tgs a', { hasText: 'WhatsApp' }).getAttribute('href');
    check('WhatsApp href is a wa.me link', /^https:\/\/wa\.me\/\?text=/.test(waHref || ''),
          (waHref || '').slice(0, 46));
    check('sheet offers 保存图片',
          await page.locator('.trish button', { hasText: '保存图片' }).count() === 1);
    check('sheet has a Share button',
          await page.locator('.trish button', { hasText: '分享…' }).count() === 1);
    await page.screenshot({ path: path.join(OUT, '4-sheet-card.png') });

    /* the sheet's own Share button must not silently swallow a refusal */
    await page.evaluate(() => {
      navigator.canShare = function () { return true; };
      navigator.share = function () { return Promise.reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' })); };
    });
    await page.locator('.trish button', { hasText: '分享…' }).click();
    await page.waitForTimeout(400);
    check('a refused share reports itself instead of doing nothing',
          (await page.locator('.trish .tg').innerText()).length > 0,
          JSON.stringify(await page.locator('.trish .tg').innerText()));
    await page.screenshot({ path: path.join(OUT, '5-sheet-refused.png') });

    await page.keyboard.press('Escape');
    await page.locator('#langseg button[data-lang="en"]').click();
    await page.waitForTimeout(400);
    check('share button follows the language',
          (await page.locator('#trishbtn').innerText()).trim() === 'Share',
          JSON.stringify((await page.locator('#trishbtn').innerText()).trim()));
    await page.locator('#langseg button[data-lang="trad"]').click();
    await page.waitForTimeout(400);
    check('traditional label', (await page.locator('#trishbtn').innerText()).trim() === '分享');
    check('still no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
  }

  /* ========================================================= phone ======== */
  console.log('\n══ phone (one tap, straight to the system sheet) ══');
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    await ctx.addInitScript(STUB_SHARE);
    const page = await ctx.newPage();
    const errors = [];
    track(page, errors);
    await page.goto(href);
    await page.waitForTimeout(900);

    check('coarse pointer detected (preferNative is on)',
          await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches));
    await page.evaluate(s => window.__setState(s), finalState());
    await page.waitForTimeout(1600);

    const cold = await page.evaluate(() => {
      window.__shared = [];
      document.getElementById('trishbtn').click();
      return new Promise(r => setTimeout(() => r({ n: window.__shared.length, s: window.__shared }), 700));
    });
    check('one tap goes straight to the system sheet — no preview in between',
          cold.n === 1, JSON.stringify(cold.s.map(x => x.files)));
    check('the shared file carries the picture', cold.n === 1 && cold.s[0].files === 1);
    check('the shared file carries the link',
          cold.n === 1 && cold.s[0].text.includes('artofwar.trilumi.xyz'));
    check('no sheet was shown on the way', await page.locator('.trish').count() === 0);
    await page.screenshot({ path: path.join(OUT, '6-phone-ending.png') });

    /* and if the OS sheet refuses, the player still gets a way out */
    await page.evaluate(() => {
      navigator.share = function () { return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); };
    });
    await page.evaluate(() => {
      document.getElementById('trishbtn').click();
      return new Promise(r => setTimeout(r, 700));
    });
    check('a refused share falls back to the preview sheet',
          await page.locator('.trish').count() === 1);
    check('phone sheet is in the page language', (await page.locator('.trish h3').innerText()).includes('结果卡片'),
          JSON.stringify(await page.locator('.trish h3').innerText()));
    await page.screenshot({ path: path.join(OUT, '7-phone-fallback.png') });

    check('no page errors on the phone', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  await browser.close();
  console.log('\nshots -> ' + OUT);
  console.log(fails ? `\n${fails} check(s) failed.` : '\nall checks passed.');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
