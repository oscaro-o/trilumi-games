<?php
/* POST /_lb/hit.php
   body: {c: <token>, pid: <visitor's own id>}
   → {ok, n}

   Somebody opened a shared link. This is the only half of the share loop that
   can actually be observed, and it is what promotes a row from 暂定 to 转正.

   Two deliberate details:

   - POST, and fired from JavaScript, never from the page load itself. When a
     link is pasted into WhatsApp or Telegram the platform fetches it to build
     a preview card — that fetch is a GET and runs no script, so it does not
     count as a visitor. Only a real browser that rendered the page calls this.
   - A player opening their own link is not a visitor. The client sends its own
     pid and a hit that matches the row's owner is acknowledged but not
     recorded. That does not stop someone opening their own link in a second
     browser, but it does stop the accidental self-click being counted.

   An unknown token is still recorded rather than refused: the visitor may have
   clicked through before the sharer's own submit landed, and refusing would
   silently lose a real arrival. */

declare(strict_types=1);

require __DIR__ . '/../../lb/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    lb_out(405, ['ok' => false, 'error' => 'method']);
}

$raw = file_get_contents('php://input', false, null, 0, LB_BODY_MAX + 1);
if (!is_string($raw) || $raw === '' || strlen($raw) > LB_BODY_MAX) {
    lb_out(400, ['ok' => false, 'error' => 'body']);
}

$d = json_decode($raw, true);
if (!is_array($d)) {
    lb_out(400, ['ok' => false, 'error' => 'json']);
}

$tok = isset($d['c']) && is_string($d['c']) ? $d['c'] : '';
if (!preg_match(LB_TOK_RE, $tok)) {
    lb_out(400, ['ok' => false, 'error' => 'token']);
}

$pid = isset($d['pid']) && is_string($d['pid']) ? $d['pid'] : '';

function lb_hits_for(string $tok): int
{
    $map = lb_hits_map();
    return isset($map[$tok]) ? (int) $map[$tok] : 0;
}

if ($pid !== '' && lb_tok_owner($tok) === $pid) {
    lb_out(200, ['ok' => true, 'self' => true, 'n' => lb_hits_for($tok)]);
}

if (!lb_rate_ok('hit', LB_HIT_RATE_MAX, LB_HIT_RATE_WIN)) {
    lb_out(429, ['ok' => false, 'error' => 'rate']);
}

if (!lb_hits_append($tok)) {
    lb_out(500, ['ok' => false, 'error' => 'write']);
}

lb_maybe_compact();

lb_out(200, ['ok' => true, 'n' => lb_hits_for($tok)]);
