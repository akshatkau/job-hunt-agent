#!/bin/bash
set -e
python -m playwright install-deps chromium
python -m playwright install chromium
python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT
