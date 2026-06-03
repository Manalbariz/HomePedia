"""Traitement streaming des reviews Inside Airbnb (gros fichiers .csv.gz)."""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterator, Optional

import pandas as pd

from .sentiment_terms import (
    compute_sentiment_scores,
    compute_sentiment_scores_light,
    update_term_counter,
)


TEXT_COLUMNS = [
    "comments", "comment", "review_text", "review", "text", "content",
    "comments_fr", "comments_en", "reviewContent",
]
DATE_COLUMNS = ["date", "review_date", "reviewDate"]


@dataclass
class YearAccumulator:
    score_sum: float = 0.0
    score_count: int = 0
    term_counter: Counter = field(default_factory=Counter)

    def add_scores(self, scores: list[float]) -> None:
        self.score_sum += float(sum(scores))
        self.score_count += len(scores)

    @property
    def sentiment_avg(self) -> float:
        if self.score_count == 0:
            return 0.0
        return self.score_sum / self.score_count


def detect_columns(sample: pd.DataFrame) -> tuple[Optional[str], Optional[str]]:
    text_col = next((c for c in TEXT_COLUMNS if c in sample.columns), None)
    date_col = next((c for c in DATE_COLUMNS if c in sample.columns), None)
    return text_col, date_col


def iter_review_chunks(
    reviews_file: Path,
    *,
    chunk_size: int,
) -> Iterator[pd.DataFrame]:
    compression = "gzip" if str(reviews_file).endswith(".gz") else None
    return pd.read_csv(
        reviews_file,
        compression=compression,
        chunksize=chunk_size,
        low_memory=True,
        encoding_errors="ignore",
    )


def process_reviews_file(
    reviews_file: Path,
    *,
    min_text_chars: int,
    max_texts_total: int,
    chunk_size: int,
    score_fn: Callable[[list[str]], list[float]],
    progress_every_chunks: int = 1,
) -> dict[int, YearAccumulator]:
    """
    Lit le fichier par morceaux (pas de chargement RAM complet).
    max_texts_total=0 => pas de limite.
    """
    sample = pd.read_csv(
        reviews_file,
        compression="gzip" if str(reviews_file).endswith(".gz") else None,
        nrows=500,
        low_memory=True,
        encoding_errors="ignore",
    )
    text_col, date_col = detect_columns(sample)
    if text_col is None:
        raise ValueError(f"Colonne texte introuvable. Colonnes: {list(sample.columns)[:40]}")

    by_year: dict[int, YearAccumulator] = defaultdict(YearAccumulator)
    total_texts = 0
    chunk_idx = 0

    for chunk in iter_review_chunks(reviews_file, chunk_size=chunk_size):
        chunk_idx += 1
        if date_col is None:
            chunk["__year"] = 0
        else:
            chunk["__year"] = pd.to_datetime(chunk[date_col], errors="coerce").dt.year.fillna(0).astype(int)

        chunk[text_col] = chunk[text_col].astype(str)
        chunk = chunk[chunk[text_col].str.len() >= min_text_chars]
        if chunk.empty:
            continue

        if max_texts_total > 0:
            remaining = max_texts_total - total_texts
            if remaining <= 0:
                break
            if len(chunk) > remaining:
                chunk = chunk.sample(n=remaining, random_state=42)

        for year, group in chunk.groupby("__year"):
            texts = group[text_col].tolist()
            y = int(year)
            acc = by_year[y]
            scores = score_fn(texts)
            acc.add_scores(scores)
            update_term_counter(acc.term_counter, texts)
            total_texts += len(texts)

        if chunk_idx % progress_every_chunks == 0:
            print(
                f"[NLP]   chunk {chunk_idx} | avis traites: {total_texts:,} | "
                f"annees: {sorted(by_year.keys())}"
            )

        if max_texts_total > 0 and total_texts >= max_texts_total:
            print(f"[NLP]   limite max_texts atteinte ({max_texts_total:,})")
            break

    print(f"[NLP]   total avis traites: {total_texts:,}")
    return dict(by_year)
