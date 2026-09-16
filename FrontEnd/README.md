# TPUB — Frontend

Site web et espace client de **TPUB**, le réseau d'affichage numérique extérieur (DOOH) du groupe
Tukhnanutha, en Tunisie.

L'application réunit trois usages :

- **Site vitrine** : présenter TPUB (réseau des Porteurs, fonctionnement, double contrôle IA +
  humain, tarifs sur devis) et convertir les annonceurs. TPUB est en phase de conception : le
  site n'annonce ni nombre d'écrans, ni clients, ni audiences, ni prix (voir
  `docs/tpub-brief.md`, liste « à ne pas affirmer »).
- **Espace annonceur** (`/espace`) : créer une campagne, réserver des écrans, la soumettre à la
  modération IA puis à la validation TPUB, et suivre son avancement.
- **Back-office** (`/admin`) pour l'équipe TPUB : vue d'ensemble, modération (valider / refuser),
  zones et écrans, messages prioritaires. Sans validation administrateur, rien n'est diffusé.

S'y ajoute un **lecteur de démonstration** (`/ecran/[supportId]`) qui simule un écran du réseau.

Interface en français uniquement (`fr-TN`, TND, fuseau Africa/Tunis). Le backend Spring Boot vit
dans `../BackEnd` ; ce dossier ne le modifie jamais.

---

## Stack

| Domaine     | Choix                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| Framework   | Next.js 15.5 (App Router, `output: "standalone"`), React 19                              |
| Langage     | TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`…)                    |
| Styles      | Tailwind CSS v4 (`@tailwindcss/postcss`), jetons CSS dans `src/app/globals.css`          |
| UI          | `radix-ui` (Dialog, Tabs, Toast, Tooltip…), `lucide-react`, `framer-motion`              |
| Formulaires | `zod` (validation côté client et côté route handler)                                     |
| Polices     | Sora (titres, libellés) + Inter (texte) via `next/font/google`                           |
| Tests       | Vitest + Testing Library (jsdom), Playwright + `@axe-core/playwright`                    |
| Qualité     | ESLint flat config (typescript-eslint typé, react-hooks, jsx-a11y, @next/next), Prettier |

## Prérequis

- **Node.js ≥ 22** (développé avec Node 24 et npm 11)
- Pour la démo complète : le backend TPUB (`../BackEnd`, Java 21 + PostgreSQL), par exemple via le
  `docker-compose.yml` à la racine du dépôt.
- Pour les tests e2e : les navigateurs Playwright (`npx playwright install chromium`).

## Installation

```bash
npm install
cp .env.example .env.local
```

Contenu de `.env.local` :

```dotenv
# URL du backend Spring, lue uniquement côté serveur par le pont /api
TPUB_API_URL=http://localhost:8080
# Optionnel : les demandes du formulaire de contact sont transmises en JSON à ce webhook
CONTACT_WEBHOOK_URL=
# Optionnel : URL publique du site (métadonnées OpenGraph, sitemap)
SITE_URL=http://localhost:3000
# Optionnel (au build) : clé CARTO des fonds de la carte du réseau ; sans clé, fonds gris Esri
NEXT_PUBLIC_CARTO_API_KEY=
```

La seule variable `NEXT_PUBLIC_*` est la clé publique CARTO des fonds de carte (les tuiles
CARTO sans clé portent le filigrane « API KEY REQUIRED ») : le navigateur ne connaît jamais l'adresse du
backend. **Inutile de configurer le CORS de Spring** (`CORS_ALLOWED_ORIGINS`) : toutes les
requêtes du navigateur restent sur la même origine et passent par le pont Next.js.

Sans `CONTACT_WEBHOOK_URL`, chaque demande de contact est ajoutée sur une ligne de
`.data/contact-requests.ndjson` (dossier ignoré par git).

## Scripts

| Commande                          | Rôle                                                      |
| --------------------------------- | --------------------------------------------------------- |
| `npm run dev`                     | Serveur de développement sur http://localhost:3000        |
| `npm run build`                   | Build de production (sortie `standalone`)                 |
| `npm run start`                   | Sert le build de production sur le port 3000              |
| `npm run typecheck`               | `tsc --noEmit`                                            |
| `npm run lint` / `lint:fix`       | ESLint                                                    |
| `npm run format` / `format:check` | Prettier                                                  |
| `npm run test` / `test:watch`     | Tests unitaires Vitest                                    |
| `npm run test:e2e`                | Tests Playwright (nécessite `npm run build` au préalable) |
| `npm run check`                   | `typecheck` + `lint` + `test`                             |

---

## Architecture

### Pont backend et session httpOnly

```
Navigateur ──► /api/session/*  ──► Spring /api/auth/*   (login, register : sans en-tête Authorization)
           ──► /api/<chemin>   ──► Spring /api/<chemin> (+ Authorization: Bearer <cookie tpub_token>)
           ──► /api/contact    ──► webhook ou .data/contact-requests.ndjson
```

- `src/app/api/[...path]/route.ts` relaie GET/POST/PUT/PATCH/DELETE vers
  `${TPUB_API_URL}/api/<chemin>` avec la query string, le corps et le signal d'annulation. Il
  refuse `/api/auth/*` (404), traduit un backend injoignable en **502** avec un message français,
  et transforme le 403 à corps vide renvoyé par Spring pour un jeton expiré en **401 « Session
  expirée »** (cookies effacés).
- `src/app/api/session/` : `POST login`, `POST register`, `POST logout`, `GET` (utilisateur
  courant). En cas de succès, deux cookies **httpOnly** sont posés : `tpub_token` (le JWT, durée
  alignée sur son `exp`, 24 h par défaut) et `tpub_user` (`email`, `nom`, `role`, `userId`, `exp`).
  Le jeton n'est jamais renvoyé au navigateur.
- `src/middleware.ts` protège les routes : `/espace/**` réservé aux `ANNONCEUR`, `/admin/**` aux
  `ADMINISTRATEUR | SUPERVISEUR | OPERATEUR`, visiteur non connecté redirigé vers
  `/connexion?next=…`. Spring reste l'autorité sur les droits.
- `src/lib/api/` : `client.ts` (`apiFetch`, erreurs typées `ApiError` / `ApiTransportError`,
  événement `tpub:session-expired` sur 401), `messages.ts` (traduction des messages Spring et Bean
  Validation), `types.ts` (types du contrat), `endpoints.ts` (une fonction par endpoint, statuts
  normalisés en majuscules).
- `src/lib/use-resource.ts` : chargement client avec annulation (pas de store global).
  `src/lib/campaign-status.ts` : libellés, tons, étapes et états dérivés (« Programmée »,
  « Terminée »). `src/lib/format.ts` : TND, dates `fr-TN`, heures `HH:mm:ss`.

### Carte des routes

| Zone                      | Routes                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitrine `(marketing)`     | `/`, `/annonceurs`, `/reseau`, `/fonctionnement`, `/tarifs`, `/faq`, `/a-propos`, `/contact`, `/mentions-legales`, `/confidentialite`, `/cgu`, `/cookies`                                                     |
| Authentification `(auth)` | `/connexion`, `/inscription`, `/mot-de-passe-oublie`                                                                                                                                                          |
| Espace annonceur          | `/espace`, `/espace/campagnes`, `/espace/campagnes/nouvelle`, `/espace/campagnes/[id]`, `/espace/campagnes/[id]/modifier`, `/espace/reservations`, `/espace/statistiques`, `/espace/reseau`, `/espace/profil` |
| Back-office               | `/admin`, `/admin/moderation`, `/admin/reseau`, `/admin/urgences`                                                                                                                                             |
| Lecteur                   | `/ecran/[supportId]`                                                                                                                                                                                          |
| API Next                  | `/api/[...path]`, `/api/session`, `/api/session/login`, `/api/session/register`, `/api/session/logout`, `/api/contact`                                                                                        |
| Divers                    | `robots.txt` (exclut `/espace`, `/admin`, `/ecran`), `sitemap.xml`, pages 404 / erreur                                                                                                                        |

L'assistant de campagne suit l'ordre imposé par le backend, en 3 étapes (`?id=&etape=1|2|3`) :
Détails (`POST /campaigns`, l'id est conservé dans l'URL) → Porteurs (disponibilités vérifiées
avant sélection, réservation au clic sur « Réserver N Porteurs et continuer ») → Vérification &
envoi (aperçu du visuel facultatif et local, `POST /campaigns/{id}/submit` puis
`POST /ai/check-content/{id}`).

### Carte du réseau & Studio 3D

Spécification : `docs/NETWORK-MAP-SPEC.md`. MapLibre et three.js ne sont chargés que côté client
(`next/dynamic`, `ssr: false`) sur les pages qui en ont besoin, jamais sur la vitrine.

- **Où** : `/espace/reseau` (explorateur annonceur), onglet « Carte » de l'étape « Zones & écrans »
  de `/espace/campagnes/nouvelle`, vue « Carte » de `/admin/reseau` (outils TPUB).
- **Tous les Porteurs, à leur emplacement exact** : aucun regroupement par défaut. La carte s'ouvre
  cadrée sur l'ensemble des Porteurs (et le cercle de leurs zones) ; en vue d'ensemble (zoom < 9)
  chaque Porteur est un point compact (couleur du type, anneau d'état), la lettre apparaît dès le
  zoom 9. Les Porteurs qui se chevauchent sont écartés en éventail autour d'un petit point relié par
  un trait fin à leur position exacte (recalculé à chaque zoom). Le compteur indique « 8 Porteurs
  affichés sur 8 » et, si un filtre en masque, « n masqués par les filtres » avec « Tout afficher ».
  Carte, liste, Studio 3D et inspecteur admin donnent la latitude / longitude (« Copier les
  coordonnées », « Ouvrir dans OpenStreetMap »).
- **Outils de la carte** (barre vitrée, navigable aux flèches ; menu sur mobile) : zoom, recentrer
  (« tous les Porteurs » ou « toute la Tunisie »), ma position, plein écran, fond de carte (Sombre,
  Clair, Satellite), couches (zones, Porteurs, orientations, étiquettes, « Regrouper les Porteurs
  proches » en option), vue 2D/3D, mesurer (`M`, Échap pour terminer), zone de chalandise (`C`),
  recherche, filtres (`F` : type A–D, statut, réservables), légende (`L`).
  Administration : « Placer un Porteur », « Créer une zone », glisser un Porteur pour le déplacer,
  poignée de rayon d'une zone, panneau « Cohérence ». Sans WebGL, une carte SVG simplifiée prend le
  relais (mêmes positions exactes, vue rapprochée du Grand Tunis quand les Porteurs s'y
  concentrent) ; la liste des Porteurs reste l'équivalent non visuel de la carte.
- **Studio 3D** (clic sur un Porteur) : maquette three.js du Porteur (type, hauteur de mât,
  orientation), points d'intérêt, visuel de l'annonceur sur l'écran (aperçu local), jour/nuit,
  points de vue `1`–`5` (orbite, piéton, conducteur, drone, face écran), `R` pour réinitialiser.
  Le configurateur réserve le Porteur sur l'un de vos brouillons (statut relu juste avant l'envoi)
  avec la zone du Porteur ; les jours déjà réservés sont indisponibles en entier.
- **Paramètres d'URL** de `/espace/reseau` (partageables) :

  | Paramètre                         | Effet                                                                                                                                                           |
  | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `?zone=<id>`                      | cadre et met en avant la zone                                                                                                                                   |
  | `?porteur=<id>`                   | ouvre le Studio 3D de ce Porteur (« Porteur introuvable » sinon)                                                                                                |
  | `?vue=3d`                         | carte inclinée avec colonnes proportionnelles à la hauteur de mât                                                                                               |
  | `?fond=clair` / `?fond=satellite` | fond de carte (Sombre par défaut)                                                                                                                               |
  | `?regrouper=1`                    | regroupe les Porteurs proches en pastilles de nombre sous le zoom 9 (désactivé par défaut : chaque Porteur est affiché)                                         |
  | `?repere=1`                       | mode repère du studio : axes, grille 1 m / 5 m, boîte englobante, ancres, caméra et « Copier la vue » (aussi dans la fenêtre « Voir en 3D » de `/admin/reseau`) |

- **Modèles GLB** : déposez `porteur-type-a.glb` … `porteur-type-d.glb` (ou un générique
  `porteur.glb`) dans `public/models/` ; ils remplacent le Porteur procédural sans modification de
  code. Format (glTF binaire, Y vers le haut, mètres, origine au centre de la base, face principale
  vers −Z), noms des nœuds `Screen_*` / `Energy_Sphere` / `Hotspot_*`, budgets et calibration avec
  `?repere=1` : `docs/PORTEUR-3D.md`.
- **Fonds de carte** : clé `NEXT_PUBLIC_CARTO_API_KEY` au build pour les fonds CARTO, sinon fonds
  gris Esri sans clé (voir Installation).

### Système de design

- Palette sombre TPUB (rouge = marque et signal, orange = énergie et accroches, bleu = confiance,
  données, liens et bouton principal dans les espaces connectés). Jetons et utilitaires dans
  `src/app/globals.css` ; aucune couleur en dur dans les composants.
- Effets signature définis une seule fois : fond aurora, cartes glass, accroches (eyebrows),
  texte en dégradé, cadres d'image avec trame LED, filets tricolores, apparition au défilement,
  compteurs animés, point « démo » pulsé. Toutes les animations respectent
  `prefers-reduced-motion` et le contenu reste visible sans JavaScript.
- Composants partagés : `src/components/ui` (boutons, champs, dialogues, toasts, onglets,
  tableaux responsives, pastilles de statut, stepper…), `src/components/marketing` (sections,
  en-tête et pied de page, écran de diffusion, pipeline de modération…), `src/components/shell`
  (AppShell, session). Référence détaillée : `docs/COMPONENTS.md`.
- Accessibilité : lien d'évitement, landmarks, un seul `h1` par page, focus visible, cibles de
  44 px, `aria-live` pour les résultats asynchrones, statuts jamais signalés par la seule couleur.

### Expérience utilisateur

Plan et critères d'acceptation : `docs/UX-PLAN.md`. Mêmes règles dans l'espace annonceur et le
back-office.

- **Navigation** : un seul shell (barre latérale groupée ≥ 1024 px, tiroir et barre d'onglets en
  bas sur mobile, masquée sur `/espace/reseau` et dans l'assistant). Le fil d'Ariane vit dans la
  barre du haut (« ‹ Parent » sur mobile) ; 404, erreurs et accès refusés restent dans le shell.
  Filtres, tri, onglets et objets ouverts (`?statut=`, `?tri=`, `?porteur=`, `?examen=`) sont dans
  l'URL : rechargement, Retour et partage conservent l'état.
- **Palette `Ctrl K` / `⌘K`** (bouton « Rechercher… » en haut, y compris depuis un champ) :
  pages, actions, récents, campagnes, Porteurs et zones déjà chargés, filtrés sans tenir compte des
  accents. `↑`/`↓` pour naviguer, `Entrée` pour ouvrir, `Ctrl/⌘ Entrée` pour un nouvel onglet.
  Aucune recherche côté serveur.
- **Raccourcis** : `?` affiche la feuille (aussi dans le menu d'aide). Partout : `/` recherche de
  la page, `G` puis `D`/`C`/`R`/`V`/`S` (espace) ou `A`/`M`/`R`/`U` (back-office), `N` nouvelle
  campagne (espace, hors assistant). Sur leurs pages : carte (`M`, `C`, `F`, `L`), Studio 3D
  (`1`–`5`, `R`), examen de modération (`J`/`K`, `V`, `R`, `Échap`). Les raccourcis à une touche ne
  s'activent jamais dans un champ et peuvent être désactivés depuis la feuille.
- **Sélecteur de dates** : saisie `jj/mm/aaaa` (chiffres seuls, barres ajoutées) ou calendrier
  commençant le lundi, au clavier (flèches, `Page ↑/↓`, `Entrée`, `Échap` rend le focus au champ),
  durées rapides et rappel en toutes lettres (« du samedi 3 octobre au vendredi 23 octobre 2026 »).
- **Apparence** : thème sombre TPUB uniquement (`<html data-theme="dark">`). Les jetons de
  surcouche et le test de contraste sont en place ; le thème clair reste différé tant que le
  contraste n'est pas garanti sur la carte, le Studio 3D et les graphiques.
- **Brouillons auto-sauvegardés** : toute saisie est gardée dans `sessionStorage` (24 h) et
  restaurée au rechargement (« Saisie restaurée · Effacer ») ; dès que le brouillon existe côté
  serveur, l'assistant l'enregistre automatiquement (« Enregistré · il y a 5 s »). Quitter un
  formulaire modifié demande « Quitter sans enregistrer ? ». Un bandeau prévient 10 min avant la
  fin de session ; à l'expiration, une fenêtre invite à se reconnecter sans perdre la saisie.
- **États** : chargement lent annoncé après 4 s (« Réessayer » après 8 s), lenteur distinguée de
  l'absence de réseau, données partielles signalées dans la section concernée, estimations
  toujours étiquetées « Estimation ».

### Sources de contenu

| Contenu                                         | Emplacement                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Coordonnées, liens du groupe et réseaux sociaux | `src/content/site.ts` (seule source)                                                                       |
| Navigation                                      | `src/content/nav.ts`                                                                                       |
| Textes des pages vitrine                        | `src/components/home/content.ts`, `src/components/offer/*-content.ts`, `src/components/story/*-content.ts` |
| Rédactionnel de référence et garde-fous         | `docs/tpub-brief.md`                                                                                       |
| Photographies                                   | `public/images/` ; logos dans `public/brand/`                                                              |
| Contrat d'API                                   | `docs/api-contract.md`                                                                                     |

---

## Tests

### Unitaires — Vitest

```bash
npm run test
```

Testing Library sous jsdom (`matchMedia` simulé en mouvement réduit). Les tests se trouvent dans
`src/**/__tests__/` : client API et traductions, cookies de session, pont et routes de session,
formulaire de contact, statuts de campagne, schémas et assistant, KPI et graphiques de l'espace,
modération, lecteur.

### Bout en bout — Playwright avec API simulée

```bash
npm run build
npx playwright test                    # tout (desktop 1440×900 + mobile Pixel 5)
npx playwright test --grep @screens    # uniquement les captures
```

- Aucun backend ni base de données n'est nécessaire : chaque appel navigateur à `/api/**` est
  intercepté par `e2e/fixtures/api.ts` (données de `e2e/fixtures/demo-data.ts`). Le serveur de
  test pointe `TPUB_API_URL` vers un port fermé, pour que toute requête non simulée échoue
  immédiatement avec le 502 du pont.
- `e2e/smoke.spec.ts` : chaque route affiche son `h1` sans erreur console, gardes de rôles,
  audit axe WCAG 2.1 AA (aucune violation sérieuse ou critique).
- `e2e/flows.spec.ts` : connexion, assistant complet (brouillon → réservation → soumission →
  résultat IA), validation par un administrateur.
- `e2e/screens.spec.ts` (`@screens`) : captures pleine page et par tranches d'écran dans
  `.qa/screens/<desktop|mobile>/` (dossier ignoré par git), prises en mouvement réduit.

Le serveur est lancé sur `http://127.0.0.1:4310` (`E2E_PORT` pour changer). Hors CI, un serveur
déjà démarré sur ce port est réutilisé : arrêtez-le après un nouveau build.

---

## Démo avec le vrai backend

1. **Backend** : démarrer PostgreSQL et Spring (`docker compose up` à la racine, ou `../BackEnd`
   en local). Pour une analyse IA instantanée et déterministe, définir dans le `.env` racine :

   ```dotenv
   OPENAI_ENABLED=false
   ```

2. **Frontend** : `TPUB_API_URL=http://localhost:8080` dans `.env.local`, puis `npm run dev`.
3. **Compte administrateur** créé au premier démarrage : `admin@tpub.local` / `Admin@123`.
   C'est le seul contenu initial : aucune zone, aucun écran, aucun annonceur.
4. **Réseau** : se connecter en administrateur, ouvrir `/admin/reseau` et créer quelques zones
   (par exemple Tunis Centre, Les Berges du Lac, La Marsa, Sousse Centre, Sfax Centre) puis des
   écrans rattachés, avec l'état technique `ACTIF` (seuls les écrans actifs sont proposés aux
   annonceurs).
5. **Annonceur** : se déconnecter, créer un compte sur `/inscription` (l'inscription crée
   toujours un `ANNONCEUR`).
6. **Campagne** : `/espace/campagnes/nouvelle` → renseigner la campagne, réserver un ou plusieurs
   écrans, passer le créatif, puis « Soumettre à la modération ». Avec l'IA locale, la campagne est
   approuvée ; mettre « gratuit » dans l'objectif pour obtenir une revue manuelle.
7. **Validation** : en administrateur, `/admin/moderation` → « Examiner » → « Valider ».
8. **Lecteur** : ouvrir `/ecran/<id de l'écran>`. Le lecteur interroge
   `GET /api/diffusion/next` avec l'heure locale courante : la campagne n'apparaît que si la date
   et la plage horaire du jour sont couvertes (sinon le contenu TPUB par défaut s'affiche).
   Chaque appel ajoute une ligne au journal de diffusion. Un message prioritaire créé dans
   `/admin/urgences` prend le pas sur les publicités.
9. **Suivi** : `/espace` et `/espace/statistiques` côté annonceur, `/admin` pour les chiffres
   globaux de la plateforme.

Les mêmes étapes, sous forme d'appels HTTP, figurent dans `docs/api-contract.md` §8.

## Limites du backend contournées par l'interface

Détail complet dans `docs/api-contract.md` §7.

- **Pas d'envoi de fichiers** : l'étape créatif affiche un aperçu local et l'indique clairement ;
  rien n'est téléversé.
- **`submit` ne lance pas l'IA** : l'interface enchaîne `submit` puis `ai/check-content`.
- **`REJECTED_BY_AI` est une impasse** : l'interface propose « Dupliquer et corriger ».
- **Campagne `REVIEW_REQUIRED` validée = jamais diffusée** : avertissement dans la modération.
- **Statuts jamais posés** : « Programmée » et « Terminée » sont déduits des dates.
- **Pas de statistiques par annonceur** : les chiffres de l'espace sont calculés côté client à
  partir des campagnes et réservations de l'annonceur ; `/statistics/dashboard` est réservé au
  back-office.
- **Pas d'annulation de réservation, pas de profil, pas de mot de passe oublié** : l'interface
  l'explique et oriente vers TPUB.
- **403 à corps vide au lieu de 401, messages en anglais** : le pont et `messages.ts` produisent
  des erreurs françaises cohérentes.
- **Pas de contrôle de propriété** : l'espace ne navigue qu'à partir de `/campaigns/mine`.
- **Rapport IA absent = 400** : affiché comme « pas encore analysée ».
- **Suppression d'une zone qui a des écrans** : message métier explicite au lieu de l'erreur
  générique de format.

---

## Déploiement

Le `Dockerfile` (Node 22 Alpine, multi-étapes) produit une image basée sur la sortie
`standalone` de Next.js :

```bash
docker build -t tpub-frontend .
docker run -p 3000:3000 -e TPUB_API_URL=http://backend:8080 tpub-frontend
```

- Utilisateur non root, `node server.js` sur le port 3000.
- `TPUB_API_URL` vaut `http://backend:8080` par défaut, ce qui correspond au service `backend`
  lorsque l'image rejoint le `docker-compose.yml` racine.
- Définir `SITE_URL` (et éventuellement `CONTACT_WEBHOOK_URL`) en production. Sans webhook, les
  demandes de contact sont écrites dans `/app/.data` : monter un volume pour les conserver.
- En production (`NODE_ENV=production`), les cookies de session sont marqués `Secure` : servir
  le site en HTTPS.
