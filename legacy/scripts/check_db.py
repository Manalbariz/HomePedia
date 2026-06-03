import yaml
import pandas as pd
import psycopg

cfg = yaml.safe_load(open("config/settings.yaml", encoding="utf-8"))
c = psycopg.connect(
    host="localhost",
    port=5433,
    user=cfg["postgres"]["user"],
    password=cfg["postgres"]["password"],
    dbname=cfg["postgres"]["db_name"],
)
for label, sql in [
    ("levels", "SELECT level, COUNT(*) n FROM fact_prices_m2 GROUP BY level"),
    ("years dept apt", "SELECT DISTINCT year FROM fact_prices_m2 WHERE level='department' AND property_type='apartments' ORDER BY 1 DESC LIMIT 5"),
    ("sample", "SELECT year, level, property_type, insee_code FROM fact_prices_m2 LIMIT 5"),
    ("property types", "SELECT property_type, COUNT(*) n FROM fact_prices_m2 GROUP BY property_type"),
    ("years", "SELECT DISTINCT year FROM fact_prices_m2 ORDER BY year DESC"),
    ("demo levels", "SELECT level, COUNT(*) n FROM fact_demographics GROUP BY level"),
]:
    print("---", label)
    print(pd.read_sql_query(sql, c))
c.close()
