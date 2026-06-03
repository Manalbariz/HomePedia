"""Génère les GeoJSON IGN à partir des Parquet déjà ingérés (sans relancer DVF/INSEE)."""
from __future__ import annotations

import argparse
from pathlib import Path

import yaml

from .ign_admin_express import prepare_admin_express_geojson_parquet_like


def main() -> None:
    parser = argparse.ArgumentParser(description="HOMEPEDIA — boundaries GeoJSON (IGN WFS)")
    parser.add_argument("--config", default="config/settings.yaml")
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    local_data_dir = Path(cfg["paths"]["local_data_dir"])
    processed_parquet_dir = local_data_dir / "processed" / "parquet"
    geo_out_dir = local_data_dir / "processed" / "geo"

    prepare_admin_express_geojson_parquet_like(
        cfg,
        processed_parquet_dir,
        geo_out_dir,
    )
    print("OK — GeoJSON:", geo_out_dir.as_posix())


if __name__ == "__main__":
    main()
