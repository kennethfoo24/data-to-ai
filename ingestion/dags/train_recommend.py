"""
DAG: train_recommend
Trains the PyTorch product recommender and registers it in MLflow.
Runs once on first trigger, then every 30 minutes.
"""
import sys
sys.path.insert(0, "/opt/airflow/ml")

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator

with DAG(
    dag_id="train_recommend",
    start_date=datetime(2024, 1, 1),
    schedule=timedelta(minutes=30),
    catchup=False,
    tags=["ml", "recommend"],
) as dag:

    PythonOperator(
        task_id="train_recommend_model",
        python_callable=lambda: __import__("recommend.train", fromlist=["run"]).run(),
    )
