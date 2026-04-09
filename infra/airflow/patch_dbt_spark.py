"""
Patch dbt-spark session.py to wrap PySpark AnalysisException as DbtRuntimeError.
This enables the Iceberg v2 "SHOW TABLE EXTENDED not supported" fallback in impl.py.
"""
import pathlib

p = pathlib.Path('/home/airflow/.local/lib/python3.11/site-packages/dbt/adapters/spark/session.py')
src = p.read_text()

old = (
    '        spark_session = SparkSession.builder.enableHiveSupport().getOrCreate()\n'
    '        self._df = spark_session.sql(sql)'
)
new = (
    '        spark_session = SparkSession.builder.enableHiveSupport().getOrCreate()\n'
    '        try:\n'
    '            self._df = spark_session.sql(sql)\n'
    '        except Exception as e:\n'
    '            from dbt.exceptions import DbtRuntimeError\n'
    '            raise DbtRuntimeError(str(e)) from e'
)

if old not in src:
    print('Pattern not found — already patched or version mismatch, skipping')
else:
    p.write_text(src.replace(old, new))
    print('dbt-spark session.py patched successfully')
