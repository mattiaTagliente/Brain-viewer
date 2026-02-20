"""Brain Viewer launcher — starts servers, shows loading screen, cleans up on close."""

import subprocess
import os
import sys
import atexit
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
VENV_PYTHON = r"C:\Users\matti\venvs\brain_viewer\Scripts\python.exe"
CHROME_DATA = os.path.join(
    os.environ.get("LOCALAPPDATA", ""), "BrainViewer", "chrome-data"
)
NO_WINDOW = 0x08000000

processes = []


def kill_port(port):
    """Kill any process listening on the given port."""
    try:
        result = subprocess.run(
            ["netstat", "-aon"],
            capture_output=True,
            text=True,
            creationflags=NO_WINDOW,
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                pid = line.strip().split()[-1]
                if pid.isdigit():
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid],
                        capture_output=True,
                        creationflags=NO_WINDOW,
                    )
    except Exception:
        pass


def cleanup():
    """Kill all child process trees."""
    for p in processes:
        try:
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(p.pid)],
                capture_output=True,
                creationflags=NO_WINDOW,
            )
        except Exception:
            pass


atexit.register(cleanup)

# --- Kill leftover instances from previous runs ---
kill_port(8000)
kill_port(5174)

# --- Start backend (hidden, no console window) ---
backend = subprocess.Popen(
    [VENV_PYTHON, "-m", "uvicorn", "brain_viewer.main:app", "--port", "8000"],
    cwd=os.path.join(PROJECT_DIR, "backend", "src"),
    creationflags=NO_WINDOW,
)
processes.append(backend)

# --- Start frontend (hidden, no console window) ---
frontend = subprocess.Popen(
    "npm run dev -- --port 5174",
    cwd=os.path.join(PROJECT_DIR, "frontend"),
    creationflags=NO_WINDOW,
    shell=True,
)
processes.append(frontend)

# --- Open Chrome with loading page in app mode ---
os.makedirs(CHROME_DATA, exist_ok=True)

loading_path = os.path.join(SCRIPT_DIR, "loading.html").replace("\\", "/")
loading_url = f"file:///{loading_path}"

chrome = subprocess.Popen(
    [
        CHROME,
        f"--app={loading_url}",
        f"--user-data-dir={CHROME_DATA}",
        "--window-size=1400,900",
        "--no-first-run",
        "--no-default-browser-check",
    ]
)

# --- Block until Chrome window is closed ---
chrome.wait()

# --- Chrome closed — tear down servers ---
cleanup()
