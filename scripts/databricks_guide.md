# Connecting DataFabric to Databricks

This guide explains how to swap the local Spark + Iceberg setup for a Databricks cluster.

## Prerequisites

- Databricks workspace (Community Edition is free: https://community.cloud.databricks.com)
- Databricks CLI configured: `pip install databricks-cli && databricks configure`

## Step 1: Update Spark config

In `.env`, change:
```
ICEBERG_CATALOG_TYPE=hive
SPARK_MASTER=databricks
```

## Step 2: Update dbt profile

In `dbt/profiles.yml`, change the `method` from `spark_connect` to `databricks` and add your cluster HTTP path.

## Step 3: Point MLflow to Databricks

```bash
export MLFLOW_TRACKING_URI=databricks
```

## Step 4: Run

The Airflow DAGs will now submit jobs to Databricks instead of local Spark.
