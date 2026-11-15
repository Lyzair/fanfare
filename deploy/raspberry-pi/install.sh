#!/usr/bin/env bash
# Fanfare club-house appliance installer for Raspberry Pi OS / Debian (bookworm or newer).
#
#   sudo ./deploy/raspberry-pi/install.sh [--dry-run] [--no-update] [--https [--accept-ca-risk]] [--image-tar FILE]
#
#   --dry-run          print every step and the files it would write; change nothing
#   --no-update        do not install the weekly update timer
#   --https            opt in to HTTPS with a local certificate authority (prints the risks, asks you to
#                      type yes; --accept-ca-risk is the same yes for scripts). Without it: plain HTTP.
#   --image-tar FILE   load a ready-made image (docker save) instead of building it on the Pi
#
# Safe to run again (idempotent). Docker comes from the distribution's own repositories (no piped download scripts).
set -euo pipefail

DRY=0
UPDATE=1
HTTPS=0
ACCEPT=0
IMAGE_TAR=""

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --no-update) UPDATE=0 ;;
    --https) HTTPS=1 ;;
    --accept-ca-risk) ACCEPT=1 ;;
    --image-tar)
      [ $# -ge 2 ] || { echo "install: --image-tar needs a file name" >&2; exit 2; }
      IMAGE_TAR=$2
      shift
      ;;
    -h | --help) usage; exit 0 ;;
    *) echo "install: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PI_DIR="$REPO/deploy/raspberry-pi"
STATE=/var/lib/fanfare
HOSTNAME_WANTED=fanfare

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

# run CMD...: print it, and run it unless --dry-run
run() {
  if [ "$DRY" = 1 ]; then printf '  + %s\n' "$*"; else "$@"; fi
}

# put_file PATH MODE: the text on stdin becomes the file (only rewritten when it changed)
put_file() {
  local path=$1 mode=$2 tmp
  tmp=$(mktemp)
  cat > "$tmp"
  if [ "$DRY" = 1 ]; then
    printf '  + write %s (mode %s):\n' "$path" "$mode"
    sed 's/^/      | /' "$tmp"
    rm -f "$tmp"
    return 0
  fi
  if [ -f "$path" ] && cmp -s "$tmp" "$path"; then
    say "  unchanged: $path"
    rm -f "$tmp"
  else
    install -D -m "$mode" "$tmp" "$path"
    rm -f "$tmp"
    say "  wrote: $path"
  fi
}

if [ "$DRY" = 1 ]; then
  say "DRY RUN: nothing is changed. These are the steps a real run would do."
elif [ "$(id -u)" -ne 0 ]; then
  echo "install: run this as root (sudo $0 ...)" >&2
  exit 1
fi

# ---- the risk text (the same words as fanfare-local.py and docs/self-hosting.md) ---------------------
print_risks() {
  cat <<'RISKS'
HTTPS on the LAN needs a local certificate authority (CA) on this Pi. Read this first:
  1. Phones that trust this certificate trust everything signed with this laptop's key. Thanks to name constraints this is limited to local network addresses, but that includes routers, NAS drives and smart-home devices on that Wi-Fi.
  2. The key is stored unencrypted on this computer. Anyone with access to this computer or user account could create fake certificates for local devices. Only use this on a computer you trust.
  3. Remove it when you no longer need it: run start-fanfare with --forget-ca on the laptop (or: python3 fanfare-local.py --forget-ca), and remove the certificate on each phone (Android: Settings > Security > Encryption & credentials > User credentials; iPhone: Settings > General > VPN & Device Management > profile > Remove).
  4. Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or the microphone.
  5. Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with the speakers. No certificate is needed for those.
(On this Pi the CA lives in /var/lib/fanfare/ca; "--forget-ca" is: sudo python3 scripts/fanfare-local.py --config-dir /var/lib/fanfare/ca --forget-ca)
RISKS
}

if [ "$HTTPS" = 1 ]; then
  step "HTTPS was requested (opt-in)"
  print_risks
  if [ "$ACCEPT" = 1 ]; then
    say "--accept-ca-risk given: creating the certificate authority."
  else
    reply=""
    printf 'Type yes to create a local certificate authority on this Pi: '
    read -r reply || true
    if [ "$reply" != "yes" ]; then
      say "No certificate authority was created. Nothing was installed. Run again without --https for plain HTTP."
      exit 1
    fi
  fi
fi

# ---- 1. packages ------------------------------------------------------------------------------------
step "1. Packages: apt-get update, unattended-upgrades, docker.io, docker compose, avahi-daemon"
export DEBIAN_FRONTEND=noninteractive
run apt-get update
if [ "$DRY" = 1 ]; then
  say "  (compose package: docker-compose-v2 where the distribution has it, otherwise docker-compose)"
  COMPOSE_PKG=docker-compose-v2
elif apt-cache policy docker-compose-v2 2>/dev/null | grep -q 'Candidate: [^(]'; then
  COMPOSE_PKG=docker-compose-v2
else
  COMPOSE_PKG=docker-compose
fi
run apt-get install -y --no-install-recommends unattended-upgrades apt-listchanges ca-certificates python3 git \
  docker.io "$COMPOSE_PKG" avahi-daemon
if [ "$HTTPS" = 1 ]; then run apt-get install -y --no-install-recommends openssl; fi

# ---- 2. automatic updates ---------------------------------------------------------------------------
step "2. Automatic security and stable updates (unattended-upgrades), reboot window 04:00"
put_file /etc/apt/apt.conf.d/20auto-upgrades 644 <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
put_file /etc/apt/apt.conf.d/52fanfare-unattended-upgrades 644 <<'EOF'
// Written by Fanfare's install.sh. Security and stable updates of Debian and Raspberry Pi OS.
Unattended-Upgrade::Origins-Pattern {
  "origin=Debian,codename=${distro_codename},label=Debian";
  "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
  "origin=Debian,codename=${distro_codename}-updates,label=Debian";
  "origin=Raspberry Pi Foundation,codename=${distro_codename}";
  "origin=Raspbian,codename=${distro_codename}";
};
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Remove-New-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
EOF
run systemctl enable --now unattended-upgrades

# ---- 3. SD-card wear: small logs ---------------------------------------------------------------------
step "3. Small logs for the SD card: journald size cap, Docker log driver local"
put_file /etc/systemd/journald.conf.d/fanfare.conf 644 <<'EOF'
[Journal]
SystemMaxUse=50M
RuntimeMaxUse=20M
MaxRetentionSec=1month
EOF
if [ "$DRY" = 1 ]; then
  say '  + write /etc/docker/daemon.json: "log-driver": "local", "log-opts": {"max-size": "2m", "max-file": "2"} (merged into an existing file)'
else
  mkdir -p /etc/docker
  python3 - <<'PY'
import json, os
p = '/etc/docker/daemon.json'
d = json.load(open(p)) if os.path.exists(p) and os.path.getsize(p) else {}
want = {'log-driver': 'local', 'log-opts': {'max-size': '2m', 'max-file': '2'}}
if any(d.get(k) != v for k, v in want.items()):
    d.update(want)
    json.dump(d, open(p, 'w'), indent=2)
    open(p, 'a').write('\n')
    print('  wrote: ' + p)
else:
    print('  unchanged: ' + p)
PY
fi
run systemctl restart systemd-journald
run systemctl enable --now docker
run systemctl restart docker

# ---- 4. fanfare.local ------------------------------------------------------------------------------
step "4. Name on the network: avahi-daemon answers fanfare.local"
if [ "$DRY" = 1 ]; then
  say "  + (set the host name to ${HOSTNAME_WANTED} if it is something else: hostnamectl set-hostname ${HOSTNAME_WANTED})"
elif [ "$(hostname)" != "$HOSTNAME_WANTED" ]; then
  say "  The host name is '$(hostname)', so phones reach it as $(hostname).local. Setting it to ${HOSTNAME_WANTED}."
  hostnamectl set-hostname "$HOSTNAME_WANTED" || say "  could not set the host name; use $(hostname).local instead of fanfare.local"
fi
run systemctl enable --now avahi-daemon

# ---- 5. HTTPS (opt-in only) --------------------------------------------------------------------------
ENV_FILE="$PI_DIR/.env"
if [ "$HTTPS" = 1 ]; then
  step "5. HTTPS: certificate from the name-constrained local CA (fanfare-local.py --issue-certs)"
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  LAN_IP=${LAN_IP:-192.168.1.20}
  run install -d -m 700 "$STATE" "$STATE/ca"
  run install -d -m 755 "$STATE/certs"
  run python3 "$REPO/scripts/fanfare-local.py" --config-dir "$STATE/ca" --issue-certs "$STATE/certs" \
    --name "${HOSTNAME_WANTED}.local" --ip "$LAN_IP" --accept-ca-risk
  put_file "$ENV_FILE" 644 <<EOF
COMPOSE_PROJECT_NAME=fanfare
COMPOSE_FILE=compose.yaml:compose.https.yaml
FANFARE_CERTS_DIR=$STATE/certs
EOF
else
  step "5. HTTPS: not requested. Fanfare is served over plain HTTP on port 80 (no certificate, no CA)"
  put_file "$ENV_FILE" 644 <<'EOF'
COMPOSE_PROJECT_NAME=fanfare
COMPOSE_FILE=compose.yaml
EOF
fi

# ---- 6. the image and the containers ---------------------------------------------------------------
step "6. Fanfare image and containers: Traefik + Fanfare, HTTP on port 80"
if [ "$DRY" = 1 ]; then
  say "  (docker compose where available, otherwise docker-compose)"
  COMPOSE=("docker compose")
elif docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  COMPOSE=(docker-compose)
fi
if [ -n "$IMAGE_TAR" ]; then
  run docker load -i "$IMAGE_TAR"
  run "${COMPOSE[@]}" --project-directory "$PI_DIR" up -d --no-build
else
  say "  Building the image on the Pi downloads about 660 MB of voices and takes a while (20 minutes or more)."
  run "${COMPOSE[@]}" --project-directory "$PI_DIR" up -d --build
fi

# ---- 7. weekly update ---------------------------------------------------------------------------------
if [ "$UPDATE" = 1 ]; then
  step "7. Weekly update: fanfare-update.timer (rebuilds Fanfare, restarts only if the image changed)"
  put_file /usr/local/sbin/fanfare-update 755 <<EOF
#!/bin/sh
# Written by Fanfare's install.sh. Update the checkout (if it is a git clone), rebuild, restart only on change.
set -eu
cd "$REPO"
before=\$(docker image inspect -f '{{.Id}}' fanfare:local 2>/dev/null || true)
if [ -d .git ]; then git pull --ff-only || echo "fanfare-update: git pull failed, rebuilding what is here"; fi
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
\$DC --project-directory "$PI_DIR" build
after=\$(docker image inspect -f '{{.Id}}' fanfare:local 2>/dev/null || true)
if [ "\$before" != "\$after" ]; then
  \$DC --project-directory "$PI_DIR" up -d
  docker image prune -f >/dev/null
  echo "fanfare-update: updated and restarted"
else
  echo "fanfare-update: no change"
fi
EOF
  put_file /etc/systemd/system/fanfare-update.service 644 <<'EOF'
[Unit]
Description=Update Fanfare (rebuild, restart only if changed)
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/fanfare-update
EOF
  put_file /etc/systemd/system/fanfare-update.timer 644 <<'EOF'
[Unit]
Description=Weekly Fanfare update

[Timer]
OnCalendar=weekly
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF
  run systemctl daemon-reload
  run systemctl enable --now fanfare-update.timer
else
  step "7. Weekly update: skipped (--no-update). Update by hand: git pull, then rebuild with docker compose"
fi

step "Done"
say "Open http://${HOSTNAME_WANTED}.local from a phone on the club Wi-Fi (the address of this Pi works too)."
if [ "$HTTPS" = 1 ]; then
  say "HTTPS: https://${HOSTNAME_WANTED}.local after you trust the CA on each phone: $STATE/ca/ca.crt (never ca.key)."
fi
