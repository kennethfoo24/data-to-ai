FROM apache/spark:3.5.0

USER root

# Iceberg runtime jar for Spark 3.5 + Scala 2.12
ARG ICEBERG_VERSION=1.5.2
RUN wget -q -O /opt/spark/jars/iceberg-spark-runtime.jar \
  "https://repo1.maven.org/maven2/org/apache/iceberg/iceberg-spark-runtime-3.5_2.12/${ICEBERG_VERSION}/iceberg-spark-runtime-3.5_2.12-${ICEBERG_VERSION}.jar"

# Kafka connector jars (bundled to avoid --packages runtime download)
RUN wget -q -O /opt/spark/jars/spark-sql-kafka-0-10_2.12-3.5.0.jar \
  "https://repo1.maven.org/maven2/org/apache/spark/spark-sql-kafka-0-10_2.12/3.5.0/spark-sql-kafka-0-10_2.12-3.5.0.jar" && \
  wget -q -O /opt/spark/jars/spark-token-provider-kafka-0-10_2.12-3.5.0.jar \
  "https://repo1.maven.org/maven2/org/apache/spark/spark-token-provider-kafka-0-10_2.12/3.5.0/spark-token-provider-kafka-0-10_2.12-3.5.0.jar" && \
  wget -q -O /opt/spark/jars/kafka-clients-3.4.1.jar \
  "https://repo1.maven.org/maven2/org/apache/kafka/kafka-clients/3.4.1/kafka-clients-3.4.1.jar" && \
  wget -q -O /opt/spark/jars/commons-pool2-2.11.1.jar \
  "https://repo1.maven.org/maven2/org/apache/commons/commons-pool2/2.11.1/commons-pool2-2.11.1.jar"

# Python deps for PySpark jobs
RUN pip3 install --no-cache-dir \
  pyarrow==15.0.2 \
  pandas==2.0.3 \
  psycopg2-binary==2.9.9

COPY spark-defaults.conf /opt/spark/conf/spark-defaults.conf

USER spark
