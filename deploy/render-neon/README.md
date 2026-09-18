# Production ZELQANE : Render (backend) + Neon (PostgreSQL) + Cloudflare

| Brique | Où | Détail |
|---|---|---|
| Base PostgreSQL | Neon, projet `zelqane` (`young-mountain-92414995`, Francfort) | offre gratuite, base `zelqane`, rôle `zelqane_user` |
| Backend Spring Boot | Render, service `zelqane-backend` (`srv-damp5qad0e5s73d7b1fg`, Francfort) | offre gratuite, Docker, https://zelqane-backend.onrender.com |
| Anti-veille | Cloudflare Worker `zelqane-keepalive` (`deploy/keepalive`) | appelle `/actuator/health` toutes les 10 min |
| Frontend + domaine | ce PC + Cloudflare Tunnel (`deploy/cloudflare`) | https://zelqane.com |

## Déploiement du backend

- Render reconstruit automatiquement à chaque push de la branche `feat/complete-cahier-des-charges`,
  **uniquement** si `BackEnd/` change (hors `*.md` et `src/test`) : voir `buildFilter` dans `render.yaml`.
- Les secrets (`SPRING_DATASOURCE_*`, `JWT_SECRET`, `MEDIA_SIGNING_SECRET`, `TOTP_ENCRYPTION_KEY`,
  `ZELQANE_ADMIN_INITIAL_PASSWORD`) sont dans les variables d'environnement Render, jamais dans git.
  Les identifiants Neon locaux sont dans `%USERPROFILE%\.zelqane-deploy.env`.
- Flyway applique les nouvelles migrations au démarrage, sur Neon.

## Frontend

```powershell
.\start-local.ps1 -Public -ApiUrl https://zelqane-backend.onrender.com
```

Démarre seulement Next.js et le tunnel : pas de PostgreSQL ni de backend local.

## Limites de l'offre gratuite

- Render : 512 Mo, CPU partagé -> démarrage ~3-4 min après un déploiement, requêtes plus lentes
  qu'en local. 750 h/mois : suffisant pour un seul service éveillé en permanence.
- Disque Render éphémère : les fichiers uploadés (`/app/uploads`) sont perdus à chaque
  redéploiement/redémarrage. À migrer vers Cloudflare R2 pour les garder.
- Neon : 0,5 Go ; le calcul se met en pause après 5 min d'inactivité (réveil < 1 s).
