#!/usr/bin/env bash
# shellcheck disable=SC2015
# Validates the reverse-proxy examples under deploy/ (needs podman or docker; downloads small images):
#   1. caddy validate on every deploy/caddy Caddyfile (with certificates from fanfare-local --issue-certs)
#   2. Traefik: deploy/traefik/compose.yaml brought up against the Fanfare image, headers/MIME/no-log checks
#   3. nginx -t on deploy/nginx-proxy-manager/custom.conf, then a proxy run with the same checks
# Needs the Fanfare image: FANFARE_IMAGE (default fanfare:smoke, as built by tests/docker/smoke.sh;
# build it with: docker build -t fanfare:smoke .)   Nothing is left behind.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 2
REPO=$PWD
# shellcheck source=tests/hosting/lib.sh
. tests/hosting/lib.sh

export FANFARE_IMAGE="${FANFARE_IMAGE:-fanfare:smoke}"
CADDY_IMAGE=$(sed -n 's/^FROM \(caddy:[^ ]*\).*/\1/p' Dockerfile)
NGINX_IMAGE=docker.io/library/nginx:1.28-alpine
detect_compose || die "no usable compose command"
echo "test: using '${COMPOSE[*]}' (engine: $ENGINE), image $FANFARE_IMAGE"
$ENGINE image inspect "$FANFARE_IMAGE" >/dev/null 2>&1 || die "image $FANFARE_IMAGE not found: docker build -t $FANFARE_IMAGE ."

TMP=$(mktemp -d)
chmod 755 "$TMP"
NET=fanfare-hosting-test-$$
cleanup() {
  echo "test: cleaning up"
  "${COMPOSE[@]}" -p fanfare-hosting-traefik -f deploy/traefik/compose.yaml down -v >/dev/null 2>&1 || true
  $ENGINE rm -f fanfare-hosting-up fanfare-hosting-nginx >/dev/null 2>&1 || true
  $ENGINE network rm "$NET" >/dev/null 2>&1 || true
  python3 scripts/fanfare-local.py --config-dir "$TMP/cfg" --forget-ca --yes >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

# ---- certificates from the name-constrained local CA (the only local-CA route)
python3 scripts/fanfare-local.py --config-dir "$TMP/cfg" --issue-certs "$TMP/certs" --name fanfare.local --ip 192.168.1.20 --accept-ca-risk >"$TMP/issue.log" 2>&1 \
  && ok "fanfare-local --issue-certs made the test certificate" || { bad "issue-certs failed"; cat "$TMP/issue.log"; }

# ---- 1. Caddy
echo "test: caddy validate ($CADDY_IMAGE)"
mkdir -p "$TMP/caddy"
cp deploy/caddy/Caddyfile* docker/fanfare.caddy "$TMP/caddy/"
cp -r "$TMP/certs" "$TMP/caddy/certs"
chmod -R a+rX "$TMP"
for f in Caddyfile Caddyfile.domain Caddyfile.local-ca; do
  out=$($ENGINE run --rm -e FANFARE_HOST=club.example.org \
        -v "$TMP/caddy:/etc/caddy:ro" \
        "$CADDY_IMAGE" caddy validate --config "/etc/caddy/$f" --adapter caddyfile 2>&1)
  if echo "$out" | grep -q "Valid configuration"; then ok "caddy validate $f"; else bad "caddy validate $f"; echo "$out" | tail -5; fi
done
out=$($ENGINE run --rm -v "$TMP/caddy:/etc/caddy:ro" "$CADDY_IMAGE" caddy fmt --diff /etc/caddy/Caddyfile 2>&1) \
  && ok "Caddyfile is formatted" || { bad "Caddyfile is not caddy-fmt clean"; echo "$out" | head; }

# ---- 2. Traefik (compose file, file provider, no Docker socket)
echo "test: traefik compose"
export FANFARE_HTTP_PORT; FANFARE_HTTP_PORT=$(free_port)
TP="${COMPOSE[*]} -p fanfare-hosting-traefik -f deploy/traefik/compose.yaml"
$TP up -d --no-build >"$TMP/tup.log" 2>&1 || { bad "traefik compose up failed"; tail -5 "$TMP/tup.log"; }
HOSTH=(-H 'Host: fanfare.local')   # the router in dynamic.yml matches this name
for _ in $(seq 1 40); do [ "$(curl -s "${HOSTH[@]}" -o /dev/null -w '%{http_code}' "http://127.0.0.1:$FANFARE_HTTP_PORT/")" = 200 ] && break; sleep 1; done
CIDS=$($ENGINE ps -q --filter "label=com.docker.compose.project=fanfare-hosting-traefik")
FCID=$($ENGINE ps -q --filter "label=com.docker.compose.project=fanfare-hosting-traefik" --filter "label=com.docker.compose.service=fanfare" | head -n1)
[ -n "$FCID" ] || die "no fanfare container in the traefik project"
check_host "http://127.0.0.1:$FANFARE_HTTP_PORT" "$FCID" "$REPO" "${HOSTH[@]}"
marker="traefik-nolog-$$-$RANDOM"
curl -s "${HOSTH[@]}" -o /dev/null -H 'User-Agent: smoke-ua-marker' "http://127.0.0.1:$FANFARE_HTTP_PORT/$marker?q=secret"
sleep 1
# shellcheck disable=SC2086
check_no_logs "$marker" $CIDS
for c in $CIDS; do
  if $ENGINE inspect "$c" --format '{{range .Mounts}}{{.Source}} {{end}}' | grep -q docker.sock; then bad "docker.sock is mounted"; fi
done
ok "no container mounts the Docker socket"
$TP down -v >/dev/null 2>&1

# ---- 3. nginx (what Nginx Proxy Manager includes in the host's server block)
echo "test: nginx ($NGINX_IMAGE)"
cat > "$TMP/nginx.conf" <<'CONF'
events {}
http {
  include /etc/nginx/mime.types;
  upstream fanfare { server fanfare-hosting-up:8080; }
  server {
    listen 8081;
    # what Nginx Proxy Manager generates for a proxy host (the access log is its default):
    access_log /dev/stdout;
    # NPM's "HSTS Enabled" adds a header at location level: that must not hide the container's headers
    location / { add_header Strict-Transport-Security "max-age=63072000" always; proxy_pass http://fanfare; proxy_set_header Host $host; }
    include /snippet/custom.conf;
  }
}
CONF
$ENGINE run --rm -v "$TMP/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$REPO/deploy/nginx-proxy-manager:/snippet:ro" \
  --add-host fanfare-hosting-up:127.0.0.1 "$NGINX_IMAGE" nginx -t >"$TMP/ngt.log" 2>&1 \
  && ok "nginx -t accepts custom.conf" || { bad "nginx -t failed"; cat "$TMP/ngt.log"; }
$ENGINE network create "$NET" >/dev/null
$ENGINE run -d --rm --name fanfare-hosting-up --network "$NET" "$FANFARE_IMAGE" >/dev/null
NP=$(free_port)
$ENGINE run -d --rm --name fanfare-hosting-nginx --network "$NET" -p "127.0.0.1:$NP:8081" \
  -v "$TMP/nginx.conf:/etc/nginx/nginx.conf:ro" -v "$REPO/deploy/nginx-proxy-manager:/snippet:ro" "$NGINX_IMAGE" >/dev/null
for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$NP/")" = 200 ] && break; sleep 1; done
check_host "http://127.0.0.1:$NP" fanfare-hosting-up "$REPO"
marker="nginx-nolog-$$-$RANDOM"
curl -s -o /dev/null -H 'User-Agent: smoke-ua-marker' "http://127.0.0.1:$NP/$marker?q=secret"
sleep 1
check_no_logs "$marker" fanfare-hosting-nginx fanfare-hosting-up
for h in content-security-policy x-content-type-options referrer-policy permissions-policy strict-transport-security; do
  expect "header $h arrives exactly once (with NPM-style location add_header)" "$(curl -sI "http://127.0.0.1:$NP/" | grep -ci "^$h:")" 1
done

echo "test: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
