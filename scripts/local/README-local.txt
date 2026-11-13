FANFARE - run it on your own computer (no internet needed)
==========================================================

1. Unzip this folder anywhere.
2. Start it:
   - Windows:        double-click start-fanfare.bat
   - macOS:          double-click start-fanfare.command
   - Linux:          run ./start-fanfare.sh
   Python 3.9 or newer must be installed (free: https://www.python.org/downloads/).
   If macOS or Linux says "permission denied", run:  chmod +x start-fanfare.*
3. Your browser opens Fanfare. Keep the black window open while you use it.
   Close it (or press Ctrl+C) to stop.

Offline: open Fanfare once, press "Prepare voices" and wait for "All voices ready".
After that it works without any network.

Use it on phones and tablets (same Wi-Fi):
   start-fanfare with the option --lan   (e.g. ./start-fanfare.sh --lan)
   The window shows an https:// address. Open <address>/trust.html on the phone once
   and follow the steps there to trust this laptop (needed for offline mode and the
   microphone). Compare the fingerprint on the phone with the one in the window.
   HTTPS needs OpenSSL or the Python package "cryptography"; otherwise plain http is
   used, where phones cannot work offline.

Privacy: the server only answers requests from this computer / your Wi-Fi, never
contacts the internet and logs nothing except "GET /path 200". Names and sounds stay in
your browser. The certificate files are kept in your user folder (not in this folder).

Options: --port N   use another port (default 8080; 8443 for --lan)
         --http     with --lan: plain http
         --open     open the browser (the start files do this already)

------------------------------------------------------------------------------

FANFARE - auf dem eigenen Rechner starten (kein Internet nötig)
===============================================================

1. Diesen Ordner irgendwo entpacken.
2. Starten:
   - Windows:        start-fanfare.bat doppelklicken
   - macOS:          start-fanfare.command doppelklicken
   - Linux:          ./start-fanfare.sh ausführen
   Python 3.9 oder neuer muss installiert sein (kostenlos: https://www.python.org/downloads/).
   Meldet macOS oder Linux "Zugriff verweigert", führe aus:  chmod +x start-fanfare.*
3. Dein Browser öffnet Fanfare. Lass das schwarze Fenster offen, solange du Fanfare
   benutzt. Zum Beenden schließen (oder Strg+C).

Offline: Fanfare einmal öffnen, "Stimmen vorbereiten" drücken und auf "Alle Stimmen
bereit" warten. Danach geht es ohne Netz.

Auf Handy und Tablet (gleiches WLAN):
   start-fanfare mit der Option --lan starten   (z. B. ./start-fanfare.sh --lan)
   Das Fenster zeigt eine https://-Adresse. Öffne <Adresse>/trust.html einmal auf dem
   Handy und folge den Schritten, um diesem Laptop zu vertrauen (nötig für den
   Offline-Modus und das Mikrofon). Vergleiche den Fingerabdruck auf dem Handy mit dem
   im Fenster. HTTPS braucht OpenSSL oder das Python-Paket "cryptography"; sonst wird
   einfaches http benutzt, womit Handys nicht offline arbeiten können.

Datenschutz: Der Server antwortet nur Anfragen von diesem Rechner / deinem WLAN,
verbindet sich nie mit dem Internet und protokolliert nur "GET /pfad 200". Namen und
Sounds bleiben in deinem Browser. Die Zertifikatsdateien liegen in deinem
Benutzerordner (nicht in diesem Ordner).

Optionen: --port N   anderer Port (Standard 8080; 8443 mit --lan)
          --http     mit --lan: einfaches http
          --open     Browser öffnen (die Startdateien tun das schon)
