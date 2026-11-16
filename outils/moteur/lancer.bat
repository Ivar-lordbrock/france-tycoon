@echo off
rem Lance une action du moteur (outils\moteur\duo.mjs). Appele par les fichiers numerotes du dossier outils.
rem Tout tient dans un seul bloc entre parentheses : cmd le lit en entier avant de lancer Node.
rem Ainsi, meme si Git modifie ce fichier pendant l'action (changement de branche), rien ne se melange.
setlocal EnableDelayedExpansion
(
  cd /d "%~dp0..\.."
  set "NODE_EXE="
  for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
  if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  if defined NODE_EXE (
    "!NODE_EXE!" "%~dp0duo.mjs" %*
    set "CODE=!ERRORLEVEL!"
  ) else (
    echo.
    echo Node.js est introuvable sur ce PC.
    echo Lance d'abord 1-installer-mon-poste.bat, dans le dossier outils.
    set "CODE=1"
  )
  if not defined DUO_SANS_PAUSE (
    echo.
    pause
  )
  exit /b !CODE!
)
