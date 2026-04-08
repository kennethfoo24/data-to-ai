# DataFabric — End-to-End Data & AI Portfolio Project
**Design Spec · 2026-04-07**

## Purpose

A fully runnable, Docker Compose-based portfolio project demonstrating end-to-end data engineering and machine learning capabilities for interview purposes. The system ingests data from multiple sources, processes it through a medallion lakehouse architecture, trains and serves two ML models, and visualises the entire pipeline in an interactive lineage dashboard.

---

## Mock Scenario: ShopStream

A fictional mid-size e-commerce platform selling electronics and home goods.

### Seed Data

| Source | Content | Size |
|---|---|---|
| `orders.csv` | 10K orders, 18 months of history | ~1MB |
| `products.csv` | 200 products across 8 categories | ~20KB |
| `customers.csv` | 2K customers | ~100KB |
| PostgreSQL | Same customers + inventory seeded on startup | — |
| Kafka | Python script streams synthetic clickstream events continuously at ~5 events/sec | live |

Seed bootstrap (`seed/seed.sh`) runs automatically on `docker compose up` and completes in ~2–3 min (`core`) or ~4–5 min (`full`).

---

## Architecture

### Profiles

The project uses Docker Compose profiles to support two hardware tiers:

```bash
# Laptop mode (~8GB RAM, ~3 min boot)
docker compose --profile core up

# Full mode (~16GB RAM, ~5 min boot)
docker compose --profile full up
```

### Service Inventory

**`core` profile — 9 services:**

| # | Service | Image | Port | Purpose |
|---|---|---|---|---|
| 1 | `postgres` | postgres:15 | 5432 | Source OLTP + Airflow + MLflow metadata |
| 2 | `kafka` | confluentinc/cp-kafka:3.7 | 9092 | KRaft mode, no Zookeeper |
| 3 | `kafka-ui` | provectuslabs/kafka-ui | 8080 | Browse topics and consumer groups |
| 4 | `clickstream-gen` | custom Python | — | Streams synthetic events into Kafka continuously |
| 5 | `spark` | bitnami/spark | 4040 | Single container, local[2] mode, filesystem Iceberg catalog |
| 6 | `airflow` | apache/airflow:2.9 | 8082 | Standalone mode (webserver + scheduler) + PyAirbyte |
| 7 | `mlflow` | ghcr.io/mlflow/mlflow | 5000 | Experiment tracking + model registry |
| 8 | `fastapi` | custom Python | 8001 | Model serving endpoints |
| 9 | `ui` | custom Next.js | 3000 | Interactive lineage dashboard |

Iceberg catalog in `core`: Spark's built-in **filesystem catalog** — Iceberg tables stored as local volume files. No extra catalog service needed.

**`full` profile — adds 7 services:**

| # | Service | Image | Port | Purpose |
|---|---|---|---|---|
| 10 | `hive-metastore` | custom | 9083 | Iceberg catalog (replaces filesystem catalog) |
| 11 | `minio` | minio/minio | 9001 | S3-compatible storage for Iceberg files |
| 12 | `airbyte-server` | airbyte/server | 8000 | Airbyte OSS platform |
| 13 | `airbyte-worker` | airbyte/worker | — | Runs connectors |
| 14 | `airbyte-temporal` | temporalio/auto-setup | — | Workflow engine |
| 15 | `airbyte-webapp` | airbyte/webapp | — | Airbyte UI (via port 8000) |
| 16 | `pgadmin` | dpage/pgadmin4 | 5050 | Postgres browser |

In `full`, MinIO replaces local filesystem for Iceberg storage and Hive Metastore replaces the filesystem catalog — Spark and dbt configs switch via env vars, no code changes.

### Ingestion Layer

- **`core`**: PyAirbyte (`pip install airbyte`) installed in the Airflow container. Runs as an Airflow DAG task — reads from Postgres and CSV files using official Airbyte source connectors, writes Parquet to the Iceberg Bronze layer.
- **`full`**: Full Airbyte OSS platform replaces PyAirbyte. Same connectors, adds the Airbyte UI at `localhost:8000`.

Kafka clickstream is handled separately by a Spark Structured Streaming job (`ingestion/streaming/clickstream_job.py`) that runs continuously and writes to Iceberg Bronze.

---

## Data Pipeline: Medallion Architecture

All layers use **Apache Iceberg** as the table format, with **Hive Metastore** as the catalog (`core`) or **MinIO + Hive Metastore** (`full`).

### Bronze Layer (Raw Ingestion)

Written by Spark. Schema detection only — no transformations. Full fidelity copy.

| Iceberg Table | Source |
|---|---|
| `bronze.orders` | orders.csv |
| `bronze.products` | products.csv |
| `bronze.customers` | customers.csv + Postgres |
| `bronze.clickstream` | Kafka topic (streaming) |

### Silver Layer (Cleaned Data)

Written by **dbt**. Orchestrated by Airflow DAG `transform`.

| dbt Model | Description |
|---|---|
| `silver.orders_clean` | Dedup, validate foreign keys, parse timestamps |
| `silver.customers_clean` | Standardise fields, remove nulls |
| `silver.clickstream_sessions` | Sessionise events by 30-min inactivity gap |

### Gold Layer (Business Tables)

Written by **dbt**, same DAG as Silver (runs sequentially).

| dbt Model | Description | Downstream use |
|---|---|---|
| `gold.customer_features` | Order count, total spend, days since last order, return rate, avg session length per customer | Churn classifier input |
| `gold.product_interactions` | Per customer-product: viewed, purchased, returned flags | Recommender input |

---

## ML Layer

### Churn Classifier (`ml/churn/`)

- **Type**: Binary classification (PyTorch)
- **Input**: `gold.customer_features` (5 features per customer)
- **Output**: Churn probability 0–1
- **Airflow DAG**: `train_churn` — runs once on boot, retrains every 30 min
- **MLflow**: Logs 3 experiment runs with different hyperparameters, registers best model as `churn-classifier` in MLflow Model Registry
- **Endpoint**: `POST /predict/churn` → `{ "customer_id": 123 }` → `{ "churn_probability": 0.73 }`

### Product Recommender (`ml/recommend/`)

- **Type**: Matrix factorisation (PyTorch)
- **Input**: `gold.product_interactions`
- **Output**: Top-5 product IDs
- **Airflow DAG**: `train_recommend` — runs once on boot, retrains every 30 min
- **MLflow**: Logs experiment runs, registers best as `product-recommender`
- **Endpoint**: `POST /predict/recommend` → `{ "customer_id": 123 }` → `{ "product_ids": [12, 45, 7, 88, 3] }`

---

## Serving Layer (FastAPI)

Single FastAPI app (`serving/main.py`) with two routers:

- `POST /predict/churn`
- `POST /predict/recommend`
- `GET /api/status` — returns unified pipeline health JSON (polled by UI every 10s)

FastAPI loads the `Production` alias from MLflow Model Registry on startup.

---

## Frontend Lineage UI (`ui/`)

**Stack**: Next.js 14 (App Router) + ReactFlow + Tailwind CSS + Simple Icons

**Design**: Light theme, Figma-quality. Animated dashed edges with glowing particles travelling between nodes. Each node shows the real product logo.

**Node → URL mapping** (click opens tool in new tab):

| Node | URL |
|---|---|
| PostgreSQL | `localhost:5050` (pgAdmin, `full` only) |
| Apache Kafka | `localhost:8080` (Kafka UI) |
| Airbyte | `localhost:8000` (`full` only) |
| Apache Spark | `localhost:4040` (Spark UI) |
| dbt | `localhost:8580` (dbt docs) |
| Apache Airflow | `localhost:8082` |
| MLflow | `localhost:5000` |
| FastAPI | `localhost:8001/docs` |
| MinIO | `localhost:9001` (`full` only) |

**Profile awareness**: `NEXT_PUBLIC_PROFILE=core|full` env var. Nodes unavailable in `core` are shown greyed-out with tooltip "Available in full profile."

**Live metrics bar** (bottom): records/hr, Kafka consumer lag, Spark job count, dbt model pass rate, churn model accuracy, API latency (p50/p95). All sourced from `GET /api/status`.

---

## Project Structure

```
data-to-ai/
├── docker-compose.yml           # core profile
├── docker-compose.full.yml      # full profile overrides
├── .env
│
├── infra/
│   ├── kafka/                   # KRaft server.properties
│   ├── spark/                   # spark-defaults.conf, Iceberg jars
│   ├── hive-metastore/          # metastore-site.xml, entrypoint.sh (full only)
│   └── minio/                   # bucket init script (full only)
│
├── ingestion/
│   ├── dags/
│   │   ├── ingest_batch.py      # PyAirbyte → Iceberg Bronze
│   │   ├── transform.py         # dbt Silver + Gold
│   │   ├── train_churn.py       # train + register churn model
│   │   └── train_recommend.py   # train + register recommender
│   ├── connectors/
│   │   ├── postgres_source.py   # PyAirbyte connector config
│   │   └── csv_source.py        # PyAirbyte connector config
│   └── streaming/
│       └── clickstream_job.py   # PySpark Structured Streaming → Bronze
│
├── dbt/
│   ├── dbt_project.yml
│   ├── profiles.yml
│   └── models/
│       ├── bronze/
│       ├── silver/
│       │   ├── orders_clean.sql
│       │   ├── customers_clean.sql
│       │   └── clickstream_sessions.sql
│       └── gold/
│           ├── customer_features.sql
│           └── product_interactions.sql
│
├── ml/
│   ├── churn/
│   │   ├── train.py
│   │   ├── model.py
│   │   └── features.py
│   └── recommend/
│       ├── train.py
│       ├── model.py
│       └── features.py
│
├── serving/
│   ├── main.py
│   ├── routers/
│   │   ├── churn.py
│   │   └── recommend.py
│   └── Dockerfile
│
├── ui/
│   ├── app/
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── LineageGraph.tsx
│   │   ├── NodeCard.tsx
│   │   ├── MetricsBar.tsx
│   │   └── FlowEdge.tsx
│   └── Dockerfile
│
├── seed/
│   ├── data/
│   │   ├── orders.csv
│   │   ├── products.csv
│   │   └── customers.csv
│   └── seed.sh
│
└── scripts/
    ├── clickstream_gen.py       # synthetic Kafka event generator
    └── databricks_guide.md     # how to connect to Databricks
```

---

## Databricks Integration

Not in Docker Compose. `scripts/databricks_guide.md` documents how to point the Spark and dbt configs at a Databricks cluster for production use — swap `spark.master=local[2]` for the Databricks connect URI and change the dbt profile target.

---

## Port Reference

| Port | Service |
|---|---|
| 3000 | Lineage UI |
| 4040 | Spark UI |
| 5000 | MLflow |
| 5050 | pgAdmin (`full`) |
| 5432 | Postgres |
| 8000 | Airbyte (`full`) |
| 8001 | FastAPI |
| 8080 | Kafka UI |
| 8082 | Airflow |
| 8580 | dbt docs |
| 9001 | MinIO console (`full`) |
| 9092 | Kafka (internal) |
