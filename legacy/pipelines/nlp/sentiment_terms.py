from __future__ import annotations

import re
from collections import Counter
from typing import List, Tuple

import numpy as np


FRENCH_STOPWORDS = {
    "de", "la", "le", "les", "des", "du", "un", "une", "et", "en", "pour", "avec",
    "sur", "au", "aux", "par", "dans", "que", "qui", "ne", "pas", "plus", "ou",
    "est", "sont", "je", "tu", "il", "elle", "nous", "vous", "ils", "elles",
    "ce", "ces", "cette", "ca", "tres", "trop",
}

POSITIVE_LEXICON_FR = {
    "bien", "super", "excellent", "parfait", "magnifique", "agreable", "calme",
    "propre", "spacieux", "lumineux", "recommande", "adorable", "sympa",
    "confortable", "tranquille", "paisible", "famille", "jardin", "centre",
    "metro", "transport",
}

NEGATIVE_LEXICON_FR = {
    "bruit", "bruyant", "sale", "mauvais", "nul", "horrible", "cher", "petit",
    "etroite", "insalubre", "danger", "pollution", "travaux", "odeur",
}


def tokenize_words(text: str) -> List[str]:
    if not isinstance(text, str):
        return []
    words = re.findall(r"[a-zA-ZÀ-ÖØ-öø-ÿ']{2,}", text.lower())
    return [w for w in words if w not in FRENCH_STOPWORDS]


def update_term_counter(counter: Counter, texts: List[str]) -> None:
    for t in texts:
        counter.update(tokenize_words(t))


def counter_to_top_terms(counter: Counter, *, top_n: int = 30) -> List[dict]:
    return [{"term": term, "freq": int(freq)} for term, freq in counter.most_common(top_n)]


def top_terms(texts: List[str], *, top_n: int = 30) -> List[dict]:
    counter: Counter = Counter()
    update_term_counter(counter, texts)
    return counter_to_top_terms(counter, top_n=top_n)


def compute_sentiment_scores_light(texts: List[str]) -> List[float]:
    scores: List[float] = []
    for text in texts:
        words = tokenize_words(text)
        if not words:
            scores.append(0.0)
            continue
        pos = sum(1 for w in words if w in POSITIVE_LEXICON_FR)
        neg = sum(1 for w in words if w in NEGATIVE_LEXICON_FR)
        if pos + neg == 0:
            scores.append(0.0)
        else:
            scores.append((pos - neg) / (pos + neg))
    return scores


def compute_sentiment_scores(
    texts: List[str],
    *,
    model_name: str,
    batch_size: int = 16,
    clf=None,
) -> List[float]:
    if not texts:
        return []

    if clf is None:
        from transformers import pipeline

        clf = pipeline("sentiment-analysis", model=model_name)

    results: List[dict] = []
    max_len = getattr(getattr(clf, "tokenizer", None), "model_max_length", 512)
    if not isinstance(max_len, int) or max_len <= 0 or max_len > 4096:
        max_len = 512

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        results.extend(clf(batch, truncation=True, max_length=max_len))

    scores = []
    for r in results:
        label = str(r.get("label", "")).lower()
        score = float(r.get("score", 0.0))
        if "pos" in label:
            scores.append(+score)
        elif "neg" in label:
            scores.append(-score)
        else:
            scores.append(0.0)
    return scores


def aggregate_sentiment(texts: List[str], *, model_name: str) -> Tuple[float, int]:
    scores = compute_sentiment_scores(texts, model_name=model_name)
    if not scores:
        return 0.0, 0
    return float(np.mean(scores)), int(len(scores))
