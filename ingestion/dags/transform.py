"""
DAG: transform
Runs dbt Silver then Gold models via spark_session (in-process PySpark).
"""
from datetime import datetime
from airflow import DAG
from airflow.operators.bash import BashOperator

DBT_DIR = "/opt/airflow/dbt"

# dbt-spark (session method) uses SparkSession.getOrCreate(). The Iceberg jar and
# catalog configs must be passed via PYSPARK_SUBMIT_ARGS so they are set at JVM start,
# not as runtime .config() calls (which are ignored on an existing session).
# --cache-selected-only prevents dbt from querying schemas not selected by the run.
ICEBERG_JAR = "/opt/airflow/iceberg-spark-runtime.jar"
PYSPARK_ARGS = (
    f"--jars {ICEBERG_JAR} "
    "--conf spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions "
    "--conf spark.sql.catalog.local=org.apache.iceberg.spark.SparkCatalog "
    "--conf spark.sql.catalog.local.type=hadoop "
    "--conf spark.sql.catalog.local.warehouse=/warehouse "
    "--conf spark.sql.defaultCatalog=local "
    "pyspark-shell"
)

DBT_ENV = f"PYSPARK_SUBMIT_ARGS='{PYSPARK_ARGS}'"

with DAG(
    dag_id="transform",
    start_date=datetime(2024, 1, 1),
    schedule=None,
    catchup=False,
    tags=["transform", "dbt"],
) as dag:

    dbt_silver = BashOperator(
        task_id="dbt_silver",
        bash_command=f"cd {DBT_DIR} && {DBT_ENV} dbt --cache-selected-only run --select silver --profiles-dir {DBT_DIR}",
    )

    dbt_gold = BashOperator(
        task_id="dbt_gold",
        bash_command=f"cd {DBT_DIR} && {DBT_ENV} dbt --cache-selected-only run --select gold --profiles-dir {DBT_DIR}",
    )

    dbt_silver >> dbt_gold
