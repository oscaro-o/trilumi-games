#!/usr/bin/env bash
#
# Report (and optionally fix) the OpenLiteSpeed listener maps for a subdomain.
#
#   bash brand/check-vhost-maps.sh createworld.trilumi.xyz          # report only
#   bash brand/check-vhost-maps.sh createworld.trilumi.xyz --fix    # insert the missing maps
#
# Why this exists
# ---------------
# A subdomain has to be mapped in THREE listeners in httpd_config.conf —
# `Default`, `SSL` and `SSL IPv6`. CyberPanel's `createWebsite` writes only the
# first one. The result is a site that answers perfectly on http:// and fails on
# https:// for a reason that looks like a broken certificate and is not: the SSL
# listener has no map, so the request never reaches the vhost. On 2026-10-03 this
# is exactly what happened to createworld.trilumi.xyz.
#
# Two traps this script exists to avoid repeating:
#   · the parse has to be done in Python, not awk. The obvious awk uses the
#     3-argument `match()`, which is gawk-only — on this box it silently returns
#     empty listener names and reports a healthy vhost as broken.
#   · the count is by LINE, not by substring. A map line names the domain twice
#     (`map <domain> <domain>`), so counting raw occurrences double-counts.
#
set -euo pipefail

HOST_ALIAS="${HOST_ALIAS:-hetu}"
DOMAIN="${1:-}"
FIX=0
[ "${2:-}" = "--fix" ] && FIX=1

if [ -z "$DOMAIN" ]; then
  printf 'usage: bash brand/check-vhost-maps.sh <domain> [--fix]\n' >&2
  exit 2
fi

# The remote script's own exit code is the answer (0 = all three listeners
# mapped), so it is captured rather than piped — a pipe would report tee's
# status instead. Nothing is written to a temp file: this box's sandbox refuses
# to delete paths that carry a drive prefix, and a stray `.out` file left behind
# is a worse failure mode than the one the file was there to prevent.
set +e
out=$(ssh -o ConnectTimeout=30 "$HOST_ALIAS" "/usr/bin/python3 - '$DOMAIN' '$FIX'" <<'PY'
import io, re, sys, shutil, time

dom = sys.argv[1]
fix = sys.argv[2] == '1'
path = '/usr/local/lsws/conf/httpd_config.conf'
mapline = '  map                     %s %s' % (dom, dom)

lines = io.open(path, encoding='utf-8').read().splitlines(True)

cur, blocks, order = None, {}, []
for i, ln in enumerate(lines):
    if ln.strip() and not ln[0].isspace():
        m = re.match(r'^listener\s+(.+?)\s*\{\s*$', ln)
        cur = m.group(1) if m else None
        if cur:
            blocks[cur] = {'last_map': None, 'has': False}
            order.append(cur)
    if cur and ln.strip().startswith('map '):
        if dom in ln:
            blocks[cur]['has'] = True
        blocks[cur]['last_map'] = i

missing = [n for n in order if not blocks[n]['has']]
for n in order:
    if blocks[n]['has']:
        print('  ok    %-22s mapped' % n)
    else:
        print('  FAIL  %-22s NO MAP  <- https would silently not reach this vhost' % n)

if not missing:
    print('  %s: mapped in all %d listeners' % (dom, len(order)))
    sys.exit(0)

if not fix:
    print()
    print('  %s is missing from %d of %d listeners. Re-run with --fix.' % (dom, len(missing), len(order)))
    sys.exit(1)

for n in missing:
    if blocks[n]['last_map'] is None:
        sys.exit('  !! listener %s has no map line to anchor to' % n)

bak = path + '.bak-maps-' + str(int(time.time()))
shutil.copy2(path, bak)
print('  backup: %s' % bak)
for idx, name in sorted(((blocks[n]['last_map'], n) for n in missing), reverse=True):
    lines.insert(idx + 1, mapline + '\n')
io.open(path, 'w', encoding='utf-8', newline='').write(''.join(lines))

after = io.open(path, encoding='utf-8').read().splitlines()
maps = sum(1 for l in after if l.strip().startswith('map ') and dom in l)
vh = sum(1 for l in after if l.startswith('virtualHost ') and dom in l)
print('  now: %d map lines, %d virtualHost block(s)' % (maps, vh))
assert maps == len(order), 'expected %d map lines, got %d' % (len(order), maps)
assert vh == 1, 'expected exactly 1 virtualHost block, got %d' % vh
print('  INSERTED')
PY
)
rc=$?
set -e
printf '%s\n' "$out"

# only bounce the web server when something actually changed — restarting lsws
# is global and drops every other site's connections for a moment
if [ "$FIX" = "1" ] && printf '%s' "$out" | grep -q '  INSERTED'; then
  printf '  restarting lsws... '
  ssh -o ConnectTimeout=30 "$HOST_ALIAS" 'systemctl restart lsws && sleep 3 && systemctl is-active lsws'
  printf '  re-run without --fix to confirm.\n'
fi
exit "$rc"
