FROM apache/airflow:2.9.3-python3.11

USER root
# Java for PySpark
RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-17-jdk-headless && \
    rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

USER airflow
# Install only orchestration-layer deps. Pin sqlalchemy<2.0 because Airflow 2.9
# requires it but dbt-spark pulls in 2.x. ML packages added in Phase 3.
RUN pip install --no-cache-dir \
  "sqlalchemy<2.0" \
  airbyte \
  "dbt-spark[PyHive]" \
  psycopg2-binary \
  confluent-kafka
