#!/usr/bin/env bash
#
# Add the TLS listener block to a vhost that is missing one.
#
#   bash brand/wire-vhssl.sh createworld.trilumi.xyz
#
# Why this exists
# ---------------
# The `TLS certificate` workflow does this step itself — but it does it *after*
# `acme.sh --install-cert`, whose `--reloadcmd "systemctl restart lsws"` can
# report `Job for lshttpd.service canceled.` and make acme.sh exit non-zero.
# The workflow's remote script runs under `set -e`, so it quits before reaching
# the vhssl step.
#
# The resulting state is genuinely misleading, and it happened on 2026-10-03:
# the certificate is issued and installed, lsws is healthy, http works, and
# https still serves the server's default certificate (CN=<hostname>) — because
# the vhost has no TLS block at all. The workflow shows a red X on a step called
# "Issue and install", which reads as "the certificate failed", while the
# certificate is sitting on disk.
#
# So: when that run goes red at the restart, run this.
#
# lsws serves every game on this box plus academy. A restart is never one site's
# business, so this finishes by checking all of them.
set -euo pipefail

HOST_ALIAS="${HOST_ALIAS:-hetu}"
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  echo "usage: bash brand/wire-vhssl.sh <domain>" >&2
  exit 2
fi

echo "==> $DOMAIN"

# ---------------------------------------------------------------- server side
ssh -o ConnectTimeout=30 "$HOST_ALIAS" "bash -s '$DOMAIN'" <<'REMOTE'
set -euo pipefail
DOMAIN="$1"
VHOST="/usr/local/lsws/conf/vhosts/$DOMAIN/vhost.conf"
LIVE="/etc/letsencrypt/live/$DOMAIN"

[ -f "$VHOST" ] || { echo "!! no vhost.conf at $VHOST" >&2; exit 1; }
[ -f "$LIVE/fullchain.pem" ] || { echo "!! no certificate at $LIVE — run the TLS workflow first" >&2; exit 1; }

if grep -qE '^[[:space:]]*vhssl' "$VHOST"; then
  echo "    vhost already has a vhssl block; nothing to do."
  exit 0
fi

BACKUP="$VHOST.bak-$(date +%s)"
cp -a "$VHOST" "$BACKUP"
echo "    backed up -> $BACKUP"

{
  printf '\n'
  printf 'vhssl  {\n'
  printf '  keyFile                 %s/privkey.pem\n'   "$LIVE"
  printf '  certFile                %s/fullchain.pem\n' "$LIVE"
  printf '  certChain               1\n'
  printf '  sslProtocol             24\n'
  printf '  enableECDHE             1\n'
  printf '  renegProtection         1\n'
  printf '  sslSessionCache         1\n'
  printf '  enableSpdy              15\n'
  printf '  enableStapling          1\n'
  printf '  ocspRespMaxAge          86400\n'
  printf '}\n'
} >> "$VHOST"
echo "    appended vhssl block"

systemctl restart lsws
sleep 2
echo "    lsws: $(systemctl is-active lsws)"
REMOTE

# ---------------------------------------------------------------- verify
echo ""
echo "==> certificate now served for $DOMAIN"
echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -dates 2>/dev/null || echo "    !! no certificate presented"

# The restart was global. If a site did not come back that matters more than
# this domain, so check rather than reporting a tidy success.
echo ""
echo "==> family health after the restart"
fail=0
for h in trilumi.xyz www.trilumi.xyz academy.trilumi.xyz \
         artofwar.trilumi.xyz hetu.trilumi.xyz whereami.trilumi.xyz \
         rebuild.trilumi.xyz rebuild2.trilumi.xyz aihammer.trilumi.xyz \
         createworld.trilumi.xyz; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://$h/" 2>/dev/null)
  if [ "$code" = "200" ]; then
    printf '    ok    %-24s %s\n' "$h" "$code"
  else
    printf '    FAIL  %-24s %s\n' "$h" "${code:-no response}"
    fail=1
  fi
done

echo ""
if [ "$fail" = "1" ]; then
  echo "at least one site did not come back — investigate before walking away." >&2
  exit 1
fi
echo "done: $DOMAIN wired, all sites healthy."
