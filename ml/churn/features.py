"""
Load gold.customer_features from Iceberg via PySpark.
Returns a pandas DataFrame with feature columns + churn label.
"""
import os

WAREHOUSE = os.getenv("SPARK_WAREHOUSE", "/warehouse")
ICEBERG_JAR = "/opt/airflow/iceberg-spark-runtime.jar"

FEATURE_COLS = [
    "order_count",
    "total_spend",
    "days_since_last_order",
    "return_rate",
    "avg_session_seconds",
]


def _spark():
    from pyspark.sql import SparkSession
    return (
        SparkSession.builder
        .appName("churn-features")
        .master("local[2]")
        .config("spark.jars", ICEBERG_JAR)
        .config("spark.sql.extensions",
                "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
        .config("spark.sql.catalog.local",
                "org.apache.iceberg.spark.SparkCatalog")
        .config("spark.sql.catalog.local.type", "hadoop")
        .config("spark.sql.catalog.local.warehouse", WAREHOUSE)
        .config("spark.sql.defaultCatalog", "local")
        .config("spark.driver.memory", "1g")
        .getOrCreate()
    )


def load() -> "pd.DataFrame":
    """Return customer_features as a pandas DataFrame.

    Adds a synthetic `churn` label: customers with days_since_last_order > 90
    and order_count < 3 are labelled churned (1), others not churned (0).
    This heuristic is intentional for demo purposes — a real project would use
    actual churn events.
    """
    import pandas as pd

    spark = _spark()
    df = spark.table("local.gold.customer_features").toPandas()

    # Fill nulls that can arise from left joins in the gold model
    df[FEATURE_COLS] = df[FEATURE_COLS].fillna(0.0)

    # Synthetic label
    df["churn"] = (
        (df["days_since_last_order"] > 90) & (df["order_count"] < 3)
    ).astype(int)

    return df
