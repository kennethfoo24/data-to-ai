"""
DAG: transform
Runs dbt Silver then Gold models via spark_session (in-process PySpark).
"""
from datetime import datetime
from airflow import DAG
from airflow.operators.bash import BashOperator

DBT_DIR = "/opt/airflow/dbt"

with DAG(
    dag_id="transform",
    start_date=datetime(2024, 1, 1),
    schedule=None,
    catchup=False,
    tags=["transform", "dbt"],
) as dag:

    dbt_silver = BashOperator(
        task_id="dbt_silver",
        bash_command=f"cd {DBT_DIR} && dbt run --select silver --profiles-dir {DBT_DIR}",
    )

    dbt_gold = BashOperator(
        task_id="dbt_gold",
        bash_command=f"cd {DBT_DIR} && dbt run --select gold --profiles-dir {DBT_DIR}",
    )

    dbt_silver >> dbt_gold
