#!/usr/bin/env python3
"""
Development server startup script with proper reload configuration.
This solves OneDrive synchronization and file watcher issues.
"""
import subprocess
import sys
from pathlib import Path

# Add explicit reload directories to work around OneDrive issues
backend_dir = Path(__file__).parent
app_dir = backend_dir / "app"

# Run uvicorn with explicit reload configuration
cmd = [
    sys.executable,
    "-m",
    "uvicorn",
    "app.main:app",
    "--reload",
    "--reload-dirs", str(app_dir),  # Watch the app directory explicitly
    "--reload-delay", "0.5",  # Reduce reload delay for faster detection
    "--port", "8000",
    "--host", "127.0.0.1",
]

print(f"🚀 Starting development server...")
print(f"📂 Watching: {app_dir}")
print(f"🔗 Server: http://localhost:8000")
print(f"Command: {' '.join(cmd)}\n")

# Clear PYTHONDONTWRITEBYTECODE if set, allow normal cache behavior
import os
if "PYTHONDONTWRITEBYTECODE" in os.environ:
    del os.environ["PYTHONDONTWRITEBYTECODE"]

subprocess.run(cmd, cwd=backend_dir)
