from __future__ import annotations

from pathlib import Path
from typing import Optional

import requests


CITY_BASE_CANDIDATES = {
    # Base = data.insideairbnb.com/france/{region}/{city}/... (sans suffixe /latest)
    "paris": [
        "france/ile-de-france/paris",
        "france/ile-de-france/paris/2024-01-01",  # fallback (si archive datée)
    ],
    "lyon": [
        "france/auvergne-rhone-alpes/lyon",
        "france/auvergne-rhone-alpes/rhone-alpes/lyon",
        "france/rhone-alpes/lyon",
    ],
    "bordeaux": [
        "france/nouvelle-aquitaine/bordeaux",
    ],
}


REVIEWS_FILE_CANDIDATES = [
    "latest/data/reviews.csv.gz",
    "latest/data/reviews.csv",
    "data/reviews.csv.gz",
    "data/reviews.csv",
]


def download_reviews_csv_for_city(city: str, out_dir: Path) -> Path:
    """
    Télécharge le fichier reviews d’Inside Airbnb pour une ville (POC).
    Retourne le chemin du fichier local (csv.gz ou csv).
    """
    city = city.lower().strip()
    out_dir.mkdir(parents=True, exist_ok=True)

    candidates = CITY_BASE_CANDIDATES.get(city, [])
    if not candidates:
        raise ValueError(f"Pas de candidates Inside Airbnb pour city={city!r}")

    # Contournement POC : si des fichiers reviews sont déjà présents localement,
    # on les réutilise au lieu de retenter un téléchargement (Inside Airbnb peut renvoyer 403).
    #
    # On accepte plusieurs conventions de nommage, car les navigateurs Windows peuvent
    # ajouter des suffixes comme " (1)" ou " (2)".
    #
    # Exemples acceptés :
    # - reviews.csv.gz
    # - reviews (1).csv.gz
    # - reviews_<city>_reviews.csv.gz (ancienne convention)
    local_candidates = []
    local_candidates.extend(out_dir.glob("reviews*.csv.gz"))
    local_candidates.extend(out_dir.glob("reviews*.csv"))
    local_candidates.extend(out_dir.glob(f"reviews_{city}_*.csv.gz"))
    local_candidates.extend(out_dir.glob(f"reviews_{city}_*.csv"))

    local_candidates = [p for p in local_candidates if p.is_file()]
    if local_candidates:
        # Heuristique : on prend le plus gros fichier (évite de choisir un fichier HTML/erreur).
        return sorted(local_candidates, key=lambda p: p.stat().st_size, reverse=True)[0]

    base = "https://data.insideairbnb.com"
    last_err: Optional[Exception] = None

    for cbase in candidates:
        for rf in REVIEWS_FILE_CANDIDATES:
            url = f"{base}/{cbase}/{rf}"
            file_name = rf.split("/")[-1]
            dest_path = out_dir / f"reviews_{city}_{file_name}"
            try:
                print(f"[NLP] Essai telechargement: {url}")
                with requests.get(url, stream=True, timeout=(15, 300)) as r:
                    if r.status_code != 200:
                        print(f"[NLP]   -> HTTP {r.status_code}, essai suivant...")
                        continue
                    total = int(r.headers.get("content-length") or 0)
                    if total:
                        print(f"[NLP]   -> telechargement ~{total / (1024 * 1024):.1f} Mo...")
                    downloaded = 0
                    with open(dest_path, "wb") as f:
                        for chunk in r.iter_content(chunk_size=1024 * 1024):
                            if chunk:
                                f.write(chunk)
                                downloaded += len(chunk)
                                if total and downloaded % (10 * 1024 * 1024) < len(chunk):
                                    pct = 100.0 * downloaded / total
                                    print(f"[NLP]   -> {downloaded / (1024 * 1024):.0f} Mo ({pct:.0f}%)")
                    print(f"[NLP]   -> OK: {dest_path.name}")
                return dest_path
            except Exception as e:
                print(f"[NLP]   -> echec: {e!r}")
                last_err = e
                continue

    raise RuntimeError(
        "Impossible de télécharger reviews Inside Airbnb pour city="
        f"{city}. last_err={last_err!r}. "
        "Astuce POC : télécharge `reviews.csv(.gz)` depuis le navigateur et dépose-le dans "
        f"{out_dir.as_posix()}/ (ex: reviews.csv.gz ou reviews (1).csv.gz), puis relance `pipelines.nlp.run`."
    )

