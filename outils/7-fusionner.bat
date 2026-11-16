@echo off
rem 7 - Fusionner : fusionne une proposition dont les verifications sont vertes.
call "%~dp0moteur\lancer.bat" fusionner %* & exit /b
