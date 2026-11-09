@echo off
cd /d "%~dp0"
if errorlevel 1 exit /b 1
python -u "%~dp0serve.py" %*
pause
