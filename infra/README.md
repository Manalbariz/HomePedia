# Infra — Kafka (Redpanda)

Broker compatible Kafka pour HomePedia v2 (Docker Desktop Windows).

## Démarrer

```powershell
cd infra
docker compose up -d
```

→ broker sur **localhost:9092**

Vérifier :

```powershell
docker compose ps
docker compose logs -f kafka
```

## Arrêter

```powershell
docker compose down
```

## Topic

Par défaut : `homepedia.listing.events` (auto-créé à la première publication).

## Brancher l’API

```powershell
cd apps/api
copy .env.example .env
# éditer : KAFKA_ENABLED=1
npm install
npm run dev
```

Au démarrage, l’API publie `listings.bootstrapped`.  
`POST /api/listings` publie `listing.created`.

## Consumer

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
