#!/usr/bin/env bash
# shellcheck disable=SC2015
# install.sh --dry-run in a Debian bookworm container (arm64 under QEMU when PLATFORM=linux/arm64):
# asserts the printed steps and that nothing is changed. Then brings up deploy/raspberry-pi/compose.yaml
# (Traefik + Fanfare) and checks headers, MIME and the absence of access-log lines.
#   tests/raspberry-pi/dry-run.sh                      # dry run (amd64) + compose
#   PLATFORM=linux/arm64 tests/raspberry-pi/dry-run.sh # dry run under QEMU
#   SKIP_COMPOSE=1 ...                                 # dry run only
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
REPO=$PWD
# shellcheck source=tests/hosting/lib.sh
. tests/hosting/lib.sh
detect_compose || die "no usable compose command"
case "$(uname -m)" in aarch64 | arm64) NATIVE=linux/arm64 ;; *) NATIVE=linux/amd64 ;; esac
PLATFORM_ARGS=(--platform "${PLATFORM:-$NATIVE}")
export FANFARE_IMAGE="${FANFARE_IMAGE:-fanfare:smoke}"
TMP=$(mktemp -d)
chmod 755 "$TMP"
PROJECT=fanfare-pi-test
cleanup() {
  "${COMPOSE[@]}" -p "$PROJECT" -f deploy/raspberry-pi/compose.yaml down -v >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# Without binfmt_misc (no root to register QEMU), "podman run --platform linux/arm64" cannot start a
# container. Then the arm64 Debian image is unpacked and install.sh runs under qemu-aarch64 user-mode
# emulation with that root file system: the same bash, coreutils and sed a Raspberry Pi would use.
ARM_ROOT=""
if [ "${PLATFORM:-}" = linux/arm64 ] && ! $ENGINE run --rm --platform linux/arm64 docker.io/library/debian:bookworm true >/dev/null 2>&1; then
  command -v qemu-aarch64 >/dev/null || die "no QEMU for arm64 (no binfmt_misc and no qemu-aarch64)"
  ARM_ROOT=$TMP/arm64root
  mkdir -p "$ARM_ROOT"
  cid=$($ENGINE create --platform linux/arm64 docker.io/library/debian:bookworm /bin/true)
  $ENGINE export "$cid" | tar -x -C "$ARM_ROOT" 2>/dev/null
  $ENGINE rm "$cid" >/dev/null
  # the tag now points at the arm64 image: fetch the native one again for the compose test
  $ENGINE pull -q --platform "$NATIVE" docker.io/library/debian:bookworm >/dev/null
  echo "test: arm64 container start is not possible here; using qemu-aarch64 user-mode with the arm64 bookworm file system"
fi

run_dry() { # args to install.sh; stdin is passed through
  if [ -n "$ARM_ROOT" ]; then
    qemu-aarch64 -L "$ARM_ROOT" -E PATH=/usr/bin:/bin "$ARM_ROOT/bin/bash" deploy/raspberry-pi/install.sh --dry-run "$@" 2>&1
  else
    # --read-only: a dry run that tried to change anything outside /tmp would fail here
    $ENGINE run --rm -i --read-only --tmpfs /tmp "${PLATFORM_ARGS[@]}" -v "$REPO:/repo:ro" docker.io/library/debian:bookworm \
      bash /repo/deploy/raspberry-pi/install.sh --dry-run "$@" 2>&1
  fi
}

tree_hash() { [ -n "$ARM_ROOT" ] && (cd "$ARM_ROOT" && find etc var opt -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum); }
before=$(tree_hash)

echo "test: install.sh --dry-run (${PLATFORM:-$NATIVE}) in debian:bookworm"
out=$(run_dry --hostname fanfare </dev/null); rc=$?
echo "$out" > "$TMP/dry.txt"
expect "dry run exits 0" "$rc" 0
for step in 'apt-get update' 'apt-get install' 'unattended-upgrades' 'Remove-Unused-Dependencies' '04:00' \
            'docker.io' 'avahi-daemon' 'fanfare.local' 'log-driver' 'SystemMaxUse' 'docker compose' \
            'fanfare-update.timer' 'HTTP on port 80' '/opt/fanfare'; do
  echo "$out" | grep -q -- "$step" && ok "prints: $step" || bad "missing step: $step"
done
echo "$out" | grep -qi 'DRY RUN' && ok "says it is a dry run" || bad "no dry-run notice"
echo "$out" | grep -q -- '--issue-certs' && bad "default run mentions issuing certificates" || ok "default is HTTP: no certificates"
echo "$out" | grep -q 'Thanks to name constraints' && bad "default run printed the CA risk text" || ok "no CA risk text without --https"
# root-owned layout: everything runs from /opt/fanfare, nothing from the user's folder (/repo here)
echo "$out" | grep -q 'chown -R root:root /opt/fanfare' && ok "files are made root-owned in /opt/fanfare" || bad "no chown of /opt/fanfare"
echo "$out" | grep -q -- '--project-directory /opt/fanfare/deploy/raspberry-pi' && ok "compose runs from /opt/fanfare" || bad "compose does not run from /opt/fanfare"
echo "$out" | grep -Eq 'git -C "?/opt/fanfare"? pull --ff-only' && ok "update is git pull on the root-owned copy" || bad "no pull on /opt/fanfare"
echo "$out" | grep -E 'git( -C)? /repo|safe.directory|pull.*/repo' && bad "a git operation touches the user's folder" || ok "no git operation in the user's folder"
echo "$out" | grep -E '^\s+\+ .*(/home/|/repo)' | grep -vE 'tar -C |git clone' && bad "a step uses the user's folder" || ok "no step runs files from the user's folder"
echo "$out" | grep -q 'hostnamectl set-hostname fanfare' && ok "--hostname sets the host name" || bad "--hostname ignored"
echo "$out" | grep -q 'docker restarts only if\|only when daemon.json changed' && ok "docker restarts only when daemon.json changed" || bad "unconditional docker restart"

out=$(run_dry --no-update)
echo "$out" | grep -q 'write /etc/systemd/system/fanfare-update' && bad "--no-update still installs the timer" || ok "--no-update skips the update timer"
echo "$out" | grep -q 'enable --now fanfare-update.timer' && bad "--no-update enables the timer" || ok "--no-update does not enable the timer"
echo "$out" | grep -q 'systemctl disable --now fanfare-update.timer' && ok "--no-update disables a timer from an earlier run" || bad "--no-update leaves an earlier timer enabled"
echo "$out" | grep -q 'find /opt/fanfare -type l' && ok "links that leave /opt/fanfare are checked" || bad "no link check"

out=$(run_dry --image-tar /tmp/x.tar)
echo "$out" | grep -q 'docker load -i /tmp/x.tar' && ok "--image-tar loads the tar" || bad "--image-tar: no docker load"
echo "$out" | grep -q 'write /etc/systemd/system/fanfare-update.timer' && bad "--image-tar still installs the timer" || ok "--image-tar installs no update timer"
echo "$out" | grep -q 'MODE=tar' && ok "mode recorded for the update script (MODE=tar)" || bad "no MODE=tar in the config file"
echo "$out" | grep -q 'hostnamectl' && bad "host name changed without --hostname" || ok "host name is kept without --hostname"
out=$(run_dry)
echo "$out" | grep -q 'MODE=build' && ok "mode recorded (MODE=build)" || bad "no MODE=build"

out=$(run_dry --https --accept-ca-risk)
echo "$out" | grep -q 'Thanks to name constraints' && ok "--https prints the risk list" || bad "--https: no risk list"
echo "$out" | grep -q -- '--issue-certs' && ok "--https issues certificates with fanfare-local --issue-certs" || bad "--https: no --issue-certs"
out=$(printf 'no\n' | run_dry --https); rc=$?
[ "$rc" -ne 0 ] && ok "--https without typing yes stops (exit $rc)" || bad "--https without yes did not stop"
echo "$out" | grep -q -- '--issue-certs' && bad "certificates were issued without yes" || ok "no certificates without yes"
out=$(run_dry --bogus); rc=$?
[ "$rc" -ne 0 ] && ok "unknown option is refused" || bad "unknown option accepted"

after=$(tree_hash)
[ "$before" = "$after" ] && ok "dry run changed nothing (read-only container / unchanged etc, var, opt)" || bad "the dry run changed files"

# shellcheck disable=SC2154
[ -n "${SKIP_COMPOSE:-}" ] && { echo "test: $pass passed, $fail failed"; [ "$fail" -eq 0 ]; exit; }

echo "test: Pi compose file (Traefik + Fanfare, HTTP)"
export FANFARE_HTTP_PORT; FANFARE_HTTP_PORT=$(free_port)
"${COMPOSE[@]}" -p "$PROJECT" -f deploy/raspberry-pi/compose.yaml up -d --no-build >"$TMP/up.log" 2>&1 || { bad "compose up failed"; tail -5 "$TMP/up.log"; }
for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$FANFARE_HTTP_PORT/")" = 200 ] && break; sleep 1; done
CIDS=$($ENGINE ps -q --filter "label=com.docker.compose.project=$PROJECT")
FCID=$($ENGINE ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=fanfare" | head -n1)
[ -n "$FCID" ] || die "no fanfare container"
check_host "http://127.0.0.1:$FANFARE_HTTP_PORT" "$FCID" "$REPO"
marker="pi-nolog-$$-$RANDOM"
curl -s -o /dev/null -H 'User-Agent: smoke-ua-marker' "http://127.0.0.1:$FANFARE_HTTP_PORT/$marker?q=secret"
sleep 1
# shellcheck disable=SC2086
check_no_logs "$marker" $CIDS
# ---- opt-in HTTPS: compose.https.yaml with a certificate from the name-constrained local CA
echo "test: Pi compose file with compose.https.yaml (opt-in)"
"${COMPOSE[@]}" -p "$PROJECT" -f deploy/raspberry-pi/compose.yaml down -v >/dev/null 2>&1
python3 scripts/fanfare-local.py --config-dir "$TMP/cfg" --issue-certs "$TMP/certs" --name fanfare.local --ip 127.0.0.1 --accept-ca-risk >"$TMP/issue.log" 2>&1 \
  && ok "certificate made with fanfare-local --issue-certs" || { bad "issue-certs failed"; cat "$TMP/issue.log"; }
chmod -R a+rX "$TMP/certs"
export FANFARE_CERTS_DIR="$TMP/certs" FANFARE_HTTPS_PORT; FANFARE_HTTPS_PORT=$(free_port)
"${COMPOSE[@]}" -p "$PROJECT" -f deploy/raspberry-pi/compose.yaml -f deploy/raspberry-pi/compose.https.yaml up -d --no-build >"$TMP/up2.log" 2>&1 || { bad "https compose up failed"; tail -5 "$TMP/up2.log"; }
FCID=$($ENGINE ps -q --filter "label=com.docker.compose.project=$PROJECT" --filter "label=com.docker.compose.service=fanfare" | head -n1)
CURLX=(--cacert "$TMP/cfg/ca.crt" --resolve "fanfare.local:$FANFARE_HTTPS_PORT:127.0.0.1")
for _ in $(seq 1 40); do [ "$(curl -s "${CURLX[@]}" -o /dev/null -w '%{http_code}' "https://fanfare.local:$FANFARE_HTTPS_PORT/")" = 200 ] && break; sleep 1; done
check_host "https://fanfare.local:$FANFARE_HTTPS_PORT" "$FCID" "$REPO" "${CURLX[@]}"
curl -s --max-time 5 -o /dev/null --resolve "fanfare.local:$FANFARE_HTTPS_PORT:127.0.0.1" "https://fanfare.local:$FANFARE_HTTPS_PORT/" && bad "certificate accepted without the local CA" || ok "certificate is not trusted without the local CA"
expect "plain HTTP still answers" "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$FANFARE_HTTP_PORT/")" 200
python3 scripts/fanfare-local.py --config-dir "$TMP/cfg" --forget-ca --yes >/dev/null 2>&1

echo "test: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
