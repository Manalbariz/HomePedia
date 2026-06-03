"""
HOMEPEDIA — exploration territoriale.

Carte choroplèthe + filtres = point d'entrée unique.
Les personas (Camille, Sofia, Maxime & Léa) ont inspiré des raccourcis « cas d'usage »,
pas des écrans séparés par personne.
"""
from __future__ import annotations

import json
import os
from decimal import Decimal
from pathlib import Path

import numpy as np
import copy

import pandas as pd
import plotly.express as px
import streamlit as st
import yaml
from wordcloud import WordCloud
import matplotlib.pyplot as plt
from pymongo import MongoClient

from scoring import add_sofia_liquidity, build_nlp_metrics
from data_loader import (
    SQL_DEPARTMENT_CODE,
    SQL_REGION_CODE,
    insee_department_from_commune,
    keep_commune_codes_only,
    load_demographics,
    load_prices,
)


st.set_page_config(page_title="HOMEPEDIA", layout="wide", page_icon="🏠")

GEO_DIR = Path("data") / "processed" / "geo"
CONFIG_PATH = Path("config/settings.yaml")
NLP_SOURCE = "Inside Airbnb (POC)"

INDICATORS = {
    "price_m2_avg": "Prix moyen au m² (€)",
    "price_m2_median": "Prix médian au m² (€)",
    "mutation_count": "Mutations DVF (liquidité)",
    "population": "Population",
    "median_age": "Âge médian",
    "sentiment_avg": "Ressenti locataires (Airbnb, POC)",
}

MAX_MAP_TERRITORIES = {"region": 25, "department": 120, "city": 600}

LEVEL_ZOOM = {
    "region": (46.5, 2.5, 5),
    "department": (46.5, 2.5, 5),
    "city": (46.8, 2.5, 7),
}


@st.cache_data(show_spinner=False)
def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _normalize_insee(code: str, level: str) -> str:
    code = str(code).strip().upper()
    if level in ("department", "region") and code.isdigit():
        return code.zfill(2) if len(code) <= 2 else code
    return code


@st.cache_data(ttl=3600, show_spinner=False)
def load_geojson_filtered(level: str, codes: tuple[str, ...]) -> dict | None:
    """Ne charge que les polygones des codes affichés (évite 100+ Mo à chaque clic)."""
    p = GEO_DIR / f"{level}.geojson"
    if not p.exists():
        return None
    codes_set = {_normalize_insee(c, level) for c in codes if c}
    if not codes_set:
        return {"type": "FeatureCollection", "features": []}

    try:
        import ijson

        features: list[dict] = []
        code_key: str | None = None
        with open(p, "rb") as f:
            for feat in ijson.items(f, "features.item"):
                props = feat.get("properties") or {}
                if code_key is None:
                    code_key = _infer_code_property_from_geojson(
                        {"features": [{"properties": props}]}
                    )
                if not code_key:
                    continue
                raw = str(props.get(code_key, "")).strip()
                if _normalize_insee(raw, level) in codes_set or raw in codes_set:
                    features.append(feat)
        if not features:
            return {"type": "FeatureCollection", "features": []}
        return compact_geojson({"type": "FeatureCollection", "features": features})
    except ImportError:
        if p.stat().st_size > 25_000_000:
            return None
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        ck = _infer_code_property_from_geojson(data) or "code_insee"
        return compact_geojson(filter_geojson_to_codes(data, codes_set, ck))


def _infer_code_property_from_geojson(geojson_data: dict) -> str | None:
    features = geojson_data.get("features", [])
    if not features:
        return None
    props = features[0].get("properties", {}) or {}
    for k in ("code_insee", "insee", "cog"):
        if k in props:
            return k
    for k in props:
        if "insee" in k.lower() or "code" in k.lower():
            return k
    return list(props.keys())[0] if props else None


def json_safe_value(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        return float(obj)
    if isinstance(obj, dict):
        return {k: json_safe_value(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [json_safe_value(v) for v in obj]
    return obj


def _round_coords(obj, precision: int = 4):
    if isinstance(obj, float):
        return round(obj, precision)
    if isinstance(obj, list):
        return [_round_coords(x, precision) for x in obj]
    return obj


def compact_geojson(geo: dict, precision: int = 4) -> dict:
    """Réduit la taille JSON (Streamlit limite ~200 Mo avec Folium)."""
    if not geo or not geo.get("features"):
        return geo
    try:
        import geopandas as gpd

        gdf = gpd.GeoDataFrame.from_features(geo["features"], crs="EPSG:4326")
        gdf["geometry"] = gdf.geometry.simplify(0.02, preserve_topology=True)
        out = json.loads(gdf.to_json())
        return json_safe_value(out)
    except Exception:
        compact = copy.deepcopy(geo)
        for feat in compact.get("features", []):
            geom = feat.get("geometry")
            if geom:
                feat["geometry"] = _round_coords(geom, precision)
        return json_safe_value(compact)


def filter_geojson_to_codes(geojson_data: dict, codes: set[str], code_key: str) -> dict:
    codes = {str(c) for c in codes}
    features = [
        f
        for f in geojson_data.get("features", [])
        if str((f.get("properties") or {}).get(code_key, "")).strip() in codes
    ]
    return {"type": "FeatureCollection", "features": features}


def coerce_sql_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Postgres (psycopg) renvoie parfois Decimal — Folium/JSON ne les accepte pas."""
    if df.empty:
        return df
    out = df.copy()
    for col in out.columns:
        if out[col].dtype == object:
            out[col] = out[col].map(
                lambda v: float(v)
                if isinstance(v, Decimal)
                else int(v)
                if isinstance(v, np.integer)
                else v
            )
        if pd.api.types.is_numeric_dtype(out[col]):
            out[col] = pd.to_numeric(out[col], errors="coerce")
    return out


def read_pg_sql(cfg: dict, sql: str, params: list | tuple | None = None) -> pd.DataFrame:
    with get_postgres_connection(cfg) as conn:
        cur = conn.cursor()
        cur.execute(sql, params or [])
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
    return coerce_sql_frame(pd.DataFrame(rows, columns=cols))


def get_postgres_connection(cfg: dict):
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = int(os.getenv("POSTGRES_PORT", "5433"))
    pg = cfg["postgres"]
    try:
        import psycopg

        return psycopg.connect(
            host=host,
            port=port,
            user=pg["user"],
            password=pg["password"],
            dbname=pg["db_name"],
            connect_timeout=5,
        )
    except Exception:
        import psycopg2

        return psycopg2.connect(
            host=host,
            port=port,
            user=pg["user"],
            password=pg["password"],
            dbname=pg["db_name"],
            connect_timeout=5,
        )


@st.cache_data(ttl=120, show_spinner=False)
def query_prices(level: str, year: int, property_type: str) -> pd.DataFrame:
    cfg = load_config()
    sql = """
    SELECT year, level, insee_code, property_type,
           price_m2_avg, price_m2_median, mutation_count
    FROM fact_prices_m2
    WHERE level=%s AND year=%s AND property_type=%s
    """
    return read_pg_sql(cfg, sql, [level, year, property_type])


@st.cache_data(ttl=120, show_spinner=False)
def query_prices_rollup(level: str, year: int, property_type: str) -> pd.DataFrame:
    if level not in ("department", "region"):
        return pd.DataFrame()
    group_sql = SQL_DEPARTMENT_CODE if level == "department" else SQL_REGION_CODE
    cfg = load_config()
    sql = f"""
    SELECT %s::int AS year, %s::text AS level,
           ({group_sql}) AS insee_code, %s::text AS property_type,
           AVG(price_m2_avg) AS price_m2_avg,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY price_m2_median) AS price_m2_median,
           SUM(mutation_count)::float AS mutation_count
    FROM fact_prices_m2
    WHERE level = 'city' AND year = %s AND property_type = %s
      AND insee_code ~ '^[0-9]{{5}}$'
    GROUP BY year, level, ({group_sql}), property_type
    """
    return read_pg_sql(
        cfg, sql, [year, level, property_type, year, property_type]
    )


@st.cache_data(ttl=120, show_spinner=False)
def query_demographics(level: str, year: int) -> pd.DataFrame:
    cfg = load_config()
    sql = """
    SELECT year, level, insee_code, population, median_age
    FROM fact_demographics
    WHERE level=%s AND year=%s
    """
    return read_pg_sql(cfg, sql, [level, year])


@st.cache_data(ttl=120, show_spinner=False)
def query_demographics_rollup(level: str, year: int) -> pd.DataFrame:
    if level not in ("department", "region"):
        return pd.DataFrame()
    group_sql = SQL_DEPARTMENT_CODE if level == "department" else SQL_REGION_CODE
    cfg = load_config()
    sql = f"""
    SELECT %s::int AS year, %s::text AS level,
           ({group_sql}) AS insee_code,
           SUM(population) AS population, AVG(median_age) AS median_age
    FROM fact_demographics
    WHERE level = 'city' AND year = %s AND insee_code ~ '^[0-9]{{5}}$'
    GROUP BY year, level, ({group_sql})
    """
    return read_pg_sql(cfg, sql, [year, level, year])


@st.cache_data(ttl=120, show_spinner=False)
def mongo_nlp_status() -> dict:
    cfg = load_config()
    try:
        client = MongoClient(
            host=os.getenv("MONGO_HOST", "localhost"),
            port=int(os.getenv("MONGO_PORT", "27017")),
            serverSelectionTimeoutMS=3000,
        )
        col = client[cfg["mongo"]["db_name"]]["nlp_sentiment"]
        n = col.count_documents({"source": NLP_SOURCE})
        cities = col.distinct("city_name", {"source": NLP_SOURCE})
        return {"ok": True, "count": n, "cities": sorted(c for c in cities if c)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@st.cache_data(ttl=120, show_spinner=False)
def load_poc_sentiment_table() -> pd.DataFrame:
    """Sentiments Airbnb pour Paris / Lyon / Bordeaux, rattachés au dept et à la commune."""
    cfg = load_config()
    overrides = (cfg.get("project") or {}).get("city_insee_overrides") or {}
    rows = []
    for city_name, commune_code in overrides.items():
        docs = query_mongo_city_sentiment(commune_code)
        if not docs:
            continue
        latest = max(docs, key=lambda x: x.get("year", 0))
        dep = insee_department_from_commune(commune_code)
        rows.append(
            {
                "insee_code_city": str(commune_code),
                "insee_code_department": dep.zfill(2) if dep.isdigit() and len(dep) <= 2 else dep,
                "city_name": city_name,
                "sentiment_avg": float(latest.get("sentiment_avg") or 0),
                "sentiment_count": int(latest.get("sentiment_count") or 0),
                "nlp_year": int(latest.get("year") or 0),
            }
        )
    return pd.DataFrame(rows)


def sentiment_commune_for_territory(code: str, level: str, poc_df: pd.DataFrame) -> str | None:
    if poc_df.empty:
        return None
    code = _normalize_insee(code, level)
    if level == "city":
        match = poc_df[poc_df["insee_code_city"] == code]
        return code if not match.empty else None
    if level == "department":
        match = poc_df[poc_df["insee_code_department"] == code]
        if not match.empty:
            return str(match.iloc[0]["insee_code_city"])
    return None


@st.cache_data(ttl=120, show_spinner=False)
def query_mongo_city_sentiment(insee_code: str) -> list[dict]:
    cfg = load_config()
    client = MongoClient(
        host=os.getenv("MONGO_HOST", "localhost"),
        port=int(os.getenv("MONGO_PORT", "27017")),
    )
    col = client[cfg["mongo"]["db_name"]]["nlp_sentiment"]
    docs = list(
        col.find({"level": "city", "insee_code": insee_code, "source": NLP_SOURCE})
    )
    for d in docs:
        d.pop("_id", None)
    return docs


@st.cache_data(ttl=120, show_spinner=False)
def build_exploration_frame(
    level: str,
    year: int,
    property_type: str,
    indicator: str,
    insee_prefix: str,
) -> tuple[pd.DataFrame, str | None]:
    df_price, rollup_note = load_prices(
        query_prices, query_prices_rollup, level, year, property_type
    )
    if df_price.empty:
        return df_price, rollup_note

    df = df_price.copy()
    df["insee_code"] = df["insee_code"].astype(str)
    if level == "city":
        df = keep_commune_codes_only(df)

    if indicator in ("population", "median_age"):
        df_demo = load_demographics(
            query_demographics, query_demographics_rollup, level, year
        )
        if df_demo.empty:
            return pd.DataFrame(), rollup_note
        df = df_demo.copy()
        df["insee_code"] = df["insee_code"].astype(str)
        if level == "city":
            df = keep_commune_codes_only(df)
    else:
        df_demo = load_demographics(
            query_demographics, query_demographics_rollup, level, year
        )
        if not df_demo.empty:
            df_demo["insee_code"] = df_demo["insee_code"].astype(str)
            df = df.merge(
                df_demo[["insee_code", "population", "median_age"]],
                on="insee_code",
                how="left",
            )

    if insee_prefix.strip():
        prefixes = tuple(p.strip() for p in insee_prefix.replace(" ", "").split(",") if p.strip())
        if prefixes:
            df = df[df["insee_code"].str.startswith(prefixes)]

    if level == "department" and "mutation_count" in df.columns:
        df = add_sofia_liquidity(df)

    poc_sent = load_poc_sentiment_table()
    if not poc_sent.empty:
        if level == "city":
            df = df.merge(
                poc_sent[["insee_code_city", "sentiment_avg", "city_name"]].rename(
                    columns={"insee_code_city": "insee_code"}
                ),
                on="insee_code",
                how="left",
            )
        elif level == "department":
            dep_sent = (
                poc_sent.groupby("insee_code_department", as_index=False)["sentiment_avg"]
                .mean()
                .rename(columns={"insee_code_department": "insee_code"})
            )
            df = df.merge(dep_sent, on="insee_code", how="left")

    if indicator not in df.columns:
        return pd.DataFrame(), rollup_note

    df = df[df[indicator].notna()].copy()
    return df, rollup_note


def apply_use_case_preset(case_key: str, cases: dict) -> None:
    preset = cases.get(case_key) or {}
    st.session_state["level"] = preset.get("level", "department")
    st.session_state["property_type"] = preset.get("property_type", "apartments")
    st.session_state["indicator"] = preset.get("indicator", "price_m2_avg")
    st.session_state["insee_prefix"] = preset.get("insee_prefix", "")


def render_territory_detail(code: str, row: pd.Series, indicator: str, level: str) -> None:
    st.subheader(f"Territoire sélectionné — `{code}`")
    label = INDICATORS.get(indicator, indicator)
    if indicator in row.index and pd.notna(row[indicator]):
        if indicator in ("price_m2_avg", "price_m2_median"):
            st.metric(label, f"{row[indicator]:,.0f} €/m²")
        elif indicator == "population":
            st.metric(label, f"{int(row[indicator]):,}")
        else:
            st.metric(label, row[indicator])

    cols = st.columns(3)
    extras = [
        ("price_m2_avg", "Prix moyen"),
        ("price_m2_median", "Prix médian"),
        ("mutation_count", "Mutations"),
        ("population", "Population"),
        ("median_age", "Âge médian"),
        ("sentiment_avg", "Ressenti Airbnb"),
    ]
    for i, (col_name, col_label) in enumerate(extras):
        if col_name in row.index and col_name != indicator and pd.notna(row.get(col_name)):
            with cols[i % 3]:
                val = row[col_name]
                if col_name in ("price_m2_avg", "price_m2_median"):
                    st.metric(col_label, f"{val:,.0f} €/m²")
                elif col_name == "population":
                    st.metric(col_label, f"{int(val):,}")
                else:
                    st.metric(col_label, val)

    render_sentiment_panel(code, level)


def render_sentiment_panel(code: str, level: str) -> None:
    poc_df = load_poc_sentiment_table()
    commune = sentiment_commune_for_territory(code, level, poc_df)
    if not commune:
        st.markdown("**Ressenti locataires (Inside Airbnb)**")
        st.caption(
            "POC : avis analysés pour **Paris (75)**, **Lyon (69)** et **Bordeaux (33)**. "
            "Passez en échelle **commune** ou sélectionnez ces départements. "
            "Lancez `python -m pipelines.nlp.run --skip-download --mode light` si Mongo est vide."
        )
        nlp = mongo_nlp_status()
        if not nlp.get("ok"):
            st.warning(f"Mongo inaccessible : {nlp.get('error', '?')}")
        elif nlp.get("count", 0) == 0:
            st.warning("Collection `nlp_sentiment` vide — relancez le pipeline NLP.")
        return

    docs = query_mongo_city_sentiment(commune)
    if not docs:
        st.caption(f"Aucun document NLP pour la commune {commune}.")
        return

    latest = max(docs, key=lambda x: x.get("year", 0))
    city_label = latest.get("city_name", commune)
    if level != "city":
        st.caption(f"Proxy via commune **{city_label}** (`{commune}`) — POC Inside Airbnb.")

    st.markdown("**Ressenti locataires (proxy qualité de vie)**")
    st.metric("Sentiment moyen", f"{latest.get('sentiment_avg', 0):.3f}")
    st.caption(f"{int(latest.get('sentiment_count', 0)):,} avis · vintage NLP {latest.get('year', '?')}")

    terms = latest.get("top_terms") or []
    if terms:
        freq = {t["term"]: int(t.get("freq", 1)) for t in terms[:50] if t.get("term")}
        wc = WordCloud(width=500, height=220, background_color="white").generate_from_frequencies(freq)
        fig, ax = plt.subplots(figsize=(6, 2.5))
        ax.imshow(wc, interpolation="bilinear")
        ax.axis("off")
        st.pyplot(fig, use_container_width=True)
        calm_kw = ["calme", "transport", "métro", "école", "famille", "ville"]
        hits = build_nlp_metrics({commune: docs}, calm_keywords=calm_kw).iloc[0]
        st.caption(
            f"Termes « calme/famille » : {int(hits.get('calm_hits', 0))} · "
            f"« transport » : {int(hits.get('transport_hits', 0))} · "
            f"« activités » : {int(hits.get('activity_hits', 0))}"
        )


def render_map_block(
    df: pd.DataFrame,
    geojson_data: dict,
    indicator: str,
    year: int,
    level: str,
) -> None:
    """Carte Plotly (léger) — évite le plafond Streamlit 200 Mo de Folium."""
    code_key = _infer_code_property_from_geojson(geojson_data)
    if not code_key:
        st.error("GeoJSON : propriété code INSEE introuvable.")
        return

    n = len(df)
    limit = MAX_MAP_TERRITORIES.get(level, 500)
    if n > limit:
        st.warning(
            f"Trop de territoires ({n}) pour la carte (max {limit}). "
            "Affinez le **préfixe INSEE** ou passez à l'échelle **département**."
        )
        st.dataframe(df.sort_values(indicator, ascending=False).head(50), use_container_width=True)
        return

    map_data = df.copy()
    if indicator in map_data.columns:
        map_data[indicator] = pd.to_numeric(map_data[indicator], errors="coerce")
    map_data = map_data.dropna(subset=[indicator])
    map_data[indicator] = map_data[indicator].astype(float)

    codes = set(map_data["insee_code"].tolist())
    geo_filtered = compact_geojson(
        filter_geojson_to_codes(geojson_data, codes, code_key)
    )
    if not geo_filtered.get("features"):
        st.warning(
            "Pas de géométrie pour ce filtre. Lancez `.\\scripts\\run_geo.ps1` "
            "ou affinez le préfixe INSEE."
        )
        st.dataframe(map_data.sort_values(indicator, ascending=False).head(30), use_container_width=True)
        return

    fig = px.choropleth(
        map_data,
        geojson=geo_filtered,
        locations="insee_code",
        featureidkey=f"properties.{code_key}",
        color=indicator,
        color_continuous_scale="YlOrRd",
        scope="europe",
        labels={indicator: INDICATORS.get(indicator, indicator), "insee_code": "INSEE"},
        title=f"{INDICATORS.get(indicator, indicator)} — {level} (DVF {year})",
    )
    fig.update_geos(fitbounds="locations", visible=False)
    fig.update_layout(margin=dict(l=0, r=0, t=40, b=0), height=560)

    event = st.plotly_chart(
        fig,
        use_container_width=True,
        key=f"plotly_map_{level}_{indicator}",
        on_select="rerun",
        selection_mode="points",
    )
    if event and getattr(event, "selection", None) and event.selection.points:
        pt = event.selection.points[0]
        loc = pt.get("location") or (pt.get("customdata") or [None])[0]
        if loc:
            st.session_state["selected_insee"] = _normalize_insee(str(loc), level)


@st.cache_data(ttl=120, show_spinner=False)
def resolve_latest_vintage(property_type: str) -> int:
    """
    Dernière vintage DVF en base (= « jusqu'à maintenant » côté données publiques).
    Pas de filtre année en UI : on compare toujours le snapshot le plus récent ingéré.
    """
    cfg = load_config()
    fallback = int((cfg.get("dashboard") or {}).get("fallback_year", 2023))
    try:
        sql = """
        SELECT MAX(year) AS year FROM fact_prices_m2
        WHERE level='city' AND property_type=%s
        """
        row = read_pg_sql(cfg, sql, [property_type])
        if not row.empty and pd.notna(row["year"].iloc[0]):
            return int(row["year"].iloc[0])
    except Exception:
        pass
    return fallback


@st.cache_data(ttl=120, show_spinner=False)
def db_status() -> dict:
    cfg = load_config()
    try:
        levels = read_pg_sql(
            cfg, "SELECT level, COUNT(*) AS n FROM fact_prices_m2 GROUP BY level"
        )
        return {"ok": True, "levels": levels.set_index("level")["n"].to_dict()}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# --- Interface ---
cfg = load_config()
use_cases = (cfg.get("dashboard") or {}).get("use_cases") or {
    "explore": {"label": "Explorer librement", "hint": "", "level": "department", "property_type": "apartments", "indicator": "price_m2_avg"}
}
case_keys = list(use_cases.keys())

st.title("HOMEPEDIA")
st.markdown(
    "Explorez un territoire via la **carte** et les **filtres** — puis déduisez prix, marché, population et ressenti. "
    "_Les personas du projet (comparer des villes, investir, s'installer près du travail) "
    "sont des exemples de parcours, pas des modes séparés._"
)

# Sidebar : filtres (toujours visibles)
st.sidebar.header("Filtres")
st.sidebar.caption("La carte se met à jour selon vos choix.")

case_key = st.sidebar.selectbox(
    "Cas d'usage (raccourci)",
    case_keys,
    format_func=lambda k: use_cases[k].get("label", k),
    key="use_case",
)
hint = use_cases.get(case_key, {}).get("hint", "")
if hint:
    st.sidebar.info(hint)

if st.sidebar.button("Appliquer les filtres du cas d'usage", use_container_width=True):
    apply_use_case_preset(case_key, use_cases)

if "level" not in st.session_state:
    apply_use_case_preset(case_key, use_cases)

level = st.sidebar.selectbox(
    "Échelle géographique",
    ["region", "department", "city"],
    key="level",
)

property_type = st.sidebar.selectbox(
    "Type de bien",
    ["apartments", "houses", "commercial", "houses_apartments"],
    format_func=lambda x: {
        "apartments": "Appartements",
        "houses": "Maisons",
        "commercial": "Commercial",
        "houses_apartments": "Maisons + appartements",
    }.get(x, x),
    key="property_type",
)

data_year = resolve_latest_vintage(property_type)
st.sidebar.caption(
    f"Marché & prix : **dernières stats DVF** ingérées (vintage {data_year}, pas du temps réel)."
)

status = db_status()
if status.get("ok"):
    lv = status.get("levels", {})
    if lv.get("city") and not lv.get("department"):
        st.sidebar.caption("Base : communes en SQL ; dépt./région agrégés à l'affichage.")

nlp_status = mongo_nlp_status()
if nlp_status.get("ok") and nlp_status.get("count", 0) > 0:
    st.sidebar.caption(
        f"Ressenti Airbnb : {', '.join(nlp_status.get('cities', []))} "
        f"({nlp_status['count']} doc. Mongo)."
    )
elif nlp_status.get("ok"):
    st.sidebar.warning("Mongo OK mais NLP vide — relancez `pipelines.nlp.run`.")
else:
    st.sidebar.caption("Mongo NLP : non joignable (Docker + pipeline NLP).")

indicator = st.sidebar.selectbox(
    "Indicateur sur la carte",
    list(INDICATORS.keys()),
    format_func=lambda k: INDICATORS[k],
    key="indicator",
)

insee_prefix = st.sidebar.text_input(
    "Filtrer par préfixe INSEE",
    placeholder="Ex. 69, 75 ou 33 (plusieurs : 69,01,38)",
    key="insee_prefix",
    help="Utile au niveau commune : agglo Lyon (69), IDF (75,77,78…).",
)

if st.sidebar.button("Actualiser les données (vider cache)", use_container_width=True):
    st.cache_data.clear()
    st.rerun()

st.sidebar.divider()
st.sidebar.markdown("**Comparer des territoires** (surbrillance bleue)")
st.sidebar.caption("Choisissez des codes INSEE à mettre en évidence sur la carte.")

filter_key = (level, data_year, property_type, indicator, insee_prefix.strip())
if st.session_state.get("_filter_key") != filter_key:
    st.session_state.pop("selected_insee", None)

df, rollup_note = build_exploration_frame(
    level, data_year, property_type, indicator, insee_prefix
)
st.session_state["_filter_key"] = filter_key

if rollup_note:
    st.info(rollup_note)

if df.empty:
    st.error(
        f"Aucune donnée pour ces filtres (vintage {data_year}). Vérifiez le **type de bien**, "
        "le **préfixe INSEE** (vide = tout voir), ou lancez `ingestion` + `Spark`."
    )
    if status.get("ok"):
        st.json(status.get("levels"))
    st.stop()

code_options = sorted(df["insee_code"].unique().tolist())
max_pick = 500 if level == "city" else 120
if len(code_options) > max_pick:
    st.sidebar.caption(f"Liste limitée aux {max_pick} premiers codes (tri par indicateur).")
    top_codes = df.nlargest(max_pick, indicator)["insee_code"].astype(str).tolist()
    pick_from = top_codes
else:
    pick_from = code_options

highlight_list = st.sidebar.multiselect(
    "Territoires à comparer",
    options=pick_from,
    default=[],
    key="highlight",
)
highlight = set(highlight_list)

df["insee_code"] = df["insee_code"].astype(str).map(lambda c: _normalize_insee(c, level))
code_tuple = tuple(sorted(df["insee_code"].unique().tolist()))
geo = load_geojson_filtered(level, code_tuple)
if geo is None:
    st.error(
        f"GeoJSON manquant ou trop lourd : `data/processed/geo/{level}.geojson` — "
        "`pip install ijson` puis `python -m pipelines.ingest.run --geo-only`"
    )
    st.stop()

# Layout : carte principale + panneau latéral
map_col, detail_col = st.columns([2, 1])

with map_col:
    st.subheader("Carte — lisez le territoire, puis affinez les filtres")
    render_map_block(df, geo, indicator, data_year, level)

with detail_col:
    st.subheader("Détail territoire")
    st.caption("Cliquez une zone sur la carte (Plotly) ou choisissez un code ci-dessous.")
    selected_code = st.selectbox("Code INSEE", [""] + code_options[: min(len(code_options), 200)], key="manual_code")

    active = st.session_state.get("selected_insee") or (selected_code or None)
    if active:
        active = _normalize_insee(active, level)
    codes_in_df = set(df["insee_code"].tolist())
    if active and active in codes_in_df:
        row = df.loc[df["insee_code"] == active].iloc[0]
        render_territory_detail(active, row, indicator, level)
    elif active:
        st.warning(f"Code `{active}` : pas de données pour ces filtres (essayez un autre territoire).")
    elif highlight_list:
        st.markdown("**Comparaison rapide**")
        sub = df[df["insee_code"].isin(highlight_list)].sort_values(indicator, ascending=False)
        show = ["insee_code", indicator]
        for c in ("price_m2_avg", "price_m2_median", "mutation_count", "population"):
            if c in sub.columns and c not in show:
                show.append(c)
        st.dataframe(sub[show], use_container_width=True, hide_index=True)
    else:
        st.info(
            "Cliquez sur la carte ou sélectionnez un territoire. "
            "Ressenti Airbnb : départements **69, 75, 33** ou échelle **commune**."
        )

# Tableau sous la carte — tri par indicateur
st.divider()
st.subheader("Tableau — tous les territoires du filtre")
table = df.sort_values(indicator, ascending=False)
rename = {
    "insee_code": "Code INSEE",
    "price_m2_avg": "Prix moyen (€/m²)",
    "price_m2_median": "Prix médian (€/m²)",
    "mutation_count": "Mutations",
    "population": "Population",
    "median_age": "Âge médian",
}
if "indice_liquidite" in table.columns:
    rename["indice_liquidite"] = "Indice liquidité (0–100)"
if "sentiment_avg" in table.columns:
    rename["sentiment_avg"] = "Ressenti Airbnb (POC)"
display_cols = [c for c in rename if c in table.columns]
st.dataframe(
    table[display_cols].head(100).rename(columns=rename),
    use_container_width=True,
    hide_index=True,
)
st.caption(
    "Personas → cas d'usage : **comparer** = plusieurs territoires + prix/population ; "
    "**investir** = médiane & mutations ; **s'installer** = commune + maisons + filtre géographique. "
    "Tout se règle ici par filtres, sans changer d'écran."
)
