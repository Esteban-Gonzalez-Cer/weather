from datetime import datetime, timedelta, timezone

from airflow.sdk import dag, task


@dag(dag_id='countries_process_requests', schedule='* * * * *',
     start_date=datetime(2026, 1, 1, tzinfo=timezone.utc), catchup=False,
     max_active_runs=1, is_paused_upon_creation=False, tags=['countries'],
     default_args={'retries': 1, 'retry_delay': timedelta(minutes=1)})
def process_requests():
    # Database jobs own the bounded retries; task retries could hide a permanent failure with an idle success.
    @task(execution_timeout=timedelta(minutes=8), do_xcom_push=False, retries=0)
    def process():
        from countries_pipeline.jobs import run
        run('process')
    process()


@dag(dag_id='countries_schedule_catalog', schedule='@hourly',
     start_date=datetime(2026, 1, 1, tzinfo=timezone.utc), catchup=False,
     max_active_runs=1, is_paused_upon_creation=False, tags=['countries'],
     default_args={'retries': 1, 'retry_delay': timedelta(minutes=1)})
def schedule_catalog():
    @task(do_xcom_push=False)
    def schedule():
        from countries_pipeline.jobs import run
        run('schedule')
    schedule()


process_requests()
schedule_catalog()
