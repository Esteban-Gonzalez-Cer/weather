#!/bin/sh
set -eu
cd "$(dirname "$0")"
export PATH="$PWD/.venv/bin:$PATH"
export AIRFLOW_HOME="$PWD/.airflow"
export AIRFLOW__CORE__DAGS_FOLDER="$PWD/dags"
export AIRFLOW__CORE__LOAD_EXAMPLES=False
export AIRFLOW__CORE__EXECUTOR=LocalExecutor
export AIRFLOW__CORE__PARALLELISM=2
export AIRFLOW__API__WORKERS=1
export AIRFLOW__DAG_PROCESSOR__PARSING_PROCESSES=1
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}"
export AIRFLOW__API__HOST=127.0.0.1
# macOS task subprocesses otherwise inherit Apple's fork safety restriction.
export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
exec .venv/bin/airflow standalone
