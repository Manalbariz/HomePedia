import argparse
import os
from pathlib import Path
from typing import Optional

from pyspark.sql import SparkSession
from pyspark.sql import functions as F


def load_yaml(config_path: str) -> dict:
    import yaml

    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _jdbc_url(cfg: dict) -> str:
    host = os.getenv("POSTGRES_HOST", "postgres")
    port = int(os.getenv("POSTGRES_PORT", "5432"))
    db = cfg["postgres"]["db_name"]
    return f"jdbc:postgresql://{host}:{port}/{db}"


def write_to_postgres(df, *, table: str, cfg: dict, mode: Optional[str] = None) -> None:
    if mode is None:
        mode = os.getenv("HOMEPEDIA_SPARK_WRITE_MODE", "append")
    props = {
        "user": cfg["postgres"]["user"],
        "password": cfg["postgres"]["password"],
        "driver": "org.postgresql.Driver",
    }
    writer = df.write
    if mode == "overwrite":
        writer = writer.option("truncate", "true")
    writer.jdbc(url=_jdbc_url(cfg), table=table, mode=mode, properties=props)


def weighted_avg_price(price_col: str, weight_col: str) -> F.Column:
    # sum(price * weight) / sum(weight)
    return F.sum(F.col(price_col) * F.col(weight_col)) / F.sum(F.col(weight_col))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="config/settings.yaml")
    args = parser.parse_args()

    cfg = load_yaml(args.config)
    app_name = cfg["spark"]["app_name"]

    spark = (
        SparkSession.builder.appName(app_name)
        # In POC, we keep the job generic.
        .getOrCreate()
    )

    # Entrées (POC) : Parquet générés par `pipelines.ingest`.
    local_data_dir = Path(cfg["paths"]["local_data_dir"])
    parquet_base = local_data_dir / "processed" / "parquet"
    dvf_prices_path = parquet_base / "dvf_prices"
    insee_demo_path = parquet_base / "insee_demographics"

    dvf_prices = spark.read.parquet(str(dvf_prices_path))
    insee_demo = spark.read.parquet(str(insee_demo_path))

    # Normalisation de types
    dvf_prices = dvf_prices.withColumn("year", F.col("year").cast("int"))
    dvf_prices = dvf_prices.withColumn("price_m2_avg", F.col("price_m2_avg").cast("double"))
    dvf_prices = dvf_prices.withColumn("price_m2_median", F.col("price_m2_median").cast("double"))
    dvf_prices = dvf_prices.withColumn("mutation_count", F.col("mutation_count").cast("double"))

    insee_demo = insee_demo.withColumn("year", F.col("year").cast("int"))
    insee_demo = insee_demo.withColumn("population", F.col("population").cast("double"))
    insee_demo = insee_demo.withColumn("median_age", F.col("median_age").cast("double"))

    # 1) Écriture des faits démographiques (city/department/region)
    demographics_fact = (
        insee_demo.select(
            F.col("year").alias("year"),
            F.col("level").alias("level"),
            F.col("insee_code").alias("insee_code"),
            F.col("population").alias("population"),
            F.col("median_age").alias("median_age"),
            F.lit("INSEE 7632446 (POC)").alias("source"),
        )
    )

    write_to_postgres(demographics_fact, table="fact_demographics", cfg=cfg, mode="append")

    # 2) Faits prix
    # City : DVF donne directement les prix par commune.
    dvf_city = dvf_prices.filter(F.col("level") == F.lit("city")).select(
        "year",
        "insee_code",
        "property_type",
        "price_m2_avg",
        "price_m2_median",
        "mutation_count",
    )

    # Mapping commune -> department/region via INSEE (city-level with dept/reg codes).
    insee_city_map = (
        insee_demo.filter(F.col("level") == F.lit("city"))
        .select(
            F.col("year").alias("year"),
            F.col("insee_code").alias("insee_code"),
            F.col("population").alias("population"),
            F.col("department_insee_code").alias("department_insee_code"),
            F.col("region_insee_code").alias("region_insee_code"),
        )
    )

    dvf_city_weighted = dvf_city.join(
        insee_city_map,
        on=["year", "insee_code"],
        how="inner",
    )

    # Department rollup
    prices_department = (
        dvf_city_weighted.filter(F.col("department_insee_code").isNotNull())
        .groupBy("year", "property_type", F.col("department_insee_code").alias("insee_code"))
        .agg(
            weighted_avg_price("price_m2_avg", "population").alias("price_m2_avg"),
            weighted_avg_price("price_m2_median", "population").alias("price_m2_median"),
            F.sum("mutation_count").alias("mutation_count"),
        )
        .withColumn("level", F.lit("department"))
        .select("year", "level", "insee_code", "property_type", "price_m2_avg", "price_m2_median", "mutation_count")
    )

    # Region rollup
    prices_region = (
        dvf_city_weighted.filter(F.col("region_insee_code").isNotNull())
        .groupBy("year", "property_type", F.col("region_insee_code").alias("insee_code"))
        .agg(
            weighted_avg_price("price_m2_avg", "population").alias("price_m2_avg"),
            weighted_avg_price("price_m2_median", "population").alias("price_m2_median"),
            F.sum("mutation_count").alias("mutation_count"),
        )
        .withColumn("level", F.lit("region"))
        .select("year", "level", "insee_code", "property_type", "price_m2_avg", "price_m2_median", "mutation_count")
    )

    prices_city = (
        dvf_city.select(
            "year",
            F.lit("city").alias("level"),
            "insee_code",
            "property_type",
            "price_m2_avg",
            "price_m2_median",
            "mutation_count",
        )
        .withColumn("mutation_count", F.col("mutation_count").cast("double"))
    )

    prices_fact = prices_city.unionByName(prices_department).unionByName(prices_region)
    prices_fact = prices_fact.withColumn("source", F.lit("DVF Statistiques (POC)"))

    write_to_postgres(prices_fact, table="fact_prices_m2", cfg=cfg, mode="append")

    spark.stop()


if __name__ == "__main__":
    main()

