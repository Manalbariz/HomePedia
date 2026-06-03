# HomePedia

Application de recherche / comparaison de logements (carto Leaflet, match type swipe, comparatif multi-sites, chat) — consignes cours 2026.

## Structure du dépôt

| Dossier | Rôle |
|---------|------|
| [`docs/`](docs/) | Documentation projet (inventaire données, specs) |
| [`legacy/`](legacy/) | **Archive** — ancien POC Streamlit + pipelines DVF/INSEE/Spark/Kafka |
| `data/` | Données locales (**non versionnées**, voir `.gitignore`) |
| [`apps/web/`](apps/web/) | Frontend **nido** — React recodé (maquette Figma en référence visuelle uniquement) |

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
cd apps/web
npm install
npm run dev
```

→ http://localhost:5173
