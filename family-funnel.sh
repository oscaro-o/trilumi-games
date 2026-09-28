#!/usr/bin/env bash
#
# trilumi · game family — funnel report
#
# Reads the beacon out of the OpenLiteSpeed access logs of every game domain
# and reports the family as one channel. The beacon only fires when JavaScript
# runs, so crawlers never enter the numbers.
#
#   bash brand/family-funnel.sh                      all time
#   bash brand/family-funnel.sh 2026-09-01           from that day
#   bash brand/family-funnel.sh 2026-09-01 2026-09-30   a range
#   bash brand/family-funnel.sh --csv yesterday      one CSV row per game, for cron
#
# Meant to run on the server:
#   ssh hetu 'bash -s' < brand/family-funnel.sh
#
# It generalises hetu-funnel.sh, which only knew about one game. Every beacon
# event now carries g=<game>, so one pass per domain answers for the family.
#
set -euo pipefail

CSV=0
if [ "${1:-}" = "--csv" ]; then
  CSV=1; shift
  DAY="${1:-yesterday}"
  [ "$DAY" = "yesterday" ] && DAY="$(date -d yesterday +%F)"
  [ "$DAY" = "today" ] && DAY="$(date +%F)"
  FROM="$DAY"; TO="$DAY"
else
  FROM="${1:-}"; TO="${2:-}"
fi

# domain:slug — the slug names the game in the report
DOMAINS="
trilumi.xyz:games-hub
aihammer.trilumi.xyz:thor-hammer
hetu.trilumi.xyz:hetu-luoshu
artofwar.trilumi.xyz:sunzi-13
whereami.trilumi.xyz:whereami
"

# One awk program, used once per domain. It emits: sessions new share clicks
# finishes languages.
read -r -d '' AWK <<'AWK' || true
function qval(q, key,   m) {
  if (match(q, "[?&]" key "=[^&]*")) {
    m = substr(q, RSTART, RLENGTH)
    sub("^[?&]" key "=", "", m)
    gsub(/%3A/, ":", m); gsub(/%2F/, "/", m); gsub(/%20/, " ", m); gsub(/\+/, " ", m)
    return m
  }
  return ""
}
BEGIN {
  split("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec", mn, " ")
  for (i = 1; i <= 12; i++) M[mn[i]] = sprintf("%02d", i)
}
/\/_e\/p\.gif\?/ {
  if (!match($0, /\/_e\/p\.gif\?[^ "]*/)) next
  q = substr($0, RSTART, RLENGTH); sub(/^\/_e\/p\.gif/, "", q)

  ev = qval(q, "e"); sid = qval(q, "s")
  if (ev == "" || sid == "") next

  if (!match($0, /\[[0-9][0-9]\/[A-Za-z][a-z][a-z]\/[0-9]{4}:[0-9:]{8}/)) next
  ts = substr($0, RSTART + 1, RLENGTH - 1)
  split(ts, a, ":"); split(a[1], dt, "/")
  date = dt[3] "-" M[dt[2]] "-" dt[1]
  if (FROM != "" && date < FROM) next
  if (TO   != "" && date > TO)   next

  if (ev == "load") {
    if (!(sid in ls)) {
      ls[sid] = 1; sess++
      if (qval(q, "n") == "1") nv++
      l = qval(q, "l"); if (l != "") lg[l]++
      r = qval(q, "r"); if (r == "") r = "unknown"
      rf[r]++
    }
  }
  if (ev == "share")  sh++
  if (ev == "click")  clk++
  if (ev == "done")   done++
  if (ev == "lang")   langswitch++
}
END {
  order = "hans hant en zh zh-Hans zh-Hant other"
  s = ""
  for (i = 1; i <= split(order, o, " "); i++) {
    if (o[i] in lg) { s = s (s == "" ? "" : "/") o[i] }
    delete lg[o[i]]
  }
  for (k in lg) s = s (s == "" ? "" : "/") k

  printf "%d %d %d %d %d %d %s", sess + 0, nv + 0, sh + 0, clk + 0, done + 0, langswitch + 0, (s == "" ? "-" : s)
  printf "\n"
  for (k in rf) printf "REF\t%s\t%d\n", k, rf[k]
}
AWK

label() {
  case "$1" in
    games-hub)   echo "Games hub" ;;
    thor-hammer) echo "Thor's Hammer" ;;
    hetu-luoshu) echo "Lo Shu" ;;
    sunzi-13)    echo "Art of War" ;;
    whereami)    echo "Where Am I" ;;
    *)           echo "$1" ;;
  esac
}

logs_for() {
  local d="$1" out="" f
  for f in /home/"$d"/logs/"$d".access_log*; do
    [ -f "$f" ] && out="$out $f"
  done
  printf '%s' "$out"
}

found_any=0

if [ "$CSV" = "1" ]; then
  printf 'date,game,sessions,new,share,hub_clicks,finishes\n'
  for pair in $DOMAINS; do
    d="${pair%%:*}"; slug="${pair##*:}"
    acc="$(logs_for "$d")"
    [ -z "$acc" ] && continue
    found_any=1
    # shellcheck disable=SC2086
    row=$(zcat -f $acc 2>/dev/null | awk -v FROM="$FROM" -v TO="$TO" -v CSV=1 -f <(printf '%s\n' "$AWK") | head -1)
    set -- $row
    printf '%s,%s,%s,%s,%s,%s,%s\n' "$DAY" "$slug" "${1:-0}" "${2:-0}" "${3:-0}" "${4:-0}" "${5:-0}"
  done
  [ "$found_any" = "0" ] && { echo "no logs found" >&2; exit 1; }
  exit 0
fi

printf '\ntrilumi · game family\n'
printf '================================================================\n'
if [ -n "$FROM" ]; then printf 'window: %s -> %s\n' "$FROM" "${TO:-now}"; else printf 'window: all time\n'; fi
printf '\n'

printf '%-16s %9s %6s %6s %7s %7s  %s\n' "GAME" "sessions" "new" "share" "hub-clk" "finish" "languages"
printf '%s\n' "--------------------------------------------------------------------------------"

TOTAL_S=0; TOTAL_N=0; TOTAL_SH=0; TOTAL_C=0; TOTAL_D=0
for pair in $DOMAINS; do
  d="${pair%%:*}"; slug="${pair##*:}"
  acc="$(logs_for "$d")"
  if [ -z "$acc" ]; then
    printf '%-16s %9s\n' "$(label "$slug")" "no logs"
    continue
  fi
  found_any=1
  # shellcheck disable=SC2086
  out=$(zcat -f $acc 2>/dev/null | awk -v FROM="$FROM" -v TO="$TO" -f <(printf '%s\n' "$AWK"))
  row=$(printf '%s\n' "$out" | head -1)
  set -- $row
  printf '%-16s %9s %6s %6s %7s %7s  %s\n' \
    "$(label "$slug")" "${1:-0}" "${2:-0}" "${3:-0}" "${4:-0}" "${5:-0}" "${7:--}"
  TOTAL_S=$(( TOTAL_S + ${1:-0} ))
  TOTAL_N=$(( TOTAL_N + ${2:-0} ))
  TOTAL_SH=$(( TOTAL_SH + ${3:-0} ))
  TOTAL_C=$(( TOTAL_C + ${4:-0} ))
  TOTAL_D=$(( TOTAL_D + ${5:-0} ))

  # where this game's visitors came from — the line that shows whether the
  # games are feeding each other or sitting in isolation
  printf '%s\n' "$out" | awk -F'\t' '$1=="REF" && $3>0 {
      printf "%-16s   from %-28s %s\n", "", $2, $3
    }'
done

printf '%s\n' "--------------------------------------------------------------------------------"
printf '%-16s %9s %6s %6s %7s %7s\n' "FAMILY" "$TOTAL_S" "$TOTAL_N" "$TOTAL_SH" "$TOTAL_C" "$TOTAL_D"

if [ "$found_any" = "0" ]; then
  printf '\nNo beacon data in range.\n'
  printf 'Check 1: are the patched games deployed?  Check 2: is the log path right?\n'
  exit 1
fi

cat <<'NOTES'

Notes
  sessions    distinct session ids that fired a load
  new         first-ever visit from that browser
  share       share-card opens
  hub-clk     clicks from the hub out to a game
  finish      games reported as finished
  from ...    referrer host, deduped per session. "self" is an internal nav;
              another game's domain means the family is feeding itself.

The hub's own row counts arrivals. A game row showing "from trilumi.xyz"
is traffic the hub sent it — that number is the hub earning its keep.
NOTES
