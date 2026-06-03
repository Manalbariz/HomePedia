import os
import shutil
from pathlib import Path
from typing import Iterable, Optional

import pandas as pd
import requests


def download_to_file(url: str, dest_path: Path, *, force: bool = False) -> None:
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if dest_path.exists() and not force:
        return

    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)


def detect_csv_sep(sample_text: str) -> str:
    # Heuristique simple basée sur les occurrences de séparateurs.
    candidates = [",", ";", "\t", "|"]
    counts = {c: sample_text.count(c) for c in candidates}
    best = max(candidates, key=lambda c: counts[c])
    return best if counts[best] > 0 else ","


def read_csv_auto(path: Path, *, encoding: str = "utf-8") -> pd.DataFrame:
    with open(path, "r", encoding=encoding, errors="ignore") as f:
        head = f.read(20000)
    sep = detect_csv_sep(head)
    # engine="python" aide l'auto-detection sur certains formats.
    return pd.read_csv(path, sep=sep, low_memory=False, encoding_errors="ignore")


def write_parquet_partitioned(
    df: pd.DataFrame,
    out_dir: Path,
    partition_cols: Iterable[str],
) -> None:
    """
    Ecrit un dataset Parquet partitionné (un dossier par partition).
    Réécriture complète : supprime l'ancien dossier pour éviter des partitions obsolètes.
    """
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # pandas>=2 utilise pyarrow. On évite les index pour rester propre.
    df = df.copy()
    for c in partition_cols:
        if c not in df.columns:
            raise ValueError(f"Partition col manquante: {c}")
    df.to_parquet(out_dir, index=False, partition_cols=list(partition_cols))


def resolve_template(value: str, cfg: dict) -> str:
    # Support minimal des templates "${paths.hdfs_base_dir}" utilisés dans settings.yaml
    out = value
    if isinstance(value, str) and "${paths.hdfs_base_dir}" in value:
        out = out.replace("${paths.hdfs_base_dir}", cfg["paths"]["hdfs_base_dir"])
    if isinstance(value, str) and "${paths.local_data_dir}" in value:
        out = out.replace("${paths.local_data_dir}", cfg["paths"]["local_data_dir"])
    return out


def try_upload_dir_to_hdfs_via_docker(local_dir: Path, hdfs_dir: str) -> None:
    """
    POC: on tente l'upload HDFS via docker compose.
    Si Docker n'est pas disponible, on loggue et on continue.
    """
    if not local_dir.exists():
        return

    # Déclencheur heuristique : si la commande docker n'est pas dispo, on skip.
    try:
        import subprocess

        subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    except Exception:
        print("HDFS upload skip: docker indisponible.")
        return

    try:
        import subprocess

        cmd = [
            "docker",
            "compose",
            "exec",
            "-T",
            "namenode",
            "hdfs",
            "dfs",
            "-mkdir",
            "-p",
            hdfs_dir,
        ]
        subprocess.run(cmd, check=False)

        # -put récursif : on upload les fichiers Parquet.
        # BDE images supportent hdfs dfs -put.
        for p in local_dir.rglob("*"):
            if p.is_file():
                rel = p.relative_to(local_dir).as_posix()
                dest = f"{hdfs_dir}/{rel}"
                mkdir_cmd = ["docker", "compose", "exec", "-T", "namenode", "hdfs", "dfs", "-mkdir", "-p", str(Path(dest).parent)]
                subprocess.run(mkdir_cmd, check=False)
                put_cmd = ["docker", "compose", "exec", "-T", "namenode", "hdfs", "dfs", "-put", "-f", str(p), dest]
                subprocess.run(put_cmd, check=False)
    except Exception as e:
        print("HDFS upload skip (exception):", repr(e))

