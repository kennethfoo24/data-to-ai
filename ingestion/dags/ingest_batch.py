"""
DAG: ingest_batch
Reads Postgres + CSV seed data into Iceberg Bronze layer.
Trigger manually or via seed.sh.
"""
import sys
sys.path.insert(0, "/opt/airflow/connectors")

from datetime import datetime
from airflow import DAG
from airflow.operators.python import PythonOperator

with DAG(
    dag_id="ingest_batch",
    start_date=datetime(2024, 1, 1),
    schedule=None,
    catchup=False,
    tags=["ingestion", "bronze"],
) as dag:

    PythonOperator(
        task_id="ingest_bronze",
        python_callable=lambda: __import__("batch_ingest").run_all(),
    )
