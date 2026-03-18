@echo off
echo Starting Target Bot Backend...
cd /d "%~dp0backend"
pip install -r requirements.txt
playwright install chromium
python run.py
pause
