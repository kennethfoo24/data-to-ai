FROM bitnami/spark:3.5.1

USER root

# Iceberg runtime jar for Spark 3.5 + Scala 2.12
ARG ICEBERG_VERSION=1.5.2
RUN wget -q -O /opt/bitnami/spark/jars/iceberg-spark-runtime.jar \
  "https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-spark-runtime-3.5_2.12/${ICEBERG_VERSION}/iceberg-spark-runtime-3.5_2.12-${ICEBERG_VERSION}.jar"

# Python deps for PySpark jobs
RUN pip install --no-cache-dir \
  pyarrow==15.0.2 \
  pandas==2.1.4 \
  psycopg2-binary==2.9.9

COPY spark-defaults.conf /opt/bitnami/spark/conf/spark-defaults.conf

USER 1001
