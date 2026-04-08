FROM apache/airflow:2.9.3-python3.11

USER root
# Java for PySpark
RUN apt-get update && \
    apt-get install -y --no-install-recommends openjdk-17-jdk-headless wget && \
    rm -rf /var/lib/apt/lists/*
RUN ARCH=$(dpkg --print-architecture) && \
    ln -sfn /usr/lib/jvm/java-17-openjdk-${ARCH} /usr/lib/jvm/java-17-openjdk && \
    echo "JAVA_HOME=/usr/lib/jvm/java-17-openjdk" >> /etc/environment
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk

# Iceberg runtime jar (for dbt spark_session)
ARG ICEBERG_VERSION=1.5.2
RUN wget -q -O /opt/airflow/iceberg-spark-runtime.jar \
  "https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-spark-runtime-3.5_2.12/${ICEBERG_VERSION}/iceberg-spark-runtime-3.5_2.12-${ICEBERG_VERSION}.jar"

USER airflow
# Install orchestration-layer deps. Pin sqlalchemy<2.0 because Airflow 2.9
# requires it but dbt-spark pulls in 2.x.
RUN pip install --no-cache-dir \
  "sqlalchemy<2.0" \
  airbyte \
  "dbt-spark[PyHive]" \
  "pyspark==3.5.1" \
  psycopg2-binary \
  confluent-kafka \
  "torch==2.2.2" \
  "mlflow==2.12.2"

USER root
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
