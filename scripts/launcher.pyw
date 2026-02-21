"""Brain Viewer launcher — starts servers, shows loading screen, cleans up on close."""

import subprocess
import os
import sys
import atexit
import re
import json
import time
import ctypes
from ctypes import wintypes

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
VENV_PYTHON = r"C:\Users\matti\venvs\brain_viewer\Scripts\python.exe"
CHROME_DATA = os.path.join(
    os.environ.get("LOCALAPPDATA", ""), "BrainViewer", "chrome-data"
)
WINDOW_BOUNDS_FILE = os.path.join(
    os.environ.get("LOCALAPPDATA", ""), "BrainViewer", "window_bounds.json"
)
NO_WINDOW = 0x08000000

processes = []

user32 = ctypes.WinDLL("user32", use_last_error=True)


def load_window_bounds():
    """Load previously saved window bounds from disk."""
    try:
        with open(WINDOW_BOUNDS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        x = int(data.get("x"))
        y = int(data.get("y"))
        width = int(data.get("width"))
        height = int(data.get("height"))
        if width >= 600 and height >= 400:
            return {"x": x, "y": y, "width": width, "height": height}
    except Exception:
        pass
    return None


def save_window_bounds(bounds):
    """Persist window bounds to disk."""
    if not bounds:
        return
    try:
        os.makedirs(os.path.dirname(WINDOW_BOUNDS_FILE), exist_ok=True)
        with open(WINDOW_BOUNDS_FILE, "w", encoding="utf-8") as f:
            json.dump(bounds, f)
    except Exception:
        pass


def find_window_for_pid(pid):
    """Find visible top-level window handle for process pid."""
    found = {"hwnd": None}

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_proc(hwnd, lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        window_pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(window_pid))
        if window_pid.value == pid:
            found["hwnd"] = hwnd
            return False
        return True

    user32.EnumWindows(enum_proc, 0)
    if found["hwnd"]:
        return found["hwnd"]

    # Fallback for Chrome process handoff: match Brain Viewer chrome app window by title/class.
    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum_title_proc(hwnd, lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        title_buf = ctypes.create_unicode_buffer(512)
        class_buf = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(hwnd, title_buf, 512)
        user32.GetClassNameW(hwnd, class_buf, 256)
        title = title_buf.value or ""
        class_name = class_buf.value or ""
        if "Brain Viewer" in title and class_name.startswith("Chrome_WidgetWin"):
            found["hwnd"] = hwnd
            return False
        return True

    user32.EnumWindows(enum_title_proc, 0)
    return found["hwnd"]


def get_window_bounds(hwnd):
    """Return window bounds {x,y,width,height} for a hwnd."""
    rect = wintypes.RECT()
    if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
        return None
    width = rect.right - rect.left
    height = rect.bottom - rect.top
    if width < 600 or height < 400:
        return None
    return {"x": rect.left, "y": rect.top, "width": width, "height": height}


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

profile_prefs = os.path.join(CHROME_DATA, "Default", "Preferences")
first_profile_run = not os.path.exists(profile_prefs)
saved_bounds = load_window_bounds()

chrome_args = [
    CHROME,
    f"--app={loading_url}",
    f"--user-data-dir={CHROME_DATA}",
    "--no-first-run",
    "--no-default-browser-check",
]
# Prefer explicit persisted bounds; fallback to one-time seed.
if saved_bounds:
    chrome_args.append(
        f"--window-size={saved_bounds['width']},{saved_bounds['height']}"
    )
    chrome_args.append(f"--window-position={saved_bounds['x']},{saved_bounds['y']}")
elif first_profile_run:
    chrome_args.append("--window-size=1400,900")

chrome = subprocess.Popen(
    chrome_args
)

# --- Block until Chrome window is closed ---
last_bounds = None
while chrome.poll() is None:
    hwnd = find_window_for_pid(chrome.pid)
    if hwnd:
        bounds = get_window_bounds(hwnd)
        if bounds and bounds != last_bounds:
            save_window_bounds(bounds)
            last_bounds = bounds
    time.sleep(0.5)

# --- Chrome closed — tear down servers ---
cleanup()
