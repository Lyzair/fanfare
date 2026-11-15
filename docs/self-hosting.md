# Self-hosting Fanfare with Docker

Fanfare is a static website. This repository ships a `Dockerfile` (builds the site, serves it with
Caddy, no Node in the final image) and a `compose.yaml`. Nothing leaves the browser, and the server
**keeps no access logs** (no visitor addresses are stored).

The Docker setup serves the app only. The **phone remote** ("soundboard mode") is a small relay inside
`fanfare-local.py`; it needs `fanfare-local` on the laptop and does not work from this container.

## Quick start

```sh
git clone <this repository> fanfare && cd fanfare
docker compose up -d --build
# open http://localhost:8080
```

The first build downloads about 660 MB of voices (kept in a build cache, so later builds are fast)
and takes several minutes. The port is published on `127.0.0.1` only: this computer, nobody else.

- **Port 8080 already taken?** `FANFARE_PORT=8090 docker compose up -d` (or put `FANFARE_PORT=8090` in a
  file called `.env` next to `compose.yaml`).
- **Podman:** `podman compose up -d --build` or `podman-compose up -d --build` work the same way.
  The build cache mount (`RUN --mount=type=cache`) is supported by Buildah; if your version rejects it,
  delete that one option in the `Dockerfile`. The image then downloads the voices on every build.
- Check: `docker compose ps` shows `healthy`.

## HTTPS on the LAN (optional, has risks)

On `http://` a phone on your Wi-Fi can use Fanfare, but not offline mode or the microphone (they need
https). **Plain HTTP is the default and needs no certificate.** HTTPS is opt-in and uses the **same
name-constrained local certificate authority (CA) as `fanfare-local --lan --https`**; the container
never creates a CA itself. Read the risks first (the container prints the same list):

1. Phones that trust this certificate trust everything signed with this laptop's key. Thanks to name constraints this is limited to local network addresses, but that includes routers, NAS drives and smart-home devices on that Wi-Fi.
2. The key is stored unencrypted on this computer. Anyone with access to this computer or user account could create fake certificates for local devices. Only use this on a computer you trust.
3. Remove it when you no longer need it: run start-fanfare with --forget-ca on the laptop (or: python3 fanfare-local.py --forget-ca), and remove the certificate on each phone (Android: Settings > Security > Encryption & credentials > User credentials; iPhone: Settings > General > VPN & Device Management > profile > Remove).
4. Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or the microphone.
5. Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with the speakers. No certificate is needed for those.

The CA is limited to private network addresses, `localhost` and `*.local` (10/8, 172.16/12, 192.168/16,
100.64/10, 127/8). Use a `.local` name such as `fanfare.local` (your router or computer must resolve it)
or the computer's LAN address, not an arbitrary name like `fanfare.lan`.

**1. Make the certificate** on the computer that runs Docker (Python 3.9+ with `openssl` or
`pip install cryptography`). It asks you to type `yes` the first time (no terminal: add `--accept-ca-risk`):

```sh
python3 scripts/fanfare-local.py --issue-certs ./certs --name fanfare.local --ip 192.168.1.20
```

This writes only `server.crt`, `server.key` (private), `hosts.txt` and `expires.txt` to `./certs`; the CA
and its key stay in your user config folder (`~/.config/fanfare-local/`). It prints the CA fingerprint, the
phone steps and the expiry date (825 days at most). Without Python on the host, use a throw-away container
(the CA then lives in `./ca`, keep that folder private; delete it to remove the CA):

```sh
docker run --rm -it -v "$PWD/scripts:/s:ro" -v "$PWD/certs:/out" -v "$PWD/ca:/ca" python:3.12-alpine \
  sh -c 'apk add -q openssl && python3 /s/fanfare-local.py --config-dir /ca --issue-certs /out --name fanfare.local'
```

(This container route is untested. Podman: the same, with `podman run`. The container runs as root inside, so with Docker run
`sudo chown -R "$USER" certs ca` afterwards. It installs `openssl`; alternatively `pip install cryptography`.)

**2. Start Fanfare with the HTTPS override** (publishes port 8443 on the LAN; the risk flag is your yes):

```sh
FANFARE_HOST=fanfare.local FANFARE_ACCEPT_CA_RISK=1 \
  docker compose -f compose.yaml -f compose.https.yaml up -d
```

The certificate folder is `./certs`, or `FANFARE_CERTS_DIR`. The port is `FANFARE_HTTPS_PORT` (8443);
`FANFARE_HTTPS_BIND` limits the address. Without `FANFARE_ACCEPT_CA_RISK=1` only HTTP is served. The
container refuses to start HTTPS when the certificate files are missing, when `FANFARE_HOST` is not covered
by the certificate (`hosts.txt`), or when the certificate has expired, and warns 30 days ahead. In this mode the
container runs as **your own user** (all capabilities still dropped), because the key is private to you. With
rootless Podman that is the default. With plain Docker set it explicitly:

```sh
FANFARE_UID=$(id -u) FANFARE_GID=$(id -g) FANFARE_HOST=fanfare.local FANFARE_ACCEPT_CA_RISK=1 \
  docker compose -f compose.yaml -f compose.https.yaml up -d
```

If the container cannot read the key it stops with a message saying so.

**3. Trust the CA on each phone.** Send `~/.config/fanfare-local/ca.crt` (the certificate, never `ca.key`) to
the phone yourself and install it as a CA certificate (Android: Settings > Security > Encryption & credentials >
Install a certificate > CA certificate; iPhone: open the file, install the profile, then Settings > General >
About > Certificate Trust Settings > switch it on). Compare the SHA-256 fingerprint with the one printed by
`--issue-certs`, then open `https://fanfare.local:8443`. This computer itself can keep using
`http://localhost:8080`, which needs no certificate.

**Renewing:** run the `--issue-certs` command again before the expiry date (it makes a fresh certificate once
the old one is about 700 days old; `--issue-certs` and `fanfare-local --lan --https` share the same server
certificate, so re-issuing from either is harmless), then `docker compose ... up -d --force-recreate`.

### Removing the certificate authority

```sh
docker compose -f compose.yaml -f compose.https.yaml down -v
python3 scripts/fanfare-local.py --forget-ca       # deletes the CA and its keys (add --yes to skip the question)
rm -rf certs                                        # (and ./ca if you used the container)
```

Then remove the certificate on each phone (Android: Settings > Security > Encryption & credentials > User
credentials > fanfare-local CA > Remove. iPhone: Settings > General > VPN & Device Management > fanfare-local CA >
Remove Profile).

### A real domain (Let's Encrypt)

If the machine is reachable from the internet and a domain points at it, Caddy can get a public
certificate instead: `FANFARE_HOST=club.example.org FANFARE_ACME=1 docker compose up -d`, publishing
`80:8080` and `443:8443` (the commented lines in `compose.yaml`). Caddy then contacts Let's Encrypt
to obtain and renew the certificate (Let's Encrypt only, no fallback issuer). That is the one outgoing connection; the app itself never contacts
anyone. Not the default and not tested here.

## With Fanfare Studio (the local voice server)

```sh
docker compose -f compose.yaml -f compose.studio.yaml up -d --build
```

This also builds and runs Fanfare Studio (CPU, ONNX 4-bit; the first start downloads about 3 GB of
models into a volume) from the folder in `FANFARE_STUDIO_DIR` (default `../fanfare-studio`). Until that
repository is renamed it still lives in `../sports-caller-voice-server`:
`FANFARE_STUDIO_DIR=../sports-caller-voice-server docker compose -f compose.yaml -f compose.studio.yaml up -d --build`.

- Studio is published on `127.0.0.1:5123` only, and the page may use it from `http://localhost:<FANFARE_PORT>`.
  With HTTPS add `FANFARE_STUDIO_EXTRA_ORIGINS=,https://fanfare.local:8443`.
- It is reachable from a browser **on this computer** (Fanfare step 4 > Local voice server > Connect,
  `http://127.0.0.1:5123`). Prepare the clips there, export the zip, import it on the phone: see
  `docs/local-voice-server.md`.
- GPU variants (ROCm `/dev/kfd` + `/dev/dri`, NVIDIA `gpus: all`) are described in `compose.studio.yaml`;
  they are not tested in this setup.

## Updating

```sh
git pull
docker compose up -d --build
```

Only changed layers are rebuilt; the voices come from the build cache. Remove old images with
`docker image prune`.

## Removing everything

```sh
docker compose down -v          # container, network and the caddy-data volume (Let's Encrypt data)
docker rmi fanfare:local        # the image (add -f compose.studio.yaml for Studio and its volumes)
docker builder prune            # the voice download cache (Podman: podman system prune --build)
```

## Privacy

- No access logs. Caddy's request log is off, its own log is limited to warnings, and the error log
  (`http.log.error`, which would carry the client address and User-Agent) is excluded, so there are no
  addresses, user agents or paths in `docker compose logs`. Server errors are not logged either; to debug,
  temporarily remove `exclude http.log.error` from the Caddyfiles in `docker/` (and rebuild).
  `tests/docker/smoke.sh` checks this for ordinary requests; the error case is not covered by a test.
- No other origin is contacted. The Content-Security-Policy is sent as an HTTP header and is identical
  to the one in `index.html` (the smoke test compares them), allowing only the page's own origin and the
  local voice server on `localhost`/`127.0.0.1`.
- The container runs as an unprivileged user with a read-only root filesystem, all capabilities dropped
  and `no-new-privileges`.
- If you put a reverse proxy in front, its logs are your responsibility.

## Tests

`tests/docker/smoke.sh` builds the image, starts it and checks status codes, the CSP header, MIME types
(`.wasm`, `.onnx`), caching, compression, hardening and the absence of log lines, then the HTTPS mode with a
temporary CA (certificates, risk gate, host check), then runs `down -v`.
It finds `docker compose`, `docker-compose`, `podman compose` or `podman-compose` by itself
(override with `CONTAINER_CLI`) and picks a free port.
