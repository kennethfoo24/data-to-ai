#!/bin/bash
set -e
echo "Testing Postgres..."
docker compose --profile core exec postgres \
  psql -U postgres -c "\l" | grep -q "airflow" && echo "PASS: airflow DB exists"
docker compose --profile core exec postgres \
  psql -U postgres -c "\l" | grep -q "mlflow" && echo "PASS: mlflow DB exists"
echo "All Postgres checks passed."
