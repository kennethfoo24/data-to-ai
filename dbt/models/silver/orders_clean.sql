{{ config(materialized='table', file_format='iceberg', database='local', schema='silver') }}

SELECT
    CAST(order_id    AS BIGINT)  AS order_id,
    CAST(customer_id AS BIGINT)  AS customer_id,
    CAST(product_id  AS BIGINT)  AS product_id,
    CAST(quantity    AS INT)     AS quantity,
    CAST(unit_price  AS DOUBLE)  AS unit_price,
    CAST(discount_pct AS INT)    AS discount_pct,
    status,
    CAST(order_date  AS DATE)    AS order_date,
    CASE WHEN return_date IS NULL OR CAST(return_date AS STRING) = ''
         THEN NULL
         ELSE CAST(return_date AS DATE)
    END AS return_date,
    CAST(unit_price * quantity * (1 - discount_pct / 100.0) AS DOUBLE) AS net_revenue
FROM {{ source('bronze', 'orders') }}
WHERE order_id    IS NOT NULL
  AND customer_id IS NOT NULL
  AND customer_id BETWEEN 1 AND 2000
  AND product_id  BETWEEN 1 AND 200
