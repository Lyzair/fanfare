# Fanfare club-house appliance (Raspberry Pi)

(German: [README.de.md](README.de.md).)

A small computer next to the club-house router that serves Fanfare to every phone on the club Wi-Fi at
`http://fanfare.local`, installs security updates by itself, and stores nothing about visitors (no access logs).
You need about an hour, a keyboard-free setup is fine, and nobody needs to touch it afterwards.

**Good to know**

- This serves the app. The **phone remote** ("soundboard mode") and **Fanfare Studio** (the voice server) are not part of it.
  Studio is **not recommended on a Pi**: voice generation is too slow for comfortable preparation. Prepare voices on a laptop
  and use *Export (zip)* and import it on the phones (see `docs/local-voice-server.md`).
- Over plain `http` a phone can use Fanfare but **not offline mode or the microphone**. HTTPS needs a local certificate authority,
  which has risks (see the end of this page). It is optional and off by default.
- For all other hosting options see `docs/self-hosting.md`.

## What you need

- Raspberry Pi 4 or 5 (2 GB RAM is enough), a power supply, a 16 GB (or larger) microSD card of good quality.
- An Ethernet cable to the router is recommended (more reliable than Wi-Fi). A Pi 4 or 5 also works on Wi-Fi.
- A computer to prepare the card, with the Raspberry Pi Imager.

## 1. Prepare the SD card

1. Open the Raspberry Pi Imager. Choose your Pi model, then **Raspberry Pi OS Lite (64-bit)** (under "Raspberry Pi OS (other)").
2. Choose the SD card. When it asks about customisation, **edit the settings**:
   - **Hostname: `fanfare`** (this is what makes `fanfare.local` work).
   - A user name and a long password.
   - **Enable SSH**, ideally "allow public-key authentication only" with your SSH key.
   - Wi-Fi only if you cannot use Ethernet. Set your country.
3. Write the card, put it into the Pi, connect Ethernet and power. Wait two minutes.

## 2. Copy Fanfare to the Pi and run the installer

From your computer (replace `youruser`):

```sh
ssh youruser@fanfare.local
sudo apt-get update && sudo apt-get install -y git
git clone <the address of this repository> fanfare
cd fanfare
sudo ./deploy/raspberry-pi/install.sh --dry-run     # shows every step and changes nothing (optional)
sudo ./deploy/raspberry-pi/install.sh
```

(No git? Download the release folder to your computer and copy it: `scp -r fanfare youruser@fanfare.local:`.)

The installer is safe to run again. It

1. updates the package lists and installs **unattended-upgrades** (security and stable updates, automatic reboot at 04:00 when needed, unused packages removed),
2. installs **Docker from the Raspberry Pi OS repositories** (`docker.io`, plus the compose package) and **avahi** (the `fanfare.local` name). Nothing is downloaded by piping a script into a shell,
3. limits the log size (journald, Docker log driver `local`) to spare the SD card,
4. builds the Fanfare image from this folder (the first build downloads about 660 MB of voices and takes 20 minutes or longer on a Pi; a 2 GB Pi
   may need patience), and starts **Traefik + Fanfare** on port 80,
5. installs a weekly timer (`fanfare-update.timer`) that updates the checkout, rebuilds and restarts Fanfare **only if something changed**.

Options: `--no-update` (no weekly timer), `--dry-run` (print only), `--image-tar FILE` (see below), `--https` (opt-in, see the end).

**Faster build:** build the image on a laptop instead, and give the Pi the result:

```sh
docker buildx build --platform linux/arm64 --load -t fanfare:local .     # on the laptop
docker save fanfare:local -o fanfare-arm64.tar                           # copy this file to the Pi
sudo ./deploy/raspberry-pi/install.sh --image-tar fanfare-arm64.tar      # on the Pi
```

## 3. Use it

On a phone connected to the club Wi-Fi, open **`http://fanfare.local`**. If a phone does not know `fanfare.local`
(some older Android versions), use the Pi's address from your router's device list, for example `http://192.168.1.20`.
Then follow the manual: *Prepare voices* once (it needs a moment and the Pi's network), after that the voices are in the phone.

Check on the Pi: `docker ps` shows two containers (`traefik`, `fanfare`, the latter `healthy`).

## Keeping it up to date

Nothing to do. Updates of the system come from unattended-upgrades, updates of Fanfare from the weekly timer.
Update now: `sudo /usr/local/sbin/fanfare-update`. Pause the Fanfare timer: `sudo systemctl disable --now fanfare-update.timer`.
`journalctl -u fanfare-update` shows what it did.

## Backups

There is nothing to back up: teams and recordings live in each coach's phone (use *Export (zip)*). If you chose HTTPS, the folder
`/var/lib/fanfare` holds the certificate authority and the certificate.

## Uninstall

```sh
cd fanfare
docker compose --project-directory deploy/raspberry-pi down -v     # (docker-compose on older systems)
sudo systemctl disable --now fanfare-update.timer
sudo rm -f /usr/local/sbin/fanfare-update /etc/systemd/system/fanfare-update.*
```

If you used HTTPS: first `sudo python3 scripts/fanfare-local.py --config-dir /var/lib/fanfare/ca --forget-ca`, then `sudo rm -rf /var/lib/fanfare`.

## HTTPS for phones (optional, has risks)

Only if you really want offline mode and the microphone on phones, and accept the following. Run `sudo ./deploy/raspberry-pi/install.sh --https`:
it prints these five points, and you must type `yes` (scripts can use `--accept-ca-risk`) before anything is created. The certificate
comes from Fanfare's own name-constrained local CA (`fanfare-local.py --issue-certs`), never from a CA made by Traefik or by another tool.

1. Phones that trust this certificate trust everything signed with this laptop's key. Thanks to name constraints this is limited to local network addresses, but that includes routers, NAS drives and smart-home devices on that Wi-Fi.
2. The key is stored unencrypted on this computer. Anyone with access to this computer or user account could create fake certificates for local devices. Only use this on a computer you trust.
3. Remove it when you no longer need it: run start-fanfare with --forget-ca on the laptop (or: python3 fanfare-local.py --forget-ca), and remove the certificate on each phone (Android: Settings > Security > Encryption & credentials > User credentials; iPhone: Settings > General > VPN & Device Management > profile > Remove).
4. Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or the microphone.
5. Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop with the speakers. No certificate is needed for those.

After the installer finishes, send `/var/lib/fanfare/ca/ca.crt` (the certificate, **never** `ca.key`) to each phone yourself, install it as a CA certificate
(Android: Settings > Security > Encryption & credentials > Install a certificate > CA certificate; iPhone: open the file, install the profile, then
Settings > General > About > Certificate Trust Settings > switch it on), compare the fingerprint with the one the installer printed,
and open `https://fanfare.local`. Plain `http://fanfare.local` keeps working. The certificate is valid for at most 825 days; run the installer
with `--https` again before it ends.

## Problems

- `fanfare.local` is not found: the host name must be `fanfare` (Imager setting), the phone must be on the same network as the Pi, and some guest Wi-Fi networks block devices from seeing each other. Use the Pi's IP address.
- Port 80 is in use: another web server runs on the Pi. Stop it (or start the appliance by hand on another port with `FANFARE_HTTP_PORT=8088 docker compose --project-directory deploy/raspberry-pi up -d`; the address then ends in `:8088`).
- The build runs out of memory on a 2 GB Pi: build on a laptop and use `--image-tar`.
