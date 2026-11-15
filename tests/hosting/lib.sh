#!/usr/bin/env bash
# shellcheck disable=SC2015
# Shared helpers for tests/hosting/validate.sh and tests/raspberry-pi/*.sh (source this file).
# Finds a compose command + engine the way tests/docker/smoke.sh does and checks what any host must do.

pass=0
fail=0
ok() { pass=$((pass + 1)); echo "  ok   $*"; }
bad() { fail=$((fail + 1)); echo "  FAIL $*"; }
die() { echo "test: $*" >&2; exit 2; }
expect() { # description actual expected
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi
}

COMPOSE=()
ENGINE=""
detect_compose() {
  if [ -n "${CONTAINER_CLI:-}" ]; then
    # shellcheck disable=SC2206
    COMPOSE=($CONTAINER_CLI)
    case "${COMPOSE[0]}" in podman*) ENGINE=podman ;; *) ENGINE=docker ;; esac
    return 0
  fi
  if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose); ENGINE=docker; return 0; fi
    if command -v docker-compose >/dev/null; then COMPOSE=(docker-compose); ENGINE=docker; return 0; fi
  fi
  if command -v podman >/dev/null && podman info >/dev/null 2>&1; then
    if [ -S "$(podman info --format '{{.Host.RemoteSocket.Path}}' 2>/dev/null | sed 's|^unix://||')" ] && podman compose version >/dev/null 2>&1; then COMPOSE=(podman compose); ENGINE=podman; return 0; fi
    if command -v podman-compose >/dev/null; then COMPOSE=(podman-compose); ENGINE=podman; return 0; fi
  fi
  return 1
}

free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }

index_csp() {
  tr '\n' ' ' < "$1/index.html" | sed -n 's/.*http-equiv="Content-Security-Policy"[[:space:]]*content="\([^"]*\)".*/\1/p'
}

# check_host BASE_URL FANFARE_CONTAINER_ID REPO_ROOT [curl args...]
# Every host must: send the CSP of index.html, nosniff, no-referrer, the right MIME types and cache rules.
check_host() {
  local base=$1 cid=$2 repo=$3
  shift 3
  local curlx=("$@")
  hdr() { curl -s "${curlx[@]}" -D - -o /dev/null -H 'Accept-Encoding: gzip' "$base$1" | tr -d '\r'; }
  header() { hdr "$1" | grep -i "^$2:" | head -n1 | sed 's/^[^:]*: *//'; }
  local csp
  csp=$(index_csp "$repo")
  [ -n "$csp" ] || bad "cannot read the CSP from index.html"
  expect "GET / is 200" "$(hdr / | head -n1 | awk '{print $2}')" 200
  expect "CSP header equals the CSP in index.html" "$(header / content-security-policy)" "$csp"
  expect "nosniff" "$(header / x-content-type-options)" nosniff
  expect "Referrer-Policy" "$(header / referrer-policy)" no-referrer
  expect "index.html no-cache" "$(header / cache-control)" no-cache
  expect "sw.js no-cache" "$(header /sw.js cache-control)" no-cache
  expect "manifest content-type" "$(header /manifest.webmanifest content-type)" "application/manifest+json; charset=utf-8"
  local ort asset
  ort=$($ENGINE exec "$cid" sh -c "cd /srv && find . -name 'ort-wasm*.wasm' | head -n1 | sed 's|^\./||'")
  asset=$($ENGINE exec "$cid" sh -c "cd /srv && ls assets | grep '\\.js\$' | head -n1")
  expect "wasm content-type" "$(header "/$ort" content-type)" application/wasm
  expect "hashed asset is cached long" "$(header "/assets/$asset" cache-control)" "public, max-age=31536000, immutable"
  expect "hashed asset js MIME" "$(header "/assets/$asset" content-type | sed 's/;.*//')" text/javascript
  expect "CSP also on the wasm file" "$(header "/$ort" content-security-policy)" "$csp"
}

# check_no_logs MARKER CONTAINER_ID... : after a request carrying MARKER, no container log may contain it
check_no_logs() {
  local marker=$1
  shift
  local c logs
  for c in "$@"; do
    logs=$($ENGINE logs "$c" 2>&1)
    if echo "$logs" | grep -q -e "$marker" -e 'smoke-ua-marker' -e 'RequestHost' -e 'ClientAddr' -e 'handled request'; then
      bad "container $(echo "$c" | cut -c1-12) logged request details"; echo "$logs" | tail -3
    else ok "no access-log lines in container $(echo "$c" | cut -c1-12)"; fi
  done
}
