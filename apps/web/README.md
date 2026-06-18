# nido — frontend HomePedia v2

UI recodée (React + Vite + Tailwind), inspirée de la maquette Figma — **sans** copier le code exporté.

## Lancer en dev

**Deux terminaux** (API + UI) :

```powershell
# Terminal 1 — API mock (port 3001)
cd apps/api
npm install
npm run dev

# Terminal 2 — Frontend (port 5173, proxy /api → 3001)
cd apps/web
npm install
npm run dev
```

Ouvrir http://localhost:5173

## Structure

| Dossier | Rôle |
|---------|------|
| `src/api/` | Client HTTP (`fetchListings`, `fetchListingById`) |
| `src/hooks/` | `useListings` — charge les annonces depuis l’API |
| `src/mocks/` | Chat / amis (UI seulement) |
| `src/types/` | Modèle `Listing`, vues |
| `src/components/` | Nav, `ListingsMap` (Leaflet + clusters), cartes annonce |
| `src/views/` | Accueil, Carte, Match, Chat |
