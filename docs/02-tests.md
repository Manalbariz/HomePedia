# Tests automatisés

HomePedia utilise **Vitest** pour les tests unitaires et d'intégration légers.

## Lancer les tests

```powershell
# API
cd apps/api
npm install
npm test

# Web
cd apps/web
npm install
npm test
```

Mode watch : `npm run test:watch`

## Couverture actuelle

### API (`apps/api`)

| Fichier | Type | Cible |
|---------|------|-------|
| `src/filters.test.ts` | Unit | Filtres listings, similarité |
| `src/auth.test.ts` | Unit | JWT, middleware `requireAuth` |
| `src/security.test.ts` | Unit | Échappement regex |
| `src/listings.routes.test.ts` | Integration | Routes `/api/health`, `/api/listings` (supertest) |
| `src/auth.routes.test.ts` | Integration | Register / login / me (MongoDB en mémoire) |

### Web (`apps/web`)

| Fichier | Type | Cible |
|---------|------|-------|
| `src/types/filters.test.ts` | Unit | `filtersToSearchParams`, `countActiveFilters` |
| `src/api/client.test.ts` | Unit | Client HTTP, token, `ApiError` |

## CI

La workflow `.github/workflows/ci.yml` exécute `npm test` sur chaque push/PR vers `main`, en plus du typecheck et du build.

## Bonnes pratiques

- **Contrat filtres** : toute modification de `apps/api/src/filters.ts` ou `apps/web/src/types/filters.ts` doit être reflétée des deux côtés + tests.
- **Nouvelle route API** : ajouter un test supertest dans `listings.routes.test.ts` ou un fichier dédié.
- **Logique pure** : préférer des fonctions testables sans I/O (comme `filters.ts`) plutôt que des tests E2E lourds.
- **Playwright / scraping** : non testé en CI (trop lourd) ; les parseurs HTML peuvent recevoir des fixtures statiques plus tard.

## Prochaines étapes suggérées

- Tests composants React (`ListingCard`, `MapFiltersPanel`) avec Testing Library
- Fixtures HTML pour les scrapers (`apps/api/src/scrapers/*.test.ts`)
- E2E Playwright optionnel (navigation hero → map)
