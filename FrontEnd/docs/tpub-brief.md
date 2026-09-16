# TPUB : brief de marque et copy deck (FR)

> **Statut à respecter partout.** TPUB est au stade du **concept / pré-lancement** (« Structured — pre-build » dans les données du groupe). Le site décrit la **raison d'être, l'intention de conception et les capacités de la plateforme**, pas des déploiements, des volumes ou des résultats constatés. Toute donnée réseau chiffrée doit venir du backend et être étiquetée avec sa nature : mesurée, estimée ou simulée.
>
> Contact : tpub@tukhnanutha.com · +216 29 577 197 · Tunis · LinkedIn /company/tukhnanutha · YouTube @tukhnanutha. Supprimer le lien X mort et les liens localhost.

---

## 1. Raison d'être

**Paragraphe.** La publicité extérieure a toujours eu de la présence, mais rarement des preuves. Les emplacements se vendent sur une audience déclarée et un plan média. L'acheteur ne reçoit presque jamais de rapport de diffusion. Deux écrans au même tarif peuvent offrir des contacts réels très différents. TPUB est conçu pour réunir en un seul système l'écran, la diffusion, la gestion de campagne et la mesure. Le rapport devient ainsi le résultat direct de l'exécution de la campagne, et non une étude séparée. TPUB est la fonction écran du Porteur, la cellule de déploiement du groupe Tukhnanutha. La plateforme vise à transformer la présence physique de ce réseau en portée publicitaire traçable, ouverte aux commerces de quartier comme aux marques et aux agences.

**Mission (une phrase).** Rendre l'affichage numérique extérieur vérifiable : chaque annonceur choisit où et quand il diffuse, et reçoit la trace de ce qui a été réellement diffusé.

**Principe fondateur (repris du groupe).** « L'audience se mesure, elle ne se déclare pas. »

---

## 2. Le problème

| Douleur de l'annonceur (source) | Réponse TPUB | Capacité plateforme qui la porte |
|---|---|---|
| **Audience déclarée, pas mesurée.** Des chiffres relevés ponctuellement, moyennés, puis appliqués à toutes les campagnes. | Distinguer ce qui est observé (diffusion, disponibilité) de ce qui est estimé, et l'afficher comme tel. | `diffusion_logs` et `statistics` par campagne, support, zone et date. `technical_status` des supports (ACTIF / MAINTENANCE / HORS_LIGNE). |
| **Aucune preuve de diffusion.** « L'acheteur reçoit un plan média, pas un rapport de diffusion. » | Chaque diffusion est journalisée et horodatée, par écran et par zone. | `diffusion_logs` (support, zone, campagne, type de contenu, durée, `diffused_at`). |
| **Tarifs opaques, sans unité comparable.** « Un tarif sans mesure d'audience est un prix au mètre carré, pas un prix média. » | Un plan média construit sur des critères explicites (zone, emplacement, créneau, période, format) plutôt qu'une grille générique. | `zones`, `diffusion_supports` (`visibility_score`, `diffusion_capacity`), `reservations` avec coût estimé, budget en TND. |
| **Incitations mal alignées.** Une rémunération sur portée estimée ne change pas, que l'audience ait été là ou non. | Le risque se déplace vers l'opérateur, tenu de démontrer la diffusion. Le budget consommé est suivi. | `campaigns.consumed_budget`, `statistics` (budget estimé vs consommé). |
| **Ciblage grossier.** Difficile d'acheter seulement son quartier ou ses heures utiles. | Ciblage par zone géographique et plage horaire quotidienne. | `zones` (lat/long, rayon, geojson), `campaign_zones`, `start_time` / `end_time` de campagne. |
| **Risque d'image et contenu en espace public.** | Chaque campagne est analysée par IA puis validée par une personne avant d'être diffusée. | `AiVerificationService` (risque et qualité /100, problèmes détectés, recommandation), validation admin, `ai_decision_logs`. |
| **Double réservation et créneaux incertains.** | Le créneau est bloqué à la réservation et confirmé à la validation. | `support_availability`, contrôle de conflit, `reservations` TEMPORAIRE → CONFIRMEE. |
| **Multiplicité d'interlocuteurs.** | Un interlocuteur unique, de la réservation à la diffusion. | Parcours unifié compte → campagne → réservation → contrôle → diffusion → statistiques. |
| **Coût d'un site autonome.** Un panneau seul doit justifier structure et alimentation par la seule publicité. | L'écran partage les coûts avec les autres fonctions du Porteur (connectivité, énergie, supervision). Cela élargit les lieux où il peut être viable. | Intégration Porteur (fonction n°2 « Écran publicitaire »). La supervision TPOT est conçue pour remonter l'état de l'écran. |

---

## 3. Objectifs

**Objectifs business de TPUB (intention)**
- Monétiser l'attention créée par le réseau de Porteurs. Dans le modèle du groupe, installation → usage → audience → revenus → nouvelle installation.
- Ouvrir la publicité numérique extérieure aux entreprises de toutes tailles, par zone et par budget en TND.
- Faire de la traçabilité (diffusion journalisée, décisions de modération tracées) l'argument commercial central.
- Protéger l'espace public : annonceurs vérifiés, contenus contrôlés, priorité aux messages d'intérêt général.
- Constituer un portefeuille d'annonceurs et d'agences avant la mise en service du réseau.

**Objectifs du site**
1. **Convertir** les annonceurs en comptes (inscription ANNONCEUR, dossier examiné par TPUB).
2. **Expliquer le parcours** en 4 étapes : zones et emplacements, campagne et créneaux, contrôle IA + validation humaine, diffusion journalisée et statistiques.
3. **Rassurer** sur la sécurité de marque (double contrôle, annonceurs vérifiés) et sur la mesure (ce qui est observé vs estimé, sans survente).
4. **Orienter** agences, grandes marques et institutions vers le contact (plan média, étude d'audience).
5. **Être honnête sur la maturité** : note de statut visible, aucune métrique inventée.
6. **Ancrer TPUB** dans le Porteur et le groupe Tukhnanutha. TPUB reste la marque contractante, avec la mention « une société du groupe Tukhnanutha ».

**KPI site suggérés (à instrumenter, pas à publier) :** inscriptions, taux de complétion du profil, premières campagnes créées (brouillon), demandes de contact par persona, consultation de la FAQ mesure et tarifs.

---

## 4. Audiences et personas

| Persona | Besoin | Objection | Message | CTA principal |
|---|---|---|---|---|
| **Commerçant / PME locale** (boutique, restaurant, clinique, auto-école) | Être vu dans son quartier, aux heures où ses clients passent, avec un budget maîtrisé. | « L'affichage, c'est pour les grandes marques. » « Je ne saurai pas si ça a tourné. » | Choisissez votre zone et vos heures, suivez votre budget, et consultez la trace de chaque diffusion. | **Créer mon compte annonceur** |
| **Responsable marketing d'une marque** | Couvrir plusieurs zones, planifier des temps forts (rentrée, fêtes, Ramadan comme saisonnalité), protéger l'image de marque et justifier la dépense. | « Les chiffres OOH sont déclaratifs. » « Et si mon visuel passe à côté d'un contenu douteux ? » | Le rapport découle de l'exécution : diffusions journalisées, contrôle de chaque contenu, décisions tracées. | **Créer un compte** · secondaire : **Parler à TPUB** |
| **Agence média** | Un partenaire DOOH fiable pour plusieurs clients, avec des données exploitables dans un plan média. | « Quelle méthodologie ? Quels dénominateurs ? Quels droits d'audit ? » | TPUB sépare preuves de diffusion et estimations d'audience, et répond avec une étude d'audience et un plan média, pas une grille générique. | **Demander un plan média** (contact) |
| **Institution publique** (message d'intérêt général) | Diffuser un message d'intérêt général dans une zone donnée. | « Un réseau publicitaire est-il approprié pour un message public ? » | Le moteur de diffusion est conçu pour donner la priorité absolue aux messages d'intérêt général dans une zone, avant toute publicité. | **Nous contacter** (les messages prioritaires sont créés par l'équipe TPUB, pas en libre-service) |

Ne revendiquer **aucun partenariat** avec une commune ou une administration. Pas de sujet politique, sécuritaire ou religieux.

---

## 5. Positionnement et hiérarchie des messages

**Positionnement.** Pour les annonceurs qui veulent être présents dans l'espace public tunisien sans acheter à l'aveugle, TPUB est une plateforme d'affichage numérique extérieur conçue sur le réseau des Porteurs. On y réserve des créneaux par zone, les contenus sont contrôlés avant diffusion, et chaque diffusion est journalisée.

**Promesse principale.** Réservez l'écran, recevez la preuve.

**Taglines (5 options)**
1. L'audience se mesure, elle ne se déclare pas.
2. Réservez l'écran. Recevez la preuve.
3. Des écrans réels. Des diffusions tracées.
4. Votre message dans la ville, sa trace dans votre tableau de bord.
5. Compter le réel.

**Piliers et mécanismes de preuve**

| Pilier | Promesse | Mécanisme de preuve (plateforme) |
|---|---|---|
| **1. Ciblage par zone et par créneau** | Diffusez là où sont vos clients, aux heures utiles. | Carte des zones (rayon / geojson), emplacements avec type, position et score de visibilité, plages horaires quotidiennes, calendrier de disponibilité sans double réservation. |
| **2. Un espace public protégé** | Aucun contenu ne part sans double contrôle. | Analyse IA (risque et qualité notés sur 100, problèmes détectés, recommandations), puis validation par un expert TPUB. Décisions motivées et journalisées. Annonceurs vérifiés (dossier client examiné). |
| **3. Diffusion prouvée** | Chaque passage laisse une trace. | Journal de diffusion horodaté par écran, zone et campagne. État technique des écrans (un écran hors ligne n'est pas compté comme diffusant). |
| **4. Un tableau de bord, un interlocuteur** | De la réservation au rapport, au même endroit. | Tableau de bord statistiques (diffusions, clics et interactions sur les canaux connectés, budget estimé vs consommé), statuts de campagne, interlocuteur unique TPUB. |

**Pilier transverse, l'ancrage Porteur :** TPUB est la fonction écran du Porteur. Supports alimentés et connectés de façon autonome, supervision intégrée, mesure pensée dès l'installation plutôt que reconstituée a posteriori (intention de conception).

**Hiérarchie :** promesse → 4 étapes → piliers → cas d'usage par persona → Porteur et groupe → FAQ → CTA.

---

## 6. Garde-fous

### Charte éditoriale (groupe Tukhnanutha, prioritaire sur le style et le SEO)
1. Aucune critique d'institution (État, ministère, administration, entreprise publique, commune, agent public), même ironique.
2. Programmes publics : décrits, jamais évalués.
3. Aucun sujet politique, électoral, religieux, judiciaire ou sécuritaire, ni personnalité publique ou migrations, même en passant. Ramadan : uniquement comme facteur de saisonnalité.
4. Aucune affirmation invérifiable présentée comme un fait. Chiffres : fourchettes prudentes et attribuées, jamais un chiffre précis inventé.
5. Les difficultés se formulent en facteurs de réussite ou en critères d'achat, sans désigner de coupable.
6. Ton de guide de décision neutre : le lecteur conclut. Pas de superlatifs ni de comparaison dévalorisante du pays.
7. Dans le doute, on retire la phrase.
8. Relecture humaine avant publication de tout contenu touchant au domaine public.

**Formulations de maturité :** « est conçu pour », « vise à », « la plateforme permet », « intention de conception », « au stade du concept ». Éviter le présent d'exploitation (« nous diffusons », « le réseau couvre »).

### À NE PAS AFFIRMER
- Que TPUB est opérationnel, commercialisé ou « en direct ». Pas de pastille « LIVE » présentée comme réelle (voir §9).
- Un nombre d'écrans, de sites, de gouvernorats, de villes, de campagnes, d'appareils ou d'annonceurs. Les anciens « 24 gouvernorats », « 500+ écrans », « 1M+ appareils », « 50+ campagnes » sont interdits.
- Des contacts ou impressions par mois, un CPM précis, des prix précis, un taux de disponibilité (ex. 99,9 %), un ROI ou un uplift (« ROI +300 % »), « ciblage 100 % », « 100 % mesuré ».
- Des logos clients, témoignages, études de cas ou partenariats (communes, institutions, agences).
- Qu'un journal de diffusion prouve une audience. Il prouve une activité de la machine, pas la présence d'une personne.
- Que l'exposition prouve l'attention, la mémorisation ou les ventes. L'attribution exige un scénario contrefactuel.
- « Précision garantie », « mesure exacte », « audience certifiée / auditée ».
- L'identification des passants, la reconnaissance faciale, le suivi individuel. Si la mesure est évoquée : « anonyme et agrégée ».
- Une conformité réglementaire (INPDP, RGPD) non validée juridiquement.
- Que l'IA garantit l'absence de tout contenu problématique, ou qu'elle décide seule. L'IA assiste, une personne valide.
- Les « vues » du tableau de bord comme audience. Aujourd'hui, elles comptent les lignes du journal de diffusion.
- Les vues et coûts estimés comme fiables. Ils sont fixés en dur dans le backend : afficher « estimation indicative » ou masquer.
- Un paiement en ligne réel. Il est simulé : « bientôt disponible ».
- L'upload de créations en libre-service (pas d'endpoint) : « bientôt disponible » ou envoi via TPUB.
- Les performances du Porteur comme constatées (hauteurs 15–30 m, 1,0–3,2 kW = intention de conception, puissance nominale).
- Superlatifs : « leader », « n°1 », « premier réseau DOOH de Tunisie », « révolutionnaire », « le meilleur », « Révolutionnez… ».
- Dénigrement de l'affichage classique, des concurrents ou du marché (« en retard »).
- Une grille tarifaire publique présentée comme « le tarif du marché ».
- L'acronyme « Tunisian Public Broadcasting » (confusion possible avec un service public) : ne pas l'utiliser.

### Glossaire de l'espace annonceur et du back-office (UX-PLAN §3.6)

Source unique dans le code : `src/content/glossary.ts`. Les écrans importent ces libellés au lieu de les retaper.

| Terme | Sens | Où l'employer | Jamais |
|---|---|---|---|
| **Porteur** | Mât physique qui porte les faces d'écran. | Navigation, carte, listes, colonnes, actions (« Réserver ce Porteur »). | « emplacement », « support » dans l'interface |
| **Écran** | Une face d'un Porteur. | Studio 3D uniquement. | Synonyme de Porteur dans les listes |
| **Créneau** | Réservation d'un Porteur pour la période de la campagne. | Listes de réservations, KPI « Créneaux », textes de réservation. | « écran réservé » |
| **Budget déclaré** | Somme des budgets saisis par l'annonceur. | Tableau de bord, Statistiques, vue d'ensemble du back-office. | « Budget total », « Budget estimé », « Budgets déclarés » |
| **Coût estimé des créneaux** | Somme des coûts estimés : 10 % du budget par créneau, fixés à la réservation. | Assistant, détail, Réservations, Statistiques, toujours avec l'étiquette « Estimation » et sa règle. | « prix », « facture » |
| **Vues estimées** | Valeur fixe de 1 000 vues par créneau, non mesurée. | Toujours avec l'étiquette « Estimation ». | « audience », « impressions » |
| **Diffusions journalisées** | Lignes du journal du lecteur (passages, pas une audience). | Back-office, tant que le rapport annonceur n'est pas ouvert. | « preuve » présentée comme fonctionnalité livrée |

**Statuts de créneau (annonceur) :** `TEMPORAIRE` « Bloqué · en attente de décision TPUB » (court : « Bloqué »), `CONFIRMEE` « Confirmé », `ANNULEE` « Libéré », `EXPIREE` « Passé ». Aide : « Le créneau est retenu pour cette campagne jusqu'à la décision de TPUB. Il n'est pas libérable en ligne. »

**Statuts de campagne (annonceur) :** Brouillon · Analyse IA en cours · En examen TPUB (avis IA favorable ou points à vérifier : même libellé, la ligne d'aide précise) · À corriger · Programmée · En diffusion · Terminée · Refusée. Le back-office garde les libellés précis (« Avis IA favorable », « Revue manuelle », « Analyse IA en attente », « Validée »).

**Règle d'estimation :** « Estimation provisoire, non issue d'une mesure : 10 % du budget de la campagne par créneau, fixé à la réservation ; 1 000 vues estimées par créneau. »

**Horaires publiés :** lun–ven, 9 h–18 h. Phrase d'attente : « Examen par l'équipe TPUB en jours ouvrés (lun–ven, 9 h–18 h). » Aucune promesse de délai, aucune notification promise.

---

## 7. Plan du site

### Site vitrine
| Page | URL | Objectif |
|---|---|---|
| Accueil | `/` | Promesse, parcours en 4 étapes, piliers, orientation par persona, conversion vers l'inscription. |
| Annonceurs (Solutions) | `/annonceurs` | Détailler l'offre par persona et par besoin, avec des CTA différenciés (compte vs plan média). |
| Réseau & zones | `/reseau` | Montrer le Porteur, les types d'emplacements et la logique de zones, sans chiffres d'inventaire. Aperçu carte alimenté par le backend. |
| Fonctionnement | `/fonctionnement` | Parcours détaillé, statuts, contrôle IA + humain, journal de diffusion, ce que mesure la plateforme et ce qu'elle ne mesure pas. |
| Tarifs & offres | `/tarifs` | Expliquer les critères de prix. Sur devis, plan média. |
| Sécurité des contenus (optionnel, ou section de Fonctionnement) | `/charte-contenus` | Règles de modération, contenus refusés, délais de revue. |
| À propos | `/a-propos` | Mission, principes, place dans le groupe (pôle Médias, audience & données), statut de maturité. |
| Contact | `/contact` | Formulaire routé par profil (agence, marque, institution, propriétaire d'emplacement). Envoi réel, sans `mailto`. |
| FAQ | `/faq` | Objections : statut, prix, mesure, modération, ciblage. |
| Légal | `/mentions-legales`, `/cgu`, `/confidentialite`, `/cookies` | À rédiger avec un juriste, contenu non fourni par la recherche. |
| 404 | — | Page dédiée, sans redirection silencieuse. |

### Espace client (rôle ANNONCEUR)
| Écran | Objectif |
|---|---|
| `/connexion`, `/inscription`, `/mot-de-passe-oublie` | Accès. L'inscription crée un compte annonceur et un dossier « en cours d'examen ». |
| `/espace` (tableau de bord) | Onboarding, statut du dossier, campagnes en cours, raccourcis. |
| `/espace/campagnes` + `/nouvelle` + `/:id` | Assistant (objectif, budget TND, période, plage horaire), statut et timeline, rapport IA. |
| `/espace/reservations` | Créneaux par emplacement et zone, statut TEMPORAIRE / CONFIRMEE / ANNULEE / EXPIREE. |
| `/espace/reseau` | Carte des zones actives et des emplacements (type, position, score de visibilité, état). |
| `/espace/statistiques` | Diffusions, clics et interactions, budget estimé vs consommé. Libellés honnêtes. |
| `/espace/profil` | Société, contacts, adresse. |
| Back-office (hors périmètre site public) | ADMINISTRATEUR : file de modération, zones et supports, messages prioritaires. OPERATEUR : état des écrans. SUPERVISEUR : consultation. |

**Alerte technique :** `/api/statistics/dashboard` est global, sans filtre par client. Ne pas l'afficher tel quel à un annonceur avant filtrage par client.

---

## 8. Copy deck (FR, prêt à coller)

### 8.0 Éléments globaux

**Header**
- Marque : T**PUB** · sous-ligne : `Affichage numérique extérieur`
- Nav : Annonceurs · Réseau & zones · Fonctionnement · Tarifs · À propos
- Liens droite : `Connexion` · bouton `Créer un compte`

**Bandeau de statut (discret, sous le header ou en pied de hero)**
> TPUB est en phase de conception. Les emplacements, fonctionnalités et parcours présentés décrivent la plateforme telle qu'elle est conçue.

**Footer**
- Pitch : « Affichage numérique extérieur sur le réseau des Porteurs : réservation par zone, contenus contrôlés, diffusions journalisées. »
- Colonnes : Plateforme (Annonceurs, Réseau & zones, Fonctionnement, Tarifs) · Société (À propos, Contact, FAQ) · Contact (tpub@tukhnanutha.com, +216 29 577 197, Tunis) · Groupe
- Carte groupe : « Une société du groupe Tukhnanutha » · « TPUB fait partie du pôle Médias, audience & données du groupe, aux côtés d'AFRIVA et d'INFINTRA. » · lien `Découvrir le groupe`
- Barre basse : « © {année} TPUB, une société du groupe Tukhnanutha. Tous droits réservés. » · « Des écrans réels. Des diffusions tracées. » · Mentions légales · CGU · Confidentialité · Cookies

---

### 8.1 Accueil

**Hero**
- Eyebrow : `Affichage numérique extérieur · Une société du groupe Tukhnanutha`
- Titre (H1) : **Des écrans réels.** / **Des diffusions tracées.**
- Lede : TPUB est la plateforme d'affichage numérique conçue pour le réseau des Porteurs. Choisissez vos zones et vos créneaux, soumettez votre campagne : chaque contenu est contrôlé avant diffusion et chaque passage est journalisé, écran par écran.
- CTA primaire : `Créer mon compte annonceur`
- CTA secondaire : `Voir comment ça marche`
- Micro-réassurance sous les CTA : « Inscription gratuite · Dossier examiné par TPUB · Budget en dinars »
  - (« Inscription gratuite » : l'inscription ne comporte pas de paiement dans le backend, mais **faire valider la formule par TPUB avant publication**.)

**Bande « mécanismes » (remplace les pseudo-stats)**
| Libellé | Sous-ligne |
|---|---|
| Par zone | Du quartier à la ville |
| Par créneau | Les heures qui comptent pour vous |
| Double contrôle | Analyse IA + validation humaine |
| Journalisé | Chaque diffusion horodatée |

**Intro problème / réponse**
- Eyebrow : `Une présence, avec des preuves`
- H2 : **L'audience se mesure, elle ne se déclare pas.**
- Texte : Longtemps, l'affichage s'est vendu sur des estimations : un emplacement, un plan média, une audience moyenne. TPUB est conçu autrement. Diffusion, gestion de campagne et suivi forment un seul système, et votre rapport découle directement de ce qui a été diffusé.
- Lien : `Découvrir le fonctionnement →`

**Comment ça marche (4 étapes)**
- H2 : **De la zone au rapport, en quatre étapes**
1. **Choisissez vos zones.** Parcourez la carte, sélectionnez les quartiers, villes ou axes où se trouvent vos clients, puis les emplacements disponibles.
2. **Créez et réservez.** Objectif, budget, période et heures de diffusion. Vos créneaux sont bloqués dès la réservation, sans double réservation.
3. **Contrôle avant diffusion.** Votre campagne est analysée par IA (conformité, risque, qualité), puis validée par un expert TPUB. Vous recevez des recommandations concrètes.
4. **Diffusez et suivez.** Une fois validée, votre campagne passe à l'antenne sur ses créneaux. Chaque diffusion est journalisée et vos statistiques sont réunies dans votre espace.
- CTA : `Créer mon compte`

**Piliers**
- H2 : **Ce que TPUB change pour un annonceur**
- **Ciblage précis.** Zones géographiques, emplacements détaillés (type, position, score de visibilité) et plages horaires : matin, sortie des bureaux, soirée.
- **Espace public protégé.** L'IA assiste, un expert TPUB valide. Annonceurs vérifiés, contenus analysés, décisions motivées et tracées.
- **Diffusion prouvée.** Chaque passage est horodaté, par écran, par zone et par campagne. Un écran hors ligne ne compte pas comme une diffusion.
- **Tout au même endroit.** Réservations, statuts, rapport IA, diffusions et budget consommé dans un seul tableau de bord, avec un interlocuteur unique.

**Cas d'usage par persona**
- H2 : **Pensé pour chaque annonceur**
- **Commerces et PME.** Soyez vu dans votre quartier, aux heures où vos clients passent, avec un budget en dinars suivi en temps réel. → `Créer mon compte`
- **Marques.** Planifiez vos temps forts sur plusieurs zones et justifiez chaque dinar avec le journal de diffusion. → `Créer un compte`
- **Agences média.** Un partenaire DOOH qui sépare preuves de diffusion et estimations d'audience, et qui répond par un plan média. → `Demander un plan média`
- **Institutions.** Les messages d'intérêt général sont conçus pour passer en priorité, avant toute publicité, dans la zone concernée. → `Nous contacter`

**Teaser réseau & zones**
- Eyebrow : `Le réseau`
- H2 : **Chaque Porteur est conçu pour devenir un écran.**
- Texte : TPUB est la fonction écran du Porteur, le support standardisé du groupe Tukhnanutha qui réunit connectivité, énergie autonome et supervision. Selon l'emplacement, l'écran s'adapte au regard : panoramique sur les ronds-points, double face sur les grands axes, à hauteur des yeux dans les rues piétonnes.
- Puces : `360° · ronds-points et places` · `Double face · axes et autoroutes` · `Hauteur des yeux · trottoirs et campus`
- CTA : `Explorer le réseau & les zones`

**Sécurité de marque / modération IA**
- Eyebrow : `Sécurité des contenus`
- H2 : **Un double contrôle avant chaque mise à l'antenne.**
- Texte : Les écrans sont dans l'espace public. Chaque campagne est donc analysée par IA avant diffusion : contenu trompeur (« gratuit garanti », fausses promesses), contenu offensant, discriminatoire ou illégal, qualité rédactionnelle, cohérence entre budget et objectif. L'analyse produit un score de risque et un score de qualité sur 100, la liste des points relevés et une recommandation. Aucune campagne n'est diffusée sans la validation d'un expert TPUB.
- Puces :
  - L'IA assiste, une personne décide.
  - Chaque décision est motivée et enregistrée.
  - Annonceurs vérifiés avant diffusion.
  - Recommandations pour corriger et resoumettre.
- Lien : `Voir notre charte des contenus →`

**Mesure**
- Eyebrow : `Mesure`
- H2 : **Ce qui est prouvé, ce qui est estimé : on ne mélange pas.**
- Texte : Un journal de diffusion prouve qu'un écran a joué votre contenu, pas qu'une personne l'a regardé. TPUB distingue donc les preuves de diffusion (quel écran, quelle zone, à quelle heure, combien de temps) des indicateurs d'audience, présentés avec leur méthode et comme estimations.
- 3 blocs :
  - **Disponibilité.** L'état technique de chaque écran est suivi : actif, en maintenance, hors ligne.
  - **Diffusions.** Horodatées par écran, zone et campagne.
  - **Suivi de campagne.** Diffusions, clics et interactions sur les canaux connectés, budget estimé et consommé.
- Note : « Les indicateurs d'audience, lorsqu'ils existent, sont anonymes, agrégés et toujours présentés avec leur méthode. »

**Porteur / groupe**
- Eyebrow : `Une société du groupe Tukhnanutha`
- H2 : **Un écran intégré à une infrastructure.**
- Texte : Le Porteur est la cellule de déploiement standardisée du groupe : connectivité (AEROLINK), écran publicitaire (TPUB), météo (ANEO), énergie hybride solaire et éolienne (SPH-AIR, AXGEN), supervision (TPOT), stockage et contrôle (TDC). L'écran partage ainsi l'alimentation, la connexion et la supervision, et la mesure est pensée dès l'installation. Dans le modèle du groupe, les recettes publicitaires contribuent au déploiement de nouveaux supports.
- Mention : « Les caractéristiques du Porteur expriment une intention de conception. »
- CTA : `Découvrir le Porteur` (vers le site du groupe)

**FAQ (8)**
1. **TPUB est-il déjà en service ?**
   TPUB est en phase de conception. Ce site présente la plateforme telle qu'elle est conçue : zones, réservation, contrôle des contenus, journal de diffusion. Vous pouvez dès maintenant créer un compte annonceur et préparer vos campagnes. La disponibilité des emplacements s'affiche dans votre espace.
2. **Qu'est-ce que j'achète exactement ?**
   Du temps de diffusion : des créneaux sur des emplacements, dans des zones, pour une période et des heures données. Un panneau vend une surface. Un écran vend du temps devant un flux de personnes.
3. **Comment le prix est-il établi ?**
   Selon l'emplacement, le format et la visibilité de l'écran, la pression (durée et fréquence dans la boucle), la période et la saison. Pour les agences et les marques, TPUB répond par un plan média plutôt que par une grille générique.
4. **Comment mes contenus sont-ils contrôlés ?**
   Par une analyse IA (conformité, risque et qualité notés sur 100, avec recommandations), puis par la validation d'un expert TPUB. Si la campagne doit être corrigée, vous la modifiez et la soumettez à nouveau.
5. **Puis-je cibler un quartier précis ?**
   Oui, la plateforme est conçue pour un ciblage par zone géographique et par plage horaire quotidienne. Une campagne peut viser plusieurs zones.
6. **Le journal de diffusion, est-ce une mesure d'audience ?**
   Non. Il prouve qu'un écran a diffusé votre contenu, à quel moment et pendant combien de temps. L'audience est une autre couche : quand elle est estimée, elle l'est de façon anonyme et agrégée, avec sa méthode, et TPUB ne l'assimile jamais à une diffusion.
7. **Que se passe-t-il si un message d'intérêt général doit être diffusé ?**
   Le moteur de diffusion est conçu pour faire passer un message prioritaire avant toute publicité dans la zone concernée, puis reprendre la programmation normale à la fin du message.
8. **Je suis une agence ou une marque nationale : par où commencer ?**
   Écrivez-nous. Nous partons de vos objectifs, de vos cibles et de vos zones pour construire un plan média, et nous précisons ce qui sera prouvé et ce qui sera estimé.

**CTA final**
- H2 : **Mettez votre message dans la ville, et gardez-en la trace.**
- Texte : Créez votre compte annonceur, préparez votre première campagne et suivez chaque étape jusqu'à la diffusion.
- Boutons : `Créer mon compte annonceur` · `Parler à TPUB`

---

### 8.2 Annonceurs (Solutions)

- Hero eyebrow : `Annonceurs`
- H1 : **Votre message, là où sont vos clients.**
- Lede : Commerce de quartier, marque ou agence : TPUB est conçu pour vous permettre de réserver du temps d'écran par zone et par créneau, avec des contenus contrôlés et des diffusions journalisées.
- CTA : `Créer mon compte` · `Demander un plan média`

**Section « Ce que vous pouvez faire »**
| Titre | Texte |
|---|---|
| Cibler | Sélectionnez vos zones sur la carte, du quartier à la ville, et choisissez vos emplacements selon leur type, leur position et leur score de visibilité. |
| Planifier | Définissez objectif, budget en dinars, période et heures de diffusion. Diffusez au bon moment : matin, sortie des bureaux, soirée. |
| Réserver | Vos créneaux sont bloqués dès la réservation et confirmés à la validation de la campagne. Pas de double réservation. |
| Diffuser | Images, vidéos, bannières : vos créations sont diffusées telles que vous les avez validées. L'intégrité des fichiers est contrôlée. |
| Suivre | Statuts de campagne, rapport IA, diffusions journalisées, budget consommé. |

**Section par persona** (4 blocs, reprendre §4)
- **Commerces & PME.** « Visible dans votre quartier, sans engagement de grande marque. » Texte : Choisissez une zone proche de votre point de vente et les heures où vos clients passent. Votre budget est suivi, vos diffusions sont tracées. CTA `Créer mon compte`.
- **Marques.** « Des temps forts planifiés, des dépenses justifiées. » Texte : Plusieurs zones, plusieurs périodes, un seul tableau de bord. Rentrée, fêtes ou saisonnalité : vous pilotez la pression et gardez la trace de ce qui a tourné. CTA `Créer un compte`.
- **Agences média.** « Achetez une architecture de mesure, pas un volume de contacts. » Texte : TPUB distingue la disponibilité des écrans, les diffusions vérifiées et les estimations d'audience, et répond à vos briefs par un plan média. CTA `Demander un plan média`.
- **Institutions.** « Un réseau conçu pour l'intérêt général. » Texte : Les messages d'intérêt général sont conçus pour être prioritaires sur la publicité dans la zone concernée. Parlons de votre besoin. CTA `Nous contacter`.

**Encadré « Les questions à poser avant de signer »** (contenu de guide, ton neutre)
- Combien d'annonceurs dans la boucle, et quelle durée totale ?
- Le journal de diffusion est-il fourni spot par spot ?
- L'audience est-elle mesurée ou déclarée ? Par créneau ou en moyenne ?
- L'écran est-il lisible en plein soleil ?
- Qui détient l'autorisation d'exploitation de l'emplacement, et jusqu'à quand ?
- Chute : « Exigez ces réponses avant de signer. Leur absence est une information en soi. »

---

### 8.3 Réseau & zones

- Eyebrow : `Réseau & zones`
- H1 : **Un réseau d'écrans conçu sur les Porteurs.**
- Lede : TPUB est conçu pour faire des écrans des Porteurs une seule surface média : des emplacements géolocalisés, regroupés en zones, programmés et supervisés depuis une même plateforme.

**Du support au rapport (4 couches)**
1. **Écrans.** Des écrans intégrés aux Porteurs, alimentés et connectés de façon autonome.
2. **Diffusion.** Un moteur conçu pour choisir en temps réel le contenu à diffuser sur chaque écran : message prioritaire d'abord, puis campagnes validées selon leur priorité, sinon contenu par défaut.
3. **Campagnes.** Réservation par zone, emplacement et créneau, avec validation avant mise à l'antenne.
4. **Suivi.** Journal de diffusion, état technique des écrans, statistiques de campagne.

**Types d'emplacements (Porteur)**
| Type | Écran | Lieu | Flux |
|---|---|---|---|
| A · Panoramique | 360° | Ronds-points, places emblématiques | Véhicules et piétons |
| B · Double face | Deux écrans verticaux, dans les deux sens | Autoroutes, grands axes | Véhicules à vitesse élevée |
| C · Hauteur des yeux | Un écran à échelle humaine | Trottoirs, rues piétonnes, campus | Piétons |
| D · Sans écran | — | Sites ruraux, hors réseau | Pas d'inventaire TPUB |

Mention : « Typologies et caractéristiques issues de la conception du Porteur. Elles expriment une intention de conception, pas des performances constatées. »

**Zones**
- H2 : **Ciblez par zone, du quartier à la ville.**
- Texte : Chaque zone est définie sur la carte (centre, rayon ou contour). Une campagne peut viser plusieurs zones. Dans chaque zone, vous voyez les emplacements, leur type, leur position, leur score de visibilité et leur état : actif, en maintenance ou hors ligne.
- Bloc carte : état vide si le backend ne renvoie aucune zone : « La carte des zones s'affichera ici dès que les premières zones seront ouvertes. »

**Au-delà de l'écran** (canaux prévus par la plateforme)
- Texte : La plateforme est conçue pour plusieurs types de supports : écrans, panneaux numériques, points Wi-Fi, application et site web. Sur les canaux connectés, elle peut aussi suivre les clics et les interactions.

**Visibilité**
- H3 : **Pourquoi un score de visibilité ?**
- Texte : Un grand écran mal orienté vaut moins qu'un écran moyen dans l'axe du regard. Le score de visibilité aide à comparer des emplacements au-delà de leur seule taille.

CTA : `Créer un compte pour explorer la carte` · `Vous détenez des emplacements ? Parlons-en`

---

### 8.4 Fonctionnement

- Eyebrow : `Fonctionnement`
- H1 : **De la réservation à la preuve de diffusion.**
- Lede : Un seul parcours, des statuts clairs, et une trace à chaque étape.

**Parcours détaillé**
1. **Inscription.** Créez votre compte annonceur avec votre société et vos coordonnées. Votre dossier est examiné par TPUB : le réseau est réservé à des annonceurs vérifiés.
2. **Exploration.** Consultez les zones actives et les emplacements de chaque zone.
3. **Création de campagne.** Nom, objectif, budget en dinars, période et plage horaire quotidienne. La campagne démarre en brouillon.
4. **Créations.** Images, vidéos ou bannières associées à la campagne.
5. **Réservation.** Choisissez emplacement, dates et heures. La plateforme vérifie les conflits et bloque le créneau temporairement.
6. **Soumission et analyse IA.** Conformité, risque et qualité notés sur 100, points relevés, recommandation.
7. **Validation TPUB.** Un expert valide (campagne en diffusion, créneaux confirmés) ou refuse (créneaux annulés), avec un motif enregistré.
8. **Diffusion.** Sur ses créneaux, selon sa priorité, sauf message d'intérêt général en cours dans la zone.
9. **Suivi.** Journal de diffusion et statistiques dans votre espace.

**Statuts de campagne**
| Statut | Ce que ça veut dire |
|---|---|
| Brouillon | Vous pouvez tout modifier. |
| Analyse IA en cours | Votre contenu est en cours d'analyse. |
| Conforme IA, en attente de validation | L'analyse est favorable, un expert TPUB va statuer. |
| Revue manuelle | Certains points demandent un examen humain. |
| À corriger | Des corrections sont nécessaires, consultez les recommandations. |
| En diffusion | Votre campagne passe sur ses créneaux. |
| Terminée | La période de diffusion est achevée. |
| Refusée | La campagne ne sera pas diffusée, le motif est indiqué. |

**Bloc « Ce que la plateforme prouve, ce qu'elle estime »**
| Niveau | Nature | Dans TPUB |
|---|---|---|
| Disponibilité de l'écran | Observée | État technique de chaque support |
| Diffusion | Observée (journalisée) | Horodatage, écran, zone, campagne, durée |
| Interactions (canaux connectés) | Observées | Clics, interactions |
| Audience, exposition | Estimée ou modélisée | Présentée avec sa méthode, anonyme et agrégée |
| Effet commercial | Nécessite un groupe témoin | Pas revendiqué par défaut |

Chute : « Une mesure prudente peut sembler moins spectaculaire qu'un chiffre gonflé. Elle reste préférable. »

**Priorité intérêt général**
- H3 : **Quand l'intérêt général passe avant la publicité**
- Texte : Le moteur de diffusion vérifie d'abord la présence d'un message prioritaire dans la zone. Si un message est actif, il remplace temporairement la programmation publicitaire des écrans concernés. La diffusion normale reprend à la fin du message. Ces messages sont gérés exclusivement par l'équipe TPUB.

**Charte des contenus (résumé)**
- Refusés : contenus trompeurs ou mensongers, offensants, discriminatoires ou illégaux.
- Signalés : qualité rédactionnelle insuffisante, incohérence entre budget et objectif.
- Toujours : validation humaine avant diffusion, décision motivée et enregistrée.

---

### 8.5 Tarifs & offres

- Eyebrow : `Tarifs`
- H1 : **Un prix média, pas un prix au mètre carré.**
- Lede : Il n'existe pas de grille unique pour l'affichage numérique. Le prix d'une campagne dépend de critères concrets, que TPUB rend explicites.

**Les critères qui font le prix**
| Critère | Ce qui joue |
|---|---|
| **Emplacement et zone** | Le critère qui pèse le plus : grand axe, entrée de centre commercial, zone d'attente, rue de quartier. |
| **Format et visibilité** | Type d'écran, taille, hauteur, orientation, luminosité, score de visibilité. |
| **Pression** | Durée du spot et fréquence de passage dans la boucle. |
| **Créneaux et période** | Plages horaires quotidiennes, nombre de jours ou de semaines. |
| **Saison** | Rentrée, fêtes de fin d'année, Ramadan. |
| **Format de création** | Image, vidéo, bannière. |

**Comment obtenir un prix**
- **Commerces et PME : dans votre espace.** Lors de la réservation, la plateforme affiche un coût estimé indicatif et suit votre budget en dinars. CTA `Créer mon compte`
- **Marques et agences : sur devis.** Nous partons de vos objectifs, zones et périodes pour construire un plan média. CTA `Demander un plan média`

**Encadré « Comparer deux offres »**
- Texte : Deux écrans au même tarif mensuel peuvent offrir des contacts réels très différents. Pour comparer, demandez la composition de la boucle, le journal de diffusion spot par spot et la nature de l'audience annoncée : mesurée ou déclarée, par créneau ou en moyenne.

**Note paiement (espace client)** : « Paiement en ligne : bientôt disponible. »

*Ne pas afficher de montants.* Si la direction souhaite un ordre de grandeur, la seule formulation sourcée (article du groupe) est : « généralement, un écran de quartier se négocie en centaines de dinars par mois, un emplacement premium en milliers ». À n'utiliser qu'attribuée et après validation. Ne jamais afficher « à partir de X DT ».

---

### 8.6 À propos

- Eyebrow : `À propos`
- H1 : **Transformer une présence en portée vérifiable.**
- Lede : TPUB est la société d'affichage numérique extérieur du groupe Tukhnanutha. Elle est conçue pour exploiter la fonction écran des Porteurs : diffusion des contenus, gestion des campagnes et suivi de ce qui est réellement diffusé.

**Mission**
- H2 : **Rendre l'affichage extérieur vérifiable.**
- Texte : L'affichage a toujours eu de la portée, rarement de la preuve. TPUB part d'un principe simple : l'audience se mesure, elle ne se déclare pas. Le risque passe de l'acheteur, contraint de croire à la portée annoncée, à l'opérateur, tenu de la démontrer.

**Principes**
- **L'attention est physique.** La portée se joue dans l'espace réel, sur des écrans que les gens voient.
- **Traçable par défaut.** Chaque diffusion est journalisée, chaque décision de modération est motivée.
- **Un espace public respecté.** Annonceurs vérifiés, contenus contrôlés, priorité à l'intérêt général.
- **Ouvert à tous les annonceurs.** Du commerce de quartier à la marque nationale, par zone et par budget.

**Dans le groupe**
- Texte : Au sein du groupe, TPUB appartient au pôle Médias, audience & données, avec AFRIVA et INFINTRA. La présence physique crée l'attention, TPUB la transforme en portée traçable, AFRIVA vise à en faire une communauté récurrente, et INFINTRA structure les données économiques utiles à la décision. TPUB contracte avec ses clients sous sa propre identité.

**Statut**
- Encadré : « TPUB est au stade de la conception. Les fonctionnalités et typologies présentées sur ce site décrivent l'intention de conception de la plateforme. »

**Tunisie**
- « Conçue en Tunisie, facturée en dinars, avec un interlocuteur tunisien. »
  - « Facturée en dinars » : budgets en TND dans la plateforme. À valider avec la direction, la facturation n'étant pas implémentée.

CTA : `Parler à TPUB` · `Découvrir le groupe`

---

### 8.7 Contact

- Eyebrow : `Contact`
- H1 : **Parlons de votre campagne.**
- Lede : Dites-nous vos objectifs, vos cibles et vos zones. Nous revenons vers vous avec une proposition adaptée.

**Carte « Parler à TPUB »** : tpub@tukhnanutha.com · +216 29 577 197 · Tunis · LinkedIn
**Note** : « Avant toute réservation, nous clarifions vos objectifs, vos cibles et vos zones, pour que votre message passe là où il compte. »

**Formulaire**
- Titre : `Votre demande`
- Champs :
  - `Nom et prénom*`
  - `E-mail professionnel*`
  - `Téléphone`
  - `Société / agence`
  - `Vous êtes*` : Commerce / PME · Marque · Agence média · Institution · Propriétaire d'emplacement · Autre
  - `Votre besoin*` : Campagne d'affichage · Plan média · Message d'intérêt général · Équiper un emplacement · Autre
  - `Zones visées`
  - `Période envisagée`
  - `Message*` (placeholder : « Objectif, cible, zones, dates, formats… »)
  - Case consentement : « J'accepte que TPUB utilise ces informations pour répondre à ma demande. » (+ lien Confidentialité)
- Bouton : `Envoyer ma demande`
- Succès : « Merci, votre demande est bien envoyée. L'équipe TPUB revient vers vous par e-mail. »
- Erreur : « L'envoi n'a pas abouti. Réessayez ou écrivez-nous à tpub@tukhnanutha.com. »
- Validation : « Ce champ est requis. » · « Adresse e-mail invalide. »
- Bloc alternatif : « Vous voulez préparer une campagne vous-même ? `Créer mon compte annonceur` »

---

### 8.8 Connexion / Inscription

**Connexion**
- Titre : `Bon retour`
- Sous-titre : « Accédez à vos campagnes, réservations et statistiques. »
- Champs : `E-mail` · `Mot de passe`
- Lien : `Mot de passe oublié ?`
- Bouton : `Se connecter`
- Erreur : « E-mail ou mot de passe incorrect. »
- Session expirée : « Votre session a expiré. Reconnectez-vous pour continuer. »
- Bas : « Pas encore de compte ? `Créer un compte annonceur` »

**Inscription**
- Titre : `Créer votre compte annonceur`
- Sous-titre : « Préparez vos campagnes, réservez vos créneaux et suivez vos diffusions. »
- Champs :
  - `Prénom et nom*`
  - `Société*`
  - `E-mail professionnel*`
  - `Téléphone*`
  - `Adresse`
  - `Mot de passe*` (aide : « 8 caractères minimum. » Aligner sur la règle du backend.)
  - Case : « J'accepte les CGU et la politique de confidentialité. »
- Bouton : `Créer mon compte`
- Encadré sous le bouton : « Pour protéger l'espace public, chaque compte annonceur est examiné par TPUB avant la diffusion de sa première campagne. »
- Succès : « Votre compte est créé. Votre dossier est en cours d'examen : vous pouvez déjà explorer les zones et préparer une campagne en brouillon. »
- E-mail déjà utilisé : « Un compte existe déjà avec cet e-mail. `Se connecter` »
- Bas : « Agence ou marque nationale ? `Demandez un plan média` »

**Mot de passe oublié**
- Titre : `Réinitialiser le mot de passe`
- Texte : « Indiquez votre e-mail, nous vous envoyons un lien de réinitialisation. »
- Confirmation : « Si un compte existe pour cette adresse, un e-mail vient de vous être envoyé. »
- (Pas d'endpoint de réinitialisation dans le backend : à implémenter avant d'exposer l'écran.)

---

### 8.9 Espace client : onboarding et états vides

**Bannière dossier (selon `validation_status`)**
- PENDING : « Dossier en cours d'examen. Vous pouvez préparer vos campagnes, la diffusion sera possible après validation de votre compte. »
- VALIDATED : « Compte vérifié. Vos campagnes peuvent être soumises à validation. »
- REJECTED : « Votre dossier n'a pas pu être validé. Contactez-nous pour en savoir plus : tpub@tukhnanutha.com. »
- SUSPENDED : « Votre compte est suspendu. Contactez l'équipe TPUB. »

**Onboarding (checklist tableau de bord)**
- Titre : `Bienvenue sur TPUB, {prénom}`
- Sous-titre : « Quatre étapes pour préparer votre première campagne. »
1. `Compléter le profil de votre société` → « Ces informations servent à examiner votre dossier. »
2. `Explorer les zones` → « Repérez les quartiers et emplacements où se trouvent vos clients. »
3. `Créer une campagne` → « Objectif, budget, période, heures de diffusion. Elle reste en brouillon tant que vous ne la soumettez pas. »
4. `Réserver vos créneaux et soumettre` → « Analyse IA, puis validation par un expert TPUB. »
- Lien : `Masquer le guide`

**États vides**
- Campagnes : « Aucune campagne pour l'instant. Créez votre première campagne : elle reste en brouillon jusqu'à sa soumission. » → `Créer une campagne`
- Réservations : « Aucun créneau réservé. Choisissez une campagne, puis un emplacement, des dates et des heures. » → `Réserver un créneau`
- Zones / carte : « Aucune zone ouverte pour le moment. Les zones apparaîtront ici dès leur ouverture. »
- Emplacements d'une zone : « Aucun emplacement disponible dans cette zone pour le moment. »
- Statistiques : « Pas encore de données. Vos statistiques apparaîtront après les premières diffusions de vos campagnes validées. »
- Journal de diffusion : « Aucune diffusion enregistrée. Chaque passage de votre campagne sera horodaté ici, par écran et par zone. »
- Rapport IA (non lancé) : « Aucune analyse pour cette campagne. Soumettez-la pour lancer l'analyse IA. »
- Rapport IA (en cours) : « Analyse en cours… Vous serez informé du résultat dans cette page. »
- Créations : « Import de créations : bientôt disponible. En attendant, transmettez vos fichiers à tpub@tukhnanutha.com. » (Pas d'endpoint d'upload.)
- Paiement : « Paiement en ligne : bientôt disponible. Les montants affichés sont indicatifs. »
- Recherche sans résultat : « Aucun résultat. Essayez d'élargir vos filtres. »

**Microcopy assistant de campagne**
- Étape 1 `Objectif` : « Que voulez-vous obtenir ? Lancement, notoriété locale, promotion, événement… »
- Étape 2 `Budget` : « Budget total en dinars (TND). Vous suivrez sa consommation. »
- Étape 3 `Période et heures` : « Dates de début et de fin, puis la plage horaire quotidienne. Votre cible de 8 h n'est pas celle de 22 h. »
- Étape 4 `Zones` : « Sélectionnez une ou plusieurs zones. »
- Étape 5 `Récapitulatif` : « Vérifiez avant d'enregistrer. Vous pourrez modifier la campagne tant qu'elle est en brouillon ou à corriger. »
- Boutons : `Enregistrer le brouillon` · `Soumettre à validation`
- Confirmation de soumission : « Soumettre cette campagne ? Elle sera analysée par IA puis examinée par un expert TPUB. Vous ne pourrez plus la modifier pendant l'examen. »

**Réservation**
- Conflit : « Ce Porteur est déjà réservé sur la période choisie. Choisissez d'autres dates ou un autre Porteur. »
- Succès : « Créneau bloqué temporairement. Il sera confirmé à la validation de votre campagne. »
- Statuts : `Temporaire` · `Confirmée` · `Annulée` · `Expirée`
- Estimation : libeller « Estimation indicative », avec l'infobulle « Valeur provisoire, non issue d'une mesure. » Ou masquer tant que le calcul est fixé en dur.

**Rapport IA (libellés)**
- `Score de risque /100` (infobulle : « Plus il est bas, mieux c'est. »)
- `Score de qualité /100`
- `Points relevés`
- `Recommandation`
- Favorable : « Analyse favorable. Votre campagne attend la validation d'un expert TPUB. »
- Revue : « Certains points demandent un examen humain. Un expert TPUB va statuer. »
- À corriger : « Des corrections sont nécessaires. Modifiez votre campagne selon les recommandations, puis soumettez-la à nouveau. »
- Refus admin : « Campagne refusée. Motif : {motif}. Vos créneaux ont été libérés. »

**Statistiques (libellés honnêtes)**
- `Diffusions journalisées` (et non « vues » ni « audience ») · infobulle : « Nombre de passages enregistrés. Une diffusion n'est pas une mesure d'audience. »
- `Clics` · `Interactions` · infobulle : « Sur les canaux connectés (Wi-Fi, application, site web). »
- `Budget estimé` · `Budget consommé`
- Filtres : `Par zone` · `Par emplacement` · `Par date`

---

## 9. Notes d'inspiration UI

**À reconstruire (points forts de l'ancien site)**
- **ScreenViz, hero « écran en diffusion »** : cadre d'écran sombre (#0c0712, radius 26, halo magenta), bezel avec pastille rouge qui pulse, créations fictives en dégradé qui défilent (environ 4,4 s), barre de progression dégradée, pastilles de pagination.
  - **À corriger** : remplacer « LIVE » par « DÉMO » ou « APERÇU ». Retirer le compteur d'impressions fictif (48 213+), contraire à la charte.
  - Le remplacer par un **mini journal de diffusion simulé** qui défile, étiqueté « Illustration » : `14:02:10 · Écran C-? · Zone ? · 10 s · Campagne VERT`.
  - Traduire les créations d'exemple en FR et les marquer « exemple ».
  - Crossfade par calques (les dégradés CSS ne s'animent pas), `key` sur la ligne pour relancer l'animation, `prefers-reduced-motion`, `aria-live="off"`.
- **Logo écran + triangle play qui pulse** et point violet clignotant : garder, avec un garde reduced-motion.
- **Tokens** : fond #fbf8fc, encre #1a0f24, magenta #ec4899 / #be1d6c, violet #a855f7, dégradé `110deg #fb7185 → #ec4899 → #a855f7`, dark #170a22 / #21103a. Typo Bricolage Grotesque (titres, display en capitales) + Inter. Radius 16/24, boutons pilule.
- **Eyebrow** barre dégradée 24×3 + capitales espacées. Cartes à bordure haute 4 px magenta (violet pour les personas). Icônes en tuiles dégradées.
- **Showcases pleine largeur alternés** avec gros numéros « 01–04 » : réutiliser pour les 4 étapes ou les piliers.
- **Chaîne verticale d'étapes** avec connecteurs : idéale pour le parcours et la timeline de statuts.
- **Bande sombre à séparateurs** : garder la forme, mais avec des **mécanismes** (Par zone / Par créneau / Double contrôle / Journalisé) au lieu de pseudo-stats.
- **Header givré sticky**, soulignement dégradé actif, burger animé ; transitions de vue au changement de route ; reveal au scroll (avec reduced-motion).

**À améliorer / ajouter**
- **Imagerie** : abandonner les photos stock NYC/Chicago. Rendus ou illustrations de Porteurs types A/B/C dans des rues tunisiennes, ou silhouettes vectorielles des 3 typologies. Pas de photo présentée comme un déploiement réel.
- **Visuel de pipeline de modération** : carte campagne → jauges « Risque /100 » et « Qualité /100 » → badge « Validé par un expert TPUB ». Double contrôle rendu tangible.
- **Carte des zones** (cercles et contours) alimentée par le backend, avec un état vide élégant. Aucun point fictif présenté comme réel.
- **Tableau « prouvé vs estimé »** en échelle de confiance visuelle (disponibilité → diffusion → interactions → audience estimée → effet commercial).
- **Maquette d'écran dans l'espace client** pour prévisualiser la création dans un cadre Type A/B/C.
- **Bandeau de statut** discret et assumé, cohérent avec le groupe (« Statut des produits »).
- **Mode sombre** complet (les surfaces dark existent déjà), focus visibles, contraste du texte sur photo sans dépendre du seul scrim, labels sur les liens-icônes.
- **Formulaire de contact réel**, avec validation, anti-bot et routage par profil. Supprimer `mailto`, les liens localhost et le lien X mort.
- **SEO** : balises OG avec image, données structurées Organization (TPUB, parentOrganization Tukhnanutha), vraie page 404.
- **Dédupliquer** les contenus répétés entre pages : chaque page porte un angle propre (Accueil = promesse, Annonceurs = personas, Réseau = supports, Fonctionnement = parcours et preuves, Tarifs = critères).
