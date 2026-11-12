@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" goto check_environment
where py >nul 2>nul
if errorlevel 1 goto missing_python
py -3 -c "import sys,struct; sys.exit(0 if sys.version_info >= (3,12) and struct.calcsize('P') == 8 else 1)" >nul 2>nul
if errorlevel 1 goto missing_python
py -3 -m venv .venv
if errorlevel 1 goto failed

:check_environment
".venv\Scripts\python.exe" -c "import sys,struct; sys.exit(0 if sys.version_info >= (3,12) and struct.calcsize('P') == 8 else 1)"
if errorlevel 1 goto missing_python
".venv\Scripts\python.exe" -c "import importlib.metadata as m,pathlib,sys; req=pathlib.Path('requirements.txt').read_text().splitlines(); sys.exit(any(m.version(p)!=v for p,v in (line.split('==') for line in req if line.strip())))" >nul 2>nul
if not errorlevel 1 goto launch
set "PIP_CACHE_DIR=%CD%\.cache\pip"
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
".venv\Scripts\python.exe" -m pip install --only-binary=:all: -r requirements.txt
if errorlevel 1 goto failed

:launch
echo Starting local ASR. Press Ctrl+C to stop.
".venv\Scripts\python.exe" app.py
if errorlevel 1 goto failed
exit /b 0

:missing_python
echo Install 64-bit Python 3.13 with the Python Launcher from https://www.python.org/downloads/windows/
echo Python 3.8 is not supported. For a custom installation, create .venv with Python 3.13 first.
pause
exit /b 1

:failed
echo Startup failed. Read the error above. No global Python packages were changed.
pause
exit /b 1
