# Production ZELQANE : Cloudflare (frontend, fichiers) + Render (backend) + Neon (PostgreSQL)

Le PC n'est plus nécessaire : tout tourne en ligne, gratuitement.

| Brique | Où | Détail |
|---|---|---|
| Base PostgreSQL | Neon, projet `zelqane` (`young-mountain-92414995`, Francfort) | offre gratuite, base `zelqane`, rôle `zelqane_user` |
| Backend Spring Boot | Render, service `zelqane-backend` (`srv-damp5qad0e5s73d7b1fg`, Francfort) | offre gratuite, Docker, https://zelqane-backend.onrender.com |
| Anti-veille | Cloudflare Worker `zelqane-keepalive` (`deploy/keepalive`) | appelle `/actuator/health` toutes les 10 min |
| Frontend + domaine | Cloudflare Worker `zelqane-frontend` (OpenNext, `FrontEnd/wrangler.jsonc`) | https://zelqane.com, https://www.zelqane.com |
| Fichiers uploadés | R2 `zelqane-media` via le Worker `zelqane-media` (`deploy/media-store`) | le backend garde un cache disque rechargé depuis R2 |
| Formulaire de contact | R2 `zelqane-contact` (`requests/<date>/<id>.json`) | binding `CONTACT_BUCKET` du frontend |

## Déploiement du backend

- Le service Render n'est pas relié à GitHub (le dépôt appartient à un autre compte) : un push ne
  déclenche rien. Après un `git push` qui touche `BackEnd/`, lancer
  `powershell -ExecutionPolicy Bypass -File deploy\render-neon\deploy-backend.ps1`
  (reconstruit le commit poussé ; ~10 min de build + ~4 min de démarrage). Aucun build n'a lieu
  pour le frontend ou la documentation. Si le dépôt est un jour relié à Render, `buildFilter`
  (`render.yaml`) limite les builds automatiques à `BackEnd/`.
- Les secrets (`SPRING_DATASOURCE_*`, `JWT_SECRET`, `MEDIA_SIGNING_SECRET`, `TOTP_ENCRYPTION_KEY`,
  `ZELQANE_ADMIN_INITIAL_PASSWORD`) sont dans les variables d'environnement Render, jamais dans git.
  Les identifiants Neon locaux sont dans `%USERPROFILE%\.zelqane-deploy.env`.
- Flyway applique les nouvelles migrations au démarrage, sur Neon.

## Frontend

```powershell
cd FrontEnd
npm run cf:deploy     # build OpenNext + déploiement du Worker (routes zelqane.com et www)
npm run cf:preview    # essai local dans le runtime Workers
```

Aucun build Render n'est déclenché. Le tunnel (`deploy/cloudflare`, `start-local.ps1 -Public`) reste
une solution de secours : les routes du Worker passent avant lui.

## Limites de l'offre gratuite

- Render : 512 Mo, CPU partagé -> démarrage ~3-4 min après un déploiement, requêtes plus lentes
  qu'en local. 750 h/mois : suffisant pour un seul service éveillé en permanence.
- Disque Render éphémère : compensé par R2 (chaque fichier y est copié, puis rechargé à la demande).
- Neon : 0,5 Go ; le calcul se met en pause après 5 min d'inactivité (réveil < 1 s).
- Worker frontend : ~2 Mo compressés, sous la limite de 3 Mo de l'offre gratuite ; images servies
  sans optimisation Next (`ZELQANE_TARGET=cloudflare`).

## Comptes de test

`test.admin@zelqane.com` (administrateur) et `test.annonceur@zelqane.com` (annonceur validé).
Mots de passe : `%USERPROFILE%\.zelqane-test-accounts.txt` (hors dépôt).
