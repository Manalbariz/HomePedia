"""Scores territoriaux pour les parcours personas (POC, données disponibles)."""
from __future__ import annotations

from typing import Any

import pandas as pd


def _percentile_rank(series: pd.Series, value: float, *, higher_is_better: bool) -> float:
    s = series.dropna()
    if s.empty or pd.isna(value):
        return 50.0
    pct = float((s <= value).mean() * 100.0) if higher_is_better else float((s >= value).mean() * 100.0)
    return max(0.0, min(100.0, pct))


def _term_hits(terms: list[dict], keywords: list[str]) -> int:
    if not terms or not keywords:
        return 0
    keys = {k.lower() for k in keywords}
    hits = 0
    for t in terms:
        term = str(t.get("term", "")).lower()
        if any(k in term for k in keys):
            hits += int(t.get("freq", 1))
    return hits


def build_nlp_metrics(docs_by_code: dict[str, list[dict]], *, calm_keywords: list[str]) -> pd.DataFrame:
    rows: list[dict[str, Any]] = []
    transport_kw = ["métro", "metro", "transport", "gare", "tram", "bus", "métro"]
    activity_kw = ["restaurant", "café", "cafe", "centre", "ville", "animé", "anime", "culture"]
    for code, docs in docs_by_code.items():
        if not docs:
            rows.append(
                {
                    "insee_code": str(code),
                    "sentiment_avg": None,
                    "calm_hits": 0,
                    "transport_hits": 0,
                    "activity_hits": 0,
                    "has_nlp": False,
                }
            )
            continue
        latest = sorted(docs, key=lambda x: x.get("year", 0), reverse=True)[0]
        terms = latest.get("top_terms") or []
        rows.append(
            {
                "insee_code": str(code),
                "sentiment_avg": latest.get("sentiment_avg"),
                "calm_hits": _term_hits(terms, calm_keywords),
                "transport_hits": _term_hits(terms, transport_kw),
                "activity_hits": _term_hits(terms, activity_kw),
                "has_nlp": True,
            }
        )
    return pd.DataFrame(rows)


def add_camille_scores(
    df: pd.DataFrame,
    nlp_df: pd.DataFrame,
    *,
    weights: dict[str, float],
) -> pd.DataFrame:
    """Score 0–100 : accessibilité prix, dynamisme, ressenti, activité marché."""
    out = df.copy()
    w = weights or {}
    w_price = float(w.get("prix", 0.35))
    w_pop = float(w.get("population", 0.20))
    w_sent = float(w.get("sentiment", 0.30))
    w_market = float(w.get("marche", 0.15))
    total_w = w_price + w_pop + w_sent + w_market
    if total_w <= 0:
        total_w = 1.0

    if not nlp_df.empty:
        out = out.merge(nlp_df, on="insee_code", how="left")

    price = out["price_m2_avg"] if "price_m2_avg" in out.columns else pd.Series(dtype=float)
    pop = out["population"] if "population" in out.columns else pd.Series(dtype=float)
    mut = out["mutation_count"] if "mutation_count" in out.columns else pd.Series(dtype=float)

    out["score_prix"] = [
        _percentile_rank(price, v, higher_is_better=False) if "price_m2_avg" in out.columns else 50.0
        for v in price
    ]
    out["score_dynamisme"] = [
        _percentile_rank(pop, v, higher_is_better=True) if "population" in out.columns else 50.0 for v in pop
    ]
    out["score_marche"] = [
        _percentile_rank(mut, v, higher_is_better=True) if "mutation_count" in out.columns else 50.0 for v in mut
    ]

    sent_scores = []
    for _, row in out.iterrows():
        s = row.get("sentiment_avg")
        if pd.isna(s) or s is None:
            sent_scores.append(50.0)
        else:
            # sentiment approx [-1, 1] → 0–100
            sent_scores.append(max(0.0, min(100.0, (float(s) + 1.0) * 50.0)))
    out["score_ressenti"] = sent_scores

    out["score_global"] = (
        out["score_prix"] * w_price
        + out["score_dynamisme"] * w_pop
        + out["score_ressenti"] * w_sent
        + out["score_marche"] * w_market
    ) / total_w

    if "transport_hits" in out.columns and "activity_hits" in out.columns:
        t_max = max(float(out["transport_hits"].max() or 0), 1.0)
        a_max = max(float(out["activity_hits"].max() or 0), 1.0)
        out["proxy_transport"] = (out["transport_hits"] / t_max * 100).round(0)
        out["proxy_activites"] = (out["activity_hits"] / a_max * 100).round(0)
    return out.sort_values("score_global", ascending=False)


def add_sofia_liquidity(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    m = out["mutation_count"].max() if "mutation_count" in out.columns else 0
    if m and m > 0:
        out["indice_liquidite"] = (out["mutation_count"] / m * 100).round(1)
    else:
        out["indice_liquidite"] = 0.0
    med = out["price_m2_median"].median() if "price_m2_median" in out.columns else 1
    if med and med > 0:
        out["prix_vs_mediane_nationale"] = ((out["price_m2_median"] / med - 1) * 100).round(1)
    return out


def add_maxime_calm_scores(
    df: pd.DataFrame,
    nlp_df: pd.DataFrame,
    *,
    calm_keywords: list[str],
) -> pd.DataFrame:
    out = df.copy()
    if not nlp_df.empty:
        out = out.merge(nlp_df[["insee_code", "calm_hits", "sentiment_avg"]], on="insee_code", how="left")
    out["calm_hits"] = out.get("calm_hits", 0).fillna(0)

    mut = out["mutation_count"] if "mutation_count" in out.columns else pd.Series(0, index=out.index)
    price = out["price_m2_avg"] if "price_m2_avg" in out.columns else pd.Series(0, index=out.index)

    calm_nlp = []
    quiet_market = []
    affordable = []
    for _, row in out.iterrows():
        c_hits = float(row.get("calm_hits", 0) or 0)
        calm_nlp.append(min(100.0, c_hits * 12.0))
        quiet_market.append(
            _percentile_rank(mut, row.get("mutation_count"), higher_is_better=False)
        )
        affordable.append(_percentile_rank(price, row.get("price_m2_avg"), higher_is_better=False))

    out["score_calme_nlp"] = calm_nlp
    out["score_marche_discret"] = quiet_market
    out["score_prix_maison"] = affordable
    out["score_famille_calme"] = (
        out["score_calme_nlp"] * 0.45 + out["score_marche_discret"] * 0.35 + out["score_prix_maison"] * 0.20
    ).round(1)
    return out.sort_values("score_famille_calme", ascending=False)
