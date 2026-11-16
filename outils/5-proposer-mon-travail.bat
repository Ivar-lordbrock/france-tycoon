@echo off
rem 5 - Proposer mon travail : ouvre la proposition (pull request) vers dev.
call "%~dp0moteur\lancer.bat" proposer %* & exit /b
