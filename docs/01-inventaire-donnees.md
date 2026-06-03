# Inventaire des données — HomePedia v2

Les fichiers lourds vivent dans `data/` en **local uniquement** (dossier ignoré par Git).

---

## 1. Synthèse

| Donnée | Présente localement | Rôle pour le **nouveau** produit (annonces + carto Leaflet) |
|--------|---------------------|---------------------------------------------------------------|
| **Annonces immobilières** (titre, prix, URL, source, photos, lat/lon) | Non | **Cœur produit** — à créer (mocks puis API) |
| **DVF** (statistiques marché pré-agrégées) | Oui (`data/raw/dvf/`) | Contexte marché (prix/m² par territoire), pas des fiches annonces |
| **INSEE population 2020** | Oui (`data/raw/insee/`) | Enrichissement territoire (population, âges…) |
| **GeoJSON admin** (commune, département, région) | Oui (`data/processed/geo/`) | Fond de carte / choroplèthe, pas les pins d’annonces |
| **Parquet** (DVF, INSEE traités) | Non (régénérable) | Pipeline legacy Spark — hors UI v2 pour l’instant |
| **Avis Inside Airbnb** (NLP legacy) | Non | Ancien POC — hors nouveau cahier des charges |

---

## 2. Fichiers présents dans `data/` (état actuel)

| Chemin | Source publique | Ordre de grandeur |
|--------|-----------------|-------------------|
| `raw/dvf/dvf_stats_whole_period.csv` | [Statistiques DVF — data.gouv.fr](https://www.data.gouv.fr/fr/datasets/statistiques-dvf/) | ~413 000 lignes, fichier volumineux |
| `raw/insee/insee_population_2020.csv` | [INSEE — évolution structure population 2020](https://www.insee.fr/fr/statistiques/7632446) | ~35 000 communes, 292 colonnes, séparateur `;` |
| `processed/geo/city.geojson` | IGN Admin Express (via scripts legacy) | Polygones communes |
| `processed/geo/department.geojson` | Idem | Polygones départements |
| `processed/geo/region.geojson` | Idem | Polygones régions |

**Total local** : environ **700+ Mo** (ne pas versionner dans Git).

---

## 3. Détail par jeu de données

### 3.1 DVF — `dvf_stats_whole_period.csv`

**Ce que c’est** : statistiques de ventes **agrégées** par territoire (pas des annonces SeLoger / Leboncoin).

**Colonnes principales** :

| Colonne | Description |
|---------|-------------|
| `code_geo` | Code du territoire (INSEE selon l’échelle) |
| `libelle_geo` | Nom (commune, département, etc.) |
| `code_parent` | Code du parent administratif |
| `echelle_geo` | `commune`, `departement`, `region`, `epci`, `section`, `nation` |
| `nb_ventes_whole_appartement` / `_maison` / `_apt_maison` / `_local` | Nombre de mutations |
| `moy_prix_m2_whole_*` | Prix au m² **moyen** |
| `med_prix_m2_whole_*` | Prix au m² **médian** |

**Répartition des lignes (indicatif)** : majorité au niveau `section`, ~35k `commune`, 101 `departement`, etc.

**Usage v2 possible** : tooltip / filtre « marché local » sur la carte, comparaison de zones — **pas** pour le swipe d’annonces.

**Régénération** (depuis la racine du repo, avec Python 3.10+) :

```powershell
cd legacy
pip install -r requirements.txt
# Adapter le chemin : settings.yaml pointe vers local_data_dir: "data" (relatif à la racine du projet)
python -m pipelines.ingest.run --config config/settings.yaml
```

URL directe utilisée par le downloader :  
`https://object.files.data.gouv.fr/data-pipeline-open/dvf/stats_whole_period.csv`

---

### 3.2 INSEE — `insee_population_2020.csv`

**Ce que c’est** : population et structure par commune (2020).

**Colonnes utiles en priorité** :

| Colonne | Description |
|---------|-------------|
| `CODGEO` | Code commune INSEE |
| `P20_POP` | Population 2020 |
| `P20_POP0014`, `P20_POP1529`, … | Pyramide des âges (tranches) |
| (+ ~290 autres colonnes) | Ménages, catégories socio-professionnelles, historique 2009/2014… |

**Attention** : fichier **`;`** comme séparateur, pas `,`.

**Usage v2 possible** : indicateurs par commune sur la carte (population, dynamique démographique).

**Régénération** : même commande d’ingestion que DVF (téléchargement ZIP INSEE dans `legacy/pipelines/ingest/insee_population.py`).

---

### 3.3 GeoJSON — `processed/geo/*.geojson`

**Ce que c’est** : contours administratifs (FeatureCollection WGS84).

**Exemple de propriétés** (commune) : `code_insee`, `nom_officiel`, `population`, `code_insee_du_departement`, `code_insee_de_la_region`, géométrie `MultiPolygon`.

**Usage v2 possible** : couche Leaflet fond (communes / départements), jointure avec DVF ou INSEE via `code_insee` / `CODGEO`.

**Régénération** (sans relancer DVF/INSEE) :

```powershell
cd legacy
python -m pipelines.ingest.run --config config/settings.yaml --geo-only
# ou
.\scripts\run_geo.ps1
```

---

## 4. Données absentes — à prévoir pour la maquette / le prof

Aligné avec le nouveau sujet (match appart, comparatif multi-sites, dépôt d’annonces).

| Besoin produit | Champs attendus (exemple) | Statut |
|----------------|---------------------------|--------|
| Annonce | `id`, `title`, `price`, `rooms`, `surface`, `address`, `lat`, `lon`, `imageUrl` | À créer |
| Source / comparatif | `source` (`seloger`, `leboncoin`, `bienici`, …), `url` | À créer |
| Sélection utilisateur | liste d’IDs + liens cliquables | UI + API mock |
| Biens similaires (volume) | liste d’annonces proches (prix, surface, zone) | Mock puis Spark/Kafka |
| Chat / partage | référence `listingId` dans les messages | UI + mock |

**Prochain fichier prévu** : `data/mocks/listings.json` (léger, versionnable) — pas encore créé.

---

## 5. Scripts legacy (génération / transformation)

Tout est sous `legacy/` (archive POC Streamlit, **pas** le livrable UI v2).

| Module | Rôle |
|--------|------|
| `legacy/pipelines/ingest/dvf_stats.py` | Télécharge + normalise DVF → Parquet |
| `legacy/pipelines/ingest/insee_population.py` | Télécharge + normalise INSEE → Parquet |
| `legacy/pipelines/ingest/ign_admin_express.py` | Boundaries → GeoJSON |
| `legacy/pipelines/ingest/run.py` | Orchestration ingestion |
| `legacy/pipelines/spark/` | Agrégations → PostgreSQL (ancien flux) |
| `legacy/pipelines/messaging/` | Kafka (ancien flux) |
| `legacy/pipelines/nlp/` | Inside Airbnb (hors scope v2 sauf décision contraire) |

Pour réutiliser l’ingestion : exécuter depuis `legacy/` et vérifier que `config/settings.yaml` cible bien `data/` à la **racine** du projet.

---

## 6. Cartographie « données → écrans » (cible v2)

```text
Annonces (mock/API)     →  Match (swipe), liste carte, comparatif, chat
DVF + INSEE + GeoJSON   →  Fond carte, filtres territoire, contexte marché
Spark + Kafka (plus tard) →  Enrichissement, similarité, gros volume carto
```

---

