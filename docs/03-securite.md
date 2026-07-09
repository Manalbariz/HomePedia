# Sécurité — bases HomePedia v2

Document de référence pour les mesures en place et les points de vigilance.

## Mesures implémentées

### HTTP (API)

| Mesure | Module | Détail |
|--------|--------|--------|
| En-têtes sécurisés | `helmet` | CSP, X-Frame-Options, etc. via `apps/api/src/app.ts` |
| CORS restreint | `security.ts` | Variable `CORS_ORIGIN` (défaut `http://localhost:5173`) |
| Limite de débit auth | `chat.ts` | 30 req / 15 min sur `/api/auth/register` et `/login` |
| Limite de débit scrape | `app.ts` | 30 req / 15 min sur `/api/scrape` et `/api/debug-page` |
| Corps JSON limité | `app.ts` | `express.json({ limit: "1mb" })` |
| Scraping désactivé en prod | `security.ts` | `/api/scrape` absent sauf `SCRAPE_ENABLED=1` |
| Recherche utilisateurs | `chat.ts` | Regex échappée (`escapeRegex`) — évite ReDoS MongoDB |
| Socket `group:join` | `socket.ts` | Vérification d'appartenance au groupe avant join |

### Authentification

- Mots de passe hashés avec **bcrypt** (cost 10)
- Tokens **JWT** signés (`JWT_SECRET` obligatoire)
- Middleware `requireAuth` sur routes chat/groups/messages

### Secrets

- **Ne jamais committer** `.env` — utiliser `.env.example` comme modèle
- `JWT_SECRET` : chaîne longue et aléatoire en production
- `MONGODB_URI` : accès restreint (IP allowlist sur Atlas)

## Variables d'environnement

Voir `apps/api/.env.example` :

```env
MONGODB_URI=mongodb://localhost:27017/homepedia
JWT_SECRET=<long-random-string>
CORS_ORIGIN=http://localhost:5173
SCRAPE_ENABLED=0
```

## Points de vigilance (non résolus)

| Risque | Sévérité | Recommandation |
|--------|----------|----------------|
| `POST /api/listings` sans auth | Moyen | Protéger ou limiter en prod |
| JWT 30 jours sans révocation | Moyen | TTL plus court + refresh token |
| Mot de passe min. 6 caractères | Faible | Renforcer la politique |
| Scraping = surface SSRF | Élevé si exposé | Garder `SCRAPE_ENABLED=0` en prod |
| Pas de HTTPS forcé côté app | — | Géré par l'hébergeur (Render, Railway, etc.) |

## Checklist déploiement

- [ ] `JWT_SECRET` unique et fort
- [ ] `CORS_ORIGIN` = URL du frontend uniquement
- [ ] `SCRAPE_ENABLED=0` sauf besoin explicite
- [ ] MongoDB avec authentification + IP allowlist
- [ ] Secrets dans les variables d'environnement de l'hébergeur, pas dans le code
- [ ] Dépendances à jour (`npm audit` périodique)

## Audit local

```powershell
cd apps/api && npm audit
cd apps/web && npm audit
```
