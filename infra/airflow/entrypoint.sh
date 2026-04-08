#!/bin/bash
set -e

# Ensure the shared warehouse volume is writable (Docker volumes start root-owned).
chmod -R 777 /warehouse 2>/dev/null || true

# Initialize the DB and create admin user with known password before starting standalone.
airflow db migrate

airflow users create \
  --username admin \
  --password admin \
  --firstname Admin \
  --lastname User \
  --role Admin \
  --email admin@shopstream.local \
  2>/dev/null || airflow users set-password --username admin --password admin

exec airflow standalone
