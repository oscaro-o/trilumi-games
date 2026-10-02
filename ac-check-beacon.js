/* ac-check-beacon.js — verify the Academy's new beacon and self-hosted fonts.
 *
 * The beacon is nothing but an Image pointed at a URL, so the harness records
 * every Image src assignment and this asserts against that list. Everything
 * here is checked by execution, not by reading the source.
 *
 * Run:  node brand/ac-check-beacon.js
 */
const fs = require('fs');
const path = require('path');
const { run, El } = require('./ao-harness');

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, '_gh', 'TrilumiWebsite', 'site-academy', 'index.html');
const DIR = path.dirname(PAGE);

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

function beacons(list) {
  return list
    .filter((u) => u.indexOf('/_e/p.gif') === 0)
    .map((u) => {
      const [p, q] = u.split('?');
      const params = {};
      new URLSearchParams(q).forEach((v, k) => { params[k] = v; });
      return { path: p, params };
    });
}

/* ── 1. A real visit from an ending card ─────────────────────────────── */
console.log('\n1. visit from a game card');
{
  const r = run(PAGE, {
    host: 'academy.trilumi.xyz',
    referrer: 'https://artofwar.trilumi.xyz/',
    search: '?utm_source=whatsapp',
    frames: 4,
  });

  check('page boots with no errors', r.errors.length === 0, r.errors.join(' | '));
  check('page boots with no warnings', r.warnings.length === 0, r.warnings.join(' | '));

  const b = beacons(r.imgRequests);
  check('exactly one beacon fired on load', b.length === 1, `got ${b.length}`);
  const p = b[0] ? b[0].params : {};
  check('endpoint is the family path', b[0] && b[0].path === '/_e/p.gif', b[0] && b[0].path);
  check('e=load', p.e === 'load', p.e);
  check('g=academy', p.g === 'academy', p.g);
  check('l=en', p.l === 'en', p.l);
  check('r=referring game', p.r === 'artofwar.trilumi.xyz', p.r);
  check('n=1 (first visit)', p.n === '1', p.n);
  check('u=utm_source carried through', p.u === 'whatsapp', p.u);
  check('session id present', !!p.s && p.s.length > 4, p.s);
}

/* ── 2. Walking into an exhibit ──────────────────────────────────────── */
console.log('\n2. clicking through to an exhibit');
{
  const r = run(PAGE, { host: 'academy.trilumi.xyz', frames: 2 });
  const before = beacons(r.imgRequests).length;

  const art = new El('article');
  art.id = 'artofwar';
  art.className = 'exhibit';
  const a = new El('a');
  a.setAttribute('href', 'https://artofwar.trilumi.xyz');
  a.parent = art;

  r.doc.dispatch('click', { target: a });

  const b = beacons(r.imgRequests);
  check('one extra beacon on click', b.length === before + 1, `${before} -> ${b.length}`);
  const p = b[b.length - 1].params;
  check('e=exhibit', p.e === 'exhibit', p.e);
  check('x=artofwar', p.x === 'artofwar', p.x);
  check('still tagged g=academy', p.g === 'academy', p.g);

  /* a click that is not inside an exhibit must not report one */
  const stray = new El('a');
  stray.setAttribute('href', 'https://academy.trilumi.xyz/');
  r.doc.dispatch('click', { target: stray });
  const after = beacons(r.imgRequests).length;
  check('click outside an exhibit reports nothing', after === b.length, `${b.length} -> ${after}`);

  /* the Jev board is a guest, on another host — it must still count */
  const jart = new El('article');
  jart.id = 'jev';
  jart.className = 'exhibit';
  const ja = new El('a');
  ja.setAttribute('href', 'https://jev.ask-jev.workers.dev');
  ja.parent = jart;
  r.doc.dispatch('click', { target: ja });
  const jb = beacons(r.imgRequests);
  check('guest instrument also counts', jb.length === after + 1 && jb[jb.length - 1].params.x === 'jev',
        JSON.stringify(jb[jb.length - 1] && jb[jb.length - 1].params));
}

/* ── 3. The off switch ───────────────────────────────────────────────── */
console.log('\n3. stays silent off *.trilumi.xyz');
{
  const r = run(PAGE, { host: 'localhost', frames: 2 });
  check('no beacon on localhost', beacons(r.imgRequests).length === 0,
        JSON.stringify(beacons(r.imgRequests)));
  check('page still boots', r.errors.length === 0, r.errors.join(' | '));

  const r2 = run(PAGE, { host: 'oscaro-o.github.io', frames: 2 });
  check('no beacon on the Pages mirror', beacons(r2.imgRequests).length === 0);
}

/* ── 4. Self-hosted type ─────────────────────────────────────────────── */
console.log('\n4. typefaces');
{
  const html = fs.readFileSync(PAGE, 'utf8');
  check('no google fonts stylesheet', !/fonts\.googleapis\.com/.test(html));
  check('no gstatic preconnect', !/fonts\.gstatic\.com/.test(html));
  check('three @font-face rules', (html.match(/@font-face/g) || []).length === 3,
        String((html.match(/@font-face/g) || []).length));

  const faces = [...html.matchAll(/src:url\((fonts\/[\w.-]+\.woff2)\)/g)].map((m) => m[1]);
  check('three local font urls', faces.length === 3, JSON.stringify(faces));
  faces.forEach((f) => {
    const abs = path.join(DIR, f);
    check(`exists: ${f}`, fs.existsSync(abs), abs);
  });

  check('beacon gif ships with the page', fs.existsSync(path.join(DIR, '_e', 'p.gif')));
  check('preload for the body face', /rel="preload" href="fonts\/inter\.woff2"/.test(html));
  check('preload carries crossorigin', /href="fonts\/inter\.woff2"[^>]*crossorigin/.test(html));
}

/* ── 5. The copy says what the games give you ────────────────────────── */
console.log('\n5. copy');
{
  const html = fs.readFileSync(PAGE, 'utf8');
  check('Games Wing intro mentions the card',
        /Each one ends with a card of how you played/.test(html));
  check('four boards advertise an ending card',
        (html.match(/<dt>Ending card<\/dt>/g) || []).length === 4,
        String((html.match(/<dt>Ending card<\/dt>/g) || []).length));
  check('Art of War names its five endings',
        /One of five endings, with a picture to match/.test(html));
  check('Art of War text mentions the card',
        /hands you a card of your own ending/.test(html));
  check('no stale trilumi.xyz/games link', !/trilumi\.xyz\/games/.test(html));
  check('still links all four games',
        ['hetu', 'artofwar', 'aihammer', 'whereami'].every((g) => html.includes(`https://${g}.trilumi.xyz`)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
