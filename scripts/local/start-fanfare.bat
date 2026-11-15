@echo off
rem Starts Fanfare on this computer. Options are passed on: --lan (phones on the same Wi-Fi), --lan --https (optional, with risks), --forget-ca (remove the local certificate), --help
cd /d "%~dp0"
where py >nul 2>nul && (py -3 fanfare-local.py --open %* & goto :done)
where python >nul 2>nul && (python fanfare-local.py --open %* & goto :done)
echo.
echo Fanfare needs Python 3.9 or newer, and it was not found on this computer.
echo.
echo   1. Open https://www.python.org/downloads/ and install Python.
echo      Tick "Add python.exe to PATH" on the first screen of the installer.
echo      Or, in a terminal:  winget install Python.Python.3.12
echo   2. Then double-click start-fanfare.bat again.
echo.
echo Fanfare braucht Python 3.9 oder neuer. Es wurde nicht gefunden.
echo   1. Auf https://www.python.org/downloads/ installieren, im Installer "Add python.exe to PATH" ankreuzen
echo      (oder im Terminal: winget install Python.Python.3.12).
echo   2. Danach start-fanfare.bat nochmal doppelklicken.
echo.
pause
exit /b 1
:done
if errorlevel 1 pause
