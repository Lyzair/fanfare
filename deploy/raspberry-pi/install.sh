#!/usr/bin/env bash
# Fanfare club-house appliance installer for Raspberry Pi OS / Debian (bookworm or newer).
#
#   sudo ./deploy/raspberry-pi/install.sh [--dry-run] [--no-update] [--https [--accept-ca-risk]] [--image-tar FILE] [--hostname NAME]
#
#   --dry-run          print every step and the files it would write; change nothing
#   --no-update        do not install the weekly update timer
#   --https            opt in to HTTPS with a local certificate authority (prints the risks, asks you to
#                      type yes; --accept-ca-risk is the same yes for scripts). Without it: plain HTTP.
#   --image-tar FILE   load a ready-made image (docker save) instead of building it on the Pi; no weekly
#                      update timer then (update by running this again with a new tar)
#   --hostname NAME    set the host name (and /etc/hosts); default: keep the current one (name.local)
#
# Fanfare is installed to /opt/fanfare (root:root, not writable by users): the weekly job runs as root and must
# never run code from a user's folder. Edits to the Fanfare files go there, with sudo.
#
# Safe to run again (idempotent). Docker comes from the distribution's own repositories (no piped download scripts).
set -euo pipefail

DRY=0
UPDATE=1
HTTPS=0
ACCEPT=0
IMAGE_TAR=""
NEW_HOSTNAME=""

usage() { sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; }

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
    --hostname)
      [ $# -ge 2 ] || { echo "install: --hostname needs a name" >&2; exit 2; }
      NEW_HOSTNAME=$2
      shift
      ;;
    -h | --help) usage; exit 0 ;;
    *) echo "install: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)   # where the user's copy is
REPO=/opt/fanfare                                          # root-owned copy that everything runs from
PI_DIR="$REPO/deploy/raspberry-pi"
STATE=/var/lib/fanfare
CONF_DIR=/etc/fanfare
if [ -n "$NEW_HOSTNAME" ]; then
  printf '%s' "$NEW_HOSTNAME" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$' \
    || { echo "install: --hostname must be letters, digits and hyphens only" >&2; exit 2; }
  HOST_NAME=$NEW_HOSTNAME
else
  HOST_NAME=$(hostname -s 2>/dev/null || echo fanfare)
fi

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

# ---- 1b. root-owned copy in /opt/fanfare -------------------------------------------------------------
step "1b. Fanfare files: a root-owned copy in $REPO (the weekly update runs as root, so it must not use a user's folder)"
# check_links: a link in $REPO that leads outside it would let the root job read a file a user can change
check_links() {
  local link target found=0
  while IFS= read -r -d '' link; do
    target=$(readlink -f -- "$link" 2>/dev/null || true)
    case "$target" in
      "$REPO"/*) ;;
      *)
        echo "install: $link is a link that leads outside $REPO (to ${target:-nowhere})" >&2
        found=1
        ;;
    esac
  done < <(find "$REPO" -type l -print0)
  if [ "$found" = 1 ]; then
    echo "install: remove these links from your Fanfare folder and from $REPO, then run this again. Stopped before anything was built or started." >&2
    exit 1
  fi
}

ORIGIN=""
if [ -f "$SRC/.git/config" ]; then
  # read the setting from the file: no git command runs inside the user's folder
  ORIGIN=$(git config --file "$SRC/.git/config" --get remote.origin.url 2>/dev/null || true)
fi
# Only an https:// address is used as root: a local path, file://, ssh:// or ext:: origin would make
# root clone now, and pull every week, from a place a user of this Pi may control.
case "$ORIGIN" in
  https://*) ;;
  "") ;;
  *)
    say "  The origin of this folder is not an https:// address ($ORIGIN): it is not used for updates."
    ORIGIN=""
    ;;
esac
HAS_REMOTE=0
if [ "$SRC" = "$REPO" ]; then
  say "  running from $REPO already"
  if [ -n "$ORIGIN" ]; then HAS_REMOTE=1; fi
elif [ -n "$ORIGIN" ]; then
  HAS_REMOTE=1
  say "  The update address (origin of your checkout) is: $ORIGIN"
  say "  Weekly updates will run: git -C $REPO pull --ff-only (as root, on the root-owned copy)."
  if [ "$DRY" = 1 ] || [ ! -d "$REPO/.git" ]; then
    run git clone -- "$ORIGIN" "$REPO"
  else
    say "  $REPO is already a clone: kept"
  fi
else
  say "  Your folder has no https remote: files are copied to $REPO and the weekly job only rebuilds from that copy."
  say "  (To get new versions later, copy a newer folder over it with this installer.)"
  TAR_EXCL=(--exclude=./node_modules --exclude=./dist --exclude=./release --exclude=./test-results --exclude=./.git)
  if [ "$DRY" = 1 ]; then
    say "  + tar -C $SRC ${TAR_EXCL[*]} -cf - . | tar -C $REPO --no-same-owner -xf -"
  else
    install -d -m 755 "$REPO"
    tar -C "$SRC" "${TAR_EXCL[@]}" -cf - . | tar -C "$REPO" --no-same-owner -xf -
  fi
fi
if [ "$SRC" != "$REPO" ]; then
  run chown -R root:root "$REPO"
  run chmod -R go-w,a+rX "$REPO"
fi
if [ "$DRY" = 1 ]; then
  say "  + find $REPO -type l   (every link must lead to a file inside $REPO; otherwise the installer stops)"
else
  check_links
fi
if [ "$DRY" != 1 ] && [ ! -f "$PI_DIR/compose.yaml" ]; then
  echo "install: $PI_DIR/compose.yaml is missing after the copy" >&2
  exit 1
fi

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
DOCKER_RESTART=0
if [ "$DRY" = 1 ]; then
  say '  + write /etc/docker/daemon.json: "log-driver": "local", "log-opts": {"max-size": "2m", "max-file": "2"} (merged, existing settings are kept; docker restarts only if the file changed)'
else
  mkdir -p /etc/docker
  # -I: isolated mode, so a json.py in the folder where sudo was run is never imported as root
  result=$(python3 -I - <<'PY'
import json, os, sys
p = '/etc/docker/daemon.json'
d = json.load(open(p)) if os.path.exists(p) and os.path.getsize(p) else {}
old = json.dumps(d, sort_keys=True)
drv = d.get('log-driver')
if drv not in (None, 'local'):
    print('kept: the existing log-driver %r is not replaced (set "local" yourself to limit log size)' % drv)
    sys.exit(0)
d['log-driver'] = 'local'
opts = d.setdefault('log-opts', {})
opts.setdefault('max-size', '2m')
opts.setdefault('max-file', '2')
if json.dumps(d, sort_keys=True) == old:
    print('unchanged')
else:
    tmp = p + '.fanfare-tmp'
    with open(tmp, 'w') as f:
        json.dump(d, f, indent=2)
        f.write('\n')
    os.replace(tmp, p)
    print('changed')
PY
)
  say "  /etc/docker/daemon.json: $result"
  if [ "$result" = changed ]; then DOCKER_RESTART=1; fi
fi
run systemctl restart systemd-journald
run systemctl enable --now docker
if [ "$DRY" = 1 ]; then
  say "  + systemctl restart docker   (only when daemon.json changed)"
elif [ "$DOCKER_RESTART" = 1 ]; then
  systemctl restart docker
fi

# ---- 4. fanfare.local ------------------------------------------------------------------------------
step "4. Name on the network: avahi-daemon answers ${HOST_NAME}.local"
if [ -n "$NEW_HOSTNAME" ]; then
  run hostnamectl set-hostname "$NEW_HOSTNAME"
  if [ "$DRY" = 1 ]; then
    say "  + set the 127.0.1.1 line of /etc/hosts to: 127.0.1.1 $NEW_HOSTNAME"
  elif grep -q '^127\.0\.1\.1' /etc/hosts; then
    sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$NEW_HOSTNAME/" /etc/hosts
  else
    printf '127.0.1.1\t%s\n' "$NEW_HOSTNAME" >> /etc/hosts
  fi
else
  say "  host name kept: ${HOST_NAME} (use --hostname NAME to change it; the Raspberry Pi Imager setting is the usual way)"
fi
run systemctl enable --now avahi-daemon

# ---- 5. HTTPS (opt-in only) --------------------------------------------------------------------------
ENV_FILE="$PI_DIR/.env"
if [ "$HTTPS" = 1 ]; then
  step "5. HTTPS: certificate from the name-constrained local CA (fanfare-local.py --issue-certs)"
  LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [ -z "$LAN_IP" ]; then
    if [ "$DRY" = 1 ]; then
      LAN_IP="<LAN-ADDRESS>"
    else
      echo "install: --https needs this Pi's network address for the certificate, but none was found. Connect it to the network and run again." >&2
      exit 1
    fi
  fi
  say "  The certificate covers ${HOST_NAME}.local and $LAN_IP. Give the Pi a fixed address (DHCP reservation in the router); if the address changes, run this again with --https."
  run install -d -m 700 "$STATE" "$STATE/ca"
  run install -d -m 755 "$STATE/certs"
  run python3 "$REPO/scripts/fanfare-local.py" --config-dir "$STATE/ca" --issue-certs "$STATE/certs" \
    --name "${HOST_NAME}.local" --ip "$LAN_IP" --accept-ca-risk
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
if [ -n "$IMAGE_TAR" ]; then MODE=tar; else MODE=build; fi
put_file "$CONF_DIR/install.conf" 644 <<EOF
# Written by Fanfare's install.sh and read by /usr/local/sbin/fanfare-update.
MODE=$MODE
HAS_REMOTE=$HAS_REMOTE
EOF
if [ "$MODE" = tar ]; then
  step "7. Weekly update: not installed (the image came from a tar file, nothing to rebuild on the Pi)"
  say "  To update: build a new tar on a laptop and run this installer again with --image-tar NEWFILE."
  if [ "$DRY" = 1 ]; then
    say "  + systemctl disable --now fanfare-update.timer   (only if an earlier run installed it)"
  else
    systemctl disable --now fanfare-update.timer 2>/dev/null || true
  fi
elif [ "$UPDATE" = 1 ]; then
  step "7. Weekly update: fanfare-update.timer (rebuilds Fanfare, restarts only if the image changed)"
  put_file /usr/local/sbin/fanfare-update 755 <<EOF
#!/bin/sh
# Written by Fanfare's install.sh. Runs as root on the root-owned copy in $REPO: git pull (if it has a remote),
# rebuild, restart only when the image changed.
set -eu
. "$CONF_DIR/install.conf"
if [ "\$MODE" = tar ]; then
  echo "fanfare-update: this Pi runs an image loaded from a tar file; load a new one with install.sh --image-tar FILE"
  exit 0
fi
cd "$REPO"
before=\$(docker image inspect -f '{{.Id}}' fanfare:local 2>/dev/null || true)
if [ "\$HAS_REMOTE" = 1 ]; then
  git -C "$REPO" pull --ff-only || echo "fanfare-update: git pull failed, rebuilding what is here"
else
  echo "fanfare-update: no remote configured, rebuilding from $REPO only"
fi
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
  step "7. Weekly update: skipped (--no-update). Update by hand: sudo git -C $REPO pull, then rebuild with docker compose"
  if [ "$DRY" = 1 ]; then
    say "  + systemctl disable --now fanfare-update.timer   (only if an earlier run installed it)"
  else
    systemctl disable --now fanfare-update.timer 2>/dev/null || true
  fi
fi

step "Done"
say "Open http://${HOST_NAME}.local from a phone on the club Wi-Fi (the address of this Pi works too)."
if [ "$HTTPS" = 1 ]; then
  say "HTTPS: https://${HOST_NAME}.local after you trust the CA on each phone: $STATE/ca/ca.crt (never ca.key)."
fi
