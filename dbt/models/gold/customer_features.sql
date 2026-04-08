{{ config(materialized='table', file_format='iceberg', database='local', schema='gold') }}

WITH order_stats AS (
    SELECT
        customer_id,
        COUNT(*)                                                 AS order_count,
        SUM(net_revenue)                                         AS total_spend,
        MAX(order_date)                                          AS last_order_date,
        SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END)    AS return_count
    FROM {{ ref('orders_clean') }}
    GROUP BY customer_id
),
session_stats AS (
    SELECT
        customer_id,
        AVG(duration_seconds) AS avg_session_seconds
    FROM {{ ref('clickstream_sessions') }}
    GROUP BY customer_id
)
SELECT
    c.customer_id,
    COALESCE(o.order_count,  0)   AS order_count,
    COALESCE(o.total_spend,  0.0) AS total_spend,
    DATEDIFF(CURRENT_DATE(), o.last_order_date) AS days_since_last_order,
    CASE WHEN o.order_count > 0
         THEN o.return_count / CAST(o.order_count AS DOUBLE)
         ELSE 0.0 END             AS return_rate,
    COALESCE(s.avg_session_seconds, 0.0) AS avg_session_seconds
FROM {{ ref('customers_clean') }} c
LEFT JOIN order_stats   o ON c.customer_id = o.customer_id
LEFT JOIN session_stats s ON c.customer_id = s.customer_id
