"""No credentials, network calls, or database operations during DAG parsing."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from airflow.sdk import dag, task

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@dag(dag_id='weather_process_requests', schedule='* * * * *',
     start_date=datetime(2026, 1, 1, tzinfo=timezone.utc), catchup=False,
     max_active_runs=1, is_paused_upon_creation=False, tags=['weather'])
def requests_dag():
    @task(retries=1, retry_delay=timedelta(seconds=30), execution_timeout=timedelta(minutes=3), do_xcom_push=False)
    def process():
        from weather_pipeline.worker import process_queue
        process_queue()
    process()


@dag(dag_id='weather_refresh_locations', schedule='*/30 * * * *',
     start_date=datetime(2026, 1, 1, tzinfo=timezone.utc), catchup=False,
     max_active_runs=1, is_paused_upon_creation=False, tags=['weather'])
def refresh_dag():
    @task(retries=1, retry_delay=timedelta(seconds=30), execution_timeout=timedelta(minutes=2), do_xcom_push=False)
    def enqueue():
        from weather_pipeline.worker import refresh_locations
        refresh_locations()
    enqueue()


requests = requests_dag()
refresh = refresh_dag()
