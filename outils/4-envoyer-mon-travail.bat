@echo off
rem 4 - Envoyer mon travail : enregistre (commit) et envoie (push) sur GitHub.
call "%~dp0moteur\lancer.bat" envoyer %* & exit /b
