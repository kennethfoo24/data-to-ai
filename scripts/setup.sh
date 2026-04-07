#!/bin/bash
# DataFabric one-shot setup
# Usage: bash scripts/setup.sh [core|full]
set -e

PROFILE=${1:-core}

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   DataFabric — ShopStream Setup          ║"
echo "╚══════════════════════════════════════════╝"
echo "Profile: $PROFILE"
echo ""

# 1. Copy .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✓ Created .env from .env.example"
  echo "  Edit .env to change passwords before deploying to a server."
else
  echo "✓ .env already exists."
fi

# 2. Generate seed CSVs
echo ""
echo "→ Generating seed data..."
python3 seed/generate_data.py

# 3. Build Docker images
echo ""
echo "→ Building Docker images (first run takes ~5 min)..."
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

# 5. Wait for Postgres
echo ""
echo "→ Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U postgres -q 2>/dev/null; do
  printf '.'
  sleep 2
done
echo " ready."

# 6. Wait for Airflow
echo "→ Waiting for Airflow (up to 90s on first boot)..."
until curl -sf http://localhost:8082/health 2>/dev/null | grep -q "healthy"; do
  printf '.'
  sleep 5
done
echo " ready."

# 7. Load seed data
echo ""
echo "→ Loading seed data..."
bash seed/seed.sh

# 8. Done
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
echo "Commands:  make up | make down | make logs | make clean"
