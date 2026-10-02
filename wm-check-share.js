/* wm-check-share.js — whereami's share card, end to end.
 *
 * This game was silently dead: `TRI.configure(...)` ran at the top of its one
 * script block, but `var TRI` is declared ~600 lines further down, so the call
 * threw and aborted the rest of the block. The button was never wired and the
 * beacon never fired — for four days, with nothing reporting it.
 *
 * "It no longer throws" is not the same as "it works", so this drives the
 * button and asserts the card is actually painted and offered.
 *
 * Run:  node brand/wm-check-share.js
 */
const path = require('path');
const { run } = require('./ao-harness');

const TARGET = path.resolve(__dirname, '..', '_gh', 'coordinate-thinking-game', 'index.html');

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

const r = run(TARGET, { host: 'whereami.trilumi.xyz', frames: 3 });

console.log('\n1. the script survives to the bottom of its own block');
{
  check('boots with no errors', r.errors.length === 0, r.errors.join(' | '));
  ['TRILUMI', 'TRICARD', 'TRISHARE', 'TRI'].forEach((m) => {
    check(`${m} is defined`, r.sandbox[m] && typeof r.sandbox[m] === 'object');
  });
  check('beacon is armed', r.sandbox.TRI && r.sandbox.TRI.on === true);
}

console.log('\n2. the page reports itself');
{
  const b = r.imgRequests.filter((u) => u.indexOf('/_e/p.gif') === 0);
  check('one load beacon', b.length === 1, `got ${b.length}`);
  const p = new URLSearchParams((b[0] || '').split('?')[1] || '');
  check('e=load', p.get('e') === 'load', p.get('e'));
  check('g=whereami', p.get('g') === 'whereami', p.get('g'));
  check('carries a language', !!p.get('l'), p.get('l'));
}

console.log('\n3. the share button is wired');
const btn = r.doc.getElementById('sharebtn');
check('sharebtn exists in the markup', !!btn);
check('sharebtn has a click handler', (btn.listeners.click || []).length === 1,
      String((btn.listeners.click || []).length));

console.log('\n4. pressing it produces a card');
{
  /* spy on the three things shareCard is supposed to do */
  let drawn = null;
  let opened = null;
  const tracked = [];

  const realDraw = r.sandbox.TRICARD.draw;
  r.sandbox.TRICARD.draw = function () { drawn = realDraw.apply(this, arguments); return drawn; };
  r.sandbox.TRISHARE.open = function () { opened = arguments; };
  r.sandbox.TRI.track = function (e, x) { tracked.push([e, x]); };

  let threw = null;
  try {
    (btn.listeners.click || []).forEach((fn) => fn({}));
  } catch (e) {
    threw = e && e.message;
  }

  check('click does not throw', !threw, threw);
  check('TRICARD.draw was called', !!drawn);
  check('TRISHARE.open was called', !!opened);

  const runs = drawn && drawn._ctx ? drawn._ctx.runs : [];
  check('the card actually painted', runs.length > 10, `${runs.length} glyph runs`);

  const text = runs.map((x) => x.text);
  /* The card stamps the academy rather than its own subdomain: a shared image
     should send the viewer to the hub, which lists all four games, not to one
     of them. Art of War prints both because it is the one being handed out at
     an event; either is fine, so this only requires a reachable address. */
  check('card carries the academy address', text.includes('academy.trilumi.xyz'));
  check('card carries no stale /games path', !text.some((t) => /trilumi\.xyz\/games/.test(t)));
  check('card carries the brand wordmark', text.join('').indexOf('TRILUMI') >= 0);
  check('the share is reported', tracked.some(([e]) => e === 'share'),
        JSON.stringify(tracked));

  check('filename is whereami.png', opened && opened[2] && opened[2].filename === 'whereami.png',
        opened && opened[2] && opened[2].filename);

  /* a second press must be equally safe */
  let threw2 = null;
  try {
    (btn.listeners.click || []).forEach((fn) => fn({}));
  } catch (e) { threw2 = e && e.message; }
  check('a second press is safe', !threw2, threw2);
}

console.log('\n5. the brand link still points at the academy');
{
  const html = require('fs').readFileSync(TARGET, 'utf8');
  check('no stale trilumi.xyz/games', !/trilumi\.xyz\/games/.test(html));
  check('links to academy', html.indexOf('academy.trilumi.xyz') >= 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
