from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


def _kafka_enabled(cfg: dict) -> bool:
    if os.getenv("HOMEPEDIA_KAFKA_ENABLED", "").strip() in {"0", "false", "no"}:
        return False
    if os.getenv("HOMEPEDIA_KAFKA_ENABLED", "").strip() in {"1", "true", "yes"}:
        return True
    return bool((cfg.get("kafka") or {}).get("enabled", False))


def _bootstrap_servers(cfg: dict) -> str:
    return os.getenv(
        "KAFKA_BOOTSTRAP_SERVERS",
        (cfg.get("kafka") or {}).get("bootstrap_servers", "localhost:9092"),
    )


def _topic(cfg: dict, key: str, default: str) -> str:
    return (cfg.get("kafka") or {}).get(key, default)


def count_parquet_rows(dataset_dir: Path) -> int | None:
    if not dataset_dir.exists():
        return None
    try:
        import pyarrow.dataset as ds

        dataset = ds.dataset(str(dataset_dir), format="parquet", partitioning="hive")
        return int(dataset.scanner().count_rows())
    except Exception:
        return None


def build_ingestion_event(
    *,
    cfg: dict,
    dvf_out_dir: Path,
    insee_out_dir: Path,
    sample_cities: int,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "event": "ingestion_completed",
        "project": (cfg.get("project") or {}).get("name", "hompeedia"),
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "dvf_sample_cities": sample_cities,
        "scale": "national" if sample_cities == 0 else "sample",
        "paths": {
            "dvf_parquet": dvf_out_dir.as_posix(),
            "insee_parquet": insee_out_dir.as_posix(),
        },
        "metrics": {
            "dvf_rows": count_parquet_rows(dvf_out_dir),
            "insee_rows": count_parquet_rows(insee_out_dir),
        },
    }
    if extra:
        payload.update(extra)
    return payload


def publish_json(cfg: dict, topic: str, payload: dict[str, Any]) -> None:
    from kafka import KafkaProducer
    from kafka.errors import NoBrokersAvailable

    servers = _bootstrap_servers(cfg)
    producer = KafkaProducer(
        bootstrap_servers=servers.split(","),
        value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode("utf-8"),
        acks="all",
        retries=3,
        request_timeout_ms=15000,
        api_version=(2, 5, 0),
    )
    try:
        future = producer.send(topic, payload)
        future.get(timeout=30)
        producer.flush()
    except NoBrokersAvailable as e:
        raise RuntimeError(
            f"Kafka indisponible sur {servers}. Lancez: docker compose up -d kafka"
        ) from e
    finally:
        producer.close()


def publish_ingestion_completed(
    cfg: dict,
    *,
    dvf_out_dir: Path,
    insee_out_dir: Path,
    sample_cities: int,
    duration_sec: Optional[float] = None,
) -> bool:
    """
    Publie un événement après ingestion réussie.
    Retourne True si publié, False si Kafka désactivé.
    """
    if not _kafka_enabled(cfg):
        print("Kafka: publication ignorée (kafka.enabled=false ou HOMEPEDIA_KAFKA_ENABLED=0).")
        return False

    topic = _topic(cfg, "topic_ingestion", "hompeedia.ingestion.completed")
    extra = {}
    if duration_sec is not None:
        extra["ingestion_duration_sec"] = round(duration_sec, 2)

    payload = build_ingestion_event(
        cfg=cfg,
        dvf_out_dir=dvf_out_dir,
        insee_out_dir=insee_out_dir,
        sample_cities=sample_cities,
        extra=extra,
    )
    publish_json(cfg, topic, payload)
    print(f"Kafka: événement publié sur '{topic}' ({payload['metrics']}).")
    return True
