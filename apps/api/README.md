# HomePedia — API mock

Serveur Express minimal pour le frontend v2 (données annonces en JSON).

## Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Santé du service (+ statut Kafka) |
| GET | `/api/listings` | Toutes les annonces (query: `q`, `city`, `source`, `minPrice`, `maxPrice`, `minRooms`) |
| POST | `/api/listings` | Créer une annonce (mock) + événement Kafka si activé |
| GET | `/api/listings/:id` | Une annonce (404 si absente) |
| GET | `/api/listings/:id/similar` | Similaires (Spark si index présent, sinon mock) |

Données : `data/listings.json` (**22 annonces** de démo — Paris, Lyon, Bordeaux, Marseille, etc., 3 sources + `example`).

## Lancer

```powershell
cd apps/api
npm install
npm run dev
```

Port par défaut : **3001** (`PORT` pour changer).

Le frontend (`apps/web`) proxy `/api` → `http://localhost:3001` en dev.

## Kafka (optionnel)

1. Broker : [`infra/README.md`](../../infra/README.md) — `docker compose up -d` dans `infra/`
2. Copier `.env.example` → `.env`, mettre `KAFKA_ENABLED=1`
3. Consumer : `npm run kafka:consume`

Événements sur le topic `homepedia.listing.events` :

- `listings.bootstrapped` — au démarrage de l’API
- `listing.created` — après `POST /api/listings`

## Spark similarité

1. Générer l’index : `npm run spark:similar` (Docker Spark via `infra/`)
2. `.env` : `SPARK_SIMILAR_ENABLED=1`
3. Optionnel : `SPARK_AUTO_RUN=1` + consumer Kafka relance le job

Détails : [`pipelines/spark/README.md`](../../pipelines/spark/README.md)
