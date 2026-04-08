#!/bin/bash
set -e

echo "==> [1/4] Generating seed CSVs..."
python3 seed/generate_data.py

echo "==> [2/4] Loading customers + inventory into Postgres..."
docker compose exec postgres psql -U postgres -d shopstream \
  -c "TRUNCATE customers RESTART IDENTITY CASCADE;"
docker compose exec postgres psql -U postgres -d shopstream \
  -c "\COPY customers(customer_id,name,email,city,country,signup_date,age,loyalty_tier) FROM '/seed/customers.csv' CSV HEADER"
docker compose exec postgres psql -U postgres -d shopstream \
  -c "SELECT setval(pg_get_serial_sequence('customers','customer_id'), MAX(customer_id)) FROM customers;"
docker compose exec postgres psql -U postgres -d shopstream \
  -c "TRUNCATE inventory;"
docker compose exec postgres psql -U postgres -d shopstream -c "
  CREATE TEMP TABLE products_import(product_id int, name text, category text, price numeric, cost_price numeric, stock_qty int);
  COPY products_import FROM '/seed/products.csv' CSV HEADER;
  INSERT INTO inventory(product_id, stock_qty) SELECT product_id, stock_qty FROM products_import;
"

echo "==> [3/4] Waiting for Airflow to be ready..."
until curl -s http://localhost:8082/health | grep -q "healthy"; do
  echo "   Airflow not ready yet, retrying in 5s..."
  sleep 5
done

echo "==> [4/4] Triggering Airflow DAGs..."
until curl -s http://localhost:8082/health | grep -q '"status": "healthy"'; do
  echo "   Airflow not ready, retrying in 5s..."
  sleep 5
done

curl -s -X POST http://localhost:8082/api/v1/dags/ingest_batch/dagRuns \
  -H "Content-Type: application/json" \
  -u "admin:admin" \
  -d '{"conf": {}}' | grep -q "running\|queued" && echo "   ingest_batch triggered ✓" || echo "   ingest_batch trigger failed"

echo "   Waiting 60s for Bronze ingestion to complete..."
sleep 60

curl -s -X POST http://localhost:8082/api/v1/dags/transform/dagRuns \
  -H "Content-Type: application/json" \
  -u "admin:admin" \
  -d '{"conf": {}}' | grep -q "running\|queued" && echo "   transform triggered ✓" || echo "   transform trigger failed"

echo ""
echo "ShopStream seed complete."
echo "  Postgres:  http://localhost:5432"
echo "  Kafka UI:  http://localhost:8080"
echo "  Spark UI:  http://localhost:4040"
echo "  Airflow:   http://localhost:8082  (admin / admin)"
echo "  MLflow:    http://localhost:5000"
echo "  FastAPI:   http://localhost:8001/docs"
echo "  UI:        http://localhost:3000"
