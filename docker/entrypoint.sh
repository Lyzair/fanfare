#!/bin/sh
# Picks the Caddy configuration. Default: plain HTTP on 8080, no certificate of any kind.
# HTTPS is opt-in: FANFARE_HOST + certificates made by `fanfare-local.py --issue-certs` (the same
# name-constrained local CA as `fanfare-local --lan --https`) + FANFARE_ACCEPT_CA_RISK=1.
set -eu

cfg=/etc/caddy/Caddyfile
certs=/certs

fail() { echo "fanfare: $*" >&2; exit 1; }

if [ -n "${FANFARE_HOST:-}" ]; then
  # Hostname or IPv4 only: the value ends up in the Caddy configuration.
  printf '%s' "$FANFARE_HOST" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$' \
    && ! printf '%s' "$FANFARE_HOST" | grep -q '\.\.' \
    || fail "FANFARE_HOST='$FANFARE_HOST' is not a host name or IPv4 address (letters, digits, dots and hyphens only, for example fanfare.local or 192.168.1.20)."
fi

if [ -z "${FANFARE_HOST:-}" ]; then
  :
elif [ "${FANFARE_ACME:-}" = "1" ]; then
  cfg=/etc/caddy/Caddyfile.acme
  echo "fanfare: FANFARE_ACME=1: requesting a public certificate for ${FANFARE_HOST} from Let's Encrypt (the one outgoing connection)." >&2
else
  cat >&2 <<'MSG'
fanfare: FANFARE_HOST is set, so you asked for HTTPS. That needs a local certificate authority (CA) on the computer that made the certificates (fanfare-local.py --issue-certs). Read this first:
  1. Phones that trust this certificate trust everything signed with this laptop's key. Thanks to name constraints this is limited to local network addresses, but that includes routers, NAS drives and smart-home devices on that Wi-Fi.
  2. The key is stored unencrypted on this computer. Anyone with access to this computer or user account could create fake certificates for local devices. Only use this on a computer you trust.
  3. Remove it when you no longer need it: run start-fanfare with --forget-ca on the laptop (or: python3 fanfare-local.py --forget-ca), and remove the certificate on each phone (Android: Settings > Security > Encryption & credentials > User credentials; iPhone: Settings > General > VPN & Device Management > profile > Remove).
  4. Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or the microphone.
  5. Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with the speakers. No certificate is needed for those.
MSG
  if [ "${FANFARE_ACCEPT_CA_RISK:-}" != "1" ]; then
    echo "fanfare: FANFARE_ACCEPT_CA_RISK=1 is not set, so only plain HTTP is served. To accept the risks above, set FANFARE_ACCEPT_CA_RISK=1." >&2
    cfg=/etc/caddy/Caddyfile
  else
    for f in server.crt server.key hosts.txt expires.txt; do
      [ -r "$certs/$f" ] || fail "$certs/$f is missing or unreadable. Make the certificates first: python3 scripts/fanfare-local.py --issue-certs ./certs --name $FANFARE_HOST (see docs/self-hosting.md), and mount them with compose.https.yaml."
    done
    grep -qixF "$FANFARE_HOST" "$certs/hosts.txt" \
      || fail "the certificate does not cover FANFARE_HOST=$FANFARE_HOST. It covers: $(tr '\n' ' ' < "$certs/hosts.txt"). Issue it again with --name/--ip for the address phones use."
    now=$(date +%s)
    exp=$(tr -dc '0-9' < "$certs/expires.txt")
    [ -n "$exp" ] || fail "$certs/expires.txt is not valid. Issue the certificates again."
    [ "$exp" -gt "$now" ] || fail "the certificate has expired. Issue it again with fanfare-local.py --issue-certs."
    [ $((exp - now)) -ge 2592000 ] || echo "fanfare: WARNING: the certificate expires in less than 30 days. Issue it again with fanfare-local.py --issue-certs." >&2
    cfg=/etc/caddy/Caddyfile.https
    echo "fanfare: HTTPS on port 8443 for ${FANFARE_HOST}. Remove the CA again: fanfare-local.py --forget-ca, and the certificate on each phone." >&2
  fi
fi

exec caddy run --config "$cfg" --adapter caddyfile
