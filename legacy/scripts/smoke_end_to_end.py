import json
import os
import subprocess
import sys
from pathlib import Path

import yaml


BASE_DIR = Path(__file__).resolve().parent.parent


def docker_available() -> bool:
    try:
        res = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        return res.returncode == 0
    except Exception:
        return False


def run_python_module(module: str, args: list[str], env: dict) -> int:
    cmd = [sys.executable, "-m", module] + args
    print("[smoke] run:", " ".join(cmd))
    return subprocess.call(cmd, env=env)


def any_parquet_files(dir_path: Path) -> bool:
    if not dir_path.exists():
        return False
    for p in dir_path.rglob("*.parquet"):
        return True
    return False


def main() -> int:
    cfg = yaml.safe_load(open(BASE_DIR / "config" / "settings.yaml", "r", encoding="utf-8"))

    local_data_dir = Path(cfg["paths"]["local_data_dir"])
    dvf_parquet_dir = BASE_DIR / local_data_dir / "processed" / "parquet" / "dvf_prices"
    insee_parquet_dir = BASE_DIR / local_data_dir / "processed" / "parquet" / "insee_demographics"
    geo_dir = BASE_DIR / local_data_dir / "processed" / "geo"

    env = os.environ.copy()
    env.setdefault("HOMEPEDIA_DVF_SAMPLE_CITIES", "20")
    env.setdefault("HOMEPEDIA_NLP_MAX_TEXTS_PER_CITY", "300")
    env.setdefault("HOMEPEDIA_NLP_MIN_TEXT_CHARS", "120")
    env.setdefault("HOMEPEDIA_UPLOAD_HDFS", "0")

    smoke_run_ingest = os.getenv("SMOKE_RUN_INGEST", "1") == "1"
    smoke_run_spark = os.getenv("SMOKE_RUN_SPARK", "1") == "1"
    smoke_run_nlp = os.getenv("SMOKE_RUN_NLP", "1") == "1"

    docker_ok = docker_available()
    print("[smoke] docker_available =", docker_ok)

    if smoke_run_ingest and not (any_parquet_files(dvf_parquet_dir) and any_parquet_files(insee_parquet_dir)):
        rc = run_python_module(
            "pipelines.ingest.run",
            ["--config", "config/settings.yaml"],
            env=env,
        )
        if rc != 0:
            print("[smoke] Ingestion DVF/INSEE failed rc=", rc)
    else:
        print("[smoke] Ingestion outputs already present (or skipped).")

    # boundaries geojson (optionnel pour smoke)
    if not geo_dir.exists():
        print("[smoke] GeoJSON dir missing:", geo_dir)
    else:
        print("[smoke] GeoJSON dir exists:", geo_dir)

    # Spark aggregate -> Postgres (nécessite docker/DB)
    if smoke_run_spark:
        if docker_ok:
            print("[smoke] Spark aggregation step: attempting to run via docker compose...")
            # compose up (best effort)
            subprocess.run(["docker", "compose", "up", "-d"], cwd=str(BASE_DIR), check=False)
            rc = subprocess.call(
                [
                    "docker",
                    "compose",
                    "exec",
                    "-T",
                    "spark-master",
                    "spark-submit",
                    "pipelines/spark/jobs/aggregate.py",
                    "--config",
                    "config/settings.yaml",
                ],
                cwd=str(BASE_DIR),
                env=env,
            )
            if rc != 0:
                print("[smoke] Spark aggregate failed rc=", rc)
        else:
            print("[smoke] Spark step skipped: docker not available.")
    else:
        print("[smoke] Spark step skipped (SMOKE_RUN_SPARK=0).")

    # NLP -> Mongo (pas forcément docker : Mongo peut être sur localhost ou non)
    if smoke_run_nlp:
        print("[smoke] NLP step: attempting to run `pipelines.nlp.run`...")
        rc = run_python_module("pipelines.nlp.run", ["--config", "config/settings.yaml"], env=env)
        if rc != 0:
            print("[smoke] NLP run failed rc=", rc)
    else:
        print("[smoke] NLP step skipped (SMOKE_RUN_NLP=0).")

    # Vérifications finales : outputs
    ok = True
    if not any_parquet_files(dvf_parquet_dir):
        print("[smoke] Missing DVF parquet:", dvf_parquet_dir)
        ok = False
    if not any_parquet_files(insee_parquet_dir):
        print("[smoke] Missing INSEE parquet:", insee_parquet_dir)
        ok = False

    print("[smoke] Done. ok=", ok)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

