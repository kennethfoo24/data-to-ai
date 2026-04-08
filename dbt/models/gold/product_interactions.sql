{{ config(materialized='table', file_format='iceberg', database='local', schema='gold') }}

SELECT
    o.customer_id,
    o.product_id,
    MAX(CASE WHEN c.event_type = 'product_view' THEN 1 ELSE 0 END) AS viewed,
    MAX(CASE WHEN o.status IN ('completed', 'pending')              THEN 1 ELSE 0 END) AS purchased,
    MAX(CASE WHEN o.status = 'returned'                             THEN 1 ELSE 0 END) AS returned
FROM {{ ref('orders_clean') }} o
LEFT JOIN {{ source('bronze', 'clickstream') }} c
       ON o.customer_id = c.customer_id
      AND o.product_id  = c.product_id
GROUP BY o.customer_id, o.product_id
