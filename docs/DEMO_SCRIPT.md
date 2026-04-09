# DataFabric — Live Demo Script

**Format:** Screen-share walkthrough. Each beat has what to open, what to say, what's happening under the hood, and likely follow-up questions.

**Pre-demo checklist:**
- [ ] `make up` — all 10 services running
- [ ] `make seed` — data loaded, DAGs triggered, models trained
- [ ] Browser tabs pre-opened: UI (:3000), pgAdmin (:5050), Kafka UI (:8080), Airflow (:8082), MLflow (:5001), FastAPI (:8001/docs)
- [ ] Confirm the MetricsBar in the UI shows green pulse and live customer/product counts

**Total runtime:** ~15–20 minutes at a comfortable pace.

---

## Beat 1 — Orient: The Big Picture

**Show:** `http://localhost:3000` — the lineage graph, full screen

![DataFabric Lineage UI](screenshots/ui-lineage.png)

> **① Layer nav** across the top — Ingest, Bronze, Silver, Gold, ML, Serve. Each label marks a distinct stage in the pipeline. **② Pipeline nodes** — click any node to open its service UI or catalog modal. **③ Animated particles** on edges — each moving dot represents data flowing between stages. **④ MetricsBar** at bottom — polls live every 10 seconds; green pulse = API reachable.

**Say:**
> "This is DataFabric — a full end-to-end data and AI platform for a fictional e-commerce company called ShopStream. What you're looking at is a live lineage graph of the entire pipeline. Every node is a real running service, every edge is a real data flow.
>
> The story goes left to right: raw data comes in from two sources on the left, flows through ingestion, gets cleaned and feature-engineered in the lakehouse in the middle, trains two machine learning models, and gets served through an API that any application can call on the right.
>
> The question we're answering is: how do you take raw customer behavior data and turn it into real-time predictions? Let me walk you through each layer."

**Under the hood:** The graph is built in ReactFlow with custom `PipelineNode` components. The animated particles on the edges (the moving dots) are SVG `animateMotion` elements — a visual representation of data flowing between stages. The bottom bar polls `/api/status` every 10 seconds.

**Likely question:** *Is this graph auto-generated from the pipeline, or hand-drawn?*
> "It's hand-defined — the node positions and edges are declared in code in `LineageGraph.tsx`. In a production system you'd generate this from a metadata catalog like OpenLineage or Amundsen. For this demo, it accurately represents the actual data flows — every edge maps to real code."

---

## Beat 2 — Sources: Where Data Comes From

**Show:** Split attention between pgAdmin (:5050) and Kafka UI (:8080)

![pgAdmin — ShopStream server](screenshots/pgadmin-connected.png)

> pgAdmin pre-connected to ShopStream. **① ShopStream server** in tree — no manual setup needed. **② Live dashboard** shows server activity (transactions/sec, block I/O). Navigate to Databases → shopstream → Schemas → public → Tables to show `customers` (2K rows) and `inventory` (200 rows).

![Kafka UI — live clickstream events](screenshots/kafka-clickstream.png)

> **① `shopstream.clickstream` topic** — the single event bus. **② 500 messages** already consumed, new ones arriving continuously. **③ Value column** shows the JSON payload — `event_id`, `customer_id`, `event_type`, `product_id`. **④ Timestamps** — events arriving at ~5/sec in real time.

**Say:**
> "We have two source systems, and they represent two completely different patterns.
>
> First is PostgreSQL — the operational database. This is where the application writes customer signups and inventory. It's a traditional relational database, not designed for analytics.
>
> Second is Kafka — a real-time event stream. Every time a customer clicks a product, views a page, or adds something to cart, an event lands in Kafka in milliseconds. Right now it's generating about 5 events per second.
>
> The reason we have two separate ingestion paths is because these two sources are fundamentally different. Postgres is batch — you read it periodically. Kafka is unbounded — it never stops, you have to process it continuously."

**Show in pgAdmin:** Navigate to the `shopstream` database → Tables → show `customers` (2,000 rows) and `inventory` (200 rows).

**Show in Kafka UI:** Click the `shopstream.clickstream` topic → Messages tab. Watch events arrive in real time. Point out the JSON structure (`event_id`, `customer_id`, `event_type`, `product_id`).

**Under the hood:** Kafka runs in KRaft mode — no Zookeeper dependency. The clickstream producer runs inside the Kafka container and publishes events to the `shopstream.clickstream` topic. `CLICKSTREAM_EVENTS_PER_SEC=5` controls the rate via `.env`.

**Likely question:** *Why Kafka instead of just polling the database for new events?*
> "Polling the database for new rows doesn't scale — you'd be running constant queries, and you'd need to track your own cursor. Kafka is purpose-built for this: it buffers events durably, multiple consumers can read the same topic independently, and it handles backpressure automatically. It also decouples the producer (the web app) from the consumer (Spark) — either can go down temporarily without data loss."

---

## Beat 3 — Ingestion: Moving Data In

**Show:** Airflow at `http://localhost:8082` (admin / admin)

![Airflow DAG list](screenshots/airflow-dags-2.png)

> **① `ingest_batch`** (blue toggle = enabled) — reads Postgres via psycopg2, writes to Bronze Iceberg. **② `transform`** — chains `dbt silver` → `dbt gold` in sequence. **③ `train_churn` / `train_recommend`** — ML training on a 30-minute schedule. **④ Tags** let you filter by layer (`bronze`, `dbt`, `ml`). **⑤ Last Run** and green circles in Recent Tasks confirm healthy past executions.

**Say:**
> "Airflow is the orchestrator — it's what schedules and runs the pipeline. You can see the DAGs here. The `ingest_batch` DAG reads from Postgres using Python, hands the data to Spark, and writes it to our lakehouse. The `transform` DAG runs dbt to clean and reshape the data. The `train_churn` and `train_recommend` DAGs train the ML models.
>
> For Kafka, we don't use Airflow — we use a long-running Spark Structured Streaming job that runs continuously in the background, processing 30-second micro-batches as events arrive."

**Show in Airflow:** Click into the `ingest_batch` DAG → Graph view → show the task. Then show the `transform` DAG with the two dbt steps (silver → gold).

**Under the hood:** The batch job uses `psycopg2` to read from Postgres into pandas, then PySpark converts it to a DataFrame and writes it to Iceberg using the Hadoop filesystem catalog at `/warehouse`. The streaming job uses Spark's `foreachBatch` pattern because Iceberg requires explicit `.append()` calls rather than native streaming sinks.

![Spark Structured Streaming — active query](screenshots/spark-streaming.png)

> Spark UI at `:4040/StreamingQuery/`. **① Status: RUNNING** — alive since container start, never stopped. **② Avg Input 4.93 rows/sec** — matches the configured producer rate. **③ Latest Batch 115** — each number is one 30-second micro-batch committed to Iceberg. **④ Duration 57+ minutes** — the streaming job is fault-tolerant and long-running by design.

**Likely question:** *Why not use a dedicated ETL tool like Fivetran or Airbyte?*
> "Great question — the original design actually used PyAirbyte. We ran into a fundamental problem: PyAirbyte needs to spin up Docker containers itself, and it can't do that from inside an existing Docker container. So we replaced it with direct psycopg2 — simpler, zero external dependencies, and gives us full control. For production scale you'd use a managed connector service, but for a single-machine demo this is more transparent."

---

## Beat 4 — Bronze Layer: Raw Lakehouse

**Show:** Click the "Iceberg Bronze" node in the UI lineage graph → catalog modal opens

**Say:**
> "All ingested data lands in Apache Iceberg — our lakehouse storage format. This is the Bronze layer: raw, unmodified copies of the source data. Four tables: customers, orders, products, and clickstream.
>
> I can click on this node and see the actual schema and sample rows directly from the warehouse."

**Show in the modal:** Point out the schema (column names and types), the sample rows, and the row count. Navigate between the tables if the modal supports it.

**Say:**
> "The key thing here is Iceberg. We're not just dropping Parquet files in a folder — Iceberg gives us ACID transactions, schema evolution, and time travel. You can query this table as it looked last Tuesday with `AS OF TIMESTAMP`. That's not something you get from plain files."

**Under the hood:** The catalog modal calls `/api/catalog/bronze/customers` on the FastAPI backend, which reads the Parquet files directly via `pyarrow` — no Spark needed for browsing. It reads schema from the first file's metadata and returns 5 rows from the first batch. Row counts come from Parquet file metadata, so it's fast even for large tables.

**Likely question:** *Why not just use a data warehouse like Snowflake or BigQuery?*
> "Those are great managed options. The tradeoff is cost and lock-in. Iceberg is an open format — any engine that speaks Iceberg (Spark, Trino, DuckDB, Flink) can read these tables without a schema registry or cloud account. For a portfolio project it also shows you understand the underlying storage layer, not just the UI of a managed service."

---

## Beat 5 — Silver & Gold: dbt Transformations

**Show:** Click the "dbt · Silver" node in the UI → catalog modal. Then click "Iceberg Silver" to see the clean table.

**Say:**
> "Bronze is raw. Silver is clean. This is where dbt comes in — data build tool. You write SQL `SELECT` statements and dbt handles materializing them as Iceberg tables, tracking dependencies, and running them in the right order.
>
> In Silver, we cast everything to proper types, filter out invalid rows, and calculate derived columns. For example, `orders_clean` adds a `net_revenue` column — unit price times quantity times one minus the discount percentage. That calculation lives once, in dbt, tested and version-controlled."

**Show:** Click "dbt · Gold" → then "Iceberg Gold" → show `customer_features` schema.

**Say:**
> "Gold is where data engineering ends and machine learning begins. The `customer_features` table has one row per customer with exactly the five features the churn model needs: order count, total spend, days since last order, return rate, and average session length.
>
> This is intentional design — the ML team consumes Gold, they don't touch raw data. The Gold layer is the contract between data engineering and data science."

**Under the hood:** dbt runs via `dbt run --select silver` then `dbt run --select gold` inside the Airflow container. The `transform` DAG chains these two steps. The `generate_schema_name.sql` macro prevents dbt from prefixing schemas with the environment name (e.g. `default_silver`), so tables land exactly in `local.silver.*` and `local.gold.*`.

**Likely question:** *How does dbt know the order to run models?*
> "dbt builds a dependency graph from `{{ ref('orders_clean') }}` and `{{ source('bronze', 'orders') }}` references in the SQL. If `customer_features` references `orders_clean`, dbt knows to run `orders_clean` first. No manual orchestration needed within dbt — it figures out the DAG itself."

---

## Beat 6 — Machine Learning: What We're Predicting

**Show:** MLflow at `http://localhost:5001`

**Say:**
> "Here's where it gets interesting. We're training two machine learning models from the Gold data, and the business question behind each is very concrete.
>
> The first is a churn classifier. For every customer, we want to know: are they about to stop buying from us? If we can identify at-risk customers early, we can intervene — send a discount, trigger a re-engagement email. The model outputs a probability between 0 and 1. Score above 0.5 and that customer is flagged as at risk.
>
> The second is a product recommender. Given a customer ID, what are the top 5 products they're most likely to engage with — products they haven't bought yet, but whose purchase pattern matches theirs? This powers personalised product listings."

**Show in MLflow:** Click the `churn-classifier` experiment → show the 3 runs side by side.

**Say:**
> "We ran three training experiments with different hyperparameters — different learning rates, layer sizes, number of epochs. Every run is fully logged: the parameters, the metrics, the model itself. This is what MLflow is for — reproducibility. You can come back six months later and know exactly what produced any given model.
>
> The key metric here is `val_auc` — Area Under the ROC Curve. Random guessing is 0.5, perfect is 1.0. Anything above 0.75 means the model is meaningfully separating churners from loyal customers."

**Show:** Click the best run → Artifacts tab → show the `model/` directory.

**Say:**
> "Every artifact needed to serve this model is stored here: the PyTorch weights, the MLflow metadata, everything. For the recommender there's also an `index_maps.json` file — a mapping between real customer IDs and the integer indices the model uses internally. The serving layer downloads this at startup to decode predictions back to actual product IDs."

**Show:** Click "Registered Models" → `churn-classifier` → show the Production alias.

**Say:**
> "This is the Production alias — the serving layer never hardcodes a version number. It always asks MLflow 'give me Production.' When a better model is trained, you set the alias to the new version with one command. The API immediately serves the new model on the next request. Zero code change, zero redeployment."

**Under the hood:** The churn model is a 3-layer MLP (5 → 32 → 16 → 1) with a sigmoid output. Features are standardized with `StandardScaler` before training. The recommender is Matrix Factorization — each customer and product gets a learned embedding vector, and the predicted score for a pair is the dot product of their embeddings. Larger `embedding_dim` = more expressive model, but slower to train (run 3 with dim=64 is the most capable).

**Likely question:** *Why not use a pre-built library like Surprise or LightFM for the recommender?*
> "We could — and in production, you probably would. The reason for rolling a PyTorch model here is to show the full ML lifecycle explicitly: how embeddings work, how the training loop logs to MLflow, how artifacts are saved and loaded. A black-box library hides all of that. This makes every step visible and teachable."

**Likely question:** *The churn label seems like a guess — how accurate is that really?*
> "Completely fair. The label is a heuristic: anyone with more than 90 days since their last order AND fewer than 3 total orders is called 'churned.' That's a reasonable proxy but not ground truth. In a real system you'd have actual churn events — subscription cancellations, account deletions, explicit signals. The architecture is identical; only the label changes. This is an intentional demo simplification."

---

## Beat 7 — Serving: Live Predictions via API

**Show:** FastAPI Swagger at `http://localhost:8001/docs`

![FastAPI Swagger UI](screenshots/fastapi-docs.png)

> **① `POST /predict/churn`** — the main prediction endpoint; accepts 5 features, returns `churn_probability`. **② `POST /predict/recommend`** — takes a `customer_id`, returns top-5 product IDs. **③ `GET /api/catalog/{layer}/{table}`** — Iceberg table browser powering the UI catalog modal. **④ `GET /api/status`** — the live health endpoint the MetricsBar polls every 10 seconds.

**Say:**
> "The trained models are served through FastAPI — a modern Python API framework. Any application, any language can call these endpoints. Let's make a live prediction."

**Show:** Click `POST /predict/churn` → Try it out → fill in the request body:

```json
{
  "customer_id": 42,
  "order_count": 1,
  "total_spend": 45.00,
  "days_since_last_order": 120,
  "return_rate": 0.0,
  "avg_session_seconds": 30
}
```

**Say:**
> "This customer has only ordered once, spent $45, hasn't ordered in 4 months, and their sessions are short. Let's see what the model thinks."

Execute → show the response with `churn_probability`.

**Say:**
> "High probability — the model flags this customer as at-risk. That number can drive an automated workflow: trigger a re-engagement email, offer a discount, alert the CRM."

**Show:** Click `POST /predict/recommend` → Try it out:

```json
{
  "customer_id": 42
}
```

Execute → show the 5 product IDs.

**Say:**
> "And here are the top 5 products the recommender thinks customer 42 would engage with — based on the purchase patterns of similar customers. This is collaborative filtering: we're not looking at the product catalog, we're looking at who bought what and finding patterns."

**Under the hood:** Models are loaded once on first request via `@functools.lru_cache` and held in memory — subsequent requests are fast. The churn endpoint builds a tensor from the 5 input features and passes it through the PyTorch model in `torch.no_grad()` mode. The recommender endpoint maps the customer ID to an embedding index via `index_maps.json`, calls `model.top_n()` which scores all products, and maps the top 5 indices back to real product IDs.

**Likely question:** *What happens if someone sends a customer ID that wasn't in the training data?*
> "The recommender returns a 404 with a clear error: 'customer_id not found in training data.' The churn endpoint is more forgiving — it takes raw features, so any customer can get a score. This is an intentional design difference: churn works on features you provide, the recommender needs to have seen the customer's history during training."

---

## Beat 8 — Everything Is Wired: The MetricsBar

**Show:** Return to `http://localhost:3000` — point to the MetricsBar at the bottom

**Say:**
> "Let's come back to the UI to close the loop. This bottom bar — the MetricsBar — is polling the FastAPI `/api/status` endpoint every 10 seconds. It's showing live data right now: 2,000 customers, 200 products, the churn model's AUC from its best training run, the recommender's RMSE.
>
> The green pulse means the API is reachable and responding. If FastAPI went down, this would go grey.
>
> This is what 'end-to-end' actually means: the same data that was seeded into Postgres, ingested into Iceberg, cleaned by dbt, used to train a model tracked in MLflow, served through FastAPI — is now being displayed in real time in this UI. Every layer is connected."

**Under the hood:** `MetricsBar` calls `/api/status` which makes a live query to MLflow Model Registry for the `val_auc` and `train_rmse` of the Production model versions, and a `SELECT COUNT(*)` against Postgres for customer and product counts. The 10-second poll interval is set in `MetricsBar.tsx`.

---

## Beat 9 — Wrap-Up: What This Demonstrates

**Show:** Return to the lineage graph at `:3000` as a backdrop

**Say:**
> "So what does this stack actually demonstrate?
>
> First, the breadth of the modern data stack — ingestion from multiple source types, a medallion lakehouse architecture, SQL-based transformations with dbt, end-to-end ML lifecycle, and a live serving layer. Every layer is a technology you'd find in a real data platform team.
>
> Second, the discipline of how data moves. Raw data never gets used directly for ML. It goes through Bronze — untouched. Silver — cleaned and typed. Gold — feature-engineered. That separation of concerns is what makes the pipeline maintainable and trustworthy.
>
> Third, reproducibility. Every model run is logged. Every transformation is in version control. Every table schema is documented. Nothing is on someone's laptop.
>
> What would I add next? Real-time data quality checks between layers. A proper streaming engine like Flink for sub-second latency. An API gateway with authentication in front of FastAPI. And drift detection on the models — alerting when customer behavior shifts enough that the churn model needs retraining."

---

## Quick Reference — Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Lineage UI | http://localhost:3000 | — |
| Airflow | http://localhost:8082 | admin / admin |
| MLflow | http://localhost:5001 | — |
| FastAPI docs | http://localhost:8001/docs | — |
| Kafka UI | http://localhost:8080 | — |
| Spark UI | http://localhost:4040 | — |
| pgAdmin | http://localhost:5050 | admin@example.com / Admin1234 |

## Sample API Payloads

**Churn — at-risk customer:**
```json
POST /predict/churn
{
  "customer_id": 42,
  "order_count": 1,
  "total_spend": 45.00,
  "days_since_last_order": 120,
  "return_rate": 0.0,
  "avg_session_seconds": 30
}
```

**Churn — loyal customer:**
```json
POST /predict/churn
{
  "customer_id": 1,
  "order_count": 15,
  "total_spend": 1240.50,
  "days_since_last_order": 8,
  "return_rate": 0.06,
  "avg_session_seconds": 340
}
```

**Recommend:**
```json
POST /predict/recommend
{ "customer_id": 42 }
```
