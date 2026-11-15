#!/bin/sh
# Picks the Caddy configuration. Default: plain HTTP. FANFARE_HOST opts in to HTTPS.
set -eu

if [ -z "${FANFARE_HOST:-}" ]; then
  cfg=/etc/caddy/Caddyfile
elif [ "${FANFARE_ACME:-}" = "1" ]; then
  cfg=/etc/caddy/Caddyfile.acme
  echo "fanfare: FANFARE_ACME=1: requesting a public certificate for ${FANFARE_HOST} from Let's Encrypt." >&2
else
  cfg=/etc/caddy/Caddyfile.https
  cat >&2 <<MSG
fanfare: FANFARE_HOST is set, so HTTPS is on at https://${FANFARE_HOST}:8443 with a local
certificate authority (CA) created by Caddy. Read this first:
  1. Phones that trust this certificate trust everything signed with this CA's key. Caddy's CA
     is not name-constrained to local addresses, so a phone that trusts it trusts certificates
     for ANY site this key signs, not only your Fanfare. Only trust it on devices you control.
  2. The CA key is stored unencrypted in the Docker volume "caddy-data" on this computer. Anyone
     who can read that volume could create fake certificates. Only use this on a computer you trust.
  3. Remove it when you no longer need it: 'docker compose down -v' deletes the volume (and with
     it the CA), and remove the certificate on each phone (Android: Settings > Security >
     Encryption & credentials > User credentials; iPhone: Settings > General > VPN & Device
     Management > profile > Remove).
  4. Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or the microphone.
  5. Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with the
     speakers. No certificate is needed for those.
MSG
fi

exec caddy run --config "$cfg" --adapter caddyfile
