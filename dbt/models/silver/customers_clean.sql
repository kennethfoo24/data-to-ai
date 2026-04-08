{{ config(materialized='table', file_format='iceberg', database='local', schema='silver') }}

WITH deduped AS (
    SELECT *,
        ROW_NUMBER() OVER (PARTITION BY email ORDER BY customer_id) AS rn
    FROM {{ source('bronze', 'customers') }}
    WHERE customer_id IS NOT NULL
      AND email IS NOT NULL
)
SELECT
    CAST(customer_id AS BIGINT) AS customer_id,
    TRIM(name)                  AS name,
    LOWER(TRIM(email))          AS email,
    city,
    country,
    CAST(signup_date AS DATE)   AS signup_date,
    CAST(age AS INT)            AS age,
    loyalty_tier
FROM deduped
WHERE rn = 1
