# Infra — Kafka + Spark

## Kafka (Redpanda)

# Infra — Kafka (Redpanda)

Broker compatible Kafka pour HomePedia v2 (Docker Desktop Windows).

## Démarrer

```powershell
cd infra
docker compose up -d
```

→ broker **localhost:9092**

## Spark (profil optionnel)
Vérifier :

Image PySpark pour le job similarité :
```powershell
docker compose ps
docker compose logs -f kafka
```

## Arrêter

```powershell
docker compose --profile spark pull spark
docker compose down
```

Le job est lancé via `npm run spark:similar` dans `apps/api` (voir [`pipelines/spark/README.md`](../pipelines/spark/README.md)).
## Topics

| Topic | Rôle |
|-------|------|
| `homepedia.listing.raw` | Données brutes (scrape, batch) → preprocess |
| `homepedia.listing.events` | Annonces normalisées (cycle de vie) |

Variables : `KAFKA_TOPIC_RAW`, `KAFKA_TOPIC_LISTINGS` (voir `apps/api/.env.example`).

## Brancher l’API

```powershell
cd apps/api
copy .env.example .env
# éditer : KAFKA_ENABLED=1
npm install
npm run dev
```

## Consumer preprocess (raw → Mongo → events)

```powershell
cd apps/api
$env:KAFKA_ENABLED="1"
npm run kafka:preprocess
```

Lit `homepedia.listing.raw`, normalise en `ListingRecord`, upsert MongoDB, publie `listing.created`.

## Consumer events (→ Spark)

```powershell
cd apps/api
$env:KAFKA_ENABLED="1"
npm run kafka:consume
```

Rejouer depuis le début du topic :

```powershell
$env:KAFKA_FROM_BEGINNING="1"
npm run kafka:consume
```

## Test rapide (POST)

```powershell
curl -X POST http://localhost:3001/api/listings `
  -H "Content-Type: application/json" `
  -d '{"title":"Test Kafka","address":"Lyon 3e","price":950,"rooms":2,"surface":45,"lat":45.75,"lon":4.85,"source":"example"}'
```
