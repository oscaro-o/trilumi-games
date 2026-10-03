<?php
/* ==========================================================================
   TRILUMI — 兵法榜 backend (shared by the game family)
   --------------------------------------------------------------------------
   Three entry points live in the web root and include this file:
     /_lb/submit.php   POST  — record a finished run
     /_lb/top.php      GET   — read the board back
     /_lb/hit.php      POST  — a shared link was opened by somebody

   Everything worth protecting — the raw logs, the IP hashes, the salt — lives
   in ../lb/, one level above the web root. This is deliberate and not
   decoration: .htaccess is silently ignored by OpenLiteSpeed on this server,
   so "protect the log with .htaccess" would have been a no-op and every
   player's row would have been world-readable.

   The client never sends a score. It sends the ending, the four resources and
   the time; the server recomputes with the same rule the page displays, so a
   hand-written request can lie about a run but cannot invent a number. The
   rule below and lbScore() in index.html are the same rule in two languages —
   change one, change the other.

   On "verifying a share": a share cannot be verified. navigator.share resolves
   with undefined, the intent links report nothing, and the platform APIs that
   could confirm a post cost money and demand a login first. What CAN be
   verified is that somebody opened the link. So a row carries a token, the
   shared URL carries that token, and a row is 转正 only once a distinct
   visitor has actually arrived through it. That is a weaker claim than "he
   posted", and it is the strongest one that is true.
   ========================================================================== */

declare(strict_types=1);

const LB_DIR      = __DIR__;
const LB_FILE     = LB_DIR . '/entries.jsonl';
const LB_HITS     = LB_DIR . '/hits.jsonl';
const LB_SALT     = LB_DIR . '/salt.txt';
const LB_RATE_DIR = LB_DIR . '/rate';

/* ---- the score rule (mirror of lbScore() in index.html) ---- */
const LB_TIER      = ['shan' => 5, 'gong' => 3, 'jiu' => 2, 'luan' => 1, 'beng' => 0];
const LB_RES_MAX   = 470;    /* 150 + 120 + 100 + 100 */
const LB_SEC_MAX   = 86400;
const LB_SPEED_REF = 1800;   /* thirty minutes earns nothing extra */
const LB_SPEED_DIV = 9;
const LB_SPEED_CAP = 200;

/* ---- limits ---- */
const LB_NAME_MAX      = 16;
const LB_LIST_MAX      = 50;
const LB_BODY_MAX      = 4096;
const LB_TOK_RE        = '/^[a-z0-9]{8,32}$/';
const LB_RATE_MAX      = 30;                /* submissions per window, per address */
const LB_RATE_WIN      = 3600;
const LB_HIT_RATE_MAX  = 200;               /* link opens are cheaper than runs */
const LB_HIT_RATE_WIN  = 3600;
const LB_COMPACT_BYTES = 4194304;           /* 4 MB */
const LB_COMPACT_KEEP  = 500;
const LB_HITS_COMPACT_BYTES = 2097152;      /* 2 MB */
const LB_HITS_COMPACT_KEEP  = 20000;

function lb_out(int $code, array $payload): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function lb_ensure(): void
{
    if (!is_dir(LB_RATE_DIR)) {
        @mkdir(LB_RATE_DIR, 0755, true);
    }
}

function lb_salt(): string
{
    $s = @file_get_contents(LB_SALT);
    if (is_string($s) && strlen(trim($s)) >= 16) {
        return trim($s);
    }
    lb_ensure();
    $s = bin2hex(random_bytes(24));
    @file_put_contents(LB_SALT, $s, LOCK_EX);
    @chmod(LB_SALT, 0600);
    return $s;
}

/* A salted hash, so the log holds no addresses. It exists only to rate-limit,
   to spot one player filling the board, and to stop a player counting their
   own click as somebody else's — never to identify anyone. */
function lb_ip_hash(): string
{
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
    return substr(hash('sha256', $ip . '|' . lb_salt()), 0, 20);
}

function lb_score(string $e, int $res, int $sec): int
{
    $tier  = isset(LB_TIER[$e]) ? LB_TIER[$e] : 0;
    $res   = max(0, min(LB_RES_MAX, $res));
    $sec   = max(0, min(LB_SEC_MAX, $sec));
    $speed = (int) max(0, min(LB_SPEED_CAP, (int) round((LB_SPEED_REF - $sec) / LB_SPEED_DIV)));
    return $tier * 1000 + $res + $speed;
}

function lb_clean_name($v): string
{
    if (!is_string($v)) {
        return '';
    }
    $v = preg_replace('/[\x00-\x1F\x7F]/u', '', $v);
    if ($v === null) {
        return '';
    }
    $v = str_replace(['<', '>', '&', '"', "'", '\\', '`'], '', $v);
    $v = preg_replace('/\s+/u', ' ', $v);
    if ($v === null) {
        return '';
    }
    $v = trim($v);
    if (function_exists('mb_substr')) {
        $v = mb_substr($v, 0, LB_NAME_MAX, 'UTF-8');
    } else {
        $v = substr($v, 0, LB_NAME_MAX * 3);
    }
    return trim($v);
}

/* ---- generic jsonl helpers ---- */
function lb_read_lines(string $file): array
{
    if (!is_file($file)) {
        return [];
    }
    $fh = @fopen($file, 'rb');
    if (!$fh) {
        return [];
    }
    $rows = [];
    while (($line = fgets($fh)) !== false) {
        $line = trim($line);
        if ($line === '') {
            continue;
        }
        $r = json_decode($line, true);
        if (is_array($r)) {
            $rows[] = $r;
        }
    }
    fclose($fh);
    return $rows;
}

function lb_read(): array
{
    $out = [];
    foreach (lb_read_lines(LB_FILE) as $r) {
        if (isset($r['pid'], $r['score'], $r['e'], $r['ts'])) {
            $out[] = $r;
        }
    }
    return $out;
}

/* Append one run. Append-only on purpose: it is O(1), it cannot lose a
   concurrent write the way a read-modify-write can, and the one-row-per-player
   rule is applied at read time by lb_ranked() instead. */
function lb_append(array $row): bool
{
    lb_ensure();
    $line = json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false) {
        return false;
    }
    return @file_put_contents(LB_FILE, $line . "\n", FILE_APPEND | LOCK_EX) !== false;
}

function lb_write_lines(string $file, array $rows): void
{
    $tmp = $file . '.tmp';
    $fh  = @fopen($tmp, 'wb');
    if (!$fh) {
        return;
    }
    foreach ($rows as $r) {
        fwrite($fh, json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n");
    }
    fclose($fh);
    @rename($tmp, $file);
}

/* higher score first; on a tie the faster run wins; then whoever got there
   first. Deterministic, so the board does not reshuffle between two reads. */
function lb_cmp(array $a, array $b): int
{
    if ($a['score'] !== $b['score']) {
        return $b['score'] <=> $a['score'];
    }
    if ($a['sec'] !== $b['sec']) {
        return $a['sec'] <=> $b['sec'];
    }
    return $a['ts'] <=> $b['ts'];
}

function lb_better(array $a, array $b): bool
{
    return lb_cmp($a, $b) < 0;
}

/* One row per player: their best run. The log itself stays append-only, which
   is what makes it safe to write under concurrency — the dedupe happens on
   read, not on write. */
function lb_ranked(): array
{
    $best = [];
    foreach (lb_read() as $r) {
        $k = (string) $r['pid'];
        if (!isset($best[$k]) || lb_better($r, $best[$k])) {
            $best[$k] = $r;
        }
    }
    $list = array_values($best);
    usort($list, 'lb_cmp');
    $rank = 0;
    foreach ($list as $i => $r) {
        $rank++;
        $list[$i]['rank'] = $rank;
    }
    return $list;
}

/* ---- referral hits ------------------------------------------------------
   One line per arriving visitor. Counting is deferred to read time and
   de-duplicated by address, so a refresh is not a new person. The append is
   O(1) and never has to look at what is already there.
   ------------------------------------------------------------------------ */

function lb_hits_append(string $tok): bool
{
    lb_ensure();
    $row = json_encode(['t' => $tok, 'ip' => lb_ip_hash(), 'ts' => time()],
                       JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($row === false) {
        return false;
    }
    return @file_put_contents(LB_HITS, $row . "\n", FILE_APPEND | LOCK_EX) !== false;
}

/* tok => number of distinct addresses that arrived through it */
function lb_hits_map(): array
{
    $seen = [];
    foreach (lb_read_lines(LB_HITS) as $r) {
        if (!isset($r['t'], $r['ip'])) {
            continue;
        }
        $seen[(string) $r['t']][(string) $r['ip']] = 1;
    }
    $out = [];
    foreach ($seen as $tok => $ips) {
        $out[$tok] = count($ips);
    }
    return $out;
}

/* whose row is this token on? used to ignore a player opening their own link */
function lb_tok_owner(string $tok): ?string
{
    foreach (lb_read() as $r) {
        if (isset($r['tok']) && $r['tok'] === $tok) {
            return (string) $r['pid'];
        }
    }
    return null;
}

function lb_tok_taken(string $tok): bool
{
    return lb_tok_owner($tok) !== null;
}

function lb_maybe_compact(): void
{
    if (is_file(LB_FILE) && filesize(LB_FILE) >= LB_COMPACT_BYTES) {
        lb_write_lines(LB_FILE, array_slice(lb_ranked(), 0, LB_COMPACT_KEEP));
    }
    if (is_file(LB_HITS) && filesize(LB_HITS) >= LB_HITS_COMPACT_BYTES) {
        $rows = lb_read_lines(LB_HITS);
        lb_write_lines(LB_HITS, array_slice($rows, -LB_HITS_COMPACT_KEEP));
    }
}

/* ---- rate limiting ---- */
function lb_rate_ok(string $bucket, int $max, int $win): bool
{
    lb_ensure();
    $f   = LB_RATE_DIR . '/' . $bucket . '-' . lb_ip_hash() . '.txt';
    $now = time();
    $n   = 0;
    $t0  = $now;
    if (is_file($f)) {
        $raw = @file_get_contents($f);
        if (is_string($raw)) {
            $p = explode(' ', trim($raw));
            if (count($p) === 2) {
                $n  = (int) $p[0];
                $t0 = (int) $p[1];
            }
        }
    }
    if ($now - $t0 > $win) {
        $n  = 0;
        $t0 = $now;
    }
    if ($n >= $max) {
        return false;
    }
    @file_put_contents($f, ($n + 1) . ' ' . $t0, LOCK_EX);
    return true;
}
