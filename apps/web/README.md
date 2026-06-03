# nido — frontend HomePedia v2

UI recodée (React + Vite + Tailwind), inspirée de la maquette Figma — **sans** copier le code exporté.

## Lancer en dev

```powershell
cd apps/web
npm install
npm run dev
```

Ouvrir http://localhost:5173

## Structure

| Dossier | Rôle |
|---------|------|
| `src/mocks/` | Annonces et chat de démo |
| `src/types/` | Modèle `Listing`, vues |
| `src/components/` | Nav, carte placeholder, cartes annonce |
| `src/views/` | Accueil, Carte, Match, Chat |

## Prochaines étapes

- Leaflet à la place du placeholder `CityMap`
- API mock (`GET /listings`, import URL)
- Écran comparatif multi-sites
- Zone dépôt d’annonces
