@echo off
rem 1 - Installer mon poste : Git, Node.js LTS, GitHub CLI, connexion GitHub, copie du projet.
rem Relancable sans risque : ce qui est deja en place est seulement verifie.
rem Le script PowerShell est en UTF-8 sans BOM : on le lit explicitement en UTF-8.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create([IO.File]::ReadAllText('%~dp0moteur\installer.ps1', [Text.Encoding]::UTF8))) -Projet '%~dp0..' %*"
if not defined DUO_SANS_PAUSE pause
