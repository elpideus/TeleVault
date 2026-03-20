#!/bin/bash
set -e
if [ $# -eq 0 ]; then
    alembic upgrade head
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
else
    exec "$@"
fi
