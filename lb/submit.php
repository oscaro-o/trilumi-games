<?php
/* POST /_lb/submit.php
   body: {pid, n, e, res, sec, l, v, tok}
   The score is NOT accepted from the client — see lib.php.

   `tok` is minted by the browser and put into the link the player shares. The
   row is provisional until somebody opens that link. A token already in use is
   dropped rather than rejected: the run is still worth recording, it just
   cannot be promoted, and answering "that token is taken" would only help
   somebody guess tokens. */

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

$pid = isset($d['pid']) && is_string($d['pid']) ? $d['pid'] : '';
if (!preg_match('/^[a-z0-9]{8,32}$/', $pid)) {
    lb_out(400, ['ok' => false, 'error' => 'pid']);
}

$e = isset($d['e']) && is_string($d['e']) ? $d['e'] : '';
if (!isset(LB_TIER[$e])) {
    lb_out(400, ['ok' => false, 'error' => 'ending']);
}

$res = isset($d['res']) ? (int) $d['res'] : -1;
if ($res < 0 || $res > LB_RES_MAX) {
    lb_out(400, ['ok' => false, 'error' => 'res']);
}

$sec = isset($d['sec']) ? (int) $d['sec'] : -1;
if ($sec < 0 || $sec > LB_SEC_MAX) {
    lb_out(400, ['ok' => false, 'error' => 'sec']);
}

if (!lb_rate_ok('sub', LB_RATE_MAX, LB_RATE_WIN)) {
    lb_out(429, ['ok' => false, 'error' => 'rate']);
}

$tok = isset($d['tok']) && is_string($d['tok']) ? $d['tok'] : '';
if ($tok !== '' && (!preg_match(LB_TOK_RE, $tok) || lb_tok_taken($tok))) {
    $tok = '';
}

$lang = isset($d['l']) && is_string($d['l']) ? substr($d['l'], 0, 8) : '';
$ver  = isset($d['v']) && is_string($d['v']) ? substr($d['v'], 0, 24) : '';

$row = [
    'pid'   => $pid,
    'n'     => lb_clean_name(isset($d['n']) ? $d['n'] : ''),
    'e'     => $e,
    'res'   => $res,
    'sec'   => $sec,
    'score' => lb_score($e, $res, $sec),
    'ts'    => time(),
    'tok'   => $tok,
    'l'     => $lang,
    'v'     => $ver,
    'ip'    => lb_ip_hash(),
];

if (!lb_append($row)) {
    lb_out(500, ['ok' => false, 'error' => 'write']);
}

lb_maybe_compact();

$rank  = null;
$total = 0;
foreach (lb_ranked() as $r) {
    $total++;
    if ($r['pid'] === $pid) {
        $rank = $r['rank'];
    }
}

lb_out(200, [
    'ok'    => true,
    'score' => $row['score'],
    'rank'  => $rank,
    'total' => $total,
    'tok'   => $tok,
]);
