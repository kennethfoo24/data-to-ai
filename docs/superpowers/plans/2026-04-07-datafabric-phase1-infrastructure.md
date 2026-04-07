# DataFabric Phase 1 — Infrastructure & Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up all 9 core Docker services with a working seed dataset so every subsequent phase has a running foundation to build on.

**Architecture:** Docker Compose with two profiles (`core` / `full`). Core runs 9 services on ~8GB RAM using Kafka KRaft (no Zookeeper), Spark in local[2] mode with a filesystem-backed Iceberg catalog, and Airflow in standalone mode. Full adds Hive Metastore, MinIO, Airbyte OSS, and pgAdmin as profile overrides.

**Tech Stack:** Docker Compose 2.x, Postgres 15, Kafka 7.6 (KRaft), Spark 3.5 + Iceberg 1.5, Airflow 2.9 (standalone), MLflow 2.12, FastAPI 0.111, Next.js 14, Python 3.11.

**Spec:** `docs/superpowers/specs/2026-04-07-data-to-ai-fabric-design.md`

**Subsequent phases:**
- Phase 2: Data Pipeline (PyAirbyte ingestion, Spark Bronze job, dbt Silver + Gold)
- Phase 3: ML Layer (churn + recommender training, Airflow DAGs, MLflow registry)
- Phase 4: FastAPI serving (`/predict/churn`, `/predict/recommend`, `/api/status`)
- Phase 5: Next.js lineage UI (ReactFlow, animated edges, live metrics)

---

## File Map

```
data-to-ai/
├── docker-compose.yml
├── docker-compose.full.yml
├── .env                            # gitignored — copied from .env.example by setup.sh
├── .env.example                    # committed — all vars documented with safe defaults
├── .gitignore
├── Makefile                        # one-command operations (up, down, seed, logs, clean)
├── README.md                       # setup guide, architecture overview, port reference
├── scripts/
│   └── setup.sh                    # one-shot bootstrap: copy .env, build images, start, seed
│
├── infra/
│   ├── postgres/
│   │   └── init.sql                    # create airflow, mlflow DBs + users
│   ├── spark/
│   │   ├── Dockerfile                  # bitnami/spark + Iceberg jar
│   │   └── spark-defaults.conf         # Iceberg catalog config
│   ├── airflow/
│   │   └── Dockerfile                  # apache/airflow + PyAirbyte + dbt-spark + torch
│   ├── hive-metastore/                 # full profile only
│   │   ├── Dockerfile
│   │   ├── metastore-site.xml
│   │   └── entrypoint.sh
│   └── minio/
│       └── init-buckets.sh             # full profile only
│
├── scripts/
│   ├── clickstream-gen/
│   │   ├── Dockerfile
│   │   ├── requirements.txt
│   │   └── gen.py                      # synthetic Kafka event generator
│   └── databricks_guide.md
│
├── seed/
│   ├── generate_data.py                # generates customers/products/orders CSVs
│   ├── seed.sh                         # bootstrap: generate → load → trigger pipeline
│   └── data/                           # generated at runtime, gitignored
│
└── serving/
    ├── Dockerfile
    ├── requirements.txt
    └── main.py                         # skeleton: GET /health only (Phase 4 fills this)

ui/                                     # skeleton only in this phase
├── Dockerfile
├── package.json
└── app/
    └── page.tsx                        # "Coming soon" placeholder
```

---

## Task 0: GitHub-ready foundation (README, .env.example, Makefile, setup.sh)

**Files:**
- Create: `README.md`
- Create: `.env.example`
- Create: `Makefile`
- Create: `scripts/setup.sh`

- [ ] **Step 1: Create `.env.example`**

```bash
cat > .env.example << 'EOF'
# ── Postgres ──────────────────────────────────────────────────────────────────
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres          # change in production
POSTGRES_DB=shopstream
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# ── Airflow ───────────────────────────────────────────────────────────────────
# Generate a new key with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
AIRFLOW_FERNET_KEY=ZmDfcTF7_60GrrY167zsiPd67pEvs0aGOv2oasOM1Pg=
AIRFLOW_SECRET_KEY=shopstream-dev-secret   # change in production

# ── Kafka ─────────────────────────────────────────────────────────────────────
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
KAFKA_TOPIC_CLICKSTREAM=shopstream.clickstream
CLICKSTREAM_EVENTS_PER_SEC=5

# ── Spark / Iceberg ───────────────────────────────────────────────────────────
SPARK_WAREHOUSE=/warehouse
ICEBERG_CATALOG_TYPE=hadoop          # core profile: hadoop (filesystem)
                                     # full profile: hive

# ── MLflow ────────────────────────────────────────────────────────────────────
MLFLOW_TRACKING_URI=http://mlflow:5000

# ── MinIO (full profile only) ─────────────────────────────────────────────────
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin       # change in production
MINIO_ENDPOINT=http://minio:9000

# ── Compose profile ───────────────────────────────────────────────────────────
# core  → 9 services, ~8GB RAM, no Airbyte UI
# full  → 16 services, ~16GB RAM, includes Airbyte, MinIO, pgAdmin
COMPOSE_PROFILES=core
EOF
```

- [ ] **Step 2: Create `Makefile`**

```makefile
.PHONY: up down seed logs clean build ps help

## Start services (core profile by default)
up:
	docker compose --profile $${COMPOSE_PROFILES:-core} up -d

## Start full profile (Airbyte, MinIO, pgAdmin)
up-full:
	COMPOSE_PROFILES=full docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up -d

## Stop all services
down:
	docker compose --profile core down
	docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full down 2>/dev/null || true

## Generate seed data and load into services
seed:
	python3 seed/generate_data.py
	bash seed/seed.sh

## Tail logs for all services
logs:
	docker compose --profile $${COMPOSE_PROFILES:-core} logs -f

## Show running containers
ps:
	docker compose --profile $${COMPOSE_PROFILES:-core} ps

## Build all custom images
build:
	docker compose --profile core build

## Remove containers, volumes, and generated data
clean:
	docker compose --profile core down -v
	rm -rf seed/data/

## One-shot setup for new contributors
setup:
	bash scripts/setup.sh

## Show this help
help:
	@grep -E '^##' Makefile | sed 's/## //'
```

- [ ] **Step 3: Create `scripts/setup.sh`**

```bash
#!/bin/bash
# setup.sh — one-shot bootstrap for DataFabric
# Usage: bash scripts/setup.sh [core|full]
set -e

PROFILE=${1:-core}
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   DataFabric — ShopStream Setup          ║"
echo "║   Profile: $PROFILE                         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Copy .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env from .env.example"
  echo "  → Edit .env to change passwords before deploying to a server."
else
  echo "✓ .env already exists, skipping copy."
fi

# 2. Generate seed CSV data
echo ""
echo "→ Generating seed data..."
python3 seed/generate_data.py

# 3. Build custom Docker images
echo ""
echo "→ Building Docker images (this takes ~5 min on first run)..."
if [ "$PROFILE" = "full" ]; then
  docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full build
else
  docker compose --profile core build
fi

# 4. Start services
echo ""
echo "→ Starting services..."
if [ "$PROFILE" = "full" ]; then
  COMPOSE_PROFILES=full docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up -d
else
  COMPOSE_PROFILES=core docker compose --profile core up -d
fi

# 5. Wait for Postgres to be healthy
echo ""
echo "→ Waiting for Postgres..."
until docker compose exec postgres pg_isready -U postgres -q; do
  printf '.'
  sleep 2
done
echo " ready."

# 6. Wait for Airflow
echo "→ Waiting for Airflow (may take 60s on first boot)..."
until curl -sf http://localhost:8082/health | grep -q "healthy"; do
  printf '.'
  sleep 5
done
echo " ready."

# 7. Load seed data
echo ""
echo "→ Loading seed data into Postgres..."
bash seed/seed.sh

# 8. Print summary
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   DataFabric is running!                                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║   Lineage UI   →  http://localhost:3000                      ║"
echo "║   Airflow      →  http://localhost:8082  (admin / admin)     ║"
echo "║   MLflow       →  http://localhost:5000                      ║"
echo "║   FastAPI docs →  http://localhost:8001/docs                 ║"
echo "║   Kafka UI     →  http://localhost:8080                      ║"
echo "║   Spark UI     →  http://localhost:4040                      ║"
if [ "$PROFILE" = "full" ]; then
echo "║   Airbyte      →  http://localhost:8000                      ║"
echo "║   MinIO        →  http://localhost:9001                      ║"
echo "║   pgAdmin      →  http://localhost:5050                      ║"
fi
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "To stop:  make down"
echo "To clean: make clean"
```

- [ ] **Step 4: Create `README.md`**

```markdown
# DataFabric — End-to-End Data & AI Portfolio

A fully runnable, Docker Compose-based showcase of modern data engineering and machine learning. Built around a fictional e-commerce platform called **ShopStream**.

## What It Demonstrates

| Layer | Tools |
|---|---|
| **Ingestion** | Apache Kafka (KRaft), PyAirbyte, Spark Structured Streaming |
| **Lakehouse** | Apache Iceberg (Bronze → Silver → Gold medallion architecture) |
| **Transformation** | Apache Spark, dbt Core |
| **Orchestration** | Apache Airflow |
| **ML Training** | PyTorch, MLflow |
| **Serving** | FastAPI |
| **Lineage UI** | Next.js, ReactFlow |

## Prerequisites

- Docker Desktop ≥ 24 with ≥ 8GB RAM allocated
- Python 3.11+
- `make` (comes with macOS/Linux; Windows: use Git Bash)

## Quick Start (5 minutes)

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/data-to-ai.git
cd data-to-ai

# One-command setup (core profile, ~8GB RAM)
bash scripts/setup.sh

# Open the lineage dashboard
open http://localhost:3000
```

## Profiles

| Profile | RAM | Services | Use when |
|---|---|---|---|
| `core` | ~8GB | 9 services | Laptop demo |
| `full` | ~16GB | 16 services | Full demo with Airbyte UI, MinIO, pgAdmin |

```bash
# Full profile
bash scripts/setup.sh full
```

## Configuration

All passwords and settings are in `.env` (copied from `.env.example` on first run).

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | `postgres` | Postgres superuser password |
| `AIRFLOW_FERNET_KEY` | (pre-filled) | Airflow encryption key — regenerate for production |
| `MINIO_ROOT_PASSWORD` | `minioadmin` | MinIO admin password (full profile) |
| `COMPOSE_PROFILES` | `core` | Active profile (`core` or `full`) |

## Common Commands

```bash
make up         # Start services
make down       # Stop services
make seed       # Re-generate and load seed data
make logs       # Tail all logs
make ps         # Show service status
make clean      # Stop + remove volumes + delete seed data
```

## Service URLs

| Service | URL | Credentials |
|---|---|---|
| Lineage UI | http://localhost:3000 | — |
| Airflow | http://localhost:8082 | admin / admin |
| MLflow | http://localhost:5000 | — |
| FastAPI docs | http://localhost:8001/docs | — |
| Kafka UI | http://localhost:8080 | — |
| Spark UI | http://localhost:4040 | — |
| pgAdmin | http://localhost:5050 | admin@shopstream.local / admin |
| Airbyte | http://localhost:8000 | — |
| MinIO | http://localhost:9001 | minioadmin / minioadmin |

## Architecture

```
CSV / Postgres / Kafka
        │
    Ingestion (PyAirbyte + Spark Streaming)
        │
   Bronze Layer ── Apache Iceberg (raw)
        │
    dbt Silver ── Iceberg (cleaned)
        │
    dbt Gold ── Iceberg (features)
        │
   ┌────┴────┐
Churn Model  Recommender  (PyTorch + MLflow)
   └────┬────┘
    FastAPI /predict
        │
   Lineage UI (Next.js)
```

## Databricks

See [`scripts/databricks_guide.md`](scripts/databricks_guide.md) for connecting Spark and dbt to a Databricks cluster.

## License

MIT
```

- [ ] **Step 5: Make scripts executable and commit**

```bash
chmod +x scripts/setup.sh
git add README.md .env.example Makefile scripts/setup.sh
git commit -m "docs: readme, env.example, makefile, setup.sh for one-command startup"
```

---

## Task 1: Project scaffold

**Files:**
- Create: `.env`
- Create: `.gitignore`
- Create: directory tree

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p infra/postgres infra/spark infra/airflow infra/hive-metastore infra/minio
mkdir -p scripts/clickstream-gen
mkdir -p seed/data
mkdir -p ingestion/dags ingestion/connectors ingestion/streaming
mkdir -p dbt/models/bronze dbt/models/silver dbt/models/gold
mkdir -p ml/churn ml/recommend
mkdir -p serving/routers
mkdir -p ui/app ui/components
mkdir -p docs/superpowers/plans docs/superpowers/specs
```

- [ ] **Step 2: Create `.env`**

```bash
cat > .env << 'EOF'
# Postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=shopstream
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Airflow
AIRFLOW_FERNET_KEY=ZmDfcTF7_60GrrY167zsiPd67pEvs0aGOv2oasOM1Pg=
AIRFLOW_SECRET_KEY=shopstream-dev-secret

# Kafka
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
KAFKA_TOPIC_CLICKSTREAM=shopstream.clickstream
CLICKSTREAM_EVENTS_PER_SEC=5

# Spark / Iceberg
SPARK_WAREHOUSE=/warehouse
ICEBERG_CATALOG_TYPE=hadoop

# MLflow
MLFLOW_TRACKING_URI=http://mlflow:5000

# MinIO (full profile)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_ENDPOINT=http://minio:9000

# Compose profile
COMPOSE_PROFILES=core
EOF
```

- [ ] **Step 3: Create `.gitignore`**

```bash
cat > .gitignore << 'EOF'
seed/data/
.env.local
__pycache__/
*.pyc
.venv/
node_modules/
.next/
mlruns/
*.egg-info/
.superpowers/
EOF
```

- [ ] **Step 4: Commit**

```bash
git init
git add .env .gitignore
git commit -m "chore: project scaffold and environment config"
```

---

## Task 2: Postgres service

**Files:**
- Create: `infra/postgres/init.sql`

- [ ] **Step 1: Write validation test**

```bash
cat > infra/postgres/test_postgres.sh << 'EOF'
#!/bin/bash
set -e
echo "Testing Postgres..."
docker compose --profile core run --rm postgres \
  psql -U postgres -c "\l" | grep -q "airflow" && echo "PASS: airflow DB exists"
docker compose --profile core run --rm postgres \
  psql -U postgres -c "\l" | grep -q "mlflow"  && echo "PASS: mlflow DB exists"
EOF
chmod +x infra/postgres/test_postgres.sh
```

- [ ] **Step 2: Create `infra/postgres/init.sql`**

```sql
-- Additional databases (shopstream created via POSTGRES_DB env var)
CREATE DATABASE airflow;
CREATE DATABASE mlflow;

-- Airflow user
CREATE USER airflow WITH PASSWORD 'airflow';
GRANT ALL PRIVILEGES ON DATABASE airflow TO airflow;
ALTER DATABASE airflow OWNER TO airflow;

-- MLflow user
CREATE USER mlflow WITH PASSWORD 'mlflow';
GRANT ALL PRIVILEGES ON DATABASE mlflow TO mlflow;
ALTER DATABASE mlflow OWNER TO mlflow;

-- ShopStream schema (seed script populates data later)
\c shopstream
CREATE TABLE IF NOT EXISTS customers (
    customer_id   SERIAL PRIMARY KEY,
    name          VARCHAR(100),
    email         VARCHAR(150) UNIQUE,
    city          VARCHAR(80),
    country       VARCHAR(60),
    signup_date   DATE,
    age           INTEGER,
    loyalty_tier  VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS inventory (
    product_id    INTEGER PRIMARY KEY,
    stock_qty     INTEGER DEFAULT 0,
    updated_at    TIMESTAMP DEFAULT NOW()
);
```

- [ ] **Step 3: Commit**

```bash
git add infra/postgres/
git commit -m "feat: postgres init SQL with airflow, mlflow, shopstream databases"
```

---

## Task 3: Kafka KRaft service

**Files:**
- No extra config files needed — all config via docker-compose env vars.

- [ ] **Step 1: Write validation script**

```bash
cat > infra/kafka/test_kafka.sh << 'EOF'
#!/bin/bash
set -e
echo "Waiting for Kafka..."
sleep 5
docker compose --profile core exec kafka \
  kafka-topics --bootstrap-server localhost:9092 --list
echo "PASS: Kafka is reachable"

docker compose --profile core exec kafka \
  kafka-topics --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic shopstream.clickstream \
  --partitions 3 --replication-factor 1
echo "PASS: topic shopstream.clickstream created"
EOF
chmod +x infra/kafka/test_kafka.sh
```

- [ ] **Step 2: Commit**

```bash
git add infra/kafka/
git commit -m "feat: kafka kraft validation script"
```

---

## Task 4: Spark + Iceberg custom image

**Files:**
- Create: `infra/spark/Dockerfile`
- Create: `infra/spark/spark-defaults.conf`

- [ ] **Step 1: Create `infra/spark/Dockerfile`**

```dockerfile
FROM bitnami/spark:3.5.1

USER root

# Iceberg runtime jar for Spark 3.5 + Scala 2.12
ARG ICEBERG_VERSION=1.5.2
RUN wget -q -O /opt/bitnami/spark/jars/iceberg-spark-runtime.jar \
  "https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-spark-runtime-3.5_2.12/${ICEBERG_VERSION}/iceberg-spark-runtime-3.5_2.12-${ICEBERG_VERSION}.jar"

# Python deps for PySpark jobs
RUN pip install --no-cache-dir \
  pyarrow==15.0.2 \
  pandas==2.1.4 \
  psycopg2-binary==2.9.9

COPY spark-defaults.conf /opt/bitnami/spark/conf/spark-defaults.conf

USER 1001
```

- [ ] **Step 2: Create `infra/spark/spark-defaults.conf`**

```properties
# Iceberg extensions
spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions

# Default catalog — filesystem-backed (core profile)
spark.sql.catalog.local=org.apache.iceberg.spark.SparkCatalog
spark.sql.catalog.local.type=hadoop
spark.sql.catalog.local.warehouse=/warehouse

# Override spark_catalog to use Iceberg
spark.sql.catalog.spark_catalog=org.apache.iceberg.spark.SparkSessionCatalog
spark.sql.catalog.spark_catalog.type=hadoop
spark.sql.catalog.spark_catalog.warehouse=/warehouse

# Defaults
spark.sql.defaultCatalog=local
spark.driver.memory=1g
spark.executor.memory=1g
```

- [ ] **Step 3: Verify Dockerfile builds**

```bash
docker build -t datafabric-spark infra/spark/
# Expected: Successfully tagged datafabric-spark:latest
```

- [ ] **Step 4: Commit**

```bash
git add infra/spark/
git commit -m "feat: spark 3.5 + iceberg 1.5 custom image"
```

---

## Task 5: Airflow custom image

**Files:**
- Create: `infra/airflow/Dockerfile`

- [ ] **Step 1: Create `infra/airflow/Dockerfile`**

```dockerfile
FROM apache/airflow:2.9.3-python3.11

USER root
# Java for PySpark
RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-17-jdk-headless && \
    rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

USER airflow
RUN pip install --no-cache-dir \
  airbyte==0.14.0 \
  dbt-spark[PyHive]==1.8.0 \
  apache-spark==3.5.1 \
  pyarrow==15.0.2 \
  pandas==2.1.4 \
  torch==2.2.2 \
  mlflow==2.12.2 \
  scikit-learn==1.4.2 \
  psycopg2-binary==2.9.9 \
  confluent-kafka==2.4.0
```

- [ ] **Step 2: Verify build**

```bash
docker build -t datafabric-airflow infra/airflow/
# Expected: Successfully tagged datafabric-airflow:latest
# Note: this image is large (~3GB). Build once, reuse via cache.
```

- [ ] **Step 3: Commit**

```bash
git add infra/airflow/
git commit -m "feat: airflow 2.9 image with pyairbyte, dbt-spark, torch, mlflow"
```

---

## Task 6: Clickstream generator service

**Files:**
- Create: `scripts/clickstream-gen/Dockerfile`
- Create: `scripts/clickstream-gen/requirements.txt`
- Create: `scripts/clickstream-gen/gen.py`

- [ ] **Step 1: Create `scripts/clickstream-gen/requirements.txt`**

```
confluent-kafka==2.4.0
faker==24.9.0
```

- [ ] **Step 2: Create `scripts/clickstream-gen/gen.py`**

```python
"""
Synthetic clickstream event generator.
Streams JSON events to Kafka topic at configurable rate.
"""
import json
import os
import random
import time
import uuid
from datetime import datetime, timezone

from confluent_kafka import Producer
from faker import Faker

fake = Faker()

BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
TOPIC     = os.getenv("KAFKA_TOPIC", "shopstream.clickstream")
RATE      = float(os.getenv("EVENTS_PER_SECOND", "5"))

EVENT_TYPES = [
    "page_view", "page_view", "page_view",   # weighted: more views than purchases
    "product_view", "product_view",
    "add_to_cart",
    "checkout",
    "purchase",
]

PAGES = ["/home", "/sale", "/new-arrivals", "/account", "/products/{product_id}"]

def make_event(customer_ids: list[int], product_ids: list[int]) -> dict:
    product_id = random.choice(product_ids)
    return {
        "event_id":    str(uuid.uuid4()),
        "customer_id": random.choice(customer_ids),
        "session_id":  str(uuid.uuid4())[:8],
        "event_type":  random.choice(EVENT_TYPES),
        "product_id":  product_id,
        "page":        random.choice(PAGES).format(product_id=product_id),
        "timestamp":   datetime.now(timezone.utc).isoformat(),
    }

def delivery_report(err, msg):
    if err:
        print(f"Delivery failed: {err}")

def main():
    print(f"Connecting to Kafka at {BOOTSTRAP}...")
    producer = Producer({"bootstrap.servers": BOOTSTRAP})

    # Seed customer and product ID ranges matching the seed data
    customer_ids = list(range(1, 2001))    # 2K customers
    product_ids  = list(range(1, 201))     # 200 products

    interval = 1.0 / RATE
    print(f"Streaming {RATE} events/sec to {TOPIC}...")

    while True:
        event = make_event(customer_ids, product_ids)
        producer.produce(
            TOPIC,
            key=str(event["customer_id"]),
            value=json.dumps(event),
            callback=delivery_report,
        )
        producer.poll(0)
        time.sleep(interval)

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Create `scripts/clickstream-gen/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY gen.py .
CMD ["python", "gen.py"]
```

- [ ] **Step 4: Verify build**

```bash
docker build -t datafabric-clickstream scripts/clickstream-gen/
# Expected: Successfully tagged datafabric-clickstream:latest
```

- [ ] **Step 5: Commit**

```bash
git add scripts/clickstream-gen/
git commit -m "feat: synthetic clickstream event generator for kafka"
```

---

## Task 7: FastAPI skeleton

**Files:**
- Create: `serving/requirements.txt`
- Create: `serving/main.py`
- Create: `serving/Dockerfile`

- [ ] **Step 1: Create `serving/requirements.txt`**

```
fastapi==0.111.0
uvicorn[standard]==0.30.1
mlflow==2.12.2
psycopg2-binary==2.9.9
torch==2.2.2
pandas==2.1.4
pyarrow==15.0.2
```

- [ ] **Step 2: Create `serving/main.py`**

```python
"""FastAPI serving app. Phase 4 adds predict routers."""
from fastapi import FastAPI

app = FastAPI(title="ShopStream ML API", version="0.1.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "shopstream-api"}

@app.get("/api/status")
def status():
    """Pipeline status — populated in Phase 4."""
    return {"pipeline": "initialising", "models": {}}
```

- [ ] **Step 3: Create `serving/Dockerfile`**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

- [ ] **Step 4: Commit**

```bash
git add serving/
git commit -m "feat: fastapi skeleton with /health and /api/status stubs"
```

---

## Task 8: Next.js UI skeleton

**Files:**
- Create: `ui/package.json`
- Create: `ui/app/page.tsx`
- Create: `ui/app/layout.tsx`
- Create: `ui/Dockerfile`
- Create: `ui/next.config.js`

- [ ] **Step 1: Create `ui/package.json`**

```json
{
  "name": "datafabric-ui",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "@xyflow/react": "^12.0.0",
    "tailwindcss": "^3.4.3",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Create `ui/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DataFabric — ShopStream Lineage',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Create `ui/app/page.tsx`**

```tsx
export default function Home() {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>DataFabric</h1>
        <p style={{ color: '#6b7280', marginTop: '8px' }}>Lineage UI — Phase 5 coming soon</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Create `ui/app/globals.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #f0f3fb; }
```

- [ ] **Step 5: Create `ui/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}
module.exports = nextConfig
```

- [ ] **Step 6: Create `ui/Dockerfile`**

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 7: Commit**

```bash
git add ui/
git commit -m "feat: next.js 14 ui skeleton"
```

---

## Task 9: Core docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
version: '3.9'

x-airflow-env: &airflow-env
  AIRFLOW__CORE__EXECUTOR: LocalExecutor
  AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://airflow:airflow@postgres:5432/airflow
  AIRFLOW__CORE__FERNET_KEY: ${AIRFLOW_FERNET_KEY}
  AIRFLOW__WEBSERVER__SECRET_KEY: ${AIRFLOW_SECRET_KEY}
  AIRFLOW__CORE__LOAD_EXAMPLES: 'false'
  AIRFLOW__CORE__DAGS_FOLDER: /opt/airflow/dags

services:

  postgres:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      - ./seed/data:/seed:ro        # makes CSVs accessible for \COPY
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 10
    profiles: [core, full]

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    restart: unless-stopped
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'
      CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk'
    volumes:
      - kafka_data:/var/lib/kafka/data
    ports:
      - "9092:9092"
    healthcheck:
      test: ["CMD", "kafka-topics", "--bootstrap-server", "localhost:9092", "--list"]
      interval: 10s
      timeout: 10s
      retries: 15
    profiles: [core, full]

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    restart: unless-stopped
    environment:
      KAFKA_CLUSTERS_0_NAME: shopstream
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
    ports:
      - "8080:8080"
    depends_on:
      kafka:
        condition: service_healthy
    profiles: [core, full]

  clickstream-gen:
    build: ./scripts/clickstream-gen
    restart: unless-stopped
    environment:
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS}
      KAFKA_TOPIC: ${KAFKA_TOPIC_CLICKSTREAM}
      EVENTS_PER_SECOND: ${CLICKSTREAM_EVENTS_PER_SEC}
    depends_on:
      kafka:
        condition: service_healthy
    profiles: [core, full]

  spark:
    build: ./infra/spark
    restart: unless-stopped
    environment:
      SPARK_MODE: master
      WAREHOUSE_PATH: ${SPARK_WAREHOUSE}
      ICEBERG_CATALOG_TYPE: ${ICEBERG_CATALOG_TYPE}
    volumes:
      - spark_warehouse:/warehouse
      - ./ingestion:/opt/spark/work-dir/ingestion
      - ./dbt:/opt/spark/work-dir/dbt
      - ./seed/data:/opt/spark/work-dir/seed/data
    ports:
      - "4040:4040"
      - "7077:7077"
    profiles: [core, full]

  airflow:
    build: ./infra/airflow
    restart: unless-stopped
    command: standalone
    environment:
      <<: *airflow-env
      POSTGRES_HOST: ${POSTGRES_HOST}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
      KAFKA_BOOTSTRAP_SERVERS: ${KAFKA_BOOTSTRAP_SERVERS}
      MLFLOW_TRACKING_URI: ${MLFLOW_TRACKING_URI}
      SPARK_WAREHOUSE: ${SPARK_WAREHOUSE}
    volumes:
      - ./ingestion/dags:/opt/airflow/dags
      - ./ingestion/connectors:/opt/airflow/connectors
      - ./ingestion/streaming:/opt/airflow/streaming
      - ./ml:/opt/airflow/ml
      - ./dbt:/opt/airflow/dbt
      - ./seed/data:/opt/airflow/seed/data
      - airflow_logs:/opt/airflow/logs
    ports:
      - "8082:8080"
    depends_on:
      postgres:
        condition: service_healthy
    profiles: [core, full]

  mlflow:
    image: ghcr.io/mlflow/mlflow:v2.12.2
    restart: unless-stopped
    command: >
      mlflow server
      --backend-store-uri postgresql://mlflow:mlflow@postgres:5432/mlflow
      --default-artifact-root /mlflow/artifacts
      --host 0.0.0.0
      --port 5000
    volumes:
      - mlflow_artifacts:/mlflow/artifacts
    ports:
      - "5000:5000"
    depends_on:
      postgres:
        condition: service_healthy
    profiles: [core, full]

  fastapi:
    build: ./serving
    restart: unless-stopped
    environment:
      MLFLOW_TRACKING_URI: ${MLFLOW_TRACKING_URI}
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
    ports:
      - "8001:8001"
    depends_on:
      - mlflow
      - postgres
    profiles: [core, full]

  ui:
    build: ./ui
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_PROFILE: core
      NEXT_PUBLIC_API_URL: http://localhost:8001
    ports:
      - "3000:3000"
    profiles: [core, full]

volumes:
  postgres_data:
  kafka_data:
  spark_warehouse:
  airflow_logs:
  mlflow_artifacts:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: core docker-compose with 9 services (kafka kraft, spark, airflow standalone)"
```

---

## Task 10: Full profile overrides

**Files:**
- Create: `docker-compose.full.yml`
- Create: `infra/hive-metastore/Dockerfile`
- Create: `infra/hive-metastore/metastore-site.xml`
- Create: `infra/hive-metastore/entrypoint.sh`
- Create: `infra/minio/init-buckets.sh`

- [ ] **Step 1: Create `infra/minio/init-buckets.sh`**

```bash
#!/bin/sh
set -e
sleep 3
mc alias set local http://minio:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD}
mc mb --ignore-existing local/shopstream-iceberg
mc mb --ignore-existing local/mlflow-artifacts
echo "MinIO buckets created."
```

- [ ] **Step 2: Create `infra/hive-metastore/metastore-site.xml`**

```xml
<?xml version="1.0"?>
<configuration>
  <property>
    <name>metastore.thrift.uris</name>
    <value>thrift://hive-metastore:9083</value>
  </property>
  <property>
    <name>metastore.task.threads.always</name>
    <value>org.apache.hadoop.hive.metastore.events.EventCleanerTask</value>
  </property>
  <property>
    <name>metastore.warehouse.dir</name>
    <value>s3a://shopstream-iceberg/warehouse</value>
  </property>
  <property>
    <name>fs.s3a.endpoint</name>
    <value>http://minio:9000</value>
  </property>
  <property>
    <name>fs.s3a.access.key</name>
    <value>minioadmin</value>
  </property>
  <property>
    <name>fs.s3a.secret.key</name>
    <value>minioadmin</value>
  </property>
  <property>
    <name>fs.s3a.path.style.access</name>
    <value>true</value>
  </property>
  <property>
    <name>javax.jdo.option.ConnectionURL</name>
    <value>jdbc:postgresql://postgres:5432/metastore</value>
  </property>
  <property>
    <name>javax.jdo.option.ConnectionDriverName</name>
    <value>org.postgresql.Driver</value>
  </property>
  <property>
    <name>javax.jdo.option.ConnectionUserName</name>
    <value>postgres</value>
  </property>
  <property>
    <name>javax.jdo.option.ConnectionPassword</name>
    <value>postgres</value>
  </property>
  <property>
    <name>datanucleus.autoCreateSchema</name>
    <value>true</value>
  </property>
</configuration>
```

- [ ] **Step 3: Create `infra/hive-metastore/entrypoint.sh`**

```bash
#!/bin/bash
set -e
# Init schema if not exists
/opt/hive/bin/schematool -dbType postgres -initSchemaTo 4.0.0 --verbose || true
# Start metastore
/opt/hive/bin/hive --service metastore
```

- [ ] **Step 4: Create `infra/hive-metastore/Dockerfile`**

```dockerfile
FROM apache/hive:4.0.0
USER root
RUN wget -q -O /opt/hive/lib/postgresql-42.7.3.jar \
  https://jdbc.postgresql.org/download/postgresql-42.7.3.jar
COPY metastore-site.xml /opt/hive/conf/metastore-site.xml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER hive
ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 5: Create `docker-compose.full.yml`**

```yaml
version: '3.9'

# Usage: docker compose -f docker-compose.yml -f docker-compose.full.yml --profile full up

services:

  # --- Add metastore database to postgres init ---
  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
      - ./infra/postgres/init-full.sql:/docker-entrypoint-initdb.d/02-init-full.sql:ro
    profiles: [full]

  hive-metastore:
    build: ./infra/hive-metastore
    restart: unless-stopped
    ports:
      - "9083:9083"
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_started
    profiles: [full]

  minio:
    image: minio/minio:RELEASE.2024-04-06T05-26-02Z
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    profiles: [full]

  minio-init:
    image: minio/mc:latest
    entrypoint: /bin/sh /init-buckets.sh
    volumes:
      - ./infra/minio/init-buckets.sh:/init-buckets.sh:ro
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    depends_on:
      - minio
    profiles: [full]

  airbyte-server:
    image: airbyte/server:0.63.14
    restart: unless-stopped
    environment:
      AIRBYTE_VERSION: 0.63.14
      DATABASE_URL: jdbc:postgresql://postgres:5432/airbyte
      DATABASE_USER: airbyte
      DATABASE_PASSWORD: airbyte
      TRACKING_STRATEGY: logging
      WORKER_ENVIRONMENT: docker
    ports:
      - "8000:8001"
    depends_on:
      postgres:
        condition: service_healthy
    profiles: [full]

  airbyte-worker:
    image: airbyte/worker:0.63.14
    restart: unless-stopped
    environment:
      AIRBYTE_VERSION: 0.63.14
      DATABASE_URL: jdbc:postgresql://postgres:5432/airbyte
      DATABASE_USER: airbyte
      DATABASE_PASSWORD: airbyte
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      - airbyte-server
    profiles: [full]

  airbyte-temporal:
    image: temporalio/auto-setup:1.22.4
    restart: unless-stopped
    environment:
      DB: postgresql
      DB_PORT: 5432
      POSTGRES_USER: temporal
      POSTGRES_PWD: temporal
      POSTGRES_SEEDS: postgres
    depends_on:
      postgres:
        condition: service_healthy
    profiles: [full]

  airbyte-webapp:
    image: airbyte/webapp:0.63.14
    restart: unless-stopped
    environment:
      INTERNAL_API_HOST: airbyte-server:8001
    ports:
      - "8000:80"
    depends_on:
      - airbyte-server
    profiles: [full]

  pgadmin:
    image: dpage/pgadmin4:8.5
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@shopstream.local
      PGADMIN_DEFAULT_PASSWORD: admin
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    ports:
      - "5050:80"
    depends_on:
      postgres:
        condition: service_healthy
    profiles: [full]

  # Override ui to set full profile env
  ui:
    environment:
      NEXT_PUBLIC_PROFILE: full
      NEXT_PUBLIC_API_URL: http://localhost:8001
    profiles: [full]

volumes:
  minio_data:
  pgadmin_data:
```

- [ ] **Step 6: Create `infra/postgres/init-full.sql`** (extra DBs for full profile)

```sql
CREATE DATABASE metastore;
CREATE DATABASE airbyte;

CREATE USER airbyte WITH PASSWORD 'airbyte';
GRANT ALL PRIVILEGES ON DATABASE airbyte TO airbyte;
ALTER DATABASE airbyte OWNER TO airbyte;

CREATE USER temporal WITH PASSWORD 'temporal';
CREATE DATABASE temporal;
GRANT ALL PRIVILEGES ON DATABASE temporal TO temporal;
ALTER DATABASE temporal OWNER TO temporal;
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.full.yml infra/hive-metastore/ infra/minio/ infra/postgres/init-full.sql
git commit -m "feat: full profile overrides (hive metastore, minio, airbyte, pgadmin)"
```

---

## Task 11: Seed data generator

**Files:**
- Create: `seed/generate_data.py`
- Create: `seed/seed.sh`

- [ ] **Step 1: Create `seed/generate_data.py`**

```python
"""
Generate realistic ShopStream seed CSVs.
Outputs: seed/data/customers.csv, products.csv, orders.csv
"""
import csv
import os
import random
from datetime import date, timedelta

random.seed(42)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# ── Customers (2,000) ──────────────────────────────────────────────────────────
CITIES = [
    ("London", "UK"), ("Manchester", "UK"), ("Birmingham", "UK"),
    ("New York", "US"), ("Los Angeles", "US"), ("Chicago", "US"),
    ("Sydney", "AU"), ("Melbourne", "AU"),
    ("Toronto", "CA"), ("Vancouver", "CA"),
]
TIERS = ["bronze", "bronze", "bronze", "silver", "silver", "gold"]
FIRST = ["Alice","Bob","Carol","Dave","Eve","Frank","Grace","Henry","Iris","Jack",
         "Karen","Leo","Mia","Noah","Olivia","Paul","Quinn","Rose","Sam","Tina"]
LAST  = ["Smith","Jones","Williams","Taylor","Brown","Davies","Evans","Wilson",
         "Thomas","Roberts","Johnson","Lee","Walker","Hall","Allen","Young"]

def random_date(start: date, end: date) -> str:
    return (start + timedelta(days=random.randint(0, (end - start).days))).isoformat()

with open(f"{DATA_DIR}/customers.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["customer_id","name","email","city","country","signup_date","age","loyalty_tier"])
    for i in range(1, 2001):
        first, last = random.choice(FIRST), random.choice(LAST)
        city, country = random.choice(CITIES)
        w.writerow([
            i, f"{first} {last}", f"{first.lower()}.{last.lower()}{i}@example.com",
            city, country,
            random_date(date(2021, 1, 1), date(2024, 12, 31)),
            random.randint(18, 72),
            random.choice(TIERS),
        ])
print("customers.csv ✓")

# ── Products (200) ────────────────────────────────────────────────────────────
CATEGORIES = {
    "Electronics":    [("iPhone 15 Pro", 999), ("Samsung S24", 849), ("iPad Air", 749),
                       ("MacBook Air M3", 1299), ("AirPods Pro", 249), ("Sony WH-1000XM5", 349),
                       ("Dell XPS 15", 1799), ("LG OLED 55\"", 1499)],
    "Home Appliances":[("Dyson V15", 699), ("Nespresso Vertuo", 199), ("KitchenAid Mixer", 449),
                       ("Instant Pot Duo", 99), ("Roomba j7+", 599)],
    "Clothing":       [("Nike Air Max", 149), ("Levi's 501 Jeans", 89), ("North Face Jacket", 299),
                       ("Adidas Ultraboost", 179), ("Ray-Ban Wayfarer", 189)],
    "Books":          [("Dune", 18), ("Atomic Habits", 16), ("The Pragmatic Programmer", 45),
                       ("Clean Code", 42), ("Designing Data-Intensive Applications", 55)],
    "Sports":         [("Yoga Mat", 39), ("Resistance Bands", 25), ("Foam Roller", 29),
                       ("Jump Rope", 15), ("Dumbbell Set 20kg", 89)],
    "Gaming":         [("PS5 Controller", 79), ("Xbox Series X", 499), ("Nintendo Switch", 299),
                       ("Gaming Headset", 129), ("Mechanical Keyboard", 149)],
    "Beauty":         [("Olay Regenerist", 35), ("CeraVe Moisturiser", 18), ("Vitamin C Serum", 29),
                       ("Electric Toothbrush", 89)],
    "Garden":         [("Garden Hose 30m", 45), ("Lawn Mower", 299), ("Plant Pots Set", 35),
                       ("Solar Lights 10pk", 49)],
}

with open(f"{DATA_DIR}/products.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["product_id","name","category","price","cost_price","stock_qty"])
    pid = 1
    for cat, items in CATEGORIES.items():
        for name, price in items:
            cost = round(price * random.uniform(0.4, 0.65), 2)
            stock = random.randint(0, 500)
            w.writerow([pid, name, cat, price, cost, stock])
            pid += 1
        # Pad each category to ~25 products
        while pid % 25 != 1 and pid <= 200:
            w.writerow([pid, f"{cat} Product {pid}", cat,
                        round(random.uniform(10, 1000), 2),
                        round(random.uniform(5, 400), 2),
                        random.randint(0, 300)])
            pid += 1
        if pid > 200:
            break
print("products.csv ✓")

# ── Orders (10,000) ───────────────────────────────────────────────────────────
STATUSES   = ["completed","completed","completed","completed","returned","cancelled","pending"]
ORDER_START = date(2023, 1, 1)
ORDER_END   = date(2024, 12, 31)

with open(f"{DATA_DIR}/orders.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["order_id","customer_id","product_id","quantity",
                "unit_price","discount_pct","status","order_date","return_date"])
    for oid in range(1, 10001):
        order_date = random_date(ORDER_START, ORDER_END)
        status     = random.choice(STATUSES)
        return_date = ""
        if status == "returned":
            rd = date.fromisoformat(order_date) + timedelta(days=random.randint(3, 30))
            return_date = rd.isoformat()
        w.writerow([
            oid,
            random.randint(1, 2000),       # customer_id
            random.randint(1, 200),        # product_id
            random.randint(1, 3),          # quantity
            round(random.uniform(10, 1200), 2),
            random.choice([0, 0, 0, 5, 10, 15, 20]),
            status,
            order_date,
            return_date,
        ])
print("orders.csv ✓")
print("Seed data generation complete.")
```

- [ ] **Step 2: Create `seed/seed.sh`**

```bash
#!/bin/bash
set -e

echo "==> [1/4] Generating seed CSVs..."
python3 seed/generate_data.py

echo "==> [2/4] Loading customers into Postgres..."
# CSV has customer_id column — use COPY with all columns, let Postgres accept the provided IDs
docker compose exec postgres psql -U postgres -d shopstream \
  -c "\COPY customers(customer_id,name,email,city,country,signup_date,age,loyalty_tier) FROM '/seed/customers.csv' CSV HEADER"
# Reset sequence so future inserts don't conflict
docker compose exec postgres psql -U postgres -d shopstream \
  -c "SELECT setval(pg_get_serial_sequence('customers','customer_id'), MAX(customer_id)) FROM customers;"

echo "==> [3/4] Waiting for Airflow to be ready..."
until curl -s http://localhost:8082/health | grep -q "healthy"; do
  echo "   Airflow not ready yet, retrying in 5s..."
  sleep 5
done

echo "==> [4/4] Triggering initial Airflow DAGs..."
# Phase 2 DAGs — these will be added in Phase 2.
# Placeholder: just print success for Phase 1.
echo "   (DAG triggers will be added in Phase 2)"

echo ""
echo "ShopStream seed complete."
echo "  Postgres:  http://localhost:5432"
echo "  Kafka UI:  http://localhost:8080"
echo "  Spark UI:  http://localhost:4040"
echo "  Airflow:   http://localhost:8082  (admin / admin)"
echo "  MLflow:    http://localhost:5000"
echo "  FastAPI:   http://localhost:8001/docs"
echo "  UI:        http://localhost:3000"
```

- [ ] **Step 3: Make seed script executable**

```bash
chmod +x seed/seed.sh
```

- [ ] **Step 4: Commit**

```bash
git add seed/
git commit -m "feat: seed data generator (2K customers, 200 products, 10K orders) + seed.sh"
```

---

## Task 12: End-to-end smoke test

- [ ] **Step 1: Build all images**

```bash
docker compose --profile core build
# Expected: all 4 custom images build successfully (spark, airflow, fastapi, ui, clickstream-gen)
```

- [ ] **Step 2: Start core services**

```bash
docker compose --profile core up -d
# Expected: 9 containers start
```

- [ ] **Step 3: Wait for healthy status**

```bash
docker compose --profile core ps
# Expected: all services show "running" or "healthy"
# Airflow takes ~60s to initialise on first boot
```

- [ ] **Step 4: Smoke test each service**

```bash
# Postgres
docker compose exec postgres pg_isready -U postgres
# Expected: /var/run/postgresql:5432 - accepting connections

# Kafka — list topics
docker compose exec kafka kafka-topics --bootstrap-server localhost:9092 --list
# Expected: (empty or shopstream.clickstream if gen already ran)

# Kafka UI
curl -s http://localhost:8080 | head -5
# Expected: HTML response

# Spark UI
curl -s http://localhost:4040 | grep -i spark
# Expected: Spark UI HTML

# Airflow
curl -s http://localhost:8082/health
# Expected: {"metadatabase":{"status":"healthy"},"scheduler":{"status":"healthy",...}}

# MLflow
curl -s http://localhost:5000/health
# Expected: {"status":"OK"}

# FastAPI
curl -s http://localhost:8001/health
# Expected: {"status":"ok","service":"shopstream-api"}

# UI
curl -s http://localhost:3000 | grep -i datafabric
# Expected: HTML containing DataFabric
```

- [ ] **Step 5: Generate seed data**

```bash
python3 seed/generate_data.py
ls -lh seed/data/
# Expected:
# customers.csv  ~120KB
# products.csv   ~10KB
# orders.csv     ~700KB
```

- [ ] **Step 6: Verify clickstream is flowing**

```bash
# Open Kafka UI at http://localhost:8080
# Navigate to Topics → shopstream.clickstream → Messages
# Expected: messages appearing every ~0.2s
```

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "chore: phase 1 complete — all 9 core services running with seed data"
```

---

## Phase 1 Complete

All 9 core services are running. Proceed to:

**[Phase 2: Data Pipeline](2026-04-07-datafabric-phase2-pipeline.md)** — PyAirbyte ingestion DAG, Spark Bronze job, dbt Silver + Gold models.
