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
  pyspark==3.5.1 \
  pyarrow==15.0.2 \
  pandas==2.1.4 \
  torch==2.2.2 \
  mlflow==2.12.2 \
  scikit-learn==1.4.2 \
  psycopg2-binary==2.9.9 \
  confluent-kafka==2.4.0
