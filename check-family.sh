#!/usr/bin/env bash
#
# One line per game: local bytes, the bytes git stores, the bytes the server
# actually sends, and how many CR characters are in the local file.
#
#   bash brand/check-family.sh
#
# Why this exists
# ---------------
# "Compare the live size with the local size" is the first thing anyone checks
# when a deploy looks like it did not land. It is only a useful check if the
# three numbers are expected to be equal — and on 2026-10-03 they were not:
# thor-hammer, hetu-luoshu and whereami all had working trees a few thousand
# bytes larger than their own git blobs, entirely in CR characters, because
# PortableGit sets `core.autocrlf=true` in its system config and two of the
# brand modules and four of the generators were writing CRLF. Git normalises on
# commit, so `git status` reported the tree clean the whole time.
#
# The result was a diagnostic that reported a false negative for three games
# that were serving perfectly. That is worse than having no diagnostic.
#
# The invariant this asserts: local == blob == live, and CR == 0.
#
# CR is counted with `tr`, never `grep -c $'\r'`. On Git Bash an unquoted
# `$'\r'` collapses to an empty pattern, so grep counts every line and reports a
# pure-LF file as "134 CRLF lines out of 134" — the opposite of the truth.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# label | repo dir | path inside it | live url
GAMES=(
  "aihammer|thor-hammer|index.html|https://aihammer.trilumi.xyz/"
  "artofwar|_gh/sunzi-13|index.html|https://artofwar.trilumi.xyz/"
  "hetu|_gh/hetu-luoshu|index.html|https://hetu.trilumi.xyz/"
  "whereami|_gh/coordinate-thinking-game|index.html|https://whereami.trilumi.xyz/"
  "rebuild|_gh/rebuild-america|1861/index.html|https://rebuild.trilumi.xyz/"
  "rebuild2|_gh/rebuild-america|1933/index.html|https://rebuild2.trilumi.xyz/"
  "createworld|_gh/create-world|index.html|https://createworld.trilumi.xyz/"
)

cr_of() { tr -dc '\r' < "$1" | wc -c | tr -d ' '; }

printf '\n%-13s %10s %10s %10s %5s   %s\n' \
       game local blob live CR verdict
printf '%s\n' "----------------------------------------------------------------------------"

fails=0
live_ok=0
for row in "${GAMES[@]}"; do
  IFS='|' read -r label repo rel url <<<"$row"
  file="$ROOT/$repo/$rel"

  if [ ! -f "$file" ]; then
    printf '%-13s %10s %10s %10s %5s   %s\n' "$label" - - - - "MISSING $file"
    fails=$((fails + 1)); continue
  fi

  local_n=$(wc -c < "$file")
  blob_n=$(git -C "$ROOT/$repo" show "HEAD:$rel" 2>/dev/null | wc -c)
  cr=$(cr_of "$file")

  # curl still writes the -w format when it fails, so its exit code is the only
  # reliable signal. Appending `|| echo 0` instead produced "00" — which is not
  # "0", so an unreachable host fell through to "deploy did not land?" and this
  # script accused a site that simply has no DNS record yet.
  live_n=$(curl -sS -L --max-time 25 -o /dev/null -w '%{size_download}' \
             "$url" 2>/dev/null)
  if [ $? -ne 0 ]; then live_n=""; fi

  if [ -z "$live_n" ] || [ "$live_n" = "0" ]; then live_s="no-dns"; else live_s="$live_n"; fi

  verdict="ok"
  if [ "$cr" != "0" ]; then
    verdict="CRLF — run the LF normaliser (see skill trap 16)"; fails=$((fails + 1))
  elif [ "$local_n" != "$blob_n" ]; then
    verdict="local != blob — uncommitted change?"; fails=$((fails + 1))
  elif [ -n "$live_n" ] && [ "$live_n" != "0" ] && [ "$live_n" != "$local_n" ]; then
    verdict="live != local — deploy did not land?"; fails=$((fails + 1))
  elif [ -z "$live_n" ] || [ "$live_n" = "0" ]; then
    verdict="not deployed yet (DNS)"
  else
    live_ok=$((live_ok + 1))
  fi

  printf '%-13s %10s %10s %10s %5s   %s\n' \
         "$label" "$local_n" "$blob_n" "$live_s" "$cr" "$verdict"
done

printf '%s\n' "----------------------------------------------------------------------------"
# Say exactly what was proven. A game with no DNS record has local == blob
# confirmed and nothing more; calling that "live == local" would be the same
# kind of unearned claim this whole script exists to stop making.
if [ "$fails" = "0" ]; then
  echo "local == blob for all ${#GAMES[@]} games, all LF; $live_ok of them also confirmed live"
else
  echo "$fails game(s) need attention (see verdict column)"
fi
echo

exit 0
