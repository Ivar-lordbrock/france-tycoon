@echo off
rem Ouvre la fenetre des outils du duo : de gros boutons, les questions une par une.
rem Les outils tournent dans une petite fenetre reduite, qui se ferme toute seule avec la page.
setlocal EnableDelayedExpansion
(
  cd /d "%~dp0.."
  set "NODE_EXE="
  for /f "delims=" %%N in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
  if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  if not defined NODE_EXE (
    echo.
    echo Node.js est introuvable sur ce PC.
    echo Lance d'abord 1-installer-mon-poste.bat, dans le dossier outils.
    echo.
    if not defined DUO_SANS_PAUSE pause
    exit /b 1
  )
  start "France Tycoon - outils (se ferme tout seul)" /min "!NODE_EXE!" "%~dp0moteur\duo.mjs" interface %*
  exit /b 0
)
