@echo off
REM AgriScan One-Click Development Server Launcher
cd /d "%~dp0"
if exist "backend\.venv\Scripts\python.exe" (
    "backend\.venv\Scripts\python.exe" run_dev.py
) else if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" run_dev.py
) else (
    python run_dev.py
)
pause
