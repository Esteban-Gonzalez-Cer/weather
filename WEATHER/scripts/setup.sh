#!/bin/sh
# Run from any directory: sh /absolute/path/to/WEATHER/scripts/setup.sh
set -eu
cd "$(dirname "$0")/.."
python3 -c 'import sys; assert sys.version_info[:2] == (3, 13), "Usa Python 3.13 para los locks incluidos."'
for service in backend pipeline; do
  if [ ! -x "$service/.venv/bin/python" ]; then python3 -m venv "$service/.venv"; fi
done
backend/.venv/bin/python -m pip install -r backend/requirements.txt --cache-dir .cache/pip
pipeline/.venv/bin/python -m pip install -r pipeline/requirements.txt --constraint https://raw.githubusercontent.com/apache/airflow/constraints-3.3.2/constraints-3.13.txt --cache-dir .cache/pip
(cd frontend && npm ci --cache .cache/npm --no-audit --no-fund)
for service in backend pipeline frontend; do
  if [ ! -f "$service/.env" ]; then cp "$service/.env.example" "$service/.env"; fi
done
printf 'Entornos listos. Configura los tres archivos .env siguiendo README.md.\n'
