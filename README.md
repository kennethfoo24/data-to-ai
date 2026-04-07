# DataFabric — End-to-End Data & AI Portfolio

A fully runnable, Docker Compose portfolio project demonstrating modern data engineering and machine learning — built around **ShopStream**, a fictional e-commerce platform.

## What It Demonstrates

| Layer | Tools |
|---|---|
| **Sources** | CSV files, PostgreSQL, Apache Kafka (real-time stream) |
| **Ingestion** | PyAirbyte (batch), Spark Structured Streaming (Kafka) |
| **Lakehouse** | Apache Iceberg — Bronze → Silver → Gold medallion architecture |
| **Transformation** | Apache Spark, dbt Core |
| **Orchestration** | Apache Airflow |
| **ML Training & Tracking** | PyTorch, MLflow |
| **Model Serving** | FastAPI (`/predict/churn`, `/predict/recommend`) |
| **Lineage Dashboard** | Next.js + ReactFlow — animated, clickable data lineage |

## Prerequisites

- Docker Desktop ≥ 24 with **≥ 8GB RAM** allocated (Settings → Resources)
- Python 3.11+
- `make` (macOS/Linux built-in; Windows: use Git Bash)

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/data-to-ai.git
cd data-to-ai
bash scripts/setup.sh
open http://localhost:3000
```

Setup takes ~5 minutes on first run (Docker image builds). Subsequent starts take ~2 minutes.

## Profiles

| Profile | RAM | Best for |
|---|---|---|
| `core` (default) | ~8GB | Laptop demo |
| `full` | ~16GB | Full demo — adds Airbyte UI, MinIO object storage, pgAdmin |

```bash
bash scripts/setup.sh full   # full profile
```

## Configuration

On first run, `.env` is auto-created from `.env.example`. Edit it to change passwords.

| Variable | Default | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | `postgres` | Change before any public deployment |
| `AIRFLOW_FERNET_KEY` | pre-filled | Regenerate for production |
| `MINIO_ROOT_PASSWORD` | `minioadmin` | Full profile only |
| `COMPOSE_PROFILES` | `core` | Set to `full` for full profile |

## Commands

```bash
make setup      # First-time setup (copies .env, builds, starts, seeds)
make up         # Start services
make down       # Stop services
make seed       # Re-generate and reload seed data
make logs       # Tail all service logs
make ps         # Show running containers
make clean      # Stop + remove volumes + delete seed data
```

## Service URLs

| Service | URL | Login |
|---|---|---|
| **Lineage UI** | http://localhost:3000 | — |
| **Airflow** | http://localhost:8082 | admin / admin |
| **MLflow** | http://localhost:5001 | — |
| **FastAPI docs** | http://localhost:8001/docs | — |
| **Kafka UI** | http://localhost:8080 | — |
| **Spark UI** | http://localhost:4040 | — |
| pgAdmin *(full)* | http://localhost:5050 | admin@shopstream.local / admin |
| Airbyte *(full)* | http://localhost:8000 | — |
| MinIO *(full)* | http://localhost:9001 | minioadmin / minioadmin |

## Architecture

```
  Sources                Lakehouse (Apache Iceberg)
  ───────                ──────────────────────────
  CSV files ──┐
  PostgreSQL──┼──► Airbyte/PyAirbyte ──► Bronze (raw)
  Kafka    ───┘         Spark                │
  (clickstream)     Structured               ▼
                    Streaming           dbt Silver (cleaned)
                                             │
                                             ▼
                                        dbt Gold (features)
                                             │
                                    ┌────────┴────────┐
                              Churn Model      Recommender
                              (PyTorch)        (PyTorch)
                                    └────────┬────────┘
                                         MLflow
                                         FastAPI
                                         Next.js Lineage UI
```

## Databricks

See [`scripts/databricks_guide.md`](scripts/databricks_guide.md) to connect Spark and dbt to a Databricks cluster instead of local Spark.

## License

MIT
