<?php
/* GET /_lb/top.php?n=20&pid=<player id>
   Returns the top n rows plus the caller's own rank, if they have one.

   Rows carry no player id and no address: the board is public, the identity
   behind a row is not. Each row does carry `h`, the number of distinct
   visitors that arrived through that player's shared link — the board's only
   social proof, and the only part of it that was actually observed rather
   than claimed. `h` is 0 for a row whose share nobody opened. */

declare(strict_types=1);

require __DIR__ . '/../../lb/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    lb_out(405, ['ok' => false, 'error' => 'method']);
}

$n = isset($_GET['n']) ? (int) $_GET['n'] : 20;
$n = max(1, min(LB_LIST_MAX, $n));

$pid = isset($_GET['pid']) && is_string($_GET['pid']) ? $_GET['pid'] : '';
if ($pid !== '' && !preg_match('/^[a-z0-9]{8,32}$/', $pid)) {
    $pid = '';
}

$all   = lb_ranked();
$hits  = lb_hits_map();
$total = count($all);

$list = [];
foreach (array_slice($all, 0, $n) as $r) {
    $tok = isset($r['tok']) && is_string($r['tok']) ? $r['tok'] : '';
    $list[] = [
        'rank' => $r['rank'],
        'n'    => $r['n'],
        'e'    => $r['e'],
        's'    => $r['score'],
        't'    => $r['sec'],
        'res'  => $r['res'],
        'h'    => ($tok !== '' && isset($hits[$tok])) ? (int) $hits[$tok] : 0,
    ];
}

$you = null;
if ($pid !== '') {
    foreach ($all as $r) {
        if ($r['pid'] === $pid) {
            $tok = isset($r['tok']) && is_string($r['tok']) ? $r['tok'] : '';
            $you = [
                'rank' => $r['rank'],
                's'    => $r['score'],
                't'    => $r['sec'],
                'e'    => $r['e'],
                'h'    => ($tok !== '' && isset($hits[$tok])) ? (int) $hits[$tok] : 0,
            ];
            break;
        }
    }
}

lb_out(200, [
    'ok'    => true,
    'total' => $total,
    'list'  => $list,
    'you'   => $you,
]);
