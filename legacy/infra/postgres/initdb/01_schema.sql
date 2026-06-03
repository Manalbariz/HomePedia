-- Schema SQL initial pour le POC.
-- Exécuté automatiquement par l'image Postgres au démarrage.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Dimensions géographiques
CREATE TABLE IF NOT EXISTS geo_entities (
  level text NOT NULL CHECK (level IN ('city', 'department', 'region')),
  insee_code text NOT NULL,
  name text,
  lat double precision,
  lon double precision,
  PRIMARY KEY (level, insee_code)
);

-- Boundaries cartographiques (GeoJSON)
CREATE TABLE IF NOT EXISTS geo_shapes (
  level text NOT NULL,
  insee_code text NOT NULL,
  name text,
  geom_geojson jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (level, insee_code),
  FOREIGN KEY (level, insee_code) REFERENCES geo_entities(level, insee_code) ON DELETE CASCADE
);

-- Faits : prix (DVF - Statistiques DVF)
CREATE TABLE IF NOT EXISTS fact_prices_m2 (
  year int NOT NULL,
  level text NOT NULL CHECK (level IN ('city', 'department', 'region')),
  insee_code text NOT NULL,
  property_type text,
  price_m2_avg double precision,
  price_m2_median double precision,
  mutation_count int,
  source text,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, level, insee_code, COALESCE(property_type, '__unknown__')),
  FOREIGN KEY (level, insee_code) REFERENCES geo_entities(level, insee_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fact_prices_m2_level_code_year
  ON fact_prices_m2 (level, insee_code, year);

-- Faits : démographie (INSEE)
CREATE TABLE IF NOT EXISTS fact_demographics (
  year int NOT NULL,
  level text NOT NULL CHECK (level IN ('city', 'department', 'region')),
  insee_code text NOT NULL,
  population double precision,
  median_age double precision,
  source text,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, level, insee_code),
  FOREIGN KEY (level, insee_code) REFERENCES geo_entities(level, insee_code) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_fact_demographics_level_code_year
  ON fact_demographics (level, insee_code, year);

