FROM apache/airflow:2.9.3-python3.11

USER root
# Java for PySpark
RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-17-jdk-headless && \
    rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

USER airflow
# Install only orchestration-layer deps — no strict version pins to avoid
# conflicts with Airflow's own constraints. ML packages (torch, mlflow, etc.)
# live in the serving container and are added in Phase 3.
RUN pip install --no-cache-dir \
  airbyte \
  dbt-spark[PyHive] \
  psycopg2-binary \
  confluent-kafka
