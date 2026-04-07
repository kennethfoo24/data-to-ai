FROM apache/hive:4.0.0
USER root
RUN wget -q -O /opt/hive/lib/postgresql-42.7.3.jar \
  https://jdbc.postgresql.org/download/postgresql-42.7.3.jar
COPY metastore-site.xml /opt/hive/conf/metastore-site.xml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER hive
ENTRYPOINT ["/entrypoint.sh"]
