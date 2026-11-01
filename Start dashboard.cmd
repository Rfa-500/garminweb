@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:4173 after the server starts.
echo Close this window or press Ctrl+C to stop the dashboard.
node server.mjs
pause
