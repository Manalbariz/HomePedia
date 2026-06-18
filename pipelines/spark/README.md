# Spark — similarité annonces

Job PySpark qui remplace le mock `/api/listings/:id/similar`.

## Entrée / sortie

| Fichier | Rôle |
|---------|------|
| `apps/api/data/listings.snapshot.json` | Snapshot écrit par l’API (prioritaire) |
| `apps/api/data/listings.json` | Seed de démo si pas de snapshot |
| `apps/api/data/similar-index.json` | Index `{ listingId: [similarIds…] }` produit par Spark |

## Docker (recommandé)

```powershell
cd infra
docker compose --profile spark up -d

cd ../apps/api
npm run spark:similar
```

## Python local (sans Docker)

```powershell
cd pipelines/spark
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

spark-submit --master "local[*]" jobs/similar_listings.py `
  --input ../../apps/api/data/listings.json `
  --output ../../apps/api/data/similar-index.json
```

## API

Dans `apps/api/.env` :

```env
SPARK_SIMILAR_ENABLED=1
```

L’endpoint `/api/listings/:id/similar` lit `similar-index.json` si présent, sinon retombe sur le calcul mock.

`SPARK_AUTO_RUN=1` : le consumer Kafka relance le job après `listings.bootstrapped` / `listing.created`.
