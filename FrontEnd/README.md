# TPUB — Frontend

Site web et espace client de **TPUB**, le réseau d'affichage numérique extérieur (DOOH) du groupe
Tukhnanutha, en Tunisie.

L'application réunit trois usages :

- **Site vitrine** : présenter TPUB (réseau des Porteurs, fonctionnement, double contrôle IA +
  humain, tarifs sur devis) et convertir les annonceurs. TPUB est en phase de conception : le
  site n'annonce ni nombre d'écrans, ni clients, ni audiences, ni prix (voir
  `docs/tpub-brief.md`, liste « à ne pas affirmer »).
- **Espace annonceur** (`/espace`) : créer une campagne (visuels, zone sur la carte, créneaux),
  réserver des Porteurs, la soumettre à l'analyse IA puis à la validation TPUB, suivre son
  avancement, ses statistiques, ses réservations et son profil (sessions, mot de passe, logo).
- **Back-office** (`/admin`) pour l'équipe TPUB : vue d'ensemble, modération (rapport IA,
  valider / refuser / bloquer), réservations et conflits, réseau (zones, Porteurs,
  indisponibilités), messages prioritaires, statistiques, utilisateurs, journal (audit, décisions
  IA, diffusions) et règles IA. Sans validation administrateur, rien n'est diffusé.

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
  relaie les corps multipart / binaires octet par octet (413 au-delà de 60 Mo) et les
  téléchargements CSV, et transforme un 401 de fin de session (`TOKEN_EXPIRED`,
  `SESSION_REVOKED`, `ACCOUNT_DISABLED`…) en **401 « Session expirée »** (cookies effacés).
- `src/app/uploads/[...path]/route.ts` relaie les médias publics `/uploads/**` (flux, `Range`,
  cache), sans cookie ni jeton.
- `src/app/api/session/` : `POST login`, `POST register`, `POST logout` (révoque la session
  côté Spring via `POST /api/me/logout`, puis efface les cookies), `GET` (utilisateur courant). En cas de succès, deux cookies **httpOnly** sont posés : `tpub_token` (le JWT, durée
  alignée sur son `exp`, 24 h par défaut) et `tpub_user` (`email`, `nom`, `role`, `userId`, `exp`).
  Le jeton n'est jamais renvoyé au navigateur.
- `src/middleware.ts` protège les routes : `/espace/**` réservé aux `ANNONCEUR`, `/admin/**` aux
  `ADMINISTRATEUR | SUPERVISEUR | OPERATEUR`, visiteur non connecté redirigé vers
  `/connexion?next=…`. Spring reste l'autorité sur les droits.
- `src/lib/api/` : `client.ts` (`apiFetch`, erreurs typées `ApiError` / `ApiTransportError`,
  événement `tpub:session-expired` sur 401), `messages.ts` (libellé français de chaque `code`
  d'erreur du backend), `types.ts` (types du contrat), `endpoints.ts` (une fonction par endpoint, statuts
  normalisés en majuscules).
- `src/lib/use-resource.ts` : chargement client avec annulation (pas de store global).
  `src/lib/campaign-status.ts` : libellés, tons, étapes et états dérivés (« Programmée »,
  « Terminée »). `src/lib/format.ts` : TND, dates `fr-TN`, heures `HH:mm:ss`.

### Carte des routes

| Zone                      | Routes                                                                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vitrine `(marketing)`     | `/`, `/annonceurs`, `/reseau`, `/fonctionnement`, `/tarifs`, `/faq`, `/a-propos`, `/contact`, `/mentions-legales`, `/confidentialite`, `/cgu`, `/cookies`                                                                                                                                        |
| Authentification `(auth)` | `/connexion`, `/inscription`, `/mot-de-passe-oublie`                                                                                                                                                                                                                                             |
| Espace annonceur          | `/espace`, `/espace/campagnes`, `/espace/campagnes/nouvelle`, `/espace/campagnes/[id]`, `/espace/campagnes/[id]/modifier`, `/espace/reservations`, `/espace/statistiques`, `/espace/reseau`, `/espace/profil`                                                                                    |
| Back-office               | `/admin`, `/admin/moderation`, `/admin/reservations`, `/admin/reseau`, `/admin/urgences`, `/admin/statistiques`, `/admin/journal`, `/admin/utilisateurs`, `/admin/regles-ia` (superviseur en lecture seule ; opérateur : vue d'ensemble, réseau, urgences, statistiques, journal des diffusions) |
| Lecteur                   | `/ecran/[supportId]`                                                                                                                                                                                                                                                                             |
| API Next                  | `/api/[...path]`, `/api/session`, `/api/session/login`, `/api/session/register`, `/api/session/logout`, `/api/contact`, `/uploads/[...path]`                                                                                                                                                     |
| Divers                    | `robots.txt` (exclut `/espace`, `/admin`, `/ecran`), `sitemap.xml`, pages 404 / erreur                                                                                                                                                                                                           |

L'assistant de campagne compte 4 étapes (`?id=&etape=1|2|3|4`, reprise possible depuis l'URL) :
Détails (`POST /campaigns`, créneaux Matin / Après-midi / Soir / Journée ou personnalisé) →
Contenu (envoi réel des images, bannières et vidéos, pré-analyse IA facultative) → Zone & Porteurs
(jusqu'à 5 cercles point + rayon sur la carte ou depuis les zones recommandées, disponibilités par
statut, réservation groupée explicite, créneaux alternatifs si la zone est saturée) → Vérification
(liste de contrôle, estimation, un seul `POST /campaigns/{id}/submit` qui lance l'analyse IA et
affiche son résultat).

### Carte du réseau & Studio 3D

Spécification : `docs/NETWORK-MAP-SPEC.md`. MapLibre et three.js ne sont chargés que côté client
(`next/dynamic`, `ssr: false`) sur les pages qui en ont besoin, jamais sur la vitrine.

- **Où** : `/espace/reseau` (explorateur annonceur), carte de ciblage de l'étape « Zone & Porteurs »
  de `/espace/campagnes/nouvelle` (clic pour placer un cercle, poignée de rayon), vue « Carte » de
  `/admin/reseau` (outils TPUB), choix du point des messages prioritaires.
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
  orientation), points d'intérêt, visuel de la campagne sur l'écran (média envoyé, sinon aperçu
  local), jour/nuit, points de vue `1`–`5` (orbite, piéton, conducteur, drone, face écran), `R`
  pour réinitialiser. Le configurateur réserve le Porteur sur l'un de vos brouillons (statut relu
  juste avant l'envoi) : les cercles existants de la campagne sont conservés et un cercle
  « Sélection du réseau » couvrant le Porteur est ajouté si besoin.
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
- `e2e/flows.spec.ts` : connexion, assistant en 4 étapes (détails → envoi d'un visuel → zone
  recommandée et réservation → soumission avec analyse IA), validation par un administrateur.
- `e2e/network.spec.ts` : explorateur du réseau, Studio 3D, carte de ciblage de l'assistant,
  outils de la carte du back-office.
- `e2e/screens.spec.ts` (`@screens`) : captures pleine page et par tranches d'écran dans
  `.qa/screens/<desktop|mobile>/` (dossier ignoré par git), prises en mouvement réduit.

Le serveur est lancé sur `http://127.0.0.1:4310` (`E2E_PORT` pour changer). Hors CI, un serveur
déjà démarré sur ce port est réutilisé : arrêtez-le après un nouveau build.

---

## Démo avec le vrai backend

Sous Windows, sans Docker, depuis la racine du dépôt (JDK et PostgreSQL portables dans
`%LOCALAPPDATA%\tpub-jdk` et `%LOCALAPPDATA%\tpub-postgres`) :

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Seed   # PostgreSQL + Spring (8080) + Next (3000)
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Stop   # tout arrêter
```

Le script applique les migrations Flyway au démarrage de Spring, réutilise le JAR de
`../BackEnd/target` et le build `.next` s'ils existent (supprimez-les après une modification pour
reconstruire) et lance l'analyse IA locale (`TPUB_AI_PROVIDER=local` sauf si la variable est déjà
définie). Avec Docker : copiez `.env.example` en `.env`, remplacez chaque `<…>` (le backend
refuse de démarrer sans `JWT_SECRET` ou avec une valeur d'exemple), `docker compose up` à la
racine, puis `TPUB_API_URL=http://localhost:8080` et `npm run dev`.

> **Sécurité — secret JWT compromis.** Le secret JWT autrefois écrit dans `.env.example` et
> `start-local.ps1` reste lisible dans l'historique git : il doit être considéré comme
> **compromis**. Le backend refuse désormais de démarrer avec cette valeur, et chaque déploiement
> doit générer son propre `JWT_SECRET` (au moins 32 octets). Aucun secret n'est plus versionné.

**Secrets locaux** : au premier lancement, `start-local.ps1` crée `.tpub-local.secrets` à la
racine (ignoré par git) avec `JWT_SECRET`, `MEDIA_SIGNING_SECRET`, `TOTP_ENCRYPTION_KEY` et
`TPUB_ADMIN_INITIAL_PASSWORD`, puis le réutilise. Supprimer ce fichier régénère les secrets : les
sessions, les liens de médias et **les doubles authentifications** déjà activées deviennent
invalides (chaque compte doit réactiver son application). Le profil Spring `local` active l'heure
simulée du lecteur (`?datetime=`) ; hors de ce profil, le serveur utilise son horloge.

**Compte administrateur** : sur une base neuve, `admin@tpub.local` est créé avec le mot de passe
`TPUB_ADMIN_INITIAL_PASSWORD` de `.tpub-local.secrets` (sans cette variable, hors start-local, un
mot de passe aléatoire est affiché une seule fois dans le journal du backend et doit être changé à
la première connexion sur `/mot-de-passe-requis`). **Une base existante garde son administrateur
et son ancien mot de passe** (la migration V7 ne force aucun changement) : changez-le depuis
`/admin/compte`, puis relancez les scripts avec `TPUB_ADMIN_PASSWORD=<nouveau mot de passe>`.

**OCR** : sans `BackEnd\tessdata\fra.traineddata`, l'OCR est simulé ; lancez
`BackEnd\scripts\fetch-tessdata.ps1` pour activer Tesseract (start-local ne télécharge rien).

**Données de démo** (`node scripts/seed-demo.mjs`, idempotent, lancé par `-Seed`) : 5 zones,
10 Porteurs couvrant tous les états techniques, une indisponibilité planifiée, 2 règles IA en plus
des 8 de la migration, les comptes ci-dessous, 4 campagnes créées par le vrai parcours (une en
diffusion aujourd'hui, une à valider, une en revue manuelle, un brouillon) et l'appairage des
écrans.

| Rôle                      | E-mail                   | Mot de passe                                               |
| ------------------------- | ------------------------ | ---------------------------------------------------------- |
| Administrateur            | `admin@tpub.local`       | `TPUB_ADMIN_PASSWORD`, sinon `.tpub-local.secrets`          |
| Administrateur (2ᵉ)       | `admin2@tpub.local`      | `scripts/.demo-accounts.json` (généré au premier seed)      |
| Superviseur               | `superviseur@tpub.local` | `scripts/.demo-accounts.json`                               |
| Opérateur                 | `operateur@tpub.local`   | `scripts/.demo-accounts.json`                               |
| Annonceur                 | `demo@annonceur.tn`      | `scripts/.demo-accounts.json`                               |

Aucun mot de passe n'est écrit dans les scripts : `TPUB_DEMO_PASSWORD` impose un mot de passe
commun aux comptes de démonstration, sinon chacun est généré une fois dans
`scripts/.demo-accounts.json` (ignoré par git) et affiché en fin de seed. Des comptes créés par une
ancienne version gardent leur ancien mot de passe : relancez alors avec `TPUB_DEMO_PASSWORD`. Le
second administrateur sert aux **doubles approbations** (messages d'urgence, validations avec
dérogation ou risque élevé).

**Appairage des écrans** : le seed génère une clé d'appareil pour chaque Porteur ACTIF qui n'en a
pas, l'enregistre dans `scripts/.demo-device-keys.json` (ignoré par git) et affiche les liens
`http://localhost:3000/ecran/<id>?cle=tpd_…` ; `--rotate-keys` remplace toutes les clés. Ouvrir ce
lien une fois suffit : le lecteur garde la clé dans le navigateur et la retire de la barre
d'adresse. Sans clé, `/ecran/<id>` affiche « Écran non appairé ». Depuis le back-office :
Réseau › Tableau › Porteurs › « Appairer l'écran » (clé affichée une seule fois, QR code du lien,
rotation et révocation).

**Double authentification et mot de passe** : chaque compte peut activer la double
authentification (application TOTP, QR code, 10 codes de secours) dans `/espace/profil#securite`
ou `/admin/compte`. `TPUB_TOTP_REQUIRED_ROLES=ADMINISTRATEUR,SUPERVISEUR,OPERATEUR` la rend
obligatoire pour l'équipe (activation imposée à la connexion, `/connexion/activer-2fa`). Un
administrateur peut la réinitialiser ou exiger un nouveau mot de passe depuis `/admin/utilisateurs`
(détail d'un compte). Les scripts se connectent à un administrateur protégé avec
`TPUB_ADMIN_TOTP_SECRET=<clé Base32>`.

**Scénario du cahier des charges (§11)** : `node scripts/demo-scenario.mjs` joue les 18 étapes
en HTTP contre le backend (compte annonceur neuf, campagne, image PNG, analyse et rapport IA,
lecture par l'administrateur, point + rayon, créneau Soir, disponibilités, réservation,
estimation, validation, appel du Porteur à une date simulée, statistiques, message d'urgence qui
remplace la publicité) et affiche ✔ / ✘ par étape. Les appels du Porteur portent la clé
d'appareil de `scripts/.demo-device-keys.json` (appairage automatique si elle manque), la date
simulée n'est honorée qu'avec le profil `local` (sinon avertissement « horloge serveur utilisée »),
et les doubles approbations sont complétées avec `admin2@tpub.local` (« 1/2 approbations » puis
« validée par … et … »). À la fin, il donne l'URL du lecteur (`/ecran/<id>?datetime=…`) qui montre la
même diffusion à l'écran.

Parcours à montrer dans l'interface :

1. **Annonceur** : `/inscription`, puis `/espace/campagnes/nouvelle` → Détails → Contenu (déposer
   une image, lancer la pré-analyse) → Zone & Porteurs (cliquer sur la carte ou « Cibler cette
   zone », « Enregistrer les zones », cocher les Porteurs disponibles, « Réserver ») → Vérification
   → « Soumettre ». Un objectif contenant « garanti » donne une revue manuelle, « cocaine » un avis
   défavorable.
2. **Administrateur** : `/admin/moderation` → « Examiner » (rapport IA, visuel, zones,
   réservations, estimation) → « Valider… » → « Confirmer la validation » (case de dérogation pour
   une revue manuelle).
3. **Lecteur** : ouvrir d'abord le lien d'appairage `/ecran/<id du Porteur>?cle=…`, puis
   `/ecran/<id du Porteur>` (ajouter `?datetime=AAAA-MM-JJTHH:mm:ss` pour simuler une heure du
   créneau, profil `local` uniquement). Un message créé dans `/admin/urgences` (point + rayon, niveau d'urgence)
   remplace la publicité pendant sa fenêtre.
4. **Suivi** : `/espace/statistiques` et `/espace/campagnes/<id>` (affichages, clics, budget
   consommé, export CSV), `/admin/statistiques`, `/admin/journal` (audit, décisions IA,
   diffusions), `/admin/reservations` (conflits).

## Limites connues

Détail dans `docs/api-contract.md` §7 et écarts de réalisation dans
`../docs/completion-contract.md` §6.

- **Pas de réinitialisation du mot de passe par e-mail** : `/mot-de-passe-oublie` oriente vers
  TPUB ; le changement de mot de passe se fait dans `/espace/profil`.
- **Pas de jeton de rafraîchissement** : la session dure 24 h (bandeau 10 min avant la fin).
- **Réseau non public** : la vitrine ne liste pas les Porteurs réels (contenu éditorial).
- **OCR simulé** (texte déduit du nom de fichier) sauf si Tesseract est installé côté backend.
- **Pas de temps réel** : le lecteur interroge l'API à la fin de chaque diffusion ; les pages du
  back-office se rafraîchissent à la demande.
- **Estimations** d'affichages et de coûts : constantes internes de simulation, toujours
  étiquetées « Estimation » et jamais reprises sur la vitrine.
- Hors périmètre : double authentification, zones polygonales, tarification dynamique,
  apprentissage à partir des décisions de l'administrateur.

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
