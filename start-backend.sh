#!/bin/bash
echo "Starting Target Bot Backend..."
cd "$(dirname "$0")/backend"
pip install -r requirements.txt
playwright install chromium
python run.py
