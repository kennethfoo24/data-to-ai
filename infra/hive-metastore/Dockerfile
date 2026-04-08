FROM apache/hive:4.0.0
USER root
RUN apt-get update -qq && apt-get install -y --no-install-recommends curl \
  && curl -fsSL -o /opt/hive/lib/postgresql-42.7.3.jar \
    https://jdbc.postgresql.org/download/postgresql-42.7.3.jar \
  && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY metastore-site.xml /opt/hive/conf/metastore-site.xml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER hive
ENTRYPOINT ["/entrypoint.sh"]
