# HomePedia — API

Serveur Express (listings, auth/chat, scrape, pipeline Kafka).

## Endpoints principaux

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Santé (+ `listingsSource`, Kafka, Spark) |
| GET | `/api/listings` | Annonces filtrées (`q`, `city`, `source`, prix, `limit`, `offset`) |
| GET | `/api/listings/:id` | Détail annonce |
| GET | `/api/listings/:id/similar` | Similaires (Spark ou algo mock) |
| POST | `/api/listings` | Créer une annonce |
| POST | `/api/scrape` | Scraper une URL (si `SCRAPE_ENABLED=1`) |

## Source des données

| `LISTINGS_SOURCE` | Comportement |
|-------------------|--------------|
| `mock` (défaut) | 22 fixtures JSON en mémoire |
| `mongo` | MongoDB (DVF, scrape, seed) |

## Scripts

```powershell
npm run dev                  # API (port 3001)
npm test                     # Vitest (35 tests)
npm run listings:seed        # Fixtures → Mongo
npm run listings:dvf-volume  # DVF open data → Mongo (--limit=1000 ou DVF_LIMIT=1000)
npm run kafka:preprocess     # raw → Mongo
npm run kafka:crawl          # pages recherche → topic crawl
npm run kafka:ingest-worker  # crawl → scrape → raw
npm run kafka:consume        # events → Spark (optionnel)
npm run playwright:install   # navigateur pour scrape
```

Pipeline détaillé : [`docs/04-pipeline-donnees.md`](../../docs/04-pipeline-donnees.md)

## Lancer

```powershell
cd apps/api
copy .env.example .env
npm install
npm run dev
```

Port : **3001** (`PORT`). Frontend proxy `/api` → `3001` en dev.

## Kafka + Spark

Voir [`infra/README.md`](../../infra/README.md) et [`pipelines/spark/README.md`](../../pipelines/spark/README.md).