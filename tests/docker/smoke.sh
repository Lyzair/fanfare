#!/usr/bin/env bash
# Smoke test for the Docker image: build it, start it with compose, check what a browser
# (and a privacy-minded admin) would care about, then remove everything again.
#
#   tests/docker/smoke.sh
#   CONTAINER_CLI="podman-compose" tests/docker/smoke.sh     # force a compose command
#   FANFARE_PORT=18080 tests/docker/smoke.sh                  # force the host port
#
# Compose command is auto-detected: docker compose, docker-compose, podman compose,
# podman-compose (the first whose engine answers without sudo).
set -uo pipefail

cd "$(dirname "$0")/../.."
PROJECT=fanfare-smoke
export FANFARE_IMAGE="${FANFARE_IMAGE:-fanfare:smoke}"
unset FANFARE_HOST FANFARE_ACME

pass=0
fail=0
ok() { pass=$((pass + 1)); echo "  ok   $*"; }
bad() { fail=$((fail + 1)); echo "  FAIL $*"; }
die() { echo "smoke: $*" >&2; exit 2; }

# ---- find a compose command and its engine
COMPOSE=()
ENGINE=""
detect() {
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
    # 'podman compose' hands over to docker-compose, which needs podman's API socket.
    if [ -S "$(podman info --format '{{.Host.RemoteSocket.Path}}' 2>/dev/null | sed 's|^unix://||')" ] && podman compose version >/dev/null 2>&1; then COMPOSE=(podman compose); ENGINE=podman; return 0; fi
    if command -v podman-compose >/dev/null; then COMPOSE=(podman-compose); ENGINE=podman; return 0; fi
  fi
  return 1
}
detect || die "no usable compose command (tried docker compose, docker-compose, podman compose, podman-compose)."
echo "smoke: using '${COMPOSE[*]}' (engine: $ENGINE)"

# ---- pick a free host port (this machine's 8080 may be taken)
if [ -z "${FANFARE_PORT:-}" ]; then
  FANFARE_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])') || die "no free port"
fi
export FANFARE_PORT
BASE="http://127.0.0.1:${FANFARE_PORT}"

dc() { "${COMPOSE[@]}" -p "$PROJECT" -f compose.yaml "$@"; }

TMP=$(mktemp -d)
dch() { "${COMPOSE[@]}" -p "$PROJECT" -f compose.yaml -f compose.https.yaml "$@"; }
cleanup() {
  echo "smoke: cleaning up"
  dch down -v >/dev/null 2>&1 || true
  dc down -v >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# ---- build and start
echo "smoke: building image $FANFARE_IMAGE (the first build downloads the voices, about 660 MB)"
start=$(date +%s)
dc build || die "image build failed"
echo "smoke: build took $(( $(date +%s) - start )) s"
dc up -d || die "compose up failed"

echo "smoke: waiting for $BASE/"
code=000
for _ in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/") || true
  [ "$code" = 200 ] && break
  sleep 1
done
[ "$code" = 200 ] || { dc logs 2>&1 | tail -20; die "service did not answer 200 (last: $code)"; }

CID=$($ENGINE ps -q --filter "label=com.docker.compose.project=$PROJECT" | head -n1)
[ -n "$CID" ] || die "cannot find the container"

echo "smoke: checks"
health=starting
for _ in $(seq 1 60); do
  health=$($ENGINE inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$CID" 2>/dev/null || echo none)
  [ "$health" = healthy ] && break
  sleep 1
done
[ "$health" = healthy ] && ok "container reports healthy" || bad "container health is '$health'"

hdr() { curl -s -D - -o /dev/null -H 'Accept-Encoding: gzip' "$BASE$1" | tr -d '\r'; }
status() { hdr "$1" | head -n1 | awk '{print $2}'; }
header() { hdr "$1" | grep -i "^$2:" | head -n1 | sed 's/^[^:]*: *//'; }
expect() { # description actual expected
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi
}

expect "GET / is 200" "$(status /)" 200
expect "GET /manual/en.html is 200" "$(status /manual/en.html)" 200
expect "GET /licenses/GPL-3.0.txt is 200" "$(status /licenses/GPL-3.0.txt)" 200
expect "GET /sw.js is 200" "$(status /sw.js)" 200
expect "unknown path is 404" "$(status /no-such-file-$$)" 404
expect "folders are not listed (/assets/ is not 200)" "$([ "$(status /assets/)" = 200 ] && echo listed || echo no)" no

# CSP header equals the <meta> CSP in the served index.html, exactly.
meta_csp=$(curl -s "$BASE/" | tr '\n' ' ' | sed -n 's/.*http-equiv="Content-Security-Policy"[[:space:]]*content="\([^"]*\)".*/\1/p')
[ -n "$meta_csp" ] || bad "could not read the CSP <meta> from index.html"
expect "CSP header equals the CSP in index.html" "$(header / content-security-policy)" "$meta_csp"
expect "nosniff" "$(header / x-content-type-options)" nosniff
expect "Referrer-Policy" "$(header / referrer-policy)" no-referrer
expect "Permissions-Policy" "$(header / permissions-policy)" "camera=(), geolocation=(), microphone=(self)"
srv=$(header / server)
case "$srv" in ''|Caddy) ok "Server header is absent or plain 'Caddy' (no version)";; *) bad "Server header leaks '$srv'";; esac
echo "$(hdr /)" | grep -qi '^via:\|^x-powered-by:' && bad "extra identifying headers" || ok "no Via / X-Powered-By"

# MIME types
find_one() { $ENGINE exec "$CID" sh -c "cd /srv && find . -name '$1' | head -n1 | sed 's|^\./||'"; }
ort=$(find_one 'ort-wasm*.wasm')
onnx=$(find_one '*.onnx')
[ -n "$ort" ] && [ -n "$onnx" ] || bad "no .wasm / .onnx found in /srv"
expect "wasm content-type ($ort)" "$(header "/$ort" content-type)" application/wasm
expect "wasm is never served with a content-encoding" "$(header "/$ort" content-encoding)" ""
expect "onnx content-type" "$(header "/$onnx" content-type)" application/octet-stream
expect "onnx is not compressed" "$(header "/$onnx" content-encoding)" ""
expect "manifest content-type" "$(header /manifest.webmanifest content-type)" "application/manifest+json; charset=utf-8"
expect "sw.js content-type" "$(header /sw.js content-type | sed 's/;.*//')" text/javascript
expect "index.html is compressed for text" "$(header / content-encoding)" gzip

# caching
expect "sw.js Cache-Control" "$(header /sw.js cache-control)" no-cache
expect "index.html Cache-Control" "$(header / cache-control)" no-cache
asset=$($ENGINE exec "$CID" sh -c "cd /srv && ls assets | grep '\\.js\$' | head -n1")
expect "hashed asset Cache-Control" "$(header "/assets/$asset" cache-control)" "public, max-age=31536000, immutable"
expect "asset mjs/js content-type" "$(header "/assets/$asset" content-type | sed 's/;.*//')" text/javascript
expect "Range requests work (206)" "$(curl -s -o /dev/null -w '%{http_code}' -H 'Range: bytes=0-99' "$BASE/$onnx")" 206

# container hardening
expect "runs as non-root" "$($ENGINE exec "$CID" id -u | awk '$1!=0{print "non-root"}')" non-root
if $ENGINE exec "$CID" sh -c 'touch /srv/.w 2>/dev/null'; then bad "root filesystem is writable"; else ok "root filesystem is read-only"; fi
if $ENGINE exec "$CID" sh -c 'command -v node' >/dev/null 2>&1; then bad "node is in the final image"; else ok "no node in the final image"; fi

# privacy: a request leaves no trace in the container log
marker="smoke-nolog-$$-$RANDOM"
curl -s -o /dev/null -H 'User-Agent: smoke-ua-marker' "$BASE/$marker?q=secret"
sleep 1
logs=$($ENGINE logs "$CID" 2>&1)
if echo "$logs" | grep -q -e "$marker" -e 'smoke-ua-marker' -e 'handled request' -e '"remote_ip"' -e '"client_ip"' -e '"remote_addr"' -e 'User-Agent'; then
  bad "the container log contains request details"; echo "$logs" | tail -5
else ok "no access-log lines after a request"; fi
lines=$(echo "$logs" | grep -c . || true)
echo "  info container log has $lines line(s) in total"

# default mode: no certificate authority, nothing on 8443, version
echo "  info $($ENGINE exec "$CID" caddy version)"
if $ENGINE exec "$CID" sh -c 'test -e /data/caddy/pki'; then bad "default mode created a PKI folder"; else ok "default mode created no CA / PKI folder"; fi
if $ENGINE exec "$CID" sh -c 'grep -qiE ":20FB [0-9A-F:]+ 0A" /proc/net/tcp /proc/net/tcp6'; then bad "something listens on 8443 in default mode"; else ok "nothing listens on 8443 in default mode"; fi

echo "smoke: image size: $($ENGINE image inspect "$FANFARE_IMAGE" --format '{{.Size}}' | awk '{printf "%.1f MB", $1/1048576}')"
dc down -v >/dev/null 2>&1

# ---- HTTPS mode: certificates from the name-constrained local CA (fanfare-local.py --issue-certs)
echo "smoke: HTTPS mode"
if command -v python3 >/dev/null && { command -v openssl >/dev/null || python3 -c 'import cryptography' 2>/dev/null; }; then
  FL="python3 scripts/fanfare-local.py --config-dir $TMP/cfg"
  # shellcheck disable=SC2086
  $FL --issue-certs "$TMP/certs" --name fanfare.local --ip 127.0.0.1 --accept-ca-risk >"$TMP/issue.log" 2>&1 \
    && ok "--issue-certs wrote the certificate" || { bad "--issue-certs failed"; cat "$TMP/issue.log"; }
  [ ! -e "$TMP/certs/ca.key" ] && ok "CA key is not in the certificate folder" || bad "CA key leaked into the certificate folder"
  HPORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
  export FANFARE_CERTS_DIR="$TMP/certs" FANFARE_HTTPS_BIND=127.0.0.1 FANFARE_HTTPS_PORT="$HPORT" FANFARE_HOST=fanfare.local
  chmod 755 "$TMP" "$TMP/certs"

  # 1. without the risk acknowledgement only HTTP is served
  dch up -d >/dev/null 2>&1
  for _ in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")" = 200 ] && break; sleep 1; done
  HCID=$($ENGINE ps -q --filter "label=com.docker.compose.project=$PROJECT" | head -n1)
  hlogs=$($ENGINE logs "$HCID" 2>&1)
  echo "$hlogs" | grep -q "only plain HTTP is served" && ok "without FANFARE_ACCEPT_CA_RISK=1 only HTTP is served (risks printed)" || bad "risk gate missing"
  echo "$hlogs" | grep -q "Thanks to name constraints" && ok "risk list printed verbatim" || bad "risk list not printed"
  curl -sk --max-time 3 -o /dev/null "https://127.0.0.1:$HPORT/" && bad "HTTPS answered without the risk flag" || ok "no HTTPS without the risk flag"
  dch down -v >/dev/null 2>&1

  # 2. with the flag
  export FANFARE_ACCEPT_CA_RISK=1
  dch up -d >/dev/null 2>&1
  code=000
  for _ in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --cacert "$TMP/cfg/ca.crt" --resolve "fanfare.local:$HPORT:127.0.0.1" "https://fanfare.local:$HPORT/") || true
    [ "$code" = 200 ] && break; sleep 1
  done
  expect "HTTPS with the local CA is 200" "$code" 200
  hcsp=$(curl -s -D - -o /dev/null --cacert "$TMP/cfg/ca.crt" --resolve "fanfare.local:$HPORT:127.0.0.1" "https://fanfare.local:$HPORT/" | tr -d '\r' | grep -i '^content-security-policy:' | sed 's/^[^:]*: *//')
  expect "HTTPS CSP header equals the CSP in index.html" "$hcsp" "$meta_csp"
  curl -s --max-time 5 -o /dev/null --resolve "fanfare.local:$HPORT:127.0.0.1" "https://fanfare.local:$HPORT/" && bad "certificate is accepted without the CA" || ok "certificate is not trusted without the local CA"
  HCID=$($ENGINE ps -q --filter "label=com.docker.compose.project=$PROJECT" | head -n1)
  if $ENGINE exec "$HCID" sh -c 'test -e /data/caddy/pki'; then bad "Caddy made its own CA"; else ok "Caddy made no CA of its own"; fi
  dch down -v >/dev/null 2>&1

  # 3. a host the certificate does not cover is refused
  export FANFARE_HOST=other.local
  dch up -d >/dev/null 2>&1
  sleep 3
  dch logs 2>&1 | grep -q "does not cover FANFARE_HOST" \
    && ok "uncovered FANFARE_HOST is refused" || bad "uncovered FANFARE_HOST was not refused"
  dch down -v >/dev/null 2>&1
  unset FANFARE_ACCEPT_CA_RISK FANFARE_CERTS_DIR FANFARE_HTTPS_BIND FANFARE_HTTPS_PORT FANFARE_HOST

  # shellcheck disable=SC2086
  $FL --forget-ca --yes >/dev/null 2>&1 && [ ! -e "$TMP/cfg/ca.key" ] && ok "--forget-ca removed the temporary CA" || bad "--forget-ca failed"
else
  echo "  skip HTTPS mode: python3 with openssl or cryptography is needed"
fi

echo "smoke: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
