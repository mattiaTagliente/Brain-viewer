@echo off
echo Stopping Brain Viewer...
taskkill /FI "WINDOWTITLE eq Brain Viewer - Backend" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Brain Viewer - Frontend" /F >nul 2>&1
:: Also kill by port if window titles don't match
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000.*LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174.*LISTENING"') do taskkill /PID %%a /F >nul 2>&1
echo Done.
timeout /t 2 /nobreak >nul
