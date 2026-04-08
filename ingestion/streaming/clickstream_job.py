"""
Spark Structured Streaming: Kafka shopstream.clickstream → Iceberg Bronze.
Runs continuously in the spark container.
"""
import os
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json, to_timestamp, to_date
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType
)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
TOPIC = os.getenv("KAFKA_TOPIC_CLICKSTREAM", "shopstream.clickstream")
WAREHOUSE = os.getenv("WAREHOUSE_PATH", "/warehouse")

EVENT_SCHEMA = StructType([
    StructField("event_id", StringType()),
    StructField("customer_id", IntegerType()),
    StructField("session_id", StringType()),
    StructField("event_type", StringType()),
    StructField("product_id", IntegerType()),
    StructField("page", StringType()),
    StructField("timestamp", StringType()),
])

spark = (
    SparkSession.builder
    .appName("clickstream-bronze")
    .config("spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
    .config("spark.sql.catalog.local",
            "org.apache.iceberg.spark.SparkCatalog")
    .config("spark.sql.catalog.local.type", "hadoop")
    .config("spark.sql.catalog.local.warehouse", WAREHOUSE)
    .config("spark.sql.defaultCatalog", "local")
    .getOrCreate()
)
spark.sparkContext.setLogLevel("WARN")

# Create Bronze namespace and table if not exists
spark.sql("CREATE NAMESPACE IF NOT EXISTS local.bronze")
spark.sql("""
    CREATE TABLE IF NOT EXISTS local.bronze.clickstream (
        event_id        STRING,
        customer_id     INT,
        session_id      STRING,
        event_type      STRING,
        product_id      INT,
        page            STRING,
        event_timestamp TIMESTAMP,
        ingest_date     DATE
    )
    USING iceberg
    PARTITIONED BY (days(event_timestamp))
""")

df_raw = (
    spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP)
    .option("subscribe", TOPIC)
    .option("startingOffsets", "latest")
    .option("failOnDataLoss", "false")
    .load()
)

df_parsed = (
    df_raw
    .select(from_json(col("value").cast("string"), EVENT_SCHEMA).alias("d"))
    .select(
        col("d.event_id"),
        col("d.customer_id"),
        col("d.session_id"),
        col("d.event_type"),
        col("d.product_id"),
        col("d.page"),
        to_timestamp(col("d.timestamp")).alias("event_timestamp"),
    )
    .withColumn("ingest_date", to_date(col("event_timestamp")))
)


def write_batch(batch_df, batch_id):
    batch_df.writeTo("local.bronze.clickstream").append()


query = (
    df_parsed.writeStream
    .foreachBatch(write_batch)
    .trigger(processingTime="30 seconds")
    .option("checkpointLocation", f"{WAREHOUSE}/_checkpoints/clickstream")
    .start()
)

print(f"Streaming clickstream → local.bronze.clickstream (checkpoint: {WAREHOUSE}/_checkpoints/clickstream)")
query.awaitTermination()
