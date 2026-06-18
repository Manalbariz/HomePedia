# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout — what is "live" vs "archived"

HomePedia is a housing search / comparison app (course project, French-language UI). The repo has two distinct halves:

- **`apps/`** — the v2 deliverable. **All current work happens here.**
  - `apps/api/` — Express + TypeScript mock API (port **3001**)
  - `apps/web/` — React + Vite + Tailwind frontend (port **5173**), product name "nido"
- **`legacy/`** — archived Streamlit / PostGIS / Spark / Kafka POC from the original course brief. Treat as read-only reference unless explicitly asked. The data pipelines under `legacy/pipelines/` regenerate DVF/INSEE/IGN datasets to root-level `data/` (gitignored). Do not assume legacy commands are wired to the v2 product.
- **`docs/01-inventaire-donnees.md`** — authoritative inventory of public datasets (DVF, INSEE, GeoJSON) and their relationship to v2.

## Common commands

Always run two terminals in dev — the web app proxies `/api` → `http://localhost:3001`:

```powershell
# Terminal 1 — API
cd apps/api
npm install
npm run dev          # tsx watch, port 3001 (override with $env:PORT)

# Terminal 2 — Web
cd apps/web
npm install
npm run dev          # Vite, port 5173
npm run build        # tsc --noEmit + vite build (use this as typecheck)
npm run preview      # serve the built bundle
```

No test runner, linter, or formatter is configured. `npm run build` in `apps/web` is the typecheck (strict TS, `noUnusedLocals`, `noUnusedParameters`). The API has no build script — `tsx` runs TS directly.

## Architecture

### API (`apps/api/src/`)

- `server.ts` — three routes: `GET /api/health`, `GET /api/listings` (with filters), `GET /api/listings/:id`, `GET /api/listings/:id/similar`. **`/:id/similar` is declared before `/:id`** because Express matches in order — preserve that ordering when adding new routes.
- `filters.ts` — `parseListingFilters` (query → typed filters), `filterListings`, `findSimilarListings` (city + price/surface/distance score, threshold `< 1.2`). City matching uses `extractCity(address)` which is a **hard-coded substring switch** (`paris`, `lyon`, `bordeaux`, …). **Adding a new city to the mock data requires also adding it here**, otherwise the `city` filter won't match it.
- Data source: `apps/api/data/listings.json` — versioned mock fixtures. **This file is intentionally NOT covered by the root `.gitignore`** (which only ignores `/data/` at repo root). Edit it directly to add listings; the server reads it fresh on every request.
- ESM + `"type": "module"`. Local imports use the `.js` extension even though source is `.ts` (e.g. `from "./filters.js"`) — this is required for Node ESM resolution under `tsx`.

### Web (`apps/web/src/`)

- **No router.** Navigation is `useState<AppView>` in `App.tsx`, one of `"hero" | "map" | "match" | "chat"`, rendered with `framer-motion` `<AnimatePresence>`. To add a screen: extend `AppView` in `types/listing.ts`, add a `NAV_ITEMS` entry in `components/Nav.tsx`, branch in `App.tsx`.
- **Path alias `@/*` → `src/*`** (configured in both `tsconfig.json` and `vite.config.ts` — keep in sync).
- **Theming** is a custom CSS-variables system driven by `ThemeContext` (`context/ThemeContext.tsx`):
  - Sets `data-theme="dark|light"` on `<html>`, persisted to `localStorage["homepedia-theme"]` (legacy key `homepedia-map-theme` is also read for migration).
  - `index.css` defines all color tokens as `--color-*` RGB triples under `[data-theme="..."]` selectors.
  - `tailwind.config.js` exposes them as semantic Tailwind colors (`bg-background`, `text-foreground`, `bg-card`, `text-primary`, `border-border`, …). **Always use these semantic classes** — hard-coded hex/`gray-*` classes break dark/light parity.
  - Leaflet basemap tiles also swap on theme inside `ListingsMap.tsx` (CARTO `dark_all` vs `voyager`).
- **Two listing hooks, pick the right one:**
  - `useListings()` — fetch-once, used by views that need all listings (Hero, Match, Chat).
  - `useFilteredListings(initialFilters?)` — refetches whenever filters change; owns the `filters` state. Used by `MapView`. Don't duplicate filter state above this hook.
- **API client** (`api/client.ts`) — `fetchListings(filters)`, `fetchListingById(id)`, `fetchSimilarListings(id)`. Throws `ApiError` with status; base URL is `import.meta.env.VITE_API_BASE ?? ""` (empty string + Vite proxy in dev; set the env var for production builds).
- **Filter type contract** lives in `types/filters.ts`. `filtersToSearchParams` is the single producer of the API query string and must stay aligned with `parseListingFilters` on the API side (`q`, `city`, `source`, `minPrice`, `maxPrice`, `minRooms`).
- **Map** uses `react-leaflet` + `react-leaflet-cluster`. Markers are `L.divIcon` HTML blobs styled inline in `priceIcon()`; the `MapViewport` inner component handles `fitBounds` / selected-listing zoom.

## Conventions worth knowing

- UI copy is in **French** — match the existing tone when adding strings.
- The Figma export referenced in `apps/web/README.md` is visual reference only; `_figma_extract/` is gitignored. Don't paste exported component code.
- Root `data/` is the dumping ground for heavy local datasets (gitignored). `apps/api/data/` is small versioned mock JSON — they are not the same thing.
- The legacy Streamlit dashboard expects Postgres on host port **5433** (not 5432) — only relevant if explicitly working in `legacy/`.
