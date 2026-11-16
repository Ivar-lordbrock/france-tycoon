@echo off
rem 3 - Commencer une tache : cree la branche feat/<zone>-<sujet> depuis le dernier dev.
call "%~dp0moteur\lancer.bat" commencer %* & exit /b
