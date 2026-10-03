#!/usr/bin/env bash
#
# Deploy the game family: the games, and the beacon each one reports to.
#
#   bash brand/deploy-family.sh              deploy every game
#   bash brand/deploy-family.sh --check      show what would move, touch nothing
#   bash brand/deploy-family.sh artofwar     deploy only one game
#
# The hub is NOT here any more. academy.trilumi.xyz replaced trilumi.xyz/games
# and is published by NekoBite/TrilumiWebsite (site-academy/) through its own
# GitHub Actions workflow — see docs/academy.md there. The old target is gone
# rather than left dormant, because it would have written the retired page
# back over the top.
#
# tar over ssh, because neither end has rsync. Ownership is taken from the
# parent directory so OpenLiteSpeed can actually read what lands.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_ALIAS="${HOST_ALIAS:-hetu}"
CHECK=0
ONLY=""

for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    *) ONLY="$arg" ;;
  esac
done

say()   { printf '%s\n' "$*"; }
title() { printf '\n%s\n' "── $* ──────────────────────────────────────"; }
want()  { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }

# push files from a local directory into a remote directory.
# The source directory is passed explicitly so tar writes bare filenames —
# archiving "brand/games/index.html" wholesale would recreate brand/games/
# on the far end, one level too deep.
push() {
  local label="$1" remote="$2" srcdir="$3"; shift 3
  local files=("$@")

  case "$remote" in
    /home/*/public_html*|/home/*/lb) : ;;
    *) say "  !!  refusing to write to '$remote'"; return 1 ;;
  esac

  if [ ! -d "$ROOT/$srcdir" ]; then
    say "  !!  source directory missing: $srcdir"; return 1
  fi

  if [ "$CHECK" = "1" ]; then
    say "  would push $label -> $remote  (${#files[@]} file(s))"
    local f
    for f in "${files[@]}"; do
      if [ -f "$ROOT/$srcdir/$f" ]; then
        say "        $srcdir/$f"
      else
        say "        !! MISSING  $srcdir/$f"
      fi
    done
    return 0
  fi

  tar czf - -C "$ROOT/$srcdir" "${files[@]}" | ssh -o ConnectTimeout=20 "$HOST_ALIAS" "
    set -e
    mkdir -p '$remote'
    tar xzf - -C '$remote'
    OWNER=\$(stat -c '%U:%G' \"\$(dirname '$remote')\")
    chown -R \"\$OWNER\" '$remote'
    find '$remote' -type d -exec chmod 755 {} +
    find '$remote' -type f -exec chmod 644 {} +
  "
  say "  pushed $label -> $remote"
}

# verify a URL. The size comes back from curl's own -w rather than from a temp
# file: writing `.deploy-check.tmp` into the working directory failed under the
# sandbox and reported `000000` for a URL that was serving fine — a verifier
# that can fail for its own reasons is worse than no verifier.
verify() {
  local label="$1" url="$2" want_code="${3:-200}"
  local out code size
  out=$(curl -sS -L --max-time 25 -o /dev/null -w '%{http_code} %{size_download}' "$url" 2>/dev/null || echo "000 0")
  code=${out%% *}
  size=${out##* }
  if [ "$code" = "$want_code" ]; then
    printf '  ok    %-42s %s  %s bytes\n' "$label" "$code" "$size"
  else
    printf '  FAIL  %-42s %s (wanted %s)\n' "$label" "$code" "$want_code"
    return 1
  fi
}

FAILED=0
note_fail() { FAILED=1; }

# assert that the service worker answering on the wire is the one in the repo.
# Without this a VERSION bump can sit in git forever and no returning visitor
# ever receives it — the failure looks exactly like "I don't see the changes".
verify_sw() {
  local label="$1" domain="$2" srcdir="$3" want got
  want=$(sed -n 's/.*const VERSION *= *"\([^"]*\)".*/\1/p' "$ROOT/$srcdir/sw.js" 2>/dev/null | head -1)
  if [ -z "$want" ]; then return 0; fi
  got=$(curl -sS -L --max-time 25 "https://$domain/sw.js" 2>/dev/null |
        sed -n 's/.*const VERSION *= *"\([^"]*\)".*/\1/p' | head -1)
  if [ "$got" = "$want" ]; then
    printf '  ok    %-42s %s\n' "$label (sw)" "$got"
  else
    printf '  FAIL  %-42s %s (repo has %s)\n' "$label (sw)" "${got:-none}" "$want"
    return 1
  fi
}

deploy_game() {
  local slug="$1" domain="$2" srcdir="$3"
  title "$slug  ·  $domain"
  # sw.js has to travel with index.html. It did not, so the service worker on
  # the server stayed at whatever was pushed by hand the first time and every
  # VERSION bump in the repo was a no-op in production — which is a very quiet
  # way to ship a change that nobody can see.
  local files=(index.html)
  if [ -f "$ROOT/$srcdir/sw.js" ]; then files+=(sw.js); fi
  push "$slug" "/home/$domain/public_html" "$srcdir" "${files[@]}"
  push "beacon" "/home/$domain/public_html/_e" brand/beacon p.gif
}

# The leaderboard needs PHP, which the games themselves do not. Only the two
# entry points go in the web root; lib.php and the log itself go one level up.
# That split is not tidiness: .htaccess is silently ignored by OpenLiteSpeed
# here, so a log sitting in public_html would have been world-readable and
# every player's row — name, time, address hash — would have been fetchable.
deploy_lb() {
  local domain="$1"
  title "兵法榜  ·  $domain"
  push "lb-lib" "/home/$domain/lb" brand/lb lib.php
  # hit.php travels with the other two. It was written for the share gate and
  # without it a row can be submitted but never promoted, because the only
  # endpoint that records an arrival would simply not be there.
  push "lb-api" "/home/$domain/public_html/_lb" brand/lb submit.php top.php hit.php
}

# Two things worth asserting, and the second is the one that matters.
# 1. the board answers as JSON
# 2. the log behind it is NOT reachable over HTTP — which is the check that
#    would have caught the log living in public_html, where .htaccess would
#    have been ignored and every row would have been world-readable.
verify_lb() {
  local domain="$1" tmp=".deploy-lb.tmp" code payload leak ok=0
  code=$(curl -sS -L --max-time 25 -o "$tmp" -w '%{http_code}' \
         "https://$domain/_lb/top.php?n=1" 2>/dev/null || echo "000")
  payload=$(cat "$tmp" 2>/dev/null || true)
  rm -f "$tmp"
  if [ "$code" = "200" ] && printf '%s' "$payload" | grep -q '"ok":true'; then
    printf '  ok    %-42s %s\n' "lb top @ $domain" "200 json"
  else
    printf '  FAIL  %-42s %s %s\n' "lb top @ $domain" "$code" "$(printf '%s' "$payload" | head -c 60)"
    ok=1
  fi
  # the arrivals endpoint has to answer too, or the gate can never promote a
  # row — the share would go out and nothing would ever come back
  code=$(curl -sS -L --max-time 25 -o "$tmp" -w '%{http_code}' \
         -X POST -H 'Content-Type: application/json' --data '{"c":"zzzzzzzz"}' \
         "https://$domain/_lb/hit.php" 2>/dev/null || echo "000")
  payload=$(cat "$tmp" 2>/dev/null || true)
  rm -f "$tmp"
  if [ "$code" = "200" ] && printf '%s' "$payload" | grep -q '"ok":true'; then
    printf '  ok    %-42s %s\n' "lb hit @ $domain" "200 json"
  else
    printf '  FAIL  %-42s %s %s\n' "lb hit @ $domain" "$code" "$(printf '%s' "$payload" | head -c 60)"
    ok=1
  fi
  # Both logs must be unreachable. entries.jsonl was the first one; hits.jsonl
  # is the same class of leak and would have been missed by checking only the
  # file that happened to be there first.
  local f
  for f in entries.jsonl hits.jsonl salt.txt; do
    leak=$(curl -sS -L --max-time 20 -o /dev/null -w '%{http_code}' \
           "https://$domain/lb/$f" 2>/dev/null || echo "000")
    if [ "$leak" = "404" ] || [ "$leak" = "403" ]; then
      printf '  ok    %-42s %s (not reachable)\n' "lb $f @ $domain" "$leak"
    else
      printf '  FAIL  %-42s %s (it is reachable!)\n' "lb $f @ $domain" "$leak"
      ok=1
    fi
  done
  return $ok
}

# ---------------------------------------------------------------- the games

if want aihammer; then deploy_game aihammer aihammer.trilumi.xyz thor-hammer; fi
if want artofwar; then deploy_game artofwar artofwar.trilumi.xyz _gh/sunzi-13; deploy_lb artofwar.trilumi.xyz; fi
if want whereami; then deploy_game whereami whereami.trilumi.xyz _gh/coordinate-thinking-game; fi

# 再建美国 / 再造政府 — one repo, two games, two subdomains. They used to
# answer on trilumi.xyz/rebuild/ as well, from games-www/ outside public_html;
# those subpaths are retired, so the pair is now two ordinary rows.
if want rebuild;  then deploy_game rebuild  rebuild.trilumi.xyz  _gh/rebuild-america/1861; fi
if want rebuild2; then deploy_game rebuild2 rebuild2.trilumi.xyz _gh/rebuild-america/1933; fi

# hetu-luoshu already carries the beacon from its first release
if want hetu; then
  title "hetu-luoshu  ·  hetu.trilumi.xyz"
  push "hetu-luoshu" "/home/hetu.trilumi.xyz/public_html" _gh/hetu-luoshu index.html
fi

# ---------------------------------------------------------------- verify

title "verify"
if [ "$CHECK" = "1" ]; then
  say "  (check only — nothing was written)"
  exit 0
fi

if want aihammer; then
  verify "aihammer"          "https://aihammer.trilumi.xyz/"        || note_fail
  verify "beacon @ aihammer" "https://aihammer.trilumi.xyz/_e/p.gif" || note_fail
fi

if want artofwar; then
  verify "artofwar"          "https://artofwar.trilumi.xyz/"         || note_fail
  verify "beacon @ artofwar" "https://artofwar.trilumi.xyz/_e/p.gif" || note_fail
  verify_sw "artofwar" artofwar.trilumi.xyz _gh/sunzi-13             || note_fail
  verify_lb "artofwar.trilumi.xyz"                                   || note_fail
fi

if want whereami; then
  verify "whereami"          "https://whereami.trilumi.xyz/"         || note_fail
  verify "beacon @ whereami" "https://whereami.trilumi.xyz/_e/p.gif" || note_fail
fi

if want hetu; then
  verify "hetu-luoshu"       "https://hetu.trilumi.xyz/"         || note_fail
  verify "beacon @ hetu"     "https://hetu.trilumi.xyz/_e/p.gif" || note_fail
  verify_sw "hetu-luoshu" hetu.trilumi.xyz _gh/hetu-luoshu       || note_fail
fi

if want rebuild; then
  verify "rebuild"           "https://rebuild.trilumi.xyz/"         || note_fail
  verify "beacon @ rebuild"  "https://rebuild.trilumi.xyz/_e/p.gif" || note_fail
fi

if want rebuild2; then
  verify "rebuild2"           "https://rebuild2.trilumi.xyz/"         || note_fail
  verify "beacon @ rebuild2"  "https://rebuild2.trilumi.xyz/_e/p.gif" || note_fail
fi

# The retired subpaths, asserted to be gone. A 200 here means something put
# games-www/rebuild back, and the family is answering on two address sets again.
for dead in "https://trilumi.xyz/rebuild/" "https://trilumi.xyz/rebuild2/" "https://trilumi.xyz/games/"; do
  code=$(curl -sS -L --max-time 20 -o /dev/null -w '%{http_code}' "$dead" 2>/dev/null || echo "000")
  if [ "$code" = "404" ]; then
    printf '  gone  %-34s %s\n' "$dead" "$code"
  else
    printf '  LIVE  %-34s %s (expected 404)\n' "$dead" "$code"
    note_fail
  fi
done

# The hub is published by CI from NekoBite/TrilumiWebsite, so this only
# confirms it is up — including its beacon, which is what makes the
# "card -> academy -> game" hop visible at all.
verify "academy (hub)"     "https://academy.trilumi.xyz/"         || note_fail
verify "beacon @ academy"  "https://academy.trilumi.xyz/_e/p.gif" || note_fail

say ""
if [ "$FAILED" = "1" ]; then
  say "one or more checks failed — see above."
  exit 1
fi
say "all checks passed."
