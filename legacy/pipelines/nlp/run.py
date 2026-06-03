"""
NLP Inside Airbnb -> MongoDB.

Architecture volume :
  1) Telechargement (lourd, une fois) : --download-only
  2) Traitement par chunks (RAM stable) : lecture csv.gz par morceaux

Modes :
  light        — lexique FR, pas de PyTorch (tout le fichier en streaming)
  transformers — modele Hugging Face (RAM elevee, limiter max_texts_per_city)
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path

import yaml
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError

from .inside_airbnb_downloader import download_reviews_csv_for_city
from .sentiment_terms import counter_to_top_terms, compute_sentiment_scores, compute_sentiment_scores_light
from .stream_process import process_reviews_file


def load_config(config_path: str) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def mongo_collection(cfg: dict):
    mongo_host = os.getenv("MONGO_HOST", "localhost")
    mongo_port = int(os.getenv("MONGO_PORT", "27017"))
    client = MongoClient(host=mongo_host, port=mongo_port, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except ServerSelectionTimeoutError:
        if mongo_host == "mongo":
            client = MongoClient(host="localhost", port=mongo_port, serverSelectionTimeoutMS=5000)
            client.admin.command("ping")
        else:
            raise
    col = client[cfg["mongo"]["db_name"]]["nlp_sentiment"]
    col.create_index([("level", 1), ("insee_code", 1), ("year", 1), ("source", 1)], unique=True)
    col.create_index([("updated_at", -1)])
    return col


def build_score_fn(mode: str, model_name: str, batch_size: int):
    if mode == "light":
        print("[NLP] Mode LIGHT — streaming complet sans PyTorch (volume OK).")
        return compute_sentiment_scores_light

    print("[NLP] Mode TRANSFORMERS — PyTorch + modele (RAM elevee, utiliser max_texts_per_city).")
    from transformers import XLMRobertaTokenizer, pipeline

    tokenizer = XLMRobertaTokenizer.from_pretrained(model_name)
    clf = pipeline(
        "sentiment-analysis",
        model=model_name,
        tokenizer=tokenizer,
        device=-1,
    )
    max_len = getattr(tokenizer, "model_max_length", 512)
    if not isinstance(max_len, int) or max_len <= 0 or max_len > 4096:
        max_len = 512

    def _score(texts: list[str]) -> list[float]:
        return compute_sentiment_scores(
            texts, model_name=model_name, batch_size=batch_size, clf=clf
        )

    return _score


def main() -> None:
    parser = argparse.ArgumentParser(description="HOMEPEDIA NLP — Inside Airbnb")
    parser.add_argument("--config", default="config/settings.yaml")
    parser.add_argument(
        "--mode",
        choices=["light", "transformers"],
        help="light = streaming gros volume ; transformers = modele (RAM)",
    )
    parser.add_argument("--download-only", action="store_true", help="Telecharge les CSV uniquement")
    parser.add_argument("--skip-download", action="store_true", help="Utilise les fichiers deja presents")
    parser.add_argument("--city", help="Une seule ville (paris, lyon, bordeaux)")
    args = parser.parse_args()

    cfg = load_config(args.config)
    nlp_cfg = cfg.get("nlp") or {}
    mode = (args.mode or os.getenv("HOMEPEDIA_NLP_MODE") or nlp_cfg.get("mode", "light")).lower()

    local_data_dir = Path(cfg["paths"]["local_data_dir"])
    raw_text_dir = local_data_dir / "raw" / "inside_airbnb"

    cities = [args.city] if args.city else cfg["project"]["text_cities_poc"]
    overrides = cfg["project"].get("city_insee_overrides", {})

    chunk_size = int(os.getenv("HOMEPEDIA_NLP_CHUNK_SIZE", nlp_cfg.get("chunk_size", 50_000)))
    max_texts = int(os.getenv("HOMEPEDIA_NLP_MAX_TEXTS_PER_CITY", nlp_cfg.get("max_texts_per_city", 0)))
    min_text_chars = int(os.getenv("HOMEPEDIA_NLP_MIN_TEXT_CHARS", nlp_cfg.get("min_text_chars", 120)))
    batch_size = int(os.getenv("HOMEPEDIA_NLP_BATCH_SIZE", nlp_cfg.get("batch_size", 8)))
    model_name = nlp_cfg.get("sentiment_model", {}).get("name", "cardiffnlp/twitter-xlm-roberta-base-sentiment")

    if mode == "transformers" and max_texts == 0:
        print(
            "[NLP] ATTENTION: mode transformers sans limite = tres long et beaucoup de RAM.\n"
            "        Pour traiter tout Paris: preferez --mode light\n"
            "        Ou fixez HOMEPEDIA_NLP_MAX_TEXTS_PER_CITY=20000"
        )

    col = None if args.download_only else mongo_collection(cfg)
    score_fn = None if args.download_only else build_score_fn(mode, model_name, batch_size)

    for city in cities:
        city = str(city).lower().strip()
        if city not in overrides:
            print(f"[NLP] city={city} sans code INSEE. Skip.")
            continue

        insee_code = str(overrides[city]).strip()
        city_out_dir = raw_text_dir / city
        city_out_dir.mkdir(parents=True, exist_ok=True)

        if not args.skip_download:
            print(f"[NLP] === {city.upper()} — telechargement (peut prendre 10-30 min pour Paris) ===")
            reviews_file = download_reviews_csv_for_city(city, city_out_dir)
            size_mb = reviews_file.stat().st_size / (1024 * 1024)
            print(f"[NLP] Fichier local: {reviews_file} ({size_mb:.1f} Mo)")
        else:
            from .inside_airbnb_downloader import download_reviews_csv_for_city as _find

            reviews_file = _find(city, city_out_dir)

        if args.download_only:
            continue

        print(f"[NLP] === {city.upper()} — traitement streaming (chunk={chunk_size:,}) ===")
        by_year = process_reviews_file(
            reviews_file,
            min_text_chars=min_text_chars,
            max_texts_total=max_texts,
            chunk_size=chunk_size,
            score_fn=score_fn,
        )

        for year, acc in sorted(by_year.items()):
            doc = {
                "level": "city",
                "insee_code": insee_code,
                "city_name": city,
                "year": int(year),
                "language": "fr",
                "sentiment_avg": acc.sentiment_avg,
                "sentiment_count": acc.score_count,
                "top_terms": counter_to_top_terms(acc.term_counter, top_n=30),
                "source": "Inside Airbnb (POC)",
                "nlp_mode": mode,
                "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
            col.update_one(
                {
                    "level": doc["level"],
                    "insee_code": doc["insee_code"],
                    "year": doc["year"],
                    "source": doc["source"],
                },
                {"$set": doc},
                upsert=True,
            )
            print(
                f"[NLP]   Mongo year={year} | sentiment={acc.sentiment_avg:.3f} | "
                f"n={acc.score_count:,}"
            )

        print(f"[NLP] Termine: {city}")

    if args.download_only:
        print("[NLP] Telechargement seul termine. Relancez avec --skip-download pour traiter.")
    else:
        print("[NLP] Ingestion terminee -> Mongo nlp_sentiment.")


if __name__ == "__main__":
    main()
