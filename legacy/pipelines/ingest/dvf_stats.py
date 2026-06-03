from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable, Optional

import numpy as np
import pandas as pd
import os

from .utils import download_to_file, read_csv_auto


# Pré-agrégés DVF sur période entière (contient ventes, prix/m2 médian et moyen).
DVF_STATS_WHOLE_PERIOD_URL = "https://object.files.data.gouv.fr/data-pipeline-open/dvf/stats_whole_period.csv"


PROPERTY_TYPE_KEYWORDS = {
    "houses": ["maison", "maisons"],
    "apartments": ["appart", "appartement", "apparts"],
    "houses_apartments": ["maison", "appart", "maisons+apparts", "maisons_apparts", "maisons+apparts".replace("+", "_")],
    "commercial": ["commercial", "local", "locaux", "activite", "activité", "terrain", "terr"],
}


def _normalize_insee_code(value: object, width: int) -> Optional[str]:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    s = str(value).strip()
    if not s or s.lower() in {"nan", "none"}:
        return None
    # Certains fichiers ont déjà le bon format, d'autres nécessitent un padding.
    if s.isdigit():
        s = s.zfill(width)
    return s


def _infer_year_column(cols: Iterable[str]) -> Optional[str]:
    c = [x.lower() for x in cols]
    # Priorité aux colonnes explicitement nommées.
    for name in ["annee", "year", "semestre", "periode", "date"]:
        if name in c:
            # On renvoie le nom original correspondant.
            idx = c.index(name)
            return list(cols)[idx]
    # Fallback: toute colonne qui contient "annee" au milieu.
    for orig in cols:
        if re.search(r"annee|year|date|periode|semestre", orig, flags=re.IGNORECASE):
            return orig
    return None


def _extract_year(series: pd.Series) -> pd.Series:
    # Tente d'obtenir une année (int) à partir de formats variés.
    def parse_one(v: object) -> Optional[int]:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        s = str(v).strip()
        if not s:
            return None
        # Cas numérique
        if s.isdigit() and len(s) == 4:
            return int(s)
        # Cas "2018-01" / "2018-S1" / "2018 semestre"
        m = re.search(r"(19|20)\d{2}", s)
        if m:
            return int(m.group(0))
        return None

    years = series.map(parse_one)
    return pd.to_numeric(years, errors="coerce").astype("Int64")


def _infer_level(df: pd.DataFrame) -> pd.DataFrame:
    # Essaye de déduire une colonne "level" (city/department/region) si le fichier est multi-niveaux.
    cols_lower = {c.lower(): c for c in df.columns}

    level_col_candidates = ["echelle", "niveau", "scale", "niveau_geo", "type_echelle"]
    found_level_col = None
    for lc in level_col_candidates:
        for key_lower, orig in cols_lower.items():
            if lc in key_lower:
                found_level_col = orig
                break
        if found_level_col:
            break

    if not found_level_col:
        # Fallback : on suppose que le fichier est “commune” si code_commune existe.
        if any("code_commune" == c.lower() for c in df.columns):
            df = df.copy()
            df["level"] = "city"
            return df
        return df

    df = df.copy()
    lc = found_level_col

    def map_level(v: object) -> Optional[str]:
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return None
        s = str(v).lower()
        if "commune" in s:
            return "city"
        if "depart" in s or "départ" in s:
            return "department"
        if "region" in s or "région" in s:
            return "region"
        return None

    df["level"] = df[lc].map(map_level)
    return df


def _pick_first(df: pd.DataFrame, candidates: Iterable[str]) -> Optional[str]:
    lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in lower:
            return lower[cand.lower()]
    return None


def _find_price_median_col(df: pd.DataFrame, property_type: str) -> Optional[str]:
    # Cherche une colonne contenant "prix" + "m2" + "median" (et un mot-clé type).
    # Heuristique : on se contente de mots-clés, sans supposer la nomenclature exacte.
    key_words = PROPERTY_TYPE_KEYWORDS[property_type]
    for c in df.columns:
        cl = c.lower()
        if "prix" in cl and ("m2" in cl or "m²" in cl) and ("median" in cl or "médian" in cl):
            if any(k in cl for k in key_words):
                return c
    return None


def _find_price_avg_col(df: pd.DataFrame, property_type: str) -> Optional[str]:
    key_words = PROPERTY_TYPE_KEYWORDS[property_type]
    for c in df.columns:
        cl = c.lower()
        if "prix" in cl and ("m2" in cl or "m²" in cl) and ("moyen" in cl or "average" in cl):
            if any(k in cl for k in key_words):
                return c
    return None


def _find_mutations_col(df: pd.DataFrame, property_type: str) -> Optional[str]:
    key_words = PROPERTY_TYPE_KEYWORDS[property_type]
    for c in df.columns:
        cl = c.lower()
        if "nb" in cl and "mut" in cl:
            if any(k in cl for k in key_words) or ("mutation" in cl):
                return c
    # Fallback : colonne générale nb_mutations
    for c in df.columns:
        if c.lower() in {"nb_mutations", "nbmutes", "nbmutes"}:
            return c
    return None


def prepare_dvf_prices_parquet(
    cfg: dict,
    raw_dir: Path,
    out_dir: Path,
) -> Path:
    sample_cities = int(os.getenv("HOMEPEDIA_DVF_SAMPLE_CITIES", cfg["datasets"]["dvf"].get("sample_cities_communes", 50)))
    dvf_whole_period_year = int(os.getenv("HOMEPEDIA_DVF_WHOLE_PERIOD_YEAR", "2023"))

    raw_dir.mkdir(parents=True, exist_ok=True)
    csv_path = raw_dir / "dvf_stats_whole_period.csv"
    download_to_file(DVF_STATS_WHOLE_PERIOD_URL, csv_path)

    df = read_csv_auto(csv_path)
    if df.empty:
        raise RuntimeError("DVF stats CSV vide.")

    # --- Parsing explicite “whole period” (schéma observé dans le CSV)
    # Colonnes typiques :
    # - code_geo, libelle_geo, code_parent, echelle_geo
    # - nb_ventes_whole_{appartement|maison|apt_maison|local}
    # - moy_prix_m2_whole_{...}
    # - med_prix_m2_whole_{...}
    dvf_has_expected_columns = (
        "echelle_geo" in df.columns
        and "code_geo" in df.columns
        and any(c.startswith("moy_prix_m2_whole_") for c in df.columns)
        and any(c.startswith("med_prix_m2_whole_") for c in df.columns)
        and any(c.startswith("nb_ventes_whole_") for c in df.columns)
    )

    if dvf_has_expected_columns:
        df = df.copy()

        def map_level(v: object) -> Optional[str]:
            if v is None or (isinstance(v, float) and np.isnan(v)):
                return None
            s = str(v).strip().lower()
            if s in {"commune"}:
                return "city"
            if s in {"departement", "département"}:
                return "department"
            if s in {"region", "région"}:
                return "region"
            return None

        df["level"] = df["echelle_geo"].map(map_level)

        # Normalisation code INSEE en fonction du niveau.
        def normalize_code_for_level(v: object, level: str) -> Optional[str]:
            s = None
            if v is None or (isinstance(v, float) and np.isnan(v)):
                return None
            s = str(v).strip()
            if not s or s.lower() in {"nan", "none"}:
                return None
            # Cas standard : codes numériques
            if s.isdigit():
                if level == "city":
                    return s.zfill(5)
                if level in {"department", "region"}:
                    return s.zfill(2)

            # Cas observé dans certaines sources : suffixes alphanumériques (ex: "01004000AT").
            # Pour que la choropleth fonctionne, on réduit au code INSEE attendu :
            # - city : 5 premiers chiffres
            # - department/region : 2 premiers chiffres
            digits = "".join(ch for ch in s if ch.isdigit())
            if digits:
                if level == "city" and len(digits) >= 5:
                    return digits[:5]
                if level in {"department", "region"} and len(digits) >= 2:
                    return digits[:2]

            # Cas Corsica / codes non numériques : on conserve.
            return s

        df["insee_code"] = [
            normalize_code_for_level(v, lvl) for v, lvl in zip(df["code_geo"].tolist(), df["level"].tolist())
        ]

        # “whole period” ne contient pas forcément de colonne year : on utilise une année de référence.
        df["year"] = dvf_whole_period_year
    else:
        # Fallback : heuristique générique (moins fiable).
        year_col = _infer_year_column(df.columns)
        if year_col:
            df["year"] = _extract_year(df[year_col])
        else:
            df["year"] = dvf_whole_period_year

        df = _infer_level(df)
        code_commune_col = _pick_first(df, ["code_commune", "code_commune_insee", "codecity", "insee_code", "code_geo"])
        if code_commune_col:
            # On suppose commune -> city et applique un padding 5.
            df["insee_code"] = df[code_commune_col].map(lambda v: _normalize_insee_code(v, 5))
        else:
            df["level"] = "city"
            df["insee_code"] = pd.NA

    df = df[df["insee_code"].notna()].copy()
    df["level"] = df.get("level", "city").fillna("city")

    # Filtrage V1 : échantillon de communes (city uniquement).
    # Les agrégations department/region sont ensuite faites par Spark.
    if sample_cities > 0:
        overrides = cfg.get("project", {}).get("city_insee_overrides", {})
        override_codes = [str(v).strip() for v in overrides.values() if v is not None]

        city_df = df[df["level"] == "city"].copy()
        unique_cities = sorted(city_df["insee_code"].dropna().unique().tolist())

        keep = set(unique_cities[:sample_cities]) | set(override_codes)
        df = df[(df["level"] == "city") & (df["insee_code"].isin(list(keep)))].copy()

    # Construire un format long “property_type”
    rows = []

    # Cas “whole period” (schéma explicite connu)
    if dvf_has_expected_columns:
        property_keyword = {
            "houses": "maison",
            "apartments": "appartement",
            "houses_apartments": "apt_maison",
            "commercial": "local",
        }

        for property_type, keyword in property_keyword.items():
            median_col = f"med_prix_m2_whole_{keyword}"
            avg_col = f"moy_prix_m2_whole_{keyword}"
            mutations_col = f"nb_ventes_whole_{keyword}"
            if median_col not in df.columns and avg_col not in df.columns and mutations_col not in df.columns:
                continue

            tmp = df.copy()
            tmp["property_type"] = property_type
            tmp["price_m2_median"] = tmp[median_col] if median_col in tmp.columns else np.nan
            tmp["price_m2_avg"] = tmp[avg_col] if avg_col in tmp.columns else np.nan
            tmp["mutation_count"] = tmp[mutations_col] if mutations_col in tmp.columns else np.nan

            tmp["price_m2_median"] = pd.to_numeric(tmp["price_m2_median"], errors="coerce")
            tmp["price_m2_avg"] = pd.to_numeric(tmp["price_m2_avg"], errors="coerce")
            tmp["mutation_count"] = pd.to_numeric(tmp["mutation_count"], errors="coerce").astype("Int64")

            rows.append(
                tmp[["year", "level", "insee_code", "property_type", "price_m2_avg", "price_m2_median", "mutation_count"]]
            )
    else:
        # Fallback heuristique
        for property_type in ["houses", "apartments", "houses_apartments", "commercial"]:
            median_col = _find_price_median_col(df, property_type)
            avg_col = _find_price_avg_col(df, property_type)
            mutations_col = _find_mutations_col(df, property_type)

            if median_col is None and avg_col is None and mutations_col is None:
                continue

            tmp = df.copy()
            tmp["property_type"] = property_type
            tmp["price_m2_median"] = tmp[median_col] if median_col else np.nan
            tmp["price_m2_avg"] = tmp[avg_col] if avg_col else np.nan
            tmp["mutation_count"] = tmp[mutations_col] if mutations_col else np.nan

            tmp["price_m2_median"] = pd.to_numeric(tmp["price_m2_median"], errors="coerce")
            tmp["price_m2_avg"] = pd.to_numeric(tmp["price_m2_avg"], errors="coerce")
            tmp["mutation_count"] = pd.to_numeric(tmp["mutation_count"], errors="coerce").astype("Int64")

            rows.append(
                tmp[
                    [
                        "year",
                        "level",
                        "insee_code",
                        "property_type",
                        "price_m2_avg",
                        "price_m2_median",
                        "mutation_count",
                    ]
                ]
            )

    if not rows:
        raise RuntimeError("Impossible d'extraire des prix DVF : colonnes non reconnues.")

    out_df = pd.concat(rows, ignore_index=True)

    # Nettoyage minimal
    out_df = out_df[out_df["year"].notna()].copy()
    out_df = out_df[out_df["insee_code"].notna()].copy()

    out_df["source"] = "DVF Statistiques (POC)"
    out_df = out_df.dropna(subset=["price_m2_avg", "price_m2_median"], how="all")

    # Partitionnement Parquet
    out_dir.mkdir(parents=True, exist_ok=True)
    # On écrit à niveau par dataset : out_dir/dvf_prices
    from .utils import write_parquet_partitioned

    write_parquet_partitioned(out_df, out_dir, partition_cols=["level", "year"])
    return out_dir

