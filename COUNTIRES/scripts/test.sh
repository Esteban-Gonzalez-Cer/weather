#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
(cd backend && .venv/bin/python -m pytest -q)
(cd pipeline && .venv/bin/python -m pytest -q)
(cd frontend && npm test && npm run test:db && npm run build)
