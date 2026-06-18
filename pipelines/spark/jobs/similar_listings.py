"""
Calcule les annonces similaires (ville, prix, surface, distance) via PySpark.

Usage:
  spark-submit --master 'local[*]' similar_listings.py \\
    --input /data/listings.snapshot.json \\
    --output /data/similar-index.json
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from pyspark.sql import SparkSession, functions as F


def extract_city(address: str) -> str:
    tail = address.split(",")[-1].strip() if "," in address else address
    lower = tail.lower()
    cities = (
        "paris",
        "lyon",
        "bordeaux",
        "mérignac",
        "merignac",
        "marseille",
        "nantes",
        "lille",
        "toulouse",
        "saint-malo",
        "strasbourg",
    )
    for city in cities:
        if city in lower:
            if city in ("mérignac", "merignac"):
                return "bordeaux"
            return city.replace("mérignac", "bordeaux").replace("merignac", "bordeaux")
    return lower


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Fichier JSON listings (array)")
    parser.add_argument("--output", required=True, help="Fichier JSON index similarité")
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--max-score", type=float, default=1.2)
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        raise SystemExit(f"Input introuvable: {input_path}")

    spark = (
        SparkSession.builder.appName("homepedia-similar-listings")
        .master("local[*]")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    df = spark.read.json(str(input_path))
    city_udf = F.udf(extract_city)
    df = df.withColumn("city", city_udf(F.col("address")))

    a = df.alias("a")
    b = df.alias("b")
    pairs = a.join(
        b,
        (F.col("a.city") == F.col("b.city")) & (F.col("a.id") != F.col("b.id")),
    )

    pairs = pairs.withColumn(
        "price_delta",
        F.abs(F.col("b.price") - F.col("a.price"))
        / F.greatest(F.col("a.price"), F.lit(1.0)),
    ).withColumn(
        "surface_delta",
        F.abs(F.col("b.surface") - F.col("a.surface"))
        / F.greatest(F.col("a.surface"), F.lit(1.0)),
    ).withColumn(
        "dist_km",
        F.sqrt(
            F.pow((F.col("b.lat") - F.col("a.lat")) * F.lit(111.0), 2)
            + F.pow((F.col("b.lon") - F.col("a.lon")) * F.lit(85.0), 2)
        ),
    ).withColumn(
        "score",
        F.col("price_delta") * F.lit(2.0)
        + F.col("surface_delta")
        + F.col("dist_km") * F.lit(0.05),
    )

    pairs = pairs.filter(F.col("score") < F.lit(args.max_score))

    from pyspark.sql.window import Window

    w = Window.partitionBy("a.id").orderBy("score")
    ranked = (
        pairs.withColumn("rn", F.row_number().over(w))
        .filter(F.col("rn") <= args.limit)
        .select(F.col("a.id").alias("base_id"), F.col("b.id").alias("similar_id"), "score")
        .orderBy("base_id", "score")
    )

    rows = ranked.collect()
    similar: dict[str, list[str]] = {}
    for row in rows:
        similar.setdefault(row["base_id"], []).append(row["similar_id"])

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "listingCount": df.count(),
        "similar": similar,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[spark] similar index -> {output_path} ({len(similar)} listings)")
    spark.stop()


if __name__ == "__main__":
    main()
