-- Additional databases (shopstream is created via POSTGRES_DB env var)
CREATE DATABASE airflow;
CREATE DATABASE mlflow;

-- Airflow user
CREATE USER airflow WITH PASSWORD 'airflow';
GRANT ALL PRIVILEGES ON DATABASE airflow TO airflow;
ALTER DATABASE airflow OWNER TO airflow;

-- MLflow user
CREATE USER mlflow WITH PASSWORD 'mlflow';
GRANT ALL PRIVILEGES ON DATABASE mlflow TO mlflow;
ALTER DATABASE mlflow OWNER TO mlflow;

-- ShopStream schema (seed script populates data later)
\c shopstream
CREATE TABLE IF NOT EXISTS customers (
    customer_id   SERIAL PRIMARY KEY,
    name          VARCHAR(100),
    email         VARCHAR(150) UNIQUE,
    city          VARCHAR(80),
    country       VARCHAR(60),
    signup_date   DATE,
    age           INTEGER,
    loyalty_tier  VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS inventory (
    product_id    INTEGER PRIMARY KEY,
    stock_qty     INTEGER DEFAULT 0,
    updated_at    TIMESTAMP DEFAULT NOW()
);
