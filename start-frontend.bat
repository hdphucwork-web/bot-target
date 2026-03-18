@echo off
echo Starting Target Bot Frontend...
cd /d "%~dp0frontend"
npm install
npm run dev
pause
