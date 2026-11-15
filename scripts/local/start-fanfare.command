#!/bin/sh
# Starts Fanfare on this computer. Options are passed on: --lan (phones on the same Wi-Fi), --lan --https (optional, with risks), --forget-ca (remove the local certificate), --help
cd "$(dirname "$0")" || exit 1
for py in python3 python; do
  if command -v "$py" >/dev/null 2>&1 && "$py" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' 2>/dev/null; then
    exec "$py" fanfare-local.py --open "$@"
  fi
done
echo "Fanfare needs Python 3.9 or newer, and it was not found."
echo "Linux: install python3 with your package manager. macOS: run 'xcode-select --install' or get it from https://www.python.org/downloads/"
echo "Fanfare braucht Python 3.9 oder neuer. Es wurde nicht gefunden (siehe oben)."
printf 'Press Enter to close. / Zum Schliessen Enter druecken. '
read -r _
exit 1
