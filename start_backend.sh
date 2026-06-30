#!/bin/bash
cd "$(dirname "$0")/backend"
exec /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m uvicorn app.main:app --reload --port 8000
