#!/usr/bin/env bash
#
# Deploy the whole game family: the hub page, the four patched games, and the
# beacon every one of them reports to.
#
#   bash brand/deploy-family.sh              deploy everything
#   bash brand/deploy-family.sh --check      show what would move, touch nothing
#   bash brand/deploy-family.sh hub          deploy only the hub
#   bash brand/deploy-family.sh aihammer     deploy only one game
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
    /home/*/public_html*) : ;;
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

# verify a URL, writing to a real file — curl on Windows errors on /dev/null
verify() {
  local label="$1" url="$2" want_code="${3:-200}"
  local tmp=".deploy-check.tmp" code size
  code=$(curl -sS -L --max-time 25 -o "$tmp" -w '%{http_code}' "$url" 2>/dev/null || echo "000")
  size=$(wc -c < "$tmp" 2>/dev/null || echo 0)
  rm -f "$tmp"
  if [ "$code" = "$want_code" ]; then
    printf '  ok    %-42s %s  %s bytes\n' "$label" "$code" "$size"
  else
    printf '  FAIL  %-42s %s (wanted %s)\n' "$label" "$code" "$want_code"
    return 1
  fi
}

FAILED=0
note_fail() { FAILED=1; }

deploy_game() {
  local slug="$1" domain="$2" srcdir="$3"
  title "$slug  ·  $domain"
  push "$slug" "/home/$domain/public_html" "$srcdir" index.html
  push "beacon" "/home/$domain/public_html/_e" brand/beacon p.gif
}

# ---------------------------------------------------------------- the hub

if want hub; then
  title "hub  ·  trilumi.xyz/games/"
  push "games hub" "/home/trilumi.xyz/public_html/games" brand/games index.html og.png
  push "beacon"    "/home/trilumi.xyz/public_html/_e"   brand/beacon p.gif
fi

# ---------------------------------------------------------------- the games

if want aihammer; then deploy_game aihammer aihammer.trilumi.xyz thor-hammer; fi
if want artofwar; then deploy_game artofwar artofwar.trilumi.xyz _gh/sunzi-13; fi
if want whereami; then deploy_game whereami whereami.trilumi.xyz _gh/coordinate-thinking-game; fi

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

if want hub; then
  verify "hub page"          "https://trilumi.xyz/games/"         || note_fail
  verify "hub og.png"        "https://trilumi.xyz/games/og.png"   || note_fail
  verify "beacon @ trilumi"  "https://trilumi.xyz/_e/p.gif"       || note_fail
fi

if want aihammer; then
  verify "aihammer"          "https://aihammer.trilumi.xyz/"        || note_fail
  verify "beacon @ aihammer" "https://aihammer.trilumi.xyz/_e/p.gif" || note_fail
fi

if want artofwar; then
  verify "artofwar"          "https://artofwar.trilumi.xyz/"         || note_fail
  verify "beacon @ artofwar" "https://artofwar.trilumi.xyz/_e/p.gif" || note_fail
fi

if want whereami; then
  verify "whereami"          "https://whereami.trilumi.xyz/"         || note_fail
  verify "beacon @ whereami" "https://whereami.trilumi.xyz/_e/p.gif" || note_fail
fi

if want hetu; then
  verify "hetu-luoshu"       "https://hetu.trilumi.xyz/"         || note_fail
  verify "beacon @ hetu"     "https://hetu.trilumi.xyz/_e/p.gif" || note_fail
fi

say ""
if [ "$FAILED" = "1" ]; then
  say "one or more checks failed — see above."
  exit 1
fi
say "all checks passed."
