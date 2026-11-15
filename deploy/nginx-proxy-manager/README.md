# Fanfare behind Nginx Proxy Manager

Nginx Proxy Manager (NPM) is a web interface around nginx. This guide puts Fanfare behind it in five minutes.
The general rules every host must follow are in `docs/self-hosting.md` (section "What any host must do").

## 1. Run the Fanfare container

From the repository: `docker compose up -d --build` (the `compose.yaml` in the top folder). To let NPM reach it, put it on the
same Docker network as NPM and do not publish the port: in your own compose file give both services the same network, or
publish it as `127.0.0.1:8080` when NPM runs with host networking.

## 2. Add the proxy host (Hosts > Proxy Hosts > Add)

| Field | Value |
| --- | --- |
| Domain Names | your domain, or `fanfare.local` on a LAN |
| Scheme | `http` |
| Forward Hostname / IP | the container name (`fanfare`, same Docker network) or the server's IP |
| Forward Port | `8080` |
| Cache Assets | **off** (the container already sets the cache rules) |
| Block Common Exploits | on is fine |
| Websockets Support | not needed |

## 3. Headers, MIME and the access log (Advanced tab)

Paste the whole file `custom.conf` from this folder into **Custom Nginx Configuration** and save. It

- switches the **access log off** for this host (`access_log off;`), so no visitor address, path or User-Agent is stored (GDPR),
- deliberately changes nothing else: the Content-Security-Policy, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Content-Type`
  (`application/wasm` and the others) and `Cache-Control` (`no-cache` for `index.html` and `sw.js`, a long cache for `assets/`) come from the Fanfare container
  and pass through exactly once, even if you switch on HSTS ("HSTS Enabled") in NPM, which adds its own header line.

`tests/hosting/validate.sh` runs `nginx -t` on this file and a real nginx proxy in front of the image (with an HSTS `add_header` like NPM's) and checks all of it.
NPM's per-host error log can still contain a client address when a request fails; keep its retention short.

## 4. SSL

- **A real domain:** on the SSL tab choose "Request a new SSL Certificate" (Let's Encrypt), "Force SSL" on. That is the only outgoing connection.
- **No public domain: only if you accept the risks below.** Do not use anything that creates its own CA. Make the certificate with Fanfare's tool, which
  limits the CA by name constraints to local addresses:
  `python3 scripts/fanfare-local.py --issue-certs ./certs --name fanfare.local --ip 192.168.1.20`
  then in NPM: SSL Certificates > Add > **Custom Certificate**, upload `server.crt` as the certificate and `server.key` as the key (no intermediate), and choose it
  on the proxy host. Trust `ca.crt` (from `~/.config/fanfare-local/`, never `ca.key`) on each phone, as described in `docs/self-hosting.md`.

### Risks of a local certificate authority (read before you do this)

1. Phones that trust this certificate trust everything signed with this laptop's key. Thanks to name constraints this is limited to local network addresses, but that includes routers, NAS drives and smart-home devices on that Wi-Fi.
2. The key is stored unencrypted on this computer. Anyone with access to this computer or user account could create fake certificates for local devices. Only use this on a computer you trust.
3. Remove it when you no longer need it: run start-fanfare with --forget-ca on the laptop (or: python3 fanfare-local.py --forget-ca), and remove the certificate on each phone (Android: Settings > Security > Encryption & credentials > User credentials; iPhone: Settings > General > VPN & Device Management > profile > Remove).
4. Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or the microphone.
5. Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with the speakers. No certificate is needed for those.

Remove it again: `python3 scripts/fanfare-local.py --forget-ca`, delete the certificate in NPM, and remove it on each phone.

## 5. Updating

`git pull && docker compose up -d --build`. NPM keeps its configuration. There is nothing to back up for Fanfare (all data is in the browsers); back up NPM's own `data` folder as you do anyway.
