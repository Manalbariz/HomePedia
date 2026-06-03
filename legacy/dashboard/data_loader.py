"""Chargement SQL + agrégation côté Postgres (évite 700k+ communes en RAM)."""
from __future__ import annotations

import re

import pandas as pd

COMMUNE_CODE_RE = re.compile(r"^\d{5}$")

SQL_DEPARTMENT_CODE = """
CASE
  WHEN insee_code ~ '^97' THEN substring(insee_code from 1 for 3)
  WHEN substring(insee_code from 1 for 2) IN ('2A', '2B') THEN substring(insee_code from 1 for 2)
  ELSE substring(insee_code from 1 for 2)
END
"""

SQL_REGION_CODE = f"""
CASE
  WHEN ({SQL_DEPARTMENT_CODE.strip()}) ~ '^97' THEN ({SQL_DEPARTMENT_CODE.strip()})
  WHEN substring(({SQL_DEPARTMENT_CODE.strip()}) from 1 for 1) = '0'
    THEN substring(({SQL_DEPARTMENT_CODE.strip()}) from 2 for 1)
  ELSE substring(({SQL_DEPARTMENT_CODE.strip()}) from 1 for 1)
END
"""


def insee_department_from_commune(code: str) -> str:
    code = str(code).strip().upper()
    if code.startswith("97") and len(code) >= 3:
        return code[:3]
    if len(code) >= 2 and code[:2] in ("2A", "2B"):
        return code[:2]
    return code[:2] if len(code) >= 5 else code


def keep_commune_codes_only(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    out = df.copy()
    out["insee_code"] = out["insee_code"].astype(str)
    return out[out["insee_code"].str.match(COMMUNE_CODE_RE)]


def load_prices(
    query_prices_fn,
    query_prices_rollup_fn,
    level: str,
    year: int,
    property_type: str,
) -> tuple[pd.DataFrame, str | None]:
    direct = query_prices_fn(level, year, property_type)
    if not direct.empty:
        return direct, None

    if level == "city":
        return keep_commune_codes_only(query_prices_fn("city", year, property_type)), None

    rolled = query_prices_rollup_fn(level, year, property_type)
    if rolled.empty:
        return rolled, None

    note = (
        f"Niveau **{level}** : agrégation SQL depuis les communes "
        "(Spark n'a écrit que le niveau city en base)."
    )
    return rolled, note


def load_demographics(
    query_demo_fn,
    query_demo_rollup_fn,
    level: str,
    year: int,
) -> pd.DataFrame:
    direct = query_demo_fn(level, year)
    if not direct.empty:
        return direct

    if level == "city":
        return keep_commune_codes_only(query_demo_fn("city", year))

    return query_demo_rollup_fn(level, year)
