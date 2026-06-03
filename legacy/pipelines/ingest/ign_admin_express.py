from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import pandas as pd
import requests


WFS_BASE_URL = "https://data.geopf.fr/wfs/ows"


def _wfs_get_geojson(
    *,
    type_name: str,
    cql_filter: Optional[str],
    out_path: Path,
    timeout_s: int = 120,
) -> None:
    """
    Télécharge un GeoJSON via WFS GetFeature et l'écrit sur disque.
    """
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": type_name,
        "outputFormat": "application/json",
        "srsName": "EPSG:4326",
    }
    if cql_filter:
        params["cql_filter"] = cql_filter

    out_path.parent.mkdir(parents=True, exist_ok=True)
    r = requests.get(WFS_BASE_URL, params=params, timeout=timeout_s)
    r.raise_for_status()
    out_path.write_bytes(r.content)


def _build_cql_in_filter(field: str, codes: set[str]) -> Optional[str]:
    if not codes:
        return None
    numeric = []
    quoted = []
    for c in sorted({str(x).strip() for x in codes if x is not None}):
        if not c:
            continue
        if c.isdigit():
            numeric.append(c)
        else:
            quoted.append("'" + c.replace("'", "''") + "'")
    items = numeric + quoted
    if not items:
        return None
    return f"{field} IN ({','.join(items)})"


def _read_codes_from_parquet_dir(p: Path, level: str, code_col: str = "insee_code") -> set[str]:
    if not p.exists():
        return set()
    try:
        import pyarrow.dataset as ds

        dataset = ds.dataset(p, format="parquet", partitioning="hive")
        schema_cols = set(dataset.schema.names)
        cols = [code_col]
        if "level" in schema_cols:
            cols = ["level", code_col]
        table = dataset.to_table(columns=cols)
        df = table.to_pandas()
    except Exception:
        parts = list(p.rglob("*.parquet"))
        if not parts:
            return set()
        df = pd.concat([pd.read_parquet(x) for x in parts], ignore_index=True)

    if "level" in df.columns:
        df = df[df["level"] == level]
    if code_col not in df.columns:
        return set()
    return set(df[code_col].dropna().astype(str).unique().tolist())


def _persona_city_codes(cfg: dict) -> set[str]:
    codes: set[str] = set()
    modes = (cfg.get("personas") or {}).get("modes") or {}
    for mode in modes.values():
        for item in mode.get("compare_cities") or []:
            if isinstance(item, dict):
                codes.add(str(item.get("insee", "")).strip())
            else:
                codes.add(str(item).strip())
        anchor = mode.get("anchor")
        if isinstance(anchor, dict) and anchor.get("insee"):
            codes.add(str(anchor["insee"]).strip())
        for c in mode.get("city_insee_codes") or []:
            codes.add(str(c).strip())
    return {c for c in codes if c}


def _cap_city_codes(cfg: dict, codes: set[str]) -> set[str]:
    geo_cfg = cfg.get("geo") or {}
    max_communes = int(os.getenv("HOMEPEDIA_GEO_MAX_CITIES", geo_cfg.get("max_communes_wfs", 0) or 0))
    if max_communes <= 0 or len(codes) <= max_communes:
        return codes

    persona = _persona_city_codes(cfg)
    preferred = codes & persona
    if preferred:
        capped = preferred
        if len(capped) > max_communes:
            capped = set(sorted(capped)[:max_communes])
        print(
            f"Geo communes: {len(codes)} codes en base → WFS limité à {len(capped)} "
            f"(personas + max_communes_wfs={max_communes})."
        )
        return capped

    capped = set(sorted(codes)[:max_communes])
    print(
        f"Geo communes: {len(codes)} codes en base → WFS limité à {max_communes} "
        "(relancer avec personas ou HOMEPEDIA_GEO_MAX_CITIES=0 pour tout charger)."
    )
    return capped


def _wfs_get_geojson_chunked(
    *,
    type_name: str,
    codes: set[str],
    out_path: Path,
    chunk_size: int = 80,
    timeout_s: int = 120,
) -> None:
    if not codes:
        out_path.write_text(json.dumps({"type": "FeatureCollection", "features": []}), encoding="utf-8")
        return

    sorted_codes = sorted(codes)
    chunks = [sorted_codes[i : i + chunk_size] for i in range(0, len(sorted_codes), chunk_size)]
    if len(chunks) == 1:
        filt = _build_cql_in_filter("code_insee", set(chunks[0]))
        _wfs_get_geojson(type_name=type_name, cql_filter=filt, out_path=out_path, timeout_s=timeout_s)
        return

    features: list[dict] = []
    tmp_dir = out_path.parent / "_wfs_chunks"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    try:
        for i, chunk in enumerate(chunks):
            tmp_path = tmp_dir / f"{out_path.stem}_{i}.geojson"
            filt = _build_cql_in_filter("code_insee", set(chunk))
            _wfs_get_geojson(type_name=type_name, cql_filter=filt, out_path=tmp_path, timeout_s=timeout_s)
            data = json.loads(tmp_path.read_text(encoding="utf-8"))
            features.extend(data.get("features") or [])
        out_path.write_text(
            json.dumps({"type": "FeatureCollection", "features": features}),
            encoding="utf-8",
        )
    finally:
        for f in tmp_dir.glob("*.geojson"):
            f.unlink(missing_ok=True)
        if tmp_dir.exists() and not any(tmp_dir.iterdir()):
            tmp_dir.rmdir()


def prepare_admin_express_geojson_parquet_like(
    cfg: dict,
    dvf_insee_processed_dir: Path,
    out_dir: Path,
    *,
    postgres_conn: Optional[str] = None,
) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)

    dvf_parquet = dvf_insee_processed_dir / "dvf_prices"
    insee_parquet = dvf_insee_processed_dir / "insee_demographics"

    target_city_codes = _read_codes_from_parquet_dir(dvf_parquet, "city")
    target_dep_codes = _read_codes_from_parquet_dir(insee_parquet, "department")
    if not target_dep_codes:
        target_dep_codes = _read_codes_from_parquet_dir(dvf_parquet, "department")
    target_reg_codes = _read_codes_from_parquet_dir(insee_parquet, "region")
    if not target_reg_codes:
        target_reg_codes = _read_codes_from_parquet_dir(dvf_parquet, "region")

    target_city_codes = _cap_city_codes(cfg, target_city_codes)

    geo_cfg = cfg.get("geo") or {}
    chunk_size = int(geo_cfg.get("wfs_chunk_size", 80))

    out_city = out_dir / "city.geojson"
    out_dep = out_dir / "department.geojson"
    out_reg = out_dir / "region.geojson"

    if target_city_codes:
        _wfs_get_geojson_chunked(
            type_name="LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:commune",
            codes=target_city_codes,
            out_path=out_city,
            chunk_size=chunk_size,
        )
    else:
        out_city.write_text(json.dumps({"type": "FeatureCollection", "features": []}), encoding="utf-8")

    if target_dep_codes:
        _wfs_get_geojson_chunked(
            type_name="LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:departement",
            codes=target_dep_codes,
            out_path=out_dep,
            chunk_size=chunk_size,
        )
    if target_reg_codes:
        _wfs_get_geojson_chunked(
            type_name="LIMITES_ADMINISTRATIVES_EXPRESS.LATEST:region",
            codes=target_reg_codes,
            out_path=out_reg,
            chunk_size=chunk_size,
        )

    print(f"GeoJSON écrit: {out_city} ({len(target_city_codes)} communes ciblées)")
    print(f"GeoJSON écrit: {out_dep}")
    print(f"GeoJSON écrit: {out_reg}")

    return out_dir
