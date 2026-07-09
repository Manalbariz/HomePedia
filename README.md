# HomePedia

Application de recherche / comparaison de logements (carto Leaflet, match type swipe, comparatif multi-sites, chat) — consignes cours 2026.

## Structure du dépôt

| Dossier | Rôle |
|---------|------|
| [`docs/`](docs/) | Documentation projet (inventaire données, tests, sécurité) |
| [`legacy/`](legacy/) | **Archive** — ancien POC Streamlit + pipelines DVF/INSEE/Spark/Kafka |
| `data/` | Données locales (**non versionnées**, voir `.gitignore`) |
| [`apps/web/`](apps/web/) | Frontend **nido** — React recodé (maquette Figma en référence visuelle uniquement) |
| [`apps/api/`](apps/api/) | API mock Express (listings, filtres, Kafka producer) |
| [`infra/`](infra/) | Docker — Kafka (Redpanda) |

## Données

Liste détaillée : **[docs/01-inventaire-donnees.md](docs/01-inventaire-donnees.md)**.

En local, placer ou régénérer les fichiers sous `data/` (DVF, INSEE, GeoJSON). Les annonces immobilières (URLs, sources) seront des **mocks** puis une API.

## Régénérer les données publiques

```powershell
cd legacy
pip install -r requirements.txt
python -m pipelines.ingest.run --config config/settings.yaml
```

Voir `legacy/README.md` pour le runbook complet de l’ancien POC.

## Lancer l’interface (v2)

```powershell
# API mock
cd apps/api && npm install && npm run dev

# Frontend (autre terminal)
cd apps/web && npm install && npm run dev
```

→ http://localhost:5173 (proxy `/api` → port 3001)

## Kafka

```powershell
cd infra && docker compose up -d

cd apps/api
copy .env.example .env   # KAFKA_ENABLED=1
npm install && npm run dev

# autre terminal — consumer
cd apps/api && npm run kafka:consume
```

Détails : [`infra/README.md`](infra/README.md)

## Spark (similarité)

```powershell
cd apps/api
npm run spark:similar
# SPARK_SIMILAR_ENABLED=1 dans .env
```

Pipeline : [`pipelines/spark/README.md`](pipelines/spark/README.md)

## Tests & CI

```powershell
cd apps/api && npm test
cd apps/web && npm test
```

Documentation : [`docs/02-tests.md`](docs/02-tests.md) · Sécurité : [`docs/03-securite.md`](docs/03-securite.md) · Pipeline données : [`docs/04-pipeline-donnees.md`](docs/04-pipeline-donnees.md)

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute tests, typecheck et build sur chaque push/PR vers `main`.
