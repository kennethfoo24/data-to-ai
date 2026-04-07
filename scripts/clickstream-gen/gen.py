"""
Synthetic clickstream event generator.
Streams JSON events to Kafka topic at configurable rate.
"""
import json
import os
import random
import time
import uuid
from datetime import datetime, timezone

from confluent_kafka import Producer
from faker import Faker

fake = Faker()

BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
TOPIC     = os.getenv("KAFKA_TOPIC", "shopstream.clickstream")
RATE      = float(os.getenv("EVENTS_PER_SECOND", "5"))

EVENT_TYPES = [
    "page_view", "page_view", "page_view",   # weighted: more views than purchases
    "product_view", "product_view",
    "add_to_cart",
    "checkout",
    "purchase",
]

PAGES = ["/home", "/sale", "/new-arrivals", "/account", "/products/{product_id}"]

def make_event(customer_ids: list[int], product_ids: list[int]) -> dict:
    product_id = random.choice(product_ids)
    return {
        "event_id":    str(uuid.uuid4()),
        "customer_id": random.choice(customer_ids),
        "session_id":  str(uuid.uuid4())[:8],
        "event_type":  random.choice(EVENT_TYPES),
        "product_id":  product_id,
        "page":        random.choice(PAGES).format(product_id=product_id),
        "timestamp":   datetime.now(timezone.utc).isoformat(),
    }

def delivery_report(err, msg):
    if err:
        print(f"Delivery failed: {err}")

def main():
    print(f"Connecting to Kafka at {BOOTSTRAP}...")
    producer = Producer({"bootstrap.servers": BOOTSTRAP})

    # Seed customer and product ID ranges matching the seed data
    customer_ids = list(range(1, 2001))    # 2K customers
    product_ids  = list(range(1, 201))     # 200 products

    interval = 1.0 / RATE
    print(f"Streaming {RATE} events/sec to {TOPIC}...")

    while True:
        event = make_event(customer_ids, product_ids)
        producer.produce(
            TOPIC,
            key=str(event["customer_id"]),
            value=json.dumps(event),
            callback=delivery_report,
        )
        producer.poll(0)
        time.sleep(interval)

if __name__ == "__main__":
    main()
