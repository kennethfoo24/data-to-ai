#!/bin/bash
set -e
# Init schema if not exists
/opt/hive/bin/schematool -dbType postgres -initSchemaTo 4.0.0 --verbose || true
# Start metastore
/opt/hive/bin/hive --service metastore
