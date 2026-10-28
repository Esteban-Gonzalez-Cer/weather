#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3.13 -c 'import sys; assert sys.version_info[:2] == (3, 13), "Use Python 3.13"'
for service in backend pipeline; do
  if [ ! -d "$service/.venv" ]; then python3.13 -m venv "$service/.venv"; fi
  "$service/.venv/bin/python" -m pip install --cache-dir .cache/pip -r "$service/requirements.txt"
done
(cd frontend && npm ci --cache ../.cache/npm --no-audit --no-fund)
for service in backend pipeline frontend; do
  if [ ! -f "$service/.env" ]; then cp "$service/.env.example" "$service/.env"; fi
done
printf '%s\n' 'Dependencias listas. Completa los tres archivos .env con el NUEVO proyecto de Supabase y tu clave de REST Countries.'
