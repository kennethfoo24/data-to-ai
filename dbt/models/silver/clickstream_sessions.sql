{{ config(materialized='table', file_format='iceberg', database='local', schema='silver') }}

WITH base AS (
    SELECT *
    FROM {{ source('bronze', 'clickstream') }}
    WHERE event_timestamp IS NOT NULL
      AND customer_id IS NOT NULL
),
with_gap AS (
    SELECT *,
        LAG(event_timestamp) OVER (
            PARTITION BY customer_id ORDER BY event_timestamp
        ) AS prev_ts
    FROM base
),
with_boundary AS (
    SELECT *,
        CASE
            WHEN prev_ts IS NULL
              OR (UNIX_TIMESTAMP(event_timestamp) - UNIX_TIMESTAMP(prev_ts)) > 1800
            THEN 1 ELSE 0
        END AS new_session
    FROM with_gap
),
labeled AS (
    SELECT *,
        SUM(new_session) OVER (
            PARTITION BY customer_id ORDER BY event_timestamp
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS session_num
    FROM with_boundary
)
SELECT
    customer_id,
    CONCAT(CAST(customer_id AS STRING), '_', CAST(session_num AS STRING)) AS session_id,
    MIN(event_timestamp)  AS session_start,
    MAX(event_timestamp)  AS session_end,
    COUNT(*)              AS event_count,
    UNIX_TIMESTAMP(MAX(event_timestamp)) - UNIX_TIMESTAMP(MIN(event_timestamp)) AS duration_seconds,
    SUM(CASE WHEN event_type = 'purchase'    THEN 1 ELSE 0 END) AS purchases,
    SUM(CASE WHEN event_type = 'add_to_cart' THEN 1 ELSE 0 END) AS add_to_carts
FROM labeled
GROUP BY customer_id, session_num
