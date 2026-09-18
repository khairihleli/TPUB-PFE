# Studio 3D du Porteur — cahier de livraison GLB et calibration

Ce document s'adresse au designer 3D qui livre le modèle du Porteur et à l'équipe qui l'intègre.
Le studio (`src/components/porteur3d/`) affiche aujourd'hui un **Porteur procédural** (types A, B, C, D)
construit en code à l'échelle métrique. Dès qu'un fichier GLB conforme est déposé dans
`public/models/`, il le remplace **sans aucune modification de code**.

> Les typologies et caractéristiques du Porteur expriment une **intention de conception**, pas des
> performances constatées. Le modèle 3D est une maquette indicative : ne pas y inscrire de
> puissances, capacités ou chiffres d'audience.

---

## 1. Chaîne de chargement

Pour un Porteur de type `X` (A, B, C ou D), le studio essaie dans l'ordre :

1. `/models/porteur-type-x.glb` (ex. `public/models/porteur-type-b.glb`) ;
2. `/models/porteur.glb` (modèle générique, utilisé pour tous les types sans fichier dédié) ;
3. à défaut, le **Porteur procédural**.

Chaque candidat est d'abord sondé par une requête `HEAD` (délai 4 s). Une réponse 404, une page HTML
ou une erreur réseau passe au candidat suivant. Si le GLB trouvé ne se charge pas, le procédural est
affiché et un avertissement apparaît en mode repère.

Décodeurs fournis : **Draco** (`public/draco/`, copie de `three/examples/jsm/libs/draco/gltf/`) et
**Meshopt** (intégré). Aucun autre décodeur n'est disponible (pas de KTX2/Basis).

## 2. Format du fichier

| Exigence | Valeur |
|---|---|
| Format | glTF 2.0 **binaire** (`.glb`), un seul fichier, textures embarquées |
| Axe vertical | **Y vers le haut** (export Blender : option « +Y Up » cochée) |
| Unité | **mètre** (1 unité = 1 m) |
| Origine | **centre de la base**, au niveau du sol (y = 0) |
| Face principale | écran principal orienté vers **−Z** (face 1 d'un type B vers −Z, face 2 vers +Z) |
| Transformations | appliquées avant export (échelle 1, rotation 0 sur la racine) |
| Matériaux | PBR metallic-roughness standard (`MeshStandardMaterial`) |
| Contenu ignoré | caméras, lumières, animations |

**Orientation dans la scène.** Le studio fait pivoter le modèle autour de Y selon l'orientation
déclarée du Porteur (`headingDeg`, 0 = nord, sens horaire ; nord de la scène = −Z). Le fichier ne doit
donc contenir aucune orientation « géographique » : face principale vers −Z, toujours.

**Hauteur.** Avec `SCENE_CONFIG.glb.autoScale = true` (défaut, `scene-config.ts`), le modèle est
mis à l'échelle **uniformément** pour que sa hauteur totale (du sol au sommet de la sphère) égale la
hauteur de mât déclarée (15, 20, 25 ou 30 m ; 20 m si non déclarée), puis recentré (centre de la base
à l'origine). Modélisez à **20 m** de référence. Conséquence pour le type C : l'écran à hauteur des
yeux (bas à 2,2 m, haut à 4 m pour 20 m) suit l'échelle ; si l'écran doit rester à hauteur fixe,
livrez un fichier par hauteur et passez `autoScale` à `false` (le repère signale alors tout écart de
hauteur supérieur à 10 %).

## 3. Noms des fichiers

| Fichier | Usage |
|---|---|
| `public/models/porteur-type-a.glb` | Type A — écran panoramique 360° (ronds-points, places) |
| `public/models/porteur-type-b.glb` | Type B — double face (grands axes) |
| `public/models/porteur-type-c.glb` | Type C — écran simple à hauteur des yeux (rues piétonnes) |
| `public/models/porteur-type-d.glb` | Type D — infrastructure sans écran |
| `public/models/porteur.glb` | Générique (repli pour tout type sans fichier dédié) |

Noms en minuscules, sans espace. Le dossier `public/models/` n'existe pas tant qu'aucun modèle n'est
livré : c'est normal (le procédural s'affiche).

## 4. Convention de nommage des nœuds

Les noms sont lus après l'import (GLTFLoader remplace les espaces par `_`, retire `[ ] . : /` et
suffixe les doublons par `_1`, `_2`… ; `Screen_Face_1.001` devient `Screen_Face_1001` et reste
reconnu).

### 4.1 Écrans — reçoivent le visuel de l'annonceur

| Nom du maillage (ou du nœud parent) | Rôle |
|---|---|
| `Screen_360` | bande cylindrique du type A |
| `Screen_Face_1` | écran du côté de la face principale (−Z) — types B et C |
| `Screen_Face_2` | écran opposé (+Z) — type B |
| `Screen…` (autre suffixe) | écran sans face identifiée : toujours allumé |

- Règle : tout nœud dont le nom **commence** par `Screen` (casse ignorée) est un écran, **ainsi que
  tous ses enfants maillages**. Un maillage dont le matériau commence par `M_Screen` est aussi un
  écran (la face est alors lue dans le nom du matériau, ex. `M_Screen_Face_2`).
- **Ne jamais** préfixer par `Screen` une pièce qui n'est pas la surface lumineuse : caisson, cadre,
  fixations, groupe d'assemblage. Utilisez `Display_Cabinet_1`, `Display_Frame`, `Display_Assembly`…
- Le matériau des écrans est **remplacé** par le studio (verre sombre + émissif piloté jour/nuit).
  Nommez-le `M_Screen` ; sa couleur n'a pas d'importance.
- **UV (canal 0) de 0 à 1 couvrant toute la zone active**, sans marge ni îlots :
  - panneaux (B, C) : u = 0 à gauche → 1 à droite **vu de face**, v = 0 en bas → 1 en haut ;
    format d'affichage **9:16 portrait** ;
  - bande 360° (A) : u fait le tour complet, **u = 0,5 face à −Z**, couture à l'arrière (+Z),
    v = 0 en bas → 1 en haut.
- Le studio calcule le rapport largeur/hauteur de chaque écran à partir de sa boîte englobante
  (circonférence/hauteur pour `Screen_360`) et cadre le visuel sans le déformer (recadrage centré sur
  les panneaux, répétition autour de la bande).

### 4.2 Sphère énergie

| Nom | Rôle |
|---|---|
| `Energy_Sphere` (contenu dans le nom, ex. `Porteur_Energy_Sphere`) | tourne en continu autour de **son axe Y local** |

Placez le **pivot au centre de la sphère**. Les sous-éléments (coques, anneaux) sont des enfants et
tournent avec elle ; ne mettez pas le mât dans ce groupe. Rotation coupée si l'utilisateur a activé
« réduire les animations ».

### 4.3 Points d'intérêt (hotspots)

Des **Empties** (objets vides) nommés `Hotspot_<id>` remplacent les ancres calculées. Placez-les à la
surface de la pièce, là où le bouton doit apparaître.

| Nom | Point | Alias acceptés |
|---|---|---|
| `Hotspot_ecran` | écran (absent pour le type D) | `Hotspot_screen`, `Hotspot_display` |
| `Hotspot_solaire` | panneaux solaires | `Hotspot_solar`, `Hotspot_panneau` |
| `Hotspot_sphere` | sphère énergie | `Hotspot_energy`, `Hotspot_energie` |
| `Hotspot_mat` | mât | `Hotspot_mast`, `Hotspot_pole` |
| `Hotspot_base` | socle | `Hotspot_socle` |
| `Hotspot_capteurs` | capteurs et connectivité | `Hotspot_sensors`, `Hotspot_capteur` |

Seul le premier mot après `Hotspot_` compte (`Hotspot_Solar_2` → solaire). Un nom inconnu est ignoré
et signalé en mode repère. Un point absent du fichier retombe sur l'ancre du modèle procédural.
L'orientation « vers l'extérieur » (utilisée pour estomper un point caché derrière le mât) est
déduite de la position horizontale de l'Empty par rapport à l'axe du mât.

## 5. Budgets

| Poste | Maximum |
|---|---|
| Triangles (fichier entier) | **150 000** (le repère affiche le total et avertit au-delà) |
| Textures | **4 textures 2K** (2048 × 2048) au plus ; JPEG/PNG/WebP |
| Compression géométrie | **Draco** (`KHR_draco_mesh_compression`) **ou Meshopt** (`EXT_meshopt_compression`) |
| Poids conseillé | < 8 Mo |

Exemple d'optimisation avec glTF-Transform (outil du designer, hors projet) :

```bash
gltf-transform optimize porteur-source.glb porteur-type-a.glb \
  --compress meshopt --texture-compress webp --texture-size 2048
```

## 6. Contenu attendu par type

| Type | Écran | Tête | Remarques |
|---|---|---|---|
| A | `Screen_360` autour du mât, vers 30–40 % de la hauteur | panneaux solaires inclinés sur bras triangulaires + sphère | socle cylindrique, mât cannelé |
| B | `Screen_Face_1` (−Z) et `Screen_Face_2` (+Z), dos à dos | idem | la face 1 est celle orientée selon `headingDeg` |
| C | `Screen_Face_1` à hauteur des yeux (≈ 2,2–4 m) | idem | emprise au sol réduite |
| D | aucun | idem | coffret capteurs bas, `Hotspot_ecran` interdit |

## 7. Calibration avec `?repere=1`

Ajoutez `?repere=1` à l'URL d'une page qui affiche le studio (ex. `/espace/reseau?porteur=12&repere=1`)
ou activez « Repère » dans les outils du personnel. Le mode repère affiche :

- **axes** X (rouge), Y (vert), Z (bleu) avec étiquettes, et le repère « −Z · face principale » ;
- **grille** au sol : lignes tous les 1 m, lignes majeures tous les 5 m ;
- **boîte englobante** du modèle et ses dimensions `L × H × P` (mètres, après normalisation) ;
- **ancres** des points d'intérêt (sphères orange) avec leurs coordonnées locales ;
- **source** du modèle (« Procédural » ou chemin du GLB) et **nombre de triangles** ;
- **caméra** en direct : position et cible dans le repère local du Porteur (orientation retirée) ;
- les **avertissements** : unité suspecte, origine décentrée, écran ou sphère introuvable, point
  d'intérêt inconnu, budget dépassé, échec de chargement.

Procédure de contrôle d'une livraison :

1. Déposer le fichier dans `public/models/` puis recharger la page avec `?repere=1`.
2. Vérifier « Source : GLB · /models/… » et le nombre de triangles.
3. Vérifier que la base touche la grille au centre et que la face principale regarde l'étiquette −Z.
4. Vérifier la hauteur `H` de la boîte (hauteur déclarée si `autoScale`).
5. Passer en vue « Face écran » (touche 5) : le visuel « VOTRE MESSAGE ICI » doit être droit, lisible
   de gauche à droite et remplir l'écran. Pour B, sélectionner Face 2.
6. Contrôler que la sphère tourne et que chaque point d'intérêt tombe sur sa pièce.

### Ajuster un point de vue

1. Orbiter jusqu'au cadrage voulu (glisser, molette, flèches du clavier).
2. Cliquer **« Copier la vue »** : le presse-papiers reçoit un JSON prêt à coller, par exemple :

```json
{
  "id": "pieton",
  "def": {
    "kind": "fixed",
    "position": [3.2, 1.7, -24.6],
    "target": [0, 3.1, -0.6],
    "referenceHeightM": 20
  }
}
```

3. Dans `src/components/porteur3d/scene-config.ts`, remplacer la propriété `def` du preset
   correspondant dans `CAMERA_PRESETS`. Les coordonnées sont locales (orientation retirée) et mises à
   l'échelle proportionnellement à la hauteur du mât (`referenceHeightM`).

Les presets par défaut sont exprimés en règles (`kind: "orbit"`) : `orbite` (trois quarts),
`pieton` (1,7 m, 25 m devant l'écran), `conducteur` (1,2 m, 60 m, décalé de 4 m), `drone` (oblique
haute), `face` (cadrage frontal calculé sur l'écran).

## 8. Repli sans WebGL

Si WebGL est indisponible (ou si le contexte est perdu), le studio affiche le rendu de référence
`public/porteur/porteur-type-{a..d}.png`, le visuel dans un écran simulé en CSS, un avertissement et
la liste des points clés : aucune livraison n'est nécessaire pour ce mode.
