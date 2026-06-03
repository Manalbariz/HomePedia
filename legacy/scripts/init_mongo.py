import os
from datetime import datetime

from pymongo import MongoClient


def main() -> None:
    mongo_host = os.getenv("MONGO_HOST", "localhost")
    mongo_port = int(os.getenv("MONGO_PORT", "27017"))
    mongo_db = os.getenv("MONGO_DB", "hompeedia")

    client = MongoClient(host=mongo_host, port=mongo_port)
    db = client[mongo_db]

    col = db["nlp_sentiment"]

    # Index pour accélérer les requêtes dashboard.
    col.create_index([("level", 1), ("insee_code", 1), ("source", 1)])
    col.create_index([("updated_at", -1)])

    # Aucun document "dummy" en POC : l’insertion sera faite par la pipeline NLP.
    print(f"Mongo init OK: db={mongo_db}, collection=nlp_sentiment (indexes ensured).")
    print("timestamp:", datetime.utcnow().isoformat() + "Z")


if __name__ == "__main__":
    main()

