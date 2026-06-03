"""
Consumer Kafka HOMEPEDIA — écoute ingestion_completed et peut déclencher Spark.

Usage:
  python -m pipelines.messaging.consumer --config config/settings.yaml
  HOMEPEDIA_KAFKA_TRIGGER_SPARK=1 python -m pipelines.messaging.consumer
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import yaml

from .kafka_events import _bootstrap_servers, _kafka_enabled, _topic

BASE_DIR = Path(__file__).resolve().parents[2]


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def run_spark_aggregate(config_path: Path) -> int:
    cmd = [
        "docker",
        "compose",
        "exec",
        "-T",
        "spark-master",
        "sh",
        "-lc",
        "python3 -m pip install -q pyyaml && "
        "/spark/bin/spark-submit --packages org.postgresql:postgresql:42.7.3 "
        f"pipelines/spark/jobs/aggregate.py --config {config_path.relative_to(BASE_DIR).as_posix()}",
    ]
    print("[kafka-consumer] Lancement Spark aggregate...")
    return subprocess.call(cmd, cwd=str(BASE_DIR))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config/settings.yaml")
    parser.add_argument("--from-beginning", action="store_true")
    parser.add_argument("--max-messages", type=int, default=0, help="0 = illimité")
    args = parser.parse_args()

    cfg = load_config(args.config)
    if not _kafka_enabled(cfg):
        print("Kafka désactivé dans la config. Activez kafka.enabled ou HOMEPEDIA_KAFKA_ENABLED=1.")
        return 1

    from kafka import KafkaConsumer
    from kafka.errors import NoBrokersAvailable

    topic = _topic(cfg, "topic_ingestion", "hompeedia.ingestion.completed")
    group = (cfg.get("kafka") or {}).get("consumer_group", "hompeedia-pipeline")

    try:
        consumer = KafkaConsumer(
            topic,
            bootstrap_servers=_bootstrap_servers(cfg).split(","),
            group_id=group,
            auto_offset_reset="earliest" if args.from_beginning else "latest",
            enable_auto_commit=True,
            value_deserializer=lambda m: json.loads(m.decode("utf-8")),
            consumer_timeout_ms=0 if args.max_messages == 0 else 10000,
        )
    except NoBrokersAvailable:
        print("Kafka indisponible. docker compose up -d kafka")
        return 1

    print(f"[kafka-consumer] Écoute {topic} (group={group})...")
    trigger_spark = os.getenv("HOMEPEDIA_KAFKA_TRIGGER_SPARK", "0").strip() == "1"
    count = 0

    for msg in consumer:
        payload = msg.value
        count += 1
        print(f"[kafka-consumer] Message #{count}: {json.dumps(payload, ensure_ascii=False)}")

        if payload.get("event") == "ingestion_completed" and trigger_spark:
            config_path = BASE_DIR / args.config
            rc = run_spark_aggregate(config_path)
            if rc != 0:
                print("[kafka-consumer] Spark a échoué rc=", rc)
                return rc

        if args.max_messages and count >= args.max_messages:
            break

    consumer.close()
    if count == 0:
        print("[kafka-consumer] Aucun message (timeout ou topic vide). Lancez d'abord l'ingestion.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
