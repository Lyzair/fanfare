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
   The window shows an http:// address; open it on the phone. This works, but over
   plain http phones cannot use offline mode or the microphone.

   PHONE AS REMOTE: with --lan, step 3 in Fanfare shows "Use a phone as remote". Press
   "Activate speaker", scan the QR code with a phone on the same Wi-Fi and enter the code.
   The laptop plays the sounds; the phone is the soundboard. Over plain http others on
   the Wi-Fi could see player names and send intercepted commands (Fanfare warns you);
   --https avoids that (see the risks below).

   OPTIONAL, WITH RISKS - HTTPS for phones:  start-fanfare with --lan --https
   It asks you to type "yes" before it creates a local certificate authority. Then open
   <address>/trust.html on each phone once and follow the steps (compare the fingerprint
   with the one in the window). Please read:
   1. Phones that trust this certificate trust everything signed with this laptop's key.
      Name constraints limit this to local network addresses, but that includes routers,
      NAS drives and smart-home devices on that Wi-Fi.
   2. The key is stored unencrypted on this computer. Anyone with access to this computer
      or user account could create fake certificates for local devices. Only use this on a
      computer you trust.
   3. Remove it when you no longer need it: start-fanfare with --forget-ca on the laptop,
      and remove the certificate on each phone (Android: Settings > Security > Encryption &
      credentials > User credentials; iPhone: Settings > General > VPN & Device Management
      > profile > Remove).
   4. Without HTTPS, Fanfare still works over Wi-Fi, but phones can't use offline mode or
      the microphone.
   5. Simpler alternatives: the online demo on the phone, or Fanfare directly on the laptop
      with the speakers - no certificate needed.
   HTTPS needs OpenSSL or the Python package "cryptography"; otherwise plain http is used.

Privacy: the server only answers requests from this computer / your Wi-Fi, never
contacts the internet and logs nothing except "GET /path 200". Names and sounds stay in
your browser. The certificate files are kept in your user folder (not in this folder).

Options: --port N   use another port (default 8080; 8443 with --https)
         --lan      also reachable from phones (plain http)
         --https    with --lan: HTTPS (optional, has risks, see above)
         --forget-ca  delete the local certificate authority and keys, then exit
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
   Das Fenster zeigt eine http://-Adresse; öffne sie auf dem Handy. Das funktioniert, aber
   über einfaches http können Handys weder den Offline-Modus noch das Mikrofon nutzen.

   HANDY ALS FERNBEDIENUNG: Mit --lan zeigt Schritt 3 in Fanfare "Handy als Fernbedienung
   nutzen". Tippe auf "Lautsprecher aktivieren", scanne den QR-Code mit einem Handy im
   gleichen WLAN und gib den Code ein. Der Laptop spielt die Sounds; das Handy ist das
   Soundboard. Über einfaches http könnten andere im WLAN Spielernamen sehen und
   abgefangene Befehle senden (Fanfare warnt davor); --https verhindert das (Risiken unten).

   OPTIONAL, MIT RISIKEN - HTTPS für Handys:  start-fanfare mit --lan --https
   Vor dem Erstellen einer lokalen Zertifizierungsstelle musst du "yes" tippen. Öffne dann
   auf jedem Handy einmal <Adresse>/trust.html und folge den Schritten (vergleiche den
   Fingerabdruck mit dem im Fenster). Bitte lesen:
   1. Handys, die diesem Zertifikat vertrauen, vertrauen allem, was mit dem Schlüssel dieses
      Laptops signiert wird. Namensbeschränkungen begrenzen das auf Adressen im lokalen Netz,
      aber dazu gehören Router, NAS-Laufwerke und Smart-Home-Geräte in diesem WLAN.
   2. Der Schlüssel liegt unverschlüsselt auf diesem Computer. Wer Zugriff auf diesen
      Computer oder dieses Benutzerkonto hat, könnte gefälschte Zertifikate für lokale
      Geräte erstellen. Nutze das nur auf einem Computer, dem du vertraust.
   3. Entferne es, wenn du es nicht mehr brauchst: start-fanfare mit --forget-ca auf dem
      Laptop starten und das Zertifikat auf jedem Handy löschen (Android: Einstellungen >
      Sicherheit > Verschlüsselung und Anmeldedaten > Nutzerzertifikate; iPhone:
      Einstellungen > Allgemein > VPN und Geräteverwaltung > Profil > Entfernen).
   4. Ohne HTTPS funktioniert Fanfare im WLAN trotzdem, aber Handys können weder den
      Offline-Modus noch das Mikrofon nutzen.
   5. Einfachere Alternativen: die Online-Demo auf dem Handy oder Fanfare direkt auf dem
      Laptop mit den Lautsprechern - dafür ist kein Zertifikat nötig.
   HTTPS braucht OpenSSL oder das Python-Paket "cryptography"; sonst wird http benutzt.

Datenschutz: Der Server antwortet nur Anfragen von diesem Rechner / deinem WLAN,
verbindet sich nie mit dem Internet und protokolliert nur "GET /pfad 200". Namen und
Sounds bleiben in deinem Browser. Die Zertifikatsdateien liegen in deinem
Benutzerordner (nicht in diesem Ordner).

Optionen: --port N   anderer Port (Standard 8080; 8443 mit --https)
          --lan      auch für Handys erreichbar (einfaches http)
          --https    mit --lan: HTTPS (optional, mit Risiken, siehe oben)
          --forget-ca  lokale Zertifizierungsstelle und Schlüssel löschen, dann beenden
          --open     Browser öffnen (die Startdateien tun das schon)
