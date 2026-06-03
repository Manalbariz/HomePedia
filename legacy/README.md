# HOMEPEDIA (POC) — archive

> **Archive uniquement** — ancien sujet (Streamlit, DVF choroplèthe, personas).  
> Le livrable cours v2 est développé à la racine (`apps/`, API, mocks annonces).  
> Inventaire des données actuelles : [`../docs/01-inventaire-donnees.md`](../docs/01-inventaire-donnees.md).

Les commandes ci-dessous supposent d’être lancées **depuis le dossier `legacy/`** (chemins `config/`, `scripts/` relatifs à ce dossier).  
Pour l’ingestion, `config/settings.yaml` écrit toujours dans `data/` à la **racine** du projet.

---

## Objectif
Construire un POC end-to-end pour explorer le marché du logement en France (données publiques), avec :
- Ingestion + standardisation
- Stockage relationnel (PostgreSQL/PostGIS) + non relationnel (MongoDB)
- Traitement “big data” via Hadoop + Spark (mini-cluster local)
- Visualisations interactives via Streamlit (cartes + tableaux)
- Analyse textuelle (word cloud + sentiment) sur des avis publics (Inside Airbnb) pour un petit périmètre.

## Prérequis
- Docker Desktop
- Python 3.10+ (pour lancer les scripts d’ingestion et NLP)

## Lancer (runbook)
```powershell
docker compose up -d
python -m pipelines.ingest.run --config config/settings.yaml
.\scripts\spark_submit.ps1
python -m pipelines.nlp.run --config config/settings.yaml --download-only
python -m pipelines.nlp.run --config config/settings.yaml --skip-download --mode light
# Postgres Docker est exposé sur 5433 (évite conflit local sur 5432)
$env:POSTGRES_HOST="localhost"
$env:POSTGRES_PORT="5433"
python -m streamlit run dashboard/app.py --server.port 8501
```

## Notes POC
- Par défaut, le POC se limite à un échantillon (et à quelques villes côté texte) pour rester rapide.
- Les datasets sont téléchargés depuis des sources publiques ; les URLs exactes sont résolues par les downloaders.

## Volumétrie (benchmark)

Mesurer tailles, lignes Parquet et durées d’ingestion / Spark pour la présentation (retour tuteur).

```powershell
# État actuel des dossiers data/ (sans relancer le pipeline)
python scripts/benchmark_volume.py report

# POC actuel (~50 communes) — ingestion seule, sans géo IGN (plus rapide)
python scripts/benchmark_volume.py run --scenario baseline

# Forte volumétrie — 2000 communes
python scripts/benchmark_volume.py run --scenario high

# Comparer baseline / medium / high (plus long)
python scripts/benchmark_volume.py compare --scenarios baseline,medium,high

# Avec agrégation Spark (Docker doit tourner : docker compose up -d)
python scripts/benchmark_volume.py run --scenario baseline --run-spark
```

Raccourci PowerShell : `.\scripts\run_volume_benchmark.ps1 -Mode baseline` (ou `high`, `compare`, `-WithSpark`).

Variable d’environnement : `HOMEPEDIA_DVF_SAMPLE_CITIES` (alignée INSEE + DVF). `0` = toutes les communes du fichier source.

Rapports JSON + Markdown : `reports/volumetry/`.

## Échelle nationale + Kafka

```powershell
pip install kafka-python
docker compose up -d
.\scripts\run_national.ps1
```

- `HOMEPEDIA_DVF_SAMPLE_CITIES=0` : toutes les communes du fichier DVF (pas d'échantillon).
- `HOMEPEDIA_SKIP_GEO=1` : carto IGN hors run national (trop volumineux en WFS).
- Après run national, régénérer la carto filtrée : `.\scripts\run_geo.ps1` ou `python -m pipelines.ingest.run --geo-only`.

## Dashboard (carte + filtres)

```powershell
$env:POSTGRES_HOST="localhost"
$env:POSTGRES_PORT="5433"
python -m streamlit run dashboard/app.py --server.port 8501
```

**Carte choroplèthe** au centre, **filtres** dans la barre latérale (échelle, année, bien, indicateur, zone INSEE).
Raccourcis **cas d'usage** (comparer / investir / s'installer) — inspirés des personas, sans écrans séparés par personne.

Config : `config/settings.yaml` → `dashboard.use_cases` et `geo.max_communes_wfs`.

## Presentation soutenance

Plan complet 16 slides : **`reports/PRESENTATION_AJOUTS.md`** (personas, volumetrie, Kafka, Spark, carto, dashboard).

| Sujet | Fichiers |
|-------|----------|
| Plan presentation | `reports/PRESENTATION_AJOUTS.md` |
| Volumetrie & charge | `reports/volumetry/slide_volumetrie_methodologie_gamma.md` · `.html` |
| Choix cartographique | `reports/volumetry/slide_cartographie_gamma.md` · `.html` |
| Run national + Kafka | `reports/volumetry/NATIONAL_KAFKA_RUN.md` |
- Après ingestion : événement Kafka `hompeedia.ingestion.completed`.
- Spark en `overwrite` sur les tables de faits (`HOMEPEDIA_SPARK_WRITE_MODE=overwrite`).

Consumer (écoute + log) :
```powershell
python -m pipelines.messaging.consumer --config config/settings.yaml --from-beginning
```

Consumer qui relance Spark sur chaque message :
```powershell
$env:HOMEPEDIA_KAFKA_TRIGGER_SPARK="1"
python -m pipelines.messaging.consumer --config config/settings.yaml
```

Architecture :
```text
Ingestion → Parquet → (Kafka: ingestion_completed) → Spark → PostgreSQL
```

Broker : **Redpanda** (compatible API Kafka) via le service `kafka` dans Docker — port **9092**.

Rapport du run national : `reports/volumetry/NATIONAL_KAFKA_RUN.md`.

