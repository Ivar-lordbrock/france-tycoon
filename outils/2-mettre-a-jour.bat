@echo off
rem 2 - Mettre a jour : recupere le dernier dev depuis GitHub (et l'integre a ta tache si tu veux).
call "%~dp0moteur\lancer.bat" mettre-a-jour %* & exit /b
