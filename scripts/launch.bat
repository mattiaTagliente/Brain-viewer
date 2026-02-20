@echo off
:: Thin wrapper — delegates to launcher.pyw (no console window)
start "" "C:\Users\matti\venvs\brain_viewer\Scripts\pythonw.exe" "%~dp0launcher.pyw"
