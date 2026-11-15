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
https). **Plain HTTP is the default and needs no certificate.** HTTPS is opt-in: set `FANFARE_HOST` and
Caddy creates its own local certificate authority (`tls internal`) and serves
`https://<FANFARE_HOST>:8443`. Read the risks first (the container prints the same list at start-up):

1. Phones that trust this certificate trust everything signed with this CA's key. Caddy's CA is not
   name-constrained to local addresses (unlike the one made by `fanfare-local --https`), so a phone
   that trusts it trusts certificates for any site this key signs, not only Fanfare. Only trust it on
   devices you control.
2. The CA key is stored unencrypted in the Docker volume `caddy-data` on this computer. Anyone who can
   read that volume could create fake certificates. Only use this on a computer you trust.
3. Remove it when you no longer need it (see "Removing the certificate authority" below), and remove the
   certificate on each phone (Android: Settings > Security > Encryption & credentials > User
   credentials; iPhone: Settings > General > VPN & Device Management > profile > Remove).
4. Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or the microphone.
5. Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with the
   speakers. No certificate is needed for those.

To switch it on, set the address phones will use (a name that resolves on your network, or the
computer's LAN address) and publish the HTTPS port by uncommenting `- "8443:8443"` in `compose.yaml`:

```sh
FANFARE_HOST=fanfare.lan docker compose up -d      # or FANFARE_HOST=192.168.1.20
```

Then on each phone open the address once, and install Caddy's root certificate. Get it from the
container:

```sh
docker compose cp fanfare:/data/caddy/pki/authorities/local/root.crt ./fanfare-root.crt
```

Send that file to the phone yourself (cable, or a messenger you trust) and install it as a CA
certificate (Android: Settings > Security > Encryption & credentials > Install a certificate > CA
certificate; iPhone: open the file, install the profile, then Settings > General > About >
Certificate Trust Settings and switch it on). Check the fingerprint on both ends:
`openssl x509 -in fanfare-root.crt -noout -fingerprint -sha256`. A computer that also uses `http://localhost:8080`
needs no certificate.

### Removing the certificate authority

```sh
docker compose down -v        # deletes the caddy-data volume, and with it the CA and its key
rm -f fanfare-root.crt
```

Then remove the certificate on each phone (steps in point 3). Starting again without `FANFARE_HOST`
creates no certificate authority.

### A real domain (Let's Encrypt)

If the machine is reachable from the internet and a domain points at it, Caddy can get a public
certificate instead: `FANFARE_HOST=club.example.org FANFARE_ACME=1 docker compose up -d`, publishing
`80:8080` and `443:8443` (the commented lines in `compose.yaml`). Caddy then contacts Let's Encrypt
to obtain and renew the certificate. That is the one outgoing connection; the app itself never contacts
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
  With HTTPS add `FANFARE_STUDIO_EXTRA_ORIGINS=,https://fanfare.lan:8443`.
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
docker compose down -v          # container, network and the caddy-data volume (certificates)
docker rmi fanfare:local        # the image (add -f compose.studio.yaml for Studio and its volumes)
docker builder prune            # the voice download cache (Podman: podman system prune --build)
```

## Privacy

- No access logs. Caddy's `log` is off for requests and set to warnings for itself, so there are no
  addresses, user agents or paths in `docker compose logs`. `tests/docker/smoke.sh` checks this.
- No other origin is contacted. The Content-Security-Policy is sent as an HTTP header and is identical
  to the one in `index.html` (the smoke test compares them), allowing only the page's own origin and the
  local voice server on `localhost`/`127.0.0.1`.
- The container runs as an unprivileged user with a read-only root filesystem, all capabilities dropped
  and `no-new-privileges`.
- If you put a reverse proxy in front, its logs are your responsibility.

## Tests

`tests/docker/smoke.sh` builds the image, starts it and checks status codes, the CSP header, MIME types
(`.wasm`, `.onnx`), caching, compression, hardening and the absence of log lines, then runs `down -v`.
It finds `docker compose`, `docker-compose`, `podman compose` or `podman-compose` by itself
(override with `CONTAINER_CLI`) and picks a free port.
