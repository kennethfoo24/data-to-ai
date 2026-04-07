#!/bin/bash
set -e

echo "==> [1/4] Generating seed CSVs..."
python3 seed/generate_data.py

echo "==> [2/4] Loading customers into Postgres..."
docker compose exec postgres psql -U postgres -d shopstream \
  -c "\COPY customers(customer_id,name,email,city,country,signup_date,age,loyalty_tier) FROM '/seed/customers.csv' CSV HEADER"
docker compose exec postgres psql -U postgres -d shopstream \
  -c "SELECT setval(pg_get_serial_sequence('customers','customer_id'), MAX(customer_id)) FROM customers;"

echo "==> [3/4] Waiting for Airflow to be ready..."
until curl -s http://localhost:8082/health | grep -q "healthy"; do
  echo "   Airflow not ready yet, retrying in 5s..."
  sleep 5
done

echo "==> [4/4] Triggering initial Airflow DAGs..."
# Phase 2 DAGs will be added in Phase 2.
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
