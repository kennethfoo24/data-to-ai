"""
Load gold.product_interactions from Iceberg via PySpark.
Returns a pandas DataFrame plus customer/product index mappings.
"""
import os

WAREHOUSE = os.getenv("SPARK_WAREHOUSE", "/warehouse")
ICEBERG_JAR = "/opt/airflow/iceberg-spark-runtime.jar"


def _spark():
    from pyspark.sql import SparkSession
    return (
        SparkSession.builder
        .appName("recommend-features")
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


def load() -> tuple["pd.DataFrame", dict, dict]:
    """Return (interactions_df, customer_id_map, product_id_map).

    interactions_df columns: customer_idx, product_idx, rating
    rating = viewed*0.5 + purchased*1.0 - returned*0.5  (implicit feedback)
    *_id_map: original_id → integer index
    """
    import pandas as pd

    spark = _spark()
    df = spark.table("local.gold.product_interactions").toPandas()
    df = df.fillna(0)

    # Build integer indices for embedding lookup
    customers = sorted(df["customer_id"].unique())
    products = sorted(df["product_id"].unique())
    customer_map = {c: i for i, c in enumerate(customers)}
    product_map = {p: i for i, p in enumerate(products)}

    df["customer_idx"] = df["customer_id"].map(customer_map)
    df["product_idx"] = df["product_id"].map(product_map)
    df["rating"] = (
        df["viewed"].astype(float) * 0.5
        + df["purchased"].astype(float) * 1.0
        - df["returned"].astype(float) * 0.5
    ).clip(lower=0.0)

    return df[["customer_idx", "product_idx", "rating"]], customer_map, product_map
