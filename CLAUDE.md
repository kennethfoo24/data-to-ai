# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DataFabric** is an end-to-end data & AI portfolio project built around **ShopStream**, a fictional e-commerce platform. It demonstrates a full modern data stack: ingestion → lakehouse → ML training → serving → lineage UI. The project is delivered in 5 phases; all 5 phases are complete.

## Common Commands

```bash
# One-shot setup (copies .env, builds images, starts services, seeds data)
make setup

# Start/stop services
make up          # core profile (~8GB RAM)
make up-full     # full profile (~16GB RAM)
make down

# Build Docker images
make build
docker compose --profile core build

# Seed data
make seed        # regenerate + reload seed data
python3 seed/generate_data.py   # generate CSVs only
bash seed/seed.sh               # load into Postgres + trigger Airflow DAGs

# Infrastructure tests
bash infra/postgres/test_postgres.sh
bash infra/kafka/test_kafka.sh

# View logs
make logs
make ps
```

## Two Deployment Profiles

| Profile | RAM | Services | Use case |
|---------|-----|----------|----------|
| `core` | ~8GB | 9 services | Local development |
| `full` | ~16GB | 16 services | Enterprise-like with Airbyte + MinIO + pgAdmin |

The full profile adds: Hive Metastore, MinIO (S3), Airbyte, pgAdmin. In core, Iceberg uses a filesystem catalog; in full, it uses Hive Metastore backed by MinIO.

## Architecture & Data Flow

```
Postgres/CSV ──► psycopg2 + PySpark (Airflow DAG) ──► Bronze (Iceberg)
Kafka ──────────► Spark Structured Streaming ──► Bronze (Iceberg)
                                                      │
                                              dbt Silver (cleaned)
                                                      │
                                              dbt Gold (features)
                                               ┌──────┴──────┐
                                          Churn Model   Recommender
                                          (PyTorch)     (PyTorch)
                                               └──────┬──────┘
                                                   MLflow
                                                   FastAPI (:8001)
                                                  Next.js UI (:3000)
```

**Medallion lakehouse**: All tables are Apache Iceberg (ACID, time travel, schema evolution).
- **Bronze**: Raw ingested data (no transformations) — customers, orders, products, clickstream
- **Silver**: Cleaned/deduplicated via dbt — orders_clean, customers_clean, clickstream_sessions
- **Gold**: Feature-engineered tables for ML, served via dbt — customer_features, product_interactions

**Orchestration**: Airflow (standalone mode — scheduler + webserver in one container) runs ingestion DAGs, dbt transformations, and ML training jobs.

## Service URLs

| Service | URL |
|---------|-----|
| Airflow | http://localhost:8082 (admin/admin) |
| Spark UI | http://localhost:4040 |
| MLflow | http://localhost:5001 |
| Kafka UI | http://localhost:8080 |
| FastAPI | http://localhost:8001 |
| Next.js UI | http://localhost:3000 |
| pgAdmin (full) | http://localhost:5050 (admin@shopstream.local/admin) |
| Airbyte (full) | http://localhost:8000 |
| MinIO (full) | http://localhost:9001 (minioadmin/minioadmin) |

## Key File Locations

- `docker-compose.yml` — Core profile (9 services)
- `docker-compose.full.yml` — Full profile overrides
- `.env.example` — All environment variables; copy to `.env` before first run
- `infra/` — Dockerfiles and init scripts for each service
- `infra/postgres/init.sql` — Creates airflow, mlflow DBs/users on first start
- `infra/spark/Dockerfile` — Spark image (Python 3.8); use `pandas<=2.0.3`
- `ingestion/` — PyAirbyte connectors, Airflow DAGs, Spark streaming jobs
- `dbt/` — dbt models (bronze/silver/gold) with Spark adapter
- `ml/` — PyTorch model training (churn prediction, recommender)
- `serving/` — FastAPI app (Phase 4)
- `ui/` — Next.js lineage dashboard (Phase 5)
- `seed/` — Synthetic data generator (2K customers, 200 products, 10K orders)
- `docs/superpowers/specs/` — Architecture spec
- `docs/superpowers/plans/` — Phase implementation plans

## Important Technical Constraints

- **Spark image uses Python 3.8** (`apache/spark:3.5.0` base). Max `pandas==2.0.3`; `pandas>=2.1` is incompatible.
- **Kafka runs KRaft** (no Zookeeper). Topic auto-creation enabled; default topic: `shopstream.clickstream`.
- **Airflow is standalone** — no Celery/Redis. Not suitable for production-scale parallelism.
- Iceberg catalog type switches between profiles: `hadoop` (core filesystem) vs `hive` (full, backed by MinIO).
- The `version` key in `docker-compose.yml` is obsolete (Compose v2) — harmless warning, do not add it back.

## Development Status

All 5 phases complete and verified end-to-end on 2026-04-08. `make setup` brings up 9 services, seeds 2K customers + 200 products, and triggers the full pipeline.

- **Phase 1** (Infrastructure): Complete
- **Phase 2** (Data Pipeline — ingestion, Spark, dbt): Complete
- **Phase 3** (ML — PyTorch, MLflow): Complete
- **Phase 4** (Serving — FastAPI): Complete
- **Phase 5** (UI — Next.js lineage dashboard): Complete

## Phase 2 — Completed (2026-04-08)

All 10 Iceberg tables operational. Full pipeline runs end-to-end via `make seed`.

| File | Purpose |
|------|---------|
| `infra/airflow/Dockerfile` | Java 17, iceberg jar, pyspark, psycopg2; arch-agnostic JAVA_HOME |
| `infra/airflow/entrypoint.sh` | Chowns /warehouse, migrates DB, sets admin/admin password, starts standalone |
| `infra/spark/Dockerfile` | Bundles 4 Kafka connector jars at build time (no runtime `--packages`) |
| `docker-compose.yml` | `user: root` on airflow + spark; basic_auth for Airflow REST API |
| `ingestion/connectors/batch_ingest.py` | psycopg2 → Postgres reads; PySpark + Iceberg hadoop catalog → Bronze |
| `ingestion/dags/ingest_batch.py` | Airflow DAG: triggers `batch_ingest.run_all()` |
| `ingestion/dags/transform.py` | Airflow DAG: `dbt run --select silver` then `dbt run --select gold` |
| `ingestion/streaming/clickstream_job.py` | PySpark Structured Streaming: Kafka → `local.bronze.clickstream`, 30s micro-batches |
| `dbt/dbt_project.yml` | silver+gold as Iceberg tables; no `+database` key (not supported by dbt-spark) |
| `dbt/profiles.yml` | `spark_session` method; iceberg jar + hadoop catalog at `/warehouse` |
| `dbt/macros/generate_schema_name.sql` | Prevents dbt from prefixing schemas (e.g. `silver` not `default_silver`) |
| `dbt/models/bronze/sources.yml` | Declares bronze sources; no `database:` key |
| `dbt/models/silver/*.sql` | orders_clean, customers_clean, clickstream_sessions |
| `dbt/models/gold/*.sql` | customer_features, product_interactions |
| `seed/seed.sh` | TRUNCATE before COPY (idempotent re-runs); triggers both Airflow DAGs |

### Key lessons learned
- **PyAirbyte** can't run inside containers (requires Docker-in-Docker) — replaced with psycopg2
- **PyIceberg 0.11.x** dropped `HadoopCatalog` — use PySpark + Iceberg Spark runtime instead
- **dbt-spark** doesn't support `+database:` config key — remove it from `dbt_project.yml` and `sources.yml`
- **Apple Silicon**: JAVA_HOME must use `dpkg --print-architecture` to resolve arm64 vs amd64

## Phase 3 — Completed (2026-04-08): ML (PyTorch + MLflow)

Two PyTorch models trained from Gold tables, tracked in MLflow.

| File | Purpose |
|------|---------|
| `infra/airflow/Dockerfile` | Added `torch==2.2.2` (plain, no `+cpu` suffix) and `mlflow==2.12.2` |
| `ml/churn/__init__.py` | Makes `churn` importable as a package |
| `ml/churn/features.py` | Loads `gold.customer_features` via PySpark; adds synthetic churn label |
| `ml/churn/model.py` | `ChurnMLP` — 3-layer MLP (5→32→16→1, sigmoid) |
| `ml/churn/train.py` | 3-run HP sweep; registers best as `churn-classifier` Production alias |
| `ml/recommend/__init__.py` | Makes `recommend` importable as a package |
| `ml/recommend/features.py` | Loads `gold.product_interactions`; builds implicit-feedback ratings + index maps |
| `ml/recommend/model.py` | `MatrixFactorization` — embedding MF with bias terms; `top_n()` helper |
| `ml/recommend/train.py` | 3-run HP sweep; saves index maps as artifact; registers `product-recommender` |
| `ingestion/dags/train_churn.py` | Airflow DAG: 30 min schedule, calls `churn.train.run()` |
| `ingestion/dags/train_recommend.py` | Airflow DAG: 30 min schedule, calls `recommend.train.run()` |

### Key notes
- ML code lives in `/opt/airflow/ml` inside the Airflow container (mounted volume)
- Both DAGs insert `/opt/airflow/ml` into `sys.path` so package imports work
- Churn label is heuristic (days_since_last_order > 90 AND order_count < 3) — intentional for demo
- Recommender saves `index_maps.json` artifact alongside the model for serving-layer decoding
- MLflow tracking URI: `http://mlflow:5000` (internal), exposed at `localhost:5001`

## Phase 4 — Completed (2026-04-08): Serving (FastAPI)

| File | Purpose |
|------|---------|
| `serving/main.py` | FastAPI app with CORS, `/health`, `/api/status` (live MLflow + Postgres metrics) |
| `serving/routers/churn.py` | `POST /predict/churn` — loads `churn-classifier@Production` from MLflow, returns churn probability |
| `serving/routers/recommend.py` | `POST /predict/recommend` — loads `product-recommender@Production`, decodes index maps, returns top-5 product IDs |
| `docker-compose.yml` | `fastapi` service: mounts `mlflow_artifacts:/mlflow/artifacts`, `./ml:/app/ml`; sets `PYTHONPATH: /app/ml` |

### Key notes
- Models loaded once at first request via `lru_cache` — no startup latency
- `/api/status` polls MLflow Model Registry + Postgres live; used by UI every 10s
- `serving/requirements.txt` pins `mlflow==2.12.2`, `torch==2.2.2` — must match the MLflow server version
- `PYTHONPATH: /app/ml` required so MLflow's PyTorch flavor can import model classes at deserialization time
- Rebuild fastapi image: `docker compose --profile core build fastapi && docker compose --profile core up -d fastapi`

### Key lessons learned
- **MLflow client/server version parity**: Client API calls must match server. Newer clients call `/api/2.0/mlflow/logged-models` which doesn't exist on older servers — pin both to the same version.
- **Shared artifact volume**: All three services (airflow, mlflow, fastapi) must mount the same `mlflow_artifacts` named volume. Missing it on any service causes 404s when loading models.
- **`torch==2.2.2+cpu` is invalid**: The `+cpu` suffix only exists for torch ≥2.6 on the PyTorch whl index. Use plain `torch==2.2.2` — CPU-only by default on Linux/ARM.
- **pyiceberg conflicts with mlflow**: `pyiceberg[pyarrow]` requires `pyarrow>=17`; `mlflow<2.14` needs `pyarrow<16`. Drop pyiceberg from Airflow image (PySpark handles all Iceberg reads anyway).
- **`orders` is not a Postgres table**: Data lives only in Iceberg. Don't query it from Postgres in `/api/status`.

## Phase 5 — Completed (2026-04-08): UI (Next.js lineage dashboard)

Interactive ReactFlow lineage graph showing the full pipeline from sources through Bronze → Silver → Gold → ML → Serve, with live metrics polling FastAPI `/api/status` every 10s.

| File | Purpose |
|------|---------|
| `ui/package.json` | Next.js 14.2.3, @xyflow/react ^12, motion ^11, tailwindcss ^3 |
| `ui/tsconfig.json` | TypeScript config with `@/*` path aliases and `moduleResolution: bundler` |
| `ui/app/globals.css` | Design system: warm white palette, Lora+DM Sans+JetBrains Mono, Emil Kowalski animation principles |
| `ui/app/layout.tsx` | Minimal layout loading globals.css |
| `ui/app/page.tsx` | Full-bleed layout: header, ReactFlow canvas, MetricsBar |
| `ui/components/LineageGraph.tsx` | ReactFlow graph with custom `PipelineNode`, `SilkEdge` (animateMotion particles), layer labels |
| `ui/components/MetricsBar.tsx` | Bottom bar polling `/api/status`: 6 metric pills, live indicator, profile badge |
| `docker-compose.yml` | `ui` service: Next.js on port 3000, `NEXT_PUBLIC_API_URL=http://localhost:8001` |

### Key notes
- `NEXT_PUBLIC_API_URL` must be `http://localhost:8001` (browser calls FastAPI directly, not via Docker hostname)
- `tsconfig.json` is required for IDE TypeScript resolution of `@/*` path aliases — Next.js resolves them at build without it but the TS language server cannot
- `LineageGraph` is dynamically imported with `ssr: false` (ReactFlow requires a browser environment)
- `SilkEdge` uses SVG `<animateMotion>` with two offset circles for silk-flow particle effect
- Node entrance stagger: `animDelay * 40ms` (12 nodes = 480ms total, avoiding 720ms slowness at 60ms)
- Animation principles (Emil Kowalski): `cubic-bezier(0.23, 1, 0.32, 1)` ease-out, never `scale(0)` entry, `:active` press feedback, `prefers-reduced-motion` support, hover guard for touch devices
- Rebuild: `docker compose --profile core build ui && docker compose --profile core up -d ui`

### Key lessons learned
- **`@xyflow/react` vs `reactflow`**: Use `@xyflow/react` (v12) which has updated API; `reactflow` is the legacy v11 package
- **ReactFlow + SSR**: Always use `dynamic(() => import(...), { ssr: false })` — ReactFlow uses browser APIs at import time
- **`tsconfig.json` missing causes false IDE errors**: Next.js finds it but TypeScript language server needs it in the project root
- **`NEXT_PUBLIC_*` baked at build time**: These vars are embedded in the JS bundle during `next build`, not at runtime — must match where the browser actually calls

## Phase 5 — Post-wiring fixes (2026-04-08)

Fixes applied after initial Phase 5 to make the UI accurately reflect live data.

### FastAPI `/api/status` (`serving/main.py`)
- Removed dead `orders` field — orders live only in Iceberg, not Postgres
- Added `products` count from the `inventory` Postgres table (seeded from `products.csv`)
- `/api/status` now returns: `{ customers: 2000, products: 200 }` + live model registry info

### MetricsBar (`ui/components/MetricsBar.tsx`)
- Updated `StatusResponse` type to include `products: number | null`
- Churn pill: changed metric from `val_accuracy` (doesn't exist) → `val_auc` (what the model logs)
- Recommender pill: changed metric from `val_loss` → `train_rmse` (what the model logs)
- Replaced dead "Accuracy" pill (was `val_accuracy`, always `—`) with "Products" pill showing live count
- Removed unused `pct()` helper

### LineageGraph (`ui/components/LineageGraph.tsx`)
- Removed `url` from both dbt nodes — dbt has no web UI in core profile (was pointing to `:8580`)
- Removed `url` from PostgreSQL node — pgAdmin (`:5050`) is full-profile only

### Seed (`seed/seed.sh`)
- Added inventory seeding: loads `products.csv` via a Postgres temp table → `inventory` table
- Seed now populates both `customers` (2K rows) and `inventory` (200 rows) on every `make seed`
- Uses server-side `COPY` (not `\COPY`) so it works inside `docker compose exec -c` strings

### Key constraint
- **`orders` is not a Postgres table**: Orders data lives only in Iceberg (Bronze layer). Never query `orders` from Postgres in `/api/status` or anywhere else.
- **fastapi image is baked, not volume-mounted**: Changes to `serving/` require `docker compose --profile core build fastapi && docker compose --profile core up -d fastapi`
