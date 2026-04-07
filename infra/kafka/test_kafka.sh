#!/bin/bash
set -e
echo "Waiting for Kafka..."
sleep 5
docker compose --profile core exec kafka \
  kafka-topics --bootstrap-server localhost:9092 --list
echo "PASS: Kafka is reachable"

docker compose --profile core exec kafka \
  kafka-topics --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic shopstream.clickstream \
  --partitions 3 --replication-factor 1
echo "PASS: topic shopstream.clickstream created"
