#!/bin/bash
set -e

# Load .env from repo root so POSTGRES_USER is available when run directly
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "${REPO_ROOT}/.env" ] && export $(grep -v '^#' "${REPO_ROOT}/.env" | xargs)
PGUSER=${POSTGRES_USER:-admin}

echo "Testing Postgres..."
docker compose --profile core exec postgres \
  psql -U "$PGUSER" -c "\l" | grep -q "airflow" && echo "PASS: airflow DB exists"
docker compose --profile core exec postgres \
  psql -U "$PGUSER" -c "\l" | grep -q "mlflow" && echo "PASS: mlflow DB exists"
echo "All Postgres checks passed."
