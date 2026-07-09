# Pipeline données — mock → volumétrie réelle

Objectif : remplacer progressivement `apps/api/data/listings.json` (22 fixtures) par des annonces réelles, normalisées au format `ListingRecord`, avec volume et traitement asynchrone.

## Architecture — 3 topics Kafka (Big Data)

```
Pages recherche          homepedia.listing.crawl        homepedia.listing.raw
(kafka:crawl)      →     { listing.url }         →      { listing.raw }
                                                         (kafka:ingest-worker
                                                          ou kafka:ingest)
                                    │
                                    ▼
                         kafka:preprocess
                         toListingRecord + géocode
                                    │
                                    ▼
                              MongoDB listings
                                    │
                         homepedia.listing.events
                                    ▼
                         Spark similarité (optionnel)
                                    ▼
                              GET /api/listings
```

| Topic | Rôle | Producteur | Consommateur |
|-------|------|------------|--------------|
| `homepedia.listing.crawl` | File d'URLs à scraper | `kafka:crawl` | `kafka:ingest-worker` |
| `homepedia.listing.raw` | Données brutes scrapées | ingest-worker, `kafka:ingest`, DVF `--kafka` | `kafka:preprocess` |
| `homepedia.listing.events` | Annonces normalisées | preprocess, API | `kafka:consume` → Spark |

## Deux sources de volumétrie

### A. Scraping réel (SeLoger, LBC, Bien'ici)
Crawl des pages de recherche → scrape des fiches → normalisation.

### B. DVF open data (~35k communes × 3 variantes)
Données publiques [data.gouv.fr](https://www.data.gouv.fr) — prix/m² médian par commune, transformés en fiches `ListingRecord` taguées `DVF`.

```powershell
# Nécessite data/raw/dvf/dvf_stats_whole_period.csv (voir legacy ingest)
npm run listings:dvf-volume -- --limit=1000
# ou : $env:DVF_LIMIT="1000"; npm run listings:dvf-volume
```

## Workflow volumétrique complet

```powershell
cd infra && docker compose up -d

cd apps/api
# .env : KAFKA_ENABLED=1, LISTINGS_SOURCE=mongo, MONGODB_URI=...

# Terminal 1 — API
npm run dev

# Terminal 2 — Preprocess (raw → Mongo)
npm run kafka:preprocess

# Terminal 3 — Ingest worker (crawl → scrape → raw)
npm run kafka:ingest-worker

# Terminal 4 — Crawl (pages de recherche → topic crawl)
copy data\search-urls.example.txt data\search-urls.txt
npm run kafka:crawl -- data/search-urls.txt

# Optionnel — volume DVF (données publiques)
npm run listings:dvf-volume -- --limit=2000

# Optionnel — Spark
npm run kafka:consume
```

## Contrat de sortie (inchangé)

Le frontend consomme toujours `ListingRecord` :

```typescript
{ id, title, address, price, rooms, surface, floor, tags, score, imageUrl, lat, lon, source, url }
```

Le preprocessing transforme `ComparedListing` (scrape) → `ListingRecord`.

## Phases de mise en œuvre

### Phase 1 — Fondations (actuelle)
- [x] Topic raw + events
- [x] `toListingRecord()` + tests
- [x] Modèle Mongo `Listing`
- [x] Consumer `npm run kafka:preprocess`
- [x] `/api/scrape` publie sur le topic raw
- [x] `LISTINGS_SOURCE=mongo` pour l'API

### Phase 2 — Volumétrie
- [x] Script `npm run listings:seed` (fixtures → Mongo)
- [x] Batch `npm run kafka:ingest` (liste d'URLs, concurrency)
- [x] Crawl `npm run kafka:crawl` + worker `kafka:ingest-worker`
- [x] Volume DVF `npm run listings:dvf-volume`
- [x] Géocodage fallback (city-centroids)
- [x] Pagination API
- [ ] UI pagination carte (frontend)

### Phase 3 — Enrichissement territoire
- [ ] Jointure DVF (prix/m² médian par `code_insee`)
- [ ] Jointure INSEE (population)
- [ ] GeoJSON pour choroplèthe carte

### Phase 4 — Spark volume
- [ ] Job Spark lecture Mongo/Parquet staging
- [ ] Similarité sur gros volume
- [ ] Agrégations marché par commune

## Passer en mode Mongo (volumétrie)

```powershell
cd apps/api

# 1. Seed les 22 fixtures dans MongoDB
npm run listings:seed
# Option : npm run listings:seed -- --clear  (vide la collection avant)

# 2. Activer Mongo comme source
# Dans .env : LISTINGS_SOURCE=mongo

# 3. Redémarrer l'API
npm run dev
```

## Ingest batch (URLs réelles)

```powershell
# Copier et éditer le fichier d'exemple
copy data\ingest-urls.example.txt data\ingest-urls.txt

# Publier sur le topic raw (nécessite KAFKA_ENABLED=1 + preprocess qui tourne)
npm run kafka:ingest -- data/ingest-urls.txt
```

## Pagination API

Sans `limit` → tableau JSON (rétrocompatible).

Avec `limit` → objet paginé :

```
GET /api/listings?city=paris&limit=10&offset=0
→ { "items": [...], "total": 42, "limit": 10, "offset": 0 }
```

`limit` max : **200**.

## Commandes

```powershell
# 1. Infra
cd infra && docker compose up -d

# 2. API
cd apps/api
copy .env.example .env
# KAFKA_ENABLED=1, LISTINGS_SOURCE=mongo (optionnel)

# Terminal 1 — API
npm run dev

# Terminal 2 — Preprocess (raw → Mongo → events)
npm run kafka:preprocess

# Terminal 3 — Consumer events (→ Spark si SPARK_AUTO_RUN=1)
npm run kafka:consume

# Scraper une URL (publie sur raw)
curl -X POST http://localhost:3001/api/scrape -H "Content-Type: application/json" -d "{\"url\":\"https://...\"}"
```

## Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `KAFKA_TOPIC_RAW` | `homepedia.listing.raw` | Topic données brutes |
| `KAFKA_TOPIC_LISTINGS` | `homepedia.listing.events` | Topic annonces normalisées |
| `LISTINGS_SOURCE` | `mock` | `mock` = JSON en mémoire, `mongo` = MongoDB |
| `KAFKA_TOPIC_CRAWL` | `homepedia.listing.crawl` | File URLs à scraper |
| `CRAWL_DELAY_MS` | `4000` | Pause entre pages de recherche |
| `INGEST_DELAY_MS` | `5000` | Pause entre scrapes (anti-ban) |
| `INGEST_CONCURRENCY` | `2` | Scrapes parallèles max |
| `DVF_LIMIT` | — | Limite communes pour `listings:dvf-volume` |

## Données legacy (DVF / INSEE)

Les pipelines sous `legacy/pipelines/ingest/` alimentent le **contexte marché** (prix/m², population), pas les fiches annonces. Ils seront branchés en Phase 3 pour enrichir les pins carte, pas pour remplacer le scrape.
