# Fanfare selbst betreiben

(English: [self-hosting.md](self-hosting.md), das ist die ausführlichere Referenz.)

Fanfare ist eine statische Website. Nichts verlässt den Browser, und der Server **führt keine Zugriffsprotokolle**
(keine Besucheradressen werden gespeichert, DSGVO).

## 1. Welche Variante passt?

| Variante | Für wen | Braucht |
| --- | --- | --- |
| **Online-Demo** | Ausprobieren, Handy mit Internet | Nichts. |
| **Laptop mit `fanfare-local`** | Trainer am Spieltag: kein Internet, Lautsprecher am Laptop, Handy-Fernbedienung | Python 3.9+, das Paket `fanfare-local`. Als Einziges mit Handy-Fernbedienung. |
| **Docker** | Ein IT-erfahrenes Mitglied, das Fanfare auf einem PC oder Heimserver betreiben will | Docker oder Podman |
| **Raspberry-Pi-Gerät** (`deploy/raspberry-pi/README.de.md`) | Vereinsheim: Ein Pi neben dem Router liefert `http://fanfare.local` an alle Handys im Vereins-WLAN und hält sich selbst aktuell | Raspberry Pi 4 oder 5 (2 GB genügen), SD-Karte, Netzwerkkabel |
| **Hinter deinem vorhandenen Proxy** (Caddy, Traefik, Nginx Proxy Manager unten) | Verein mit eigenem Server, Reverse-Proxy und Domain | Ein Proxy, den du kennst |

Fanfare Studio (der lokale Stimmen-Server) ist **auf einem Raspberry Pi nicht empfehlenswert**: zu langsam. Bereite Stimmen auf einem Laptop vor und exportiere/importiere sie (`docs/local-voice-server.md`).

## 2. Was jeder Host leisten muss

Fanfare ist ein Ordner statischer Dateien (`dist/`). Das Docker-Image erfüllt alles schon (`docker/fanfare.caddy`), ebenso jeder Proxy davor
(er reicht die Header durch). Nur wenn du `dist/` selbst auslieferst, ist das deine Aufgabe:

- [ ] `dist/` statisch ausliefern. Betrieb in einem Unterpfad geht (relative URLs, `base: './'`; der Service-Worker-Bereich folgt dem Ordner).
- [ ] MIME-Typen: `.wasm` als `application/wasm`, `.mjs` und `.js` als JavaScript, `.webmanifest` als `application/manifest+json`. `.wasm`, `.onnx`, `.data` und Medien **nicht** komprimieren.
- [ ] Den **Content-Security-Policy-Header** senden, exakt wie das `<meta>`-Tag in `index.html`:
      `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' http://localhost:* http://127.0.0.1:*; media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'`
- [ ] `X-Content-Type-Options: nosniff` und `Referrer-Policy: no-referrer`.
- [ ] `Cache-Control: no-cache` für `index.html` und `sw.js`; langer Cache (`public, max-age=31536000, immutable`) nur für die Dateien unter `assets/`.
- [ ] **Zugriffsprotokolle aus oder IP-Adressen anonymisiert** (DSGVO). In allen Beispielen sind sie aus. Schreibt dein Proxy oder Host ein eigenes Log, bist du dafür verantwortlich.
- [ ] Keine Anfragen an andere Server: Die Seite macht keine, und die CSP verbietet sie.

## Docker

```sh
git clone <Adresse dieses Repositorys> fanfare && cd fanfare
docker compose up -d --build
# http://localhost:8080 öffnen
```

Der erste Bau lädt etwa 660 MB Stimmen (in einem Build-Cache, spätere Builds sind schnell) und dauert einige Minuten. Der Port ist nur auf `127.0.0.1` veröffentlicht.
Port 8080 belegt: `FANFARE_PORT=8090 docker compose up -d`. Podman: `podman compose up -d --build`. Prüfen: `docker compose ps` zeigt `healthy`.

Images für andere Prozessoren (`linux/amd64`, `linux/arm64` für Raspberry Pi 4/5 mit 64-Bit-System, `linux/arm/v7` für ältere Pis; Letzteres ungetestet auf echter Hardware):
`docker buildx build --platform linux/arm64 --load -t fanfare:local .` und `docker save fanfare:local -o fanfare-arm64.tar`.
Die CI baut alle Plattformen, ohne etwas zu veröffentlichen. Das Veröffentlichen von Images ist eine manuelle Entscheidung der Maintainer.

## HTTPS ohne öffentliche Domain: Risiken und Schritte (optional)

Das gilt für jede Variante mit lokalem Zertifikat: Docker, Caddy, Traefik, Nginx Proxy Manager, Raspberry-Pi-Gerät.
**Selbstsigniertes HTTPS ist überall optional und nie die Voreinstellung.** Es gibt genau einen Weg: `fanfare-local.py --issue-certs`
(eine durch Namensbeschränkungen auf lokale Adressen begrenzte Zertifizierungsstelle). Nicht `tls internal` von Caddy, nicht eine von Traefik erzeugte
Zertifizierungsstelle, nicht mkcert. Traefiks eingebautes Standardzertifikat: Browserwarnung auf jedem Gerät, nichts zu installieren (Offline-Modus und Mikrofon gehen dann auf Handys trotzdem nicht).

Lies zuerst die Risiken (der Container und der Pi-Installer zeigen dieselbe Liste):

1. Handys, die diesem Zertifikat vertrauen, vertrauen allem, was mit dem Schlüssel dieses Laptops signiert wird. Durch Namensbeschränkungen gilt das nur für Adressen im lokalen Netz, aber dazu gehören Router, NAS-Laufwerke und Smart-Home-Geräte in diesem WLAN.
2. Der Schlüssel liegt unverschlüsselt auf diesem Computer. Wer Zugriff auf diesen Computer oder dieses Benutzerkonto hat, könnte gefälschte Zertifikate für lokale Geräte erstellen. Nutze das nur auf einem Computer, dem du vertraust.
3. Entferne es, wenn du es nicht mehr brauchst: start-fanfare mit --forget-ca auf dem Laptop starten (oder: python3 fanfare-local.py --forget-ca) und das Zertifikat auf jedem Handy löschen (Android: Einstellungen > Sicherheit > Verschlüsselung und Anmeldedaten > Nutzerzertifikate; iPhone: Einstellungen > Allgemein > VPN und Geräteverwaltung > Profil > Entfernen).
4. Ohne HTTPS funktioniert Fanfare im WLAN trotzdem, aber Handys können weder den Offline-Modus noch das Mikrofon nutzen.
5. Einfachere Alternativen: die Online-Demo auf dem Handy oder Fanfare direkt auf dem Laptop mit den Lautsprechern. Dafür ist kein Zertifikat nötig.

1. Zertifikat erzeugen (Python 3.9+ mit `openssl`): `python3 scripts/fanfare-local.py --issue-certs ./certs --name fanfare.local --ip 192.168.1.20` (du tippst einmal `yes`; ohne Terminal: `--accept-ca-risk`).
   Das schreibt `server.crt`, `server.key`, `hosts.txt`, `expires.txt` nach `./certs` (höchstens 825 Tage gültig); die Zertifizierungsstelle bleibt in `~/.config/fanfare-local/`.
2. Docker: `FANFARE_UID=$(id -u) FANFARE_GID=$(id -g) FANFARE_HOST=fanfare.local FANFARE_ACCEPT_CA_RISK=1 docker compose -f compose.yaml -f compose.https.yaml up -d`
   (Port 8443; ohne `FANFARE_ACCEPT_CA_RISK=1` gibt es nur HTTP).
3. `~/.config/fanfare-local/ca.crt` (nie `ca.key`) selbst auf jedes Handy schicken und als CA-Zertifikat installieren, Fingerabdruck vergleichen.
4. Entfernen: `docker compose -f compose.yaml -f compose.https.yaml down -v`, `python3 scripts/fanfare-local.py --forget-ca`, `rm -rf certs`, Zertifikat auf jedem Handy löschen.

## Hinter deinem eigenen Reverse-Proxy

Alle Beispiele liefern standardmäßig HTTP, haben **kein Zugriffsprotokoll** und überlassen dem Fanfare-Container MIME-Typen und Cache-Regeln.
Die Dateien liegen in `deploy/`; `tests/hosting/validate.sh` führt sie aus (`caddy validate`, `nginx -t` und je ein Traefik- und nginx-Proxy vor dem echten Image,
geprüft werden CSP, `nosniff`, `Referrer-Policy`, `application/wasm`, `no-cache`, langer Cache und das Fehlen von Log-Zeilen).

### Caddy

`deploy/caddy/`: `Caddyfile` (HTTP auf `:8080`), `Caddyfile.domain` (echte Domain mit Let's Encrypt, nur Let's Encrypt, ohne Ausweichanbieter; die einzige ausgehende Verbindung)
und `Caddyfile.local-ca` (optional, mit Risiken: Zertifikate aus `fanfare-local.py --issue-certs`, Caddy erzeugt keine eigene Zertifizierungsstelle).
Lege `docker/fanfare.caddy` daneben und setze darin `root * /srv` auf deinen `dist/`-Ordner. Caddy schreibt kein Zugriffsprotokoll, solange ein Site-Block kein `log` hat;
`log { exclude http.log.error }` hält auch Fehlerzeilen (Adresse, User-Agent) heraus.

### Traefik

`deploy/traefik/`: `compose.yaml`, `traefik.yml`, `dynamic.yml` (Router, Service, Header-Middleware), `dynamic-tls.yml`. Traefik liest **Dateien**, es braucht keinen Docker-Socket.
`cd deploy/traefik && docker compose up -d --build`, dann `http://fanfare.local/` (`Host()` in `dynamic.yml` anpassen).

- Die Middleware `fanfare-headers` setzt CSP (identisch zu `index.html`), `nosniff`, `Referrer-Policy` und `Permissions-Policy`; `Content-Type` und `Cache-Control` des Containers bleiben unverändert.
- Kein `accessLog`-Abschnitt, also kein Zugriffsprotokoll; Versionsprüfung und anonyme Nutzungsdaten sind aus.
- **Docker-Labels** (`compose.labels.yaml`) nur als Beispiel: Sie brauchen den **Docker-Socket** im Traefik-Container, und wer den kontrolliert, kontrolliert Docker, also root auf dem Host (`:ro` ändert das nicht). Wenn du Labels willst, setze einen
  schreibgeschützten Socket-Proxy dazwischen. Der Datei-Provider vermeidet das Problem und wird vom Raspberry-Pi-Gerät benutzt.
- **TLS mit echter Domain:** `certificatesResolvers` mit Let's Encrypt (HTTP- oder DNS-Challenge) in `traefik.yml`, Port 443 veröffentlichen, `tls: {certResolver: ...}` am Router. Hier nicht getestet.
- **TLS selbstsigniert:** (a) Traefiks eingebautes Standardzertifikat: Browserwarnung auf jedem Gerät; (b) Datei-Provider-Zertifikat aus der namensbeschränkten lokalen Zertifizierungsstelle (`--issue-certs`, die Zeilen `dynamic-tls.yml` und `./certs` in `compose.yaml` einkommentieren, `443:443` veröffentlichen). Risiken oben lesen.

### Nginx Proxy Manager

Details und Klickweg: `deploy/nginx-proxy-manager/README.md`. Proxy-Host: Schema `http`, Weiterleitung an den Container `fanfare` Port `8080`, „Cache Assets“ aus, WebSockets nicht nötig.
Unter **Advanced > Custom Nginx Configuration** den Inhalt von `deploy/nginx-proxy-manager/custom.conf` einfügen: `access_log off;`, die vier Sicherheits-Header genau einmal und die CSP wie in `index.html`.
SSL: mit echter Domain Let's Encrypt; ohne Domain nur mit den Risiken oben: „Custom Certificate“ mit `server.crt` und `server.key` aus `fanfare-local.py --issue-certs`, nichts von NPM selbst erzeugen lassen.
Der Fehler-Log von NPM kann bei fehlgeschlagenen Anfragen Adressen enthalten; Aufbewahrung kurz halten.

### Raspberry-Pi-Gerät

Ein Pi 4 oder 5 neben dem Router im Vereinsheim liefert `http://fanfare.local` an alle Handys im Vereins-WLAN. Schritt für Schritt für Einsteiger: `deploy/raspberry-pi/README.de.md`.
Kurz: Ordner auf den Pi kopieren, `sudo ./deploy/raspberry-pi/install.sh` (mit `--dry-run` werden nur die Schritte angezeigt). Der Installer richtet unattended-upgrades ein (Sicherheits- und Stable-Updates, Neustartfenster 04:00),
installiert Docker aus den Paketquellen (kein `curl | sh`), avahi (`fanfare.local`), begrenzt journald und nutzt den Docker-Log-Treiber `local` (SD-Karte schonen), baut das Image (oder lädt es mit `--image-tar`) und startet Traefik + Fanfare auf Port 80.
Ein wöchentlicher systemd-Timer (`fanfare-update.timer`, `--no-update` überspringt ihn) baut neu und startet nur bei Änderungen neu. HTTPS nur mit `--https`: Der Installer zeigt die fünf Risiken, du tippst `yes` (oder `--accept-ca-risk`).

## Fanfare Studio (Stimmen-Server)

`docker compose -f compose.yaml -f compose.studio.yaml up -d --build` baut und startet Studio zusätzlich (CPU; der erste Start lädt etwa 3 GB Modelle). Studio ist nur auf `127.0.0.1:5123` erreichbar und
wird im Browser auf diesem Computer benutzt (Schritt 4 > Lokaler Stimmen-Server). Details: `docs/local-voice-server.md`. Nicht auf einem Raspberry Pi.

## Aktualisieren, Sicherung, Deinstallieren

- **Aktualisieren:** `git pull && docker compose up -d --build`; alte Images mit `docker image prune` entfernen. Das Pi-Gerät macht das wöchentlich selbst (`sudo /usr/local/sbin/fanfare-update` sofort).
- **Sicherung: Es gibt nichts zu sichern.** Teams, Aufstellungen und Aufnahmen liegen in den Browsern (in der App *Export (zip)*). Auf dem Server sind nur die Konfiguration (Dateien in `deploy/`) und, bei HTTPS, der Zertifikatsordner und die Zertifizierungsstelle (`~/.config/fanfare-local/`, Pi: `/var/lib/fanfare`) aufhebenswert.
- **Deinstallieren:** `docker compose down -v` und `docker rmi fanfare:local`; Pi: siehe `deploy/raspberry-pi/README.de.md`, Abschnitt „Entfernen“.

## Datenschutz

Keine Zugriffsprotokolle, keine anderen Server, der Container läuft als unprivilegierter Benutzer mit schreibgeschütztem Dateisystem, ohne Capabilities und mit `no-new-privileges`.
Die CSP wird als HTTP-Header gesendet und ist identisch zu der in `index.html`. Ein Proxy davor: Seine Logs liegen in deiner Verantwortung; in allen Beispielen unter `deploy/` sind sie aus.

## Tests

`tests/docker/smoke.sh` (Image), `tests/hosting/validate.sh` (Proxy-Beispiele) und `tests/raspberry-pi/dry-run.sh` (Installer `--dry-run` in Debian Bookworm, arm64 über QEMU, Pi-Compose-Datei mit curl-Prüfungen); alle laufen in der CI.
