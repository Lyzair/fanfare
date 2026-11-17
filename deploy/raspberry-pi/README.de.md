# Fanfare-Vereinsheim-Gerät (Raspberry Pi)

(English: [README.md](README.md).)

Ein kleiner Computer neben dem Router im Vereinsheim, der Fanfare für alle Handys im Vereins-WLAN unter
`http://fanfare.local` bereitstellt, Sicherheitsupdates selbst einspielt und nichts über Besucher speichert (keine Zugriffsprotokolle).
Du brauchst etwa eine Stunde, danach muss niemand mehr etwas anfassen.

**Gut zu wissen**

- Das Gerät liefert die App. Die **Handy-Fernbedienung** („Soundboard-Modus“) und **Fanfare Studio** (der Stimmen-Server) gehören nicht dazu.
  Studio ist **auf einem Pi nicht empfehlenswert**: Die Stimmen-Erzeugung ist zu langsam. Bereite die Stimmen auf einem Laptop vor und nutze
  *Export (zip)* und den Import auf den Handys (siehe `docs/local-voice-server.md`).
- Über einfaches `http` funktioniert Fanfare auf dem Handy, aber **nicht der Offline-Modus und nicht das Mikrofon**. HTTPS braucht eine lokale
  Zertifizierungsstelle und hat Risiken (siehe Ende dieser Seite). Es ist optional und standardmäßig aus.
- Alle anderen Betriebsarten stehen in `docs/self-hosting.de.md`.

## Was du brauchst

- Raspberry Pi 4 oder 5 (2 GB RAM reichen), Netzteil, microSD-Karte ab 16 GB in guter Qualität.
- Ein Netzwerkkabel zum Router wird empfohlen (zuverlässiger als WLAN). Ein Pi 4 oder 5 geht auch per WLAN.
- Ein Computer mit dem Raspberry Pi Imager, um die Karte vorzubereiten.

## 1. SD-Karte vorbereiten

1. Raspberry Pi Imager öffnen. Pi-Modell wählen, dann **Raspberry Pi OS Lite (64-bit)** (unter „Raspberry Pi OS (other)“).
2. SD-Karte wählen. Bei der Frage nach Anpassungen die **Einstellungen bearbeiten**:
   - **Hostname: `fanfare`** (damit funktioniert `fanfare.local`).
   - Ein Benutzername und ein langes Passwort.
   - **SSH aktivieren**, am besten „nur Public-Key-Authentifizierung“ mit deinem SSH-Schlüssel.
   - WLAN nur, wenn kein Netzwerkkabel möglich ist. Land einstellen.
3. Karte schreiben, in den Pi stecken, Netzwerkkabel und Strom anschließen. Zwei Minuten warten.

## 2. Fanfare auf den Pi kopieren und den Installer starten

Von deinem Computer aus (ersetze `deinbenutzer`):

```sh
ssh deinbenutzer@fanfare.local
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/Lyzair/fanfare.git fanfare
cd fanfare
sudo ./deploy/raspberry-pi/install.sh --dry-run     # zeigt alle Schritte, ändert nichts (optional)
sudo ./deploy/raspberry-pi/install.sh
```

(Kein git? Auf GitHub „Code“ → „Download ZIP“, entpacken, den Ordner in `fanfare` umbenennen und kopieren: `scp -r fanfare deinbenutzer@fanfare.local:`.)

Der Installer kann gefahrlos mehrfach laufen. Er

1. aktualisiert die Paketlisten und installiert **unattended-upgrades** (Sicherheits- und Stable-Updates, automatischer Neustart um 04:00 bei Bedarf, nicht mehr benötigte Pakete werden entfernt),
2. installiert **Docker aus den Raspberry-Pi-OS-Paketquellen** (`docker.io` plus das Compose-Paket) und **avahi** (der Name `fanfare.local`). Es wird kein Skript per Pipe in eine Shell geladen,
3. begrenzt die Protokollgröße (journald, Docker-Log-Treiber `local`), um die SD-Karte zu schonen,
4. baut das Fanfare-Image aus diesem Ordner (der erste Bau lädt etwa 660 MB Stimmen und dauert auf einem Pi 20 Minuten oder länger) und startet **Traefik + Fanfare** auf Port 80,
5. richtet einen wöchentlichen Timer (`fanfare-update.timer`) ein, der die Kopie in `/opt/fanfare` aktualisiert, neu baut und Fanfare **nur bei Änderungen** neu startet.

**Wo was liegt.** Der Installer legt Fanfare in **`/opt/fanfare`** ab, Besitzer root, für normale Benutzer nicht beschreibbar: Der wöchentliche Job läuft als root und darf nie Code aus einem Ordner ausführen, den ein Benutzer ändern kann. Hat dein Ordner ein git-Remote mit `https://`-Adresse, ist `/opt/fanfare` ein Klon davon (der Installer zeigt die Adresse) und der Timer führt `git -C /opt/fanfare pull --ff-only` aus. Ohne ein solches (kein Remote, oder ein lokaler Pfad, eine `file://`- oder `ssh://`-Adresse) werden die Dateien nur kopiert, und der Timer baut nur neu. Der Installer bricht ab, wenn die Kopie eine Verknüpfung enthält, die aus `/opt/fanfare` hinausführt. Dein eigener Ordner wird danach nicht mehr benutzt und kann gelöscht werden. Um eine Fanfare-Datei zu ändern, bearbeite sie in `/opt/fanfare` mit `sudo`. Der Zertifikatsstand (nur HTTPS) liegt in `/var/lib/fanfare`, die Installer-Einstellungen in `/etc/fanfare/install.conf`.

**Sicherheitshinweis:** Mitglied der Gruppe `docker` zu sein, ist dasselbe wie root auf dem Pi. Füge keine Benutzer dieser Gruppe hinzu; nutze `sudo docker ...` wie in dieser Anleitung.

Optionen: `--no-update` (kein Wochen-Timer), `--dry-run` (nur anzeigen), `--image-tar DATEI` (siehe unten), `--https` (optional, siehe Ende), `--hostname NAME` (Hostnamen setzen; standardmäßig bleibt der aktuelle, die Handys nutzen `<Hostname>.local`; mit der Imager-Einstellung `fanfare` ist das `fanfare.local`).

**Schneller bauen:** Baue das Image auf einem Laptop und gib dem Pi das Ergebnis:

```sh
docker buildx build --platform linux/arm64 --load -t fanfare:local .     # auf dem Laptop
docker save fanfare:local -o fanfare-arm64.tar                           # Datei auf den Pi kopieren
sudo ./deploy/raspberry-pi/install.sh --image-tar fanfare-arm64.tar      # auf dem Pi
```

Mit `--image-tar` gibt es **keinen Wochen-Timer** (auf dem Pi wird nichts gebaut). Zum Aktualisieren baust du auf dieselbe Weise eine neue tar-Datei und startest den Installer erneut mit `--image-tar NEUEDATEI`.

## 3. Benutzen

Auf einem Handy im Vereins-WLAN **`http://fanfare.local`** öffnen. Kennt ein Handy `fanfare.local` nicht (manche älteren
Android-Versionen), nimm die Adresse des Pi aus der Geräteliste deines Routers, zum Beispiel `http://192.168.1.20`.
Dann der Anleitung folgen: einmal *Stimmen vorbereiten*, danach sind die Stimmen auf dem Handy.

Prüfen auf dem Pi: `sudo docker ps` zeigt zwei Container (`traefik`, `fanfare`, letzterer `healthy`).

## Aktuell bleiben

Du musst nichts tun. Systemupdates kommen von unattended-upgrades, Fanfare-Updates vom Wochen-Timer. Das Caddy-Basisimage in Fanfare ist im `Dockerfile` festgelegt: Sicherheitskorrekturen daran kommen mit einer neuen Version dieses Repositorys, die das Wochen-Update holt.
Sofort aktualisieren: `sudo /usr/local/sbin/fanfare-update`. Timer anhalten: `sudo systemctl disable --now fanfare-update.timer`.
`journalctl -u fanfare-update` zeigt, was passiert ist.

## Datensicherung

Es gibt nichts zu sichern: Teams und Aufnahmen liegen im Handy der Trainerin oder des Trainers (*Export (zip)* nutzen). Wenn du HTTPS gewählt hast,
liegen in `/var/lib/fanfare` die Zertifizierungsstelle und das Zertifikat.

## Entfernen

```sh
sudo docker compose --project-directory /opt/fanfare/deploy/raspberry-pi down -v     # (docker-compose auf älteren Systemen)
sudo systemctl disable --now fanfare-update.timer
sudo rm -f /usr/local/sbin/fanfare-update /etc/systemd/system/fanfare-update.*
sudo rm -rf /opt/fanfare /etc/fanfare
```

Falls du HTTPS genutzt hast: zuerst `sudo python3 /opt/fanfare/scripts/fanfare-local.py --config-dir /var/lib/fanfare/ca --forget-ca`, dann `sudo rm -rf /var/lib/fanfare`.

## HTTPS für Handys (optional, mit Risiken)

Nur, wenn du wirklich Offline-Modus und Mikrofon auf den Handys willst und Folgendes akzeptierst. Starte `sudo ./deploy/raspberry-pi/install.sh --https`:
Der Installer zeigt diese fünf Punkte, und du musst `yes` eintippen (Skripte nutzen `--accept-ca-risk`), bevor etwas erstellt wird. Das Zertifikat
stammt von Fanfares eigener, namensbeschränkter lokaler Zertifizierungsstelle (`fanfare-local.py --issue-certs`), nie von einer Zertifizierungsstelle, die Traefik oder ein anderes Werkzeug erzeugt.

1. Handys, die diesem Zertifikat vertrauen, vertrauen allem, was mit dem Schlüssel dieses Laptops signiert wird. Durch Namensbeschränkungen gilt das nur für Adressen im lokalen Netz, aber dazu gehören Router, NAS-Laufwerke und Smart-Home-Geräte in diesem WLAN.
2. Der Schlüssel liegt unverschlüsselt auf diesem Computer. Wer Zugriff auf diesen Computer oder dieses Benutzerkonto hat, könnte gefälschte Zertifikate für lokale Geräte erstellen. Nutze das nur auf einem Computer, dem du vertraust.
3. Entferne es, wenn du es nicht mehr brauchst: start-fanfare mit --forget-ca auf dem Laptop starten (oder: python3 fanfare-local.py --forget-ca) und das Zertifikat auf jedem Handy löschen (Android: Einstellungen > Sicherheit > Verschlüsselung und Anmeldedaten > Nutzerzertifikate; iPhone: Einstellungen > Allgemein > VPN und Geräteverwaltung > Profil > Entfernen).
4. Ohne HTTPS funktioniert Fanfare im WLAN trotzdem, aber Handys können weder den Offline-Modus noch das Mikrofon nutzen.
5. Einfachere Alternativen: die Online-Demo auf dem Handy oder Fanfare direkt auf dem Laptop mit den Lautsprechern. Dafür ist kein Zertifikat nötig.

Nach dem Installer schickst du `/var/lib/fanfare/ca/ca.crt` (das Zertifikat, **nie** `ca.key`) selbst an jedes Handy und installierst es als CA-Zertifikat
(Android: Einstellungen > Sicherheit > Verschlüsselung und Anmeldedaten > Zertifikat installieren > CA-Zertifikat; iPhone: Datei öffnen, Profil installieren, dann
Einstellungen > Allgemein > Info > Zertifikatsvertrauenseinstellungen > einschalten), vergleichst den Fingerabdruck mit dem, den der Installer angezeigt hat,
und öffnest `https://fanfare.local`. Das einfache `http://fanfare.local` funktioniert weiter. Das Zertifikat gilt höchstens 825 Tage; starte den Installer
vor Ablauf nochmals mit `--https`. Es gilt für den Hostnamen und die Adresse, die der Pi bei der Installation hatte: Gib dem Pi eine feste Adresse (DHCP-Reservierung im Router); ändert sich die Adresse, starte den Installer erneut mit `--https`, um ein neues Zertifikat zu erzeugen.

## Probleme

- `fanfare.local` wird nicht gefunden: Der Hostname muss `fanfare` sein (Imager-Einstellung), das Handy muss im selben Netz wie der Pi sein, und manche Gast-WLANs verhindern, dass Geräte sich sehen. Nimm die IP-Adresse des Pi.
- Port 80 ist belegt: Auf dem Pi läuft ein anderer Webserver. Beende ihn (oder starte das Gerät von Hand auf einem anderen Port mit `FANFARE_HTTP_PORT=8088 sudo -E docker compose --project-directory /opt/fanfare/deploy/raspberry-pi up -d`; die Adresse endet dann auf `:8088`).
- Der Bau geht auf einem Pi mit 2 GB der Speicher aus: auf einem Laptop bauen und `--image-tar` nutzen.
