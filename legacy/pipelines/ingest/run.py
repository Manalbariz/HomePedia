import argparse
import os
import time
from pathlib import Path

import yaml

from .dvf_stats import prepare_dvf_prices_parquet
from .insee_population import prepare_insee_population_parquet
from .utils import resolve_template, try_upload_dir_to_hdfs_via_docker
from .ign_admin_express import prepare_admin_express_geojson_parquet_like
from ..messaging.kafka_events import publish_ingestion_completed


def load_config(config_path: str) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def ensure_dirs(base_dir: Path) -> None:
    (base_dir / "raw").mkdir(parents=True, exist_ok=True)
    (base_dir / "processed").mkdir(parents=True, exist_ok=True)
    (base_dir / "staging").mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config/settings.yaml")
    parser.add_argument(
        "--geo-only",
        action="store_true",
        help="Génère uniquement les GeoJSON IGN à partir des Parquet existants.",
    )
    args = parser.parse_args()

    cfg = load_config(args.config)
    local_data_dir = Path(cfg["paths"]["local_data_dir"])

    ensure_dirs(Path(local_data_dir))

    if args.geo_only:
        geo_out_dir = Path(local_data_dir) / "processed" / "geo"
        processed_parquet_dir = Path(local_data_dir) / "processed" / "parquet"
        print("Ingestion IGN Admin Express (geo-only)...")
        prepare_admin_express_geojson_parquet_like(
            cfg,
            processed_parquet_dir,
            geo_out_dir,
        )
        print("OK - GeoJSON boundaries écrits:", geo_out_dir.as_posix())
        return

    # Local directories
    raw_dir = Path(local_data_dir) / "raw"
    processed_parquet_dir = Path(local_data_dir) / "processed" / "parquet"

    dvf_raw_dir = raw_dir / "dvf"
    insee_raw_dir = raw_dir / "insee"

    dvf_out_dir = processed_parquet_dir / "dvf_prices"
    insee_out_dir = processed_parquet_dir / "insee_demographics"

    sample_cities = int(
        os.getenv(
            "HOMEPEDIA_DVF_SAMPLE_CITIES",
            cfg["datasets"]["dvf"].get("sample_cities_communes", 50),
        )
    )
    scale_label = "nationale" if sample_cities == 0 else f"échantillon ({sample_cities} communes)"
    print(f"Ingestion DVF — échelle {scale_label} ...")
    t0 = time.perf_counter()

    print("Ingestion DVF (prix au m²) ...")
    prepare_dvf_prices_parquet(cfg, dvf_raw_dir, dvf_out_dir)
    print("OK - DVF prices parquet écrits:", dvf_out_dir.as_posix())

    print("Ingestion POC INSEE (démographie) ...")
    prepare_insee_population_parquet(cfg, insee_raw_dir, insee_out_dir)
    print("OK - INSEE demographics parquet écrits:", insee_out_dir.as_posix())

    # Optionnel : upload HDFS (si docker disponible)
    upload = os.getenv("HOMEPEDIA_UPLOAD_HDFS", "0").strip() == "1"
    if upload:
        dvf_hdfs_dir = resolve_template(cfg["spark"]["parquet_dir_prices"], cfg)
        insee_hdfs_dir = resolve_template(cfg["spark"]["parquet_dir_demographics"], cfg)
        print("Upload HDFS activé (HOMEPEDIA_UPLOAD_HDFS=1)")
        try_upload_dir_to_hdfs_via_docker(dvf_out_dir, dvf_hdfs_dir)
        try_upload_dir_to_hdfs_via_docker(insee_out_dir, insee_hdfs_dir)
    else:
        print("Upload HDFS ignoré (défaut). Mettre HOMEPEDIA_UPLOAD_HDFS=1 pour activer.")

    elapsed = time.perf_counter() - t0
    print(f"Ingestion terminée (DVF + INSEE) en {elapsed:.1f}s.")

    try:
        publish_ingestion_completed(
            cfg,
            dvf_out_dir=dvf_out_dir,
            insee_out_dir=insee_out_dir,
            sample_cities=sample_cities,
            duration_sec=elapsed,
        )
    except Exception as e:
        print("Kafka: publication échouée (ingestion OK):", e)

    if os.getenv("HOMEPEDIA_SKIP_GEO", "0").strip() == "1":
        print("Geo boundaries ignorés (HOMEPEDIA_SKIP_GEO=1).")
    else:
        print("Ingestion POC IGN Admin Express (boundaries GeoJSON)...")
        geo_out_dir = Path(local_data_dir) / "processed" / "geo"
        prepare_admin_express_geojson_parquet_like(
            cfg,
            processed_parquet_dir,
            geo_out_dir,
        )
        print("OK - GeoJSON boundaries écrits:", geo_out_dir.as_posix())


if __name__ == "__main__":
    main()

