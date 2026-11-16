@echo off
rem 8 - Fin de sprint : proposition dev vers main, puis fusion et version v0.N.0.
call "%~dp0moteur\lancer.bat" fin-de-sprint %* & exit /b
