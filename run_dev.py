#!/usr/bin/env python3
"""
Single-command development launcher for AgriScan.
Runs both FastAPI backend and Vite frontend concurrently.
Handles graceful shutdown of both servers on Ctrl+C.
"""
import os
import sys
import shutil
import signal
import subprocess
import threading
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

# Force UTF-8 output if possible
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def find_python():
    """Locate the Python executable in the virtual environment."""
    candidates = [
        BACKEND_DIR / ".venv" / "Scripts" / "python.exe",
        ROOT_DIR / ".venv" / "Scripts" / "python.exe",
        BACKEND_DIR / "venv" / "Scripts" / "python.exe",
        ROOT_DIR / "venv" / "Scripts" / "python.exe",
        BACKEND_DIR / ".venv" / "bin" / "python",
        ROOT_DIR / ".venv" / "bin" / "python",
    ]
    for p in candidates:
        if p.is_file():
            return str(p)
    return sys.executable

def find_npm():
    """Locate npm executable."""
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    if not npm:
        npm = shutil.which("npm")
    return npm or "npm"

def stream_output(pipe, prefix):
    """Stream stdout/stderr from a child process with a colored/labeled prefix."""
    try:
        for line in iter(pipe.readline, ""):
            if not line:
                break
            print(f"{prefix} {line.rstrip()}", flush=True)
    except Exception:
        pass
    finally:
        pipe.close()

def main():
    python_bin = find_python()
    npm_bin = find_npm()

    print("=" * 60)
    print("  AgriScan Full-Stack Dev Server Runner")
    print(f"  Backend:  http://localhost:8000")
    print(f"  Frontend: http://localhost:5173")
    print("  Press Ctrl+C to terminate both servers")
    print("=" * 60, "\n")

    backend_cmd = [
        python_bin,
        "-m",
        "uvicorn",
        "app.main:app",
        "--reload",
        "--reload-dir",
        str(BACKEND_DIR / "app"),
        "--reload-delay",
        "0.5",
        "--port",
        "8000",
        "--host",
        "127.0.0.1",
    ]

    frontend_cmd = [npm_bin, "run", "dev"]

    procs = []

    try:
        # Start Backend
        backend_proc = subprocess.Popen(
            backend_cmd,
            cwd=BACKEND_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
        )
        procs.append(("Backend", backend_proc))
        threading.Thread(
            target=stream_output,
            args=(backend_proc.stdout, "[BACKEND]"),
            daemon=True,
        ).start()

        # Start Frontend
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            cwd=FRONTEND_DIR,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
            shell=(os.name == "nt"),
        )
        procs.append(("Frontend", frontend_proc))
        threading.Thread(
            target=stream_output,
            args=(frontend_proc.stdout, "[FRONTEND]"),
            daemon=True,
        ).start()

        # Wait on either process
        while True:
            for name, proc in procs:
                ret = proc.poll()
                if ret is not None:
                    print(f"\n[INFO] {name} process exited with returncode {ret}")
                    return
            threading.Event().wait(0.5)

    except KeyboardInterrupt:
        print("\n[INFO] Stopping servers...")
    finally:
        for name, proc in procs:
            if proc.poll() is None:
                try:
                    if os.name == "nt":
                        # Terminate process tree on Windows
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                        )
                    else:
                        proc.terminate()
                except Exception:
                    pass
        print("[INFO] Both servers stopped.")

if __name__ == "__main__":
    main()
