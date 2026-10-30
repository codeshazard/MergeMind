#!/usr/bin/env bash
set -e
python3 -m venv .venv || python -m venv .venv
source .venv/bin/activate || source .venv/Scripts/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
echo "Backend setup complete. Run 'uvicorn main:app --reload --port 8000' inside server directory."
