from __future__ import annotations

import re
import zipfile
from pathlib import Path
from typing import Dict, Iterable, Optional

import numpy as np
import pandas as pd
import os

from .utils import download_to_file, read_csv_auto, write_parquet_partitioned


INSEE_POP_ZIP_URL = "https://www.insee.fr/fr/statistiques/fichier/7632446/base-cc-evol-struct-pop-2020_csv.zip"


AGE_BIN_MIDPOINTS = {
    "0014": 7.0,
    "1529": 22.0,  # approx midpoint
    "3044": 37.0,
    "4559": 52.0,
    "6074": 67.0,
    "7589": 82.0,
    "90P": 95.0,
}


# Métropole (2016+) : mapping département INSEE -> code région INSEE (2 chiffres).
# Permet de dériver `region_insee_code` quand le dataset n’expose pas `REG` séparément.
DEP_TO_REGION = {
    # Île-de-France (11)
    "75": "11",
    "77": "11",
    "78": "11",
    "91": "11",
    "92": "11",
    "93": "11",
    "94": "11",
    # Centre-Val de Loire (24)
    "18": "24",
    "28": "24",
    "36": "24",
    "37": "24",
    "41": "24",
    "45": "24",
    # Bourgogne-Franche-Comté (27)
    "21": "27",
    "25": "27",
    "39": "27",
    "58": "27",
    "70": "27",
    "71": "27",
    "89": "27",
    "90": "27",
    # Normandie (28)
    "14": "28",
    "27": "28",
    "50": "28",
    "61": "28",
    # Hauts-de-France (32)
    "02": "32",
    "59": "32",
    "60": "32",
    "62": "32",
    "80": "32",
    # Grand Est (44)
    "08": "44",
    "10": "44",
    "51": "44",
    "52": "44",
    "54": "44",
    "55": "44",
    "57": "44",
    "67": "44",
    "68": "44",
    # Pays de la Loire (52? code région=52 n’existe pas ici) -> code région 45
    "44": "45",
    "49": "45",
    "53": "45",
    "72": "45",
    "85": "45",
    # Bretagne (53)
    "22": "53",
    "29": "53",
    "35": "53",
    "56": "53",
    # Nouvelle-Aquitaine (75)
    "16": "75",
    "17": "75",
    "19": "75",
    "23": "75",
    "24": "75",
    "33": "75",
    "40": "75",
    "47": "75",
    "64": "75",
    "79": "75",
    "86": "75",
    "87": "75",
    # Occitanie (76)
    "09": "76",
    "12": "76",
    "31": "76",
    "32": "76",
    "46": "76",
    "65": "76",
    "66": "76",
    "81": "76",
    "82": "76",
    # Auvergne-Rhône-Alpes (84)
    "01": "84",
    "03": "84",
    "07": "84",
    "15": "84",
    "26": "84",
    "38": "84",
    "42": "84",
    "43": "84",
    "63": "84",
    "69": "84",
    "73": "84",
    "74": "84",
    # Provence-Alpes-Côte d’Azur (93)
    "04": "93",
    "05": "93",
    "06": "93",
    "13": "93",
    "83": "93",
    "84": "93",
    # Corse (94)
    "2A": "94",
    "2B": "94",
}


def _find_sep_in_zip_csv(csv_text_path: Path) -> str:
    # Utilisé si besoin : on préfère laisser read_csv_auto détecter.
    return ","


def _compute_median_age_approx(row: pd.Series, year_prefix: str) -> Optional[float]:
    """
    Approxime un âge médian via la moyenne pondérée par les bins d'âge.
    (Le dataset ne fournit pas directement une médiane explicite de l'âge.)
    """
    total = 0.0
    weighted_sum = 0.0
    # 2009/2014/2020 : préfixe P09 / P14 / P20
    for bin_suffix, midpoint in AGE_BIN_MIDPOINTS.items():
        col = f"{year_prefix}_POP{bin_suffix}"
        if col not in row.index:
            continue
        val = pd.to_numeric(row.get(col, np.nan), errors="coerce")
        if pd.isna(val):
            continue
        total += float(val)
        weighted_sum += float(val) * float(midpoint)

    if total <= 0:
        return None
    return weighted_sum / total


def _infer_years_columns(df: pd.DataFrame, wanted_years: Iterable[int]) -> Dict[int, str]:
    mapping = {}
    for y in wanted_years:
        suffix = str(y)[-2:]
        year_prefix = f"P{suffix}"
        # Ex : P20_POP
        if f"{year_prefix}_POP" in df.columns:
            mapping[y] = year_prefix
    return mapping


def prepare_insee_population_parquet(
    cfg: dict,
    raw_dir: Path,
    out_dir: Path,
    *,
    years: Iterable[int] = (2009, 2014, 2020),
) -> Path:
    raw_dir.mkdir(parents=True, exist_ok=True)

    zip_path = raw_dir / "insee_population_2020.zip"
    download_to_file(INSEE_POP_ZIP_URL, zip_path)

    # Le zip contient un csv (unique pour le fichier principal).
    with zipfile.ZipFile(zip_path) as zf:
        csv_names = [n for n in zf.namelist() if n.lower().endswith(".csv")]
        if not csv_names:
            raise RuntimeError("INSEE zip: aucun fichier .csv trouvé.")
        # On prend le premier.
        csv_member = csv_names[0]
        extracted_path = raw_dir / "insee_population_2020.csv"
        if not extracted_path.exists():
            with zf.open(csv_member) as src, open(extracted_path, "wb") as dst:
                dst.write(src.read())

    df = read_csv_auto(extracted_path)
    if df.empty:
        raise RuntimeError("INSEE population CSV vide.")

    # Normalisation de colonnes
    # Colonnes de géographie (voir doc Insee) : CODGEO, DEP, REG, LIBGEO
    for c in ["CODGEO", "DEP", "REG"]:
        if c in df.columns:
            df[c] = df[c].astype(str).str.strip()

    years_prefix = _infer_years_columns(df, years)
    if not years_prefix:
        # Fallback : si le dataset utilise d'autres libellés, on ne bloque pas le POC.
        raise RuntimeError("Impossible d'inférer les préfixes de colonnes INSEE (P09/P14/P20).")

    # Filtre V1 : échantillonnage communes
    sample_n = int(os.getenv("HOMEPEDIA_DVF_SAMPLE_CITIES", cfg["datasets"].get("dvf", {}).get("sample_cities_communes", 50)))
    if sample_n > 0 and "CODGEO" in df.columns:
        unique_cities = sorted(df["CODGEO"].dropna().unique().tolist())
        overrides = cfg.get("project", {}).get("city_insee_overrides", {})
        override_codes = [str(v).strip() for v in overrides.values() if v is not None]
        keep_cities = sorted(set(unique_cities[:sample_n]) | set(override_codes))
        df_city = df[df["CODGEO"].isin(keep_cities)].copy()
    else:
        df_city = df.copy()

    records = []
    for y, prefix in years_prefix.items():
        pop_col = f"{prefix}_POP"
        if pop_col not in df_city.columns:
            continue

        # Population commune + âge (approx)
        df_city["_population"] = pd.to_numeric(df_city[pop_col], errors="coerce")
        df_city["_median_age_approx"] = df_city.apply(lambda r: _compute_median_age_approx(r, prefix), axis=1)

        # City records
        if "CODGEO" in df_city.columns:
            codgeo = df_city["CODGEO"].astype(str).str.strip()

            def dep_from_codgeo(v: str) -> str | None:
                if v.startswith("2A") or v.startswith("2B"):
                    return v[:2]
                # métropole : 5 caractères, département = 2 premiers
                if v.isdigit() and len(v) >= 2:
                    return v[:2].zfill(2)
                # cas outre-mer : tente 3 premiers chiffres
                if v.isdigit() and len(v) >= 3:
                    dep3 = v[:3]
                    return dep3
                return None

            department_code = codgeo.map(dep_from_codgeo)
            region_code = department_code.map(lambda d: DEP_TO_REGION.get(str(d)) if d else None)

            tmp_city = pd.DataFrame(
                {
                    "year": int(y),
                    "level": "city",
                    "insee_code": df_city["CODGEO"],
                    "department_insee_code": department_code.astype(str).str.strip(),
                    "region_insee_code": region_code.astype(str).str.strip(),
                    "population": df_city["_population"],
                    "median_age": df_city["_median_age_approx"],
                    "source": "INSEE 7632446 (POC)",
                }
            )
            records.append(tmp_city)

        # Department records (agrégation)
        if "DEP" in df_city.columns:
            # Correction pondérée : recalcul via somme(population) et moyenne pondérée des âges.
            tmp_dep_rows = []
            for dep_code, g in df_city.groupby("DEP"):
                pop = pd.to_numeric(g["_population"], errors="coerce").sum()
                w = (pd.to_numeric(g["_population"], errors="coerce") * pd.to_numeric(g["_median_age_approx"], errors="coerce")).sum()
                median_age = (w / pop) if pop and not np.isnan(w) else None
                tmp_dep_rows.append(
                    {
                        "year": int(y),
                        "level": "department",
                        "insee_code": str(dep_code).strip(),
                        "population": pop,
                        "median_age": median_age,
                        "source": "INSEE 7632446 (POC)",
                    }
                )
            records.extend(pd.DataFrame(tmp_dep_rows))

        # Region records (agrégation)
        if "REG" in df_city.columns:
            tmp_reg_rows = []
            for reg_code, g in df_city.groupby("REG"):
                pop = pd.to_numeric(g["_population"], errors="coerce").sum()
                w = (pd.to_numeric(g["_population"], errors="coerce") * pd.to_numeric(g["_median_age_approx"], errors="coerce")).sum()
                median_age = (w / pop) if pop and not np.isnan(w) else None
                tmp_reg_rows.append(
                    {
                        "year": int(y),
                        "level": "region",
                        "insee_code": str(reg_code).strip(),
                        "population": pop,
                        "median_age": median_age,
                        "source": "INSEE 7632446 (POC)",
                    }
                )
            records.extend(pd.DataFrame(tmp_reg_rows))

    out_df = pd.concat(records, ignore_index=True)
    out_df = out_df.dropna(subset=["insee_code", "population"], how="any")

    # Nettoyage types
    out_df["population"] = pd.to_numeric(out_df["population"], errors="coerce")
    out_df["median_age"] = pd.to_numeric(out_df["median_age"], errors="coerce")
    out_df["year"] = pd.to_numeric(out_df["year"], errors="coerce").astype(int)

    # Partitionnement Parquet
    out_dir.mkdir(parents=True, exist_ok=True)
    write_parquet_partitioned(out_df, out_dir, partition_cols=["level", "year"])
    return out_dir

