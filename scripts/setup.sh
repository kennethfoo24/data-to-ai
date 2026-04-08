#!/usr/bin/env bash
# DataFabric one-shot setup
# Usage: bash scripts/setup.sh [core|full]
set -euo pipefail
cd "$(dirname "$0")/.."

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

# Generate AIRFLOW_FERNET_KEY if it's still the placeholder
if grep -q "^AIRFLOW_FERNET_KEY=GENERATE_ME" .env; then
  FERNET_KEY=$(python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())")
  sed -i.bak "s|^AIRFLOW_FERNET_KEY=.*|AIRFLOW_FERNET_KEY=${FERNET_KEY}|" .env && rm -f .env.bak
  echo "✓ Generated AIRFLOW_FERNET_KEY."
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
WAIT=0
until curl -sf http://localhost:8082/health 2>/dev/null | grep -q "healthy"; do
  if [ $WAIT -ge 90 ]; then
    echo ""
    echo "ERROR: Airflow did not become healthy within 90s."
    echo "Run 'make logs' to check what went wrong."
    exit 1
  fi
  printf '.'
  sleep 5
  WAIT=$((WAIT + 5))
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
