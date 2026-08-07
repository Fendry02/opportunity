# Fond de carte vectoriel — design

Date : 7 août 2026
État : validé, prêt pour le plan d'implémentation

## Décision

Remplacer le fond de carte raster OSM France HOT par un fond **vectoriel
MapLibre GL alimenté par OpenFreeMap Positron**, dont le style est ajusté sur
les tokens de `app/globals.css`. Supprimer au passage le chemin Google Maps.

Contrainte posée en amont et non négociable : le fond reste **gratuit et sans
clé d'API**, comme le reste du produit. C'est ce qui a éliminé Google Maps comme
défaut et Stadia Maps comme candidat.

## Pourquoi, et pourquoi la décision d'avant était mal fondée

`components/ResultsMap.tsx` portait ce commentaire :

> Tuiles OSM France HOT : plus lisibles en ville dense que le fond CARTO
> Positron, trop pâle quand beaucoup de pins se superposent.

Cette justification a été testée et ne tient pas. Rendu comparatif sur Tours,
même cadrage sur le cercle de 1 km, à deux densités (10 prospects réels des
fixtures, puis 70 semés dans le rayon) : à forte densité, Positron donne **plus**
de contraste de pins que HOT, pas moins. La raison est chromatique — les pins de
score sont rouges et orangés, et les routes de HOT sont saumon, donc de la même
famille. Les pastilles s'y noient. Un fond gris neutre n'entre pas en
concurrence avec elles.

Le fond pâle n'efface pas les pins : c'est lui qui les fait ressortir.

Observation annexe du test : à 70 prospects, **aucun** fond ne sauve la
lisibilité au centre du cluster. C'est un problème de regroupement de pins, pas
de fond de carte. Hors périmètre ici.

## Périmètre

Inclus :

- Remplacement du rendu carte par MapLibre GL + OpenFreeMap Positron ajusté.
- Suppression complète du chemin Google Maps.
- Découpage du composant en trois unités à responsabilité unique.
- Deux corrections de documentation induites (détaillées plus bas).

Exclu :

- Le regroupement de pins à forte densité.
- L'auto-hébergement des tuiles (Protomaps/PMTiles). MapLibre y mènera sans
  effort perdu le jour où ça deviendra souhaitable ; rien à préparer maintenant.
- Tout changement au score, à l'analyse de site ou au brief.

## Architecture

`ResultsMap.tsx` fait aujourd'hui 411 lignes et contient deux implémentations de
carte complètes. La cible se découpe en trois unités testables séparément :

| Unité | Rôle | Dépend de |
| --- | --- | --- |
| `lib/map/circle.ts` | `circlePolygon(centre, rayonM)` → `Feature<Polygon>` GeoJSON | rien, fonction pure |
| `lib/map/style.ts` | `patchPositronStyle(style)` → style MapLibre ajusté | rien, pas de React |
| `components/ResultsMap.tsx` | Conteneur, marqueurs, recentrage, sélection | les deux ci-dessus |

L'invariant du projet est préservé : `lib/` n'importe pas React et reste
appelable depuis les tests sans moteur de rendu.

### Pourquoi `circlePolygon` existe

Leaflet fournit `L.Circle`, MapLibre non. Le cercle de rayon doit devenir une
source GeoJSON explicite. La fonction échantillonne le cercle en 96 segments et
corrige la longitude par `cos(latitude)` — sans cette correction, le cercle
s'aplatit visiblement à la latitude de la France métropolitaine.

### Le style : patcher, pas vendoriser

Deux options écartées et une retenue.

Vendoriser les 25 Ko de JSON Positron dans le dépôt fige le rendu, mais oblige à
suivre à la main chaque correction d'OpenFreeMap. Consommer leur style sans le
toucher laisse les libellés passer sous les pins.

Retenu : **récupérer leur style au chargement et lui appliquer une liste
d'overrides nommés.** Le mode de défaillance est choisi délibérément — si
OpenFreeMap renomme une couche, l'override correspondant devient inopérant et on
perd un réglage ; on ne perd pas la carte. `patchPositronStyle()` ignore
silencieusement un identifiant de couche absent et ne lève jamais.

### Les overrides

Identifiants et valeurs relevés sur le style Positron réel (version 8,
55 couches, sources `openmaptiles` et `ne2_shaded`), pas devinés :

Valeurs de départ chiffrées ci-dessous. Elles sont à confirmer à l'œil sur la
démo de Tours aux deux densités — c'est un réglage visuel, pas un calcul — mais
elles donnent au plan quelque chose d'exécutable plutôt qu'une intention.

| Couche | Constat actuel | Ajustement |
| --- | --- | --- |
| `label_other` | Libellés de quartier en capitales (`text-transform: uppercase`, dès z8), `text-color: #333`. Ce sont eux qui passent sous les pins | `text-opacity` interpolée sur le zoom : 1 jusqu'à z12, 0.35 à partir de z14 |
| `label_city` | « Tours » en `#000`, affiché en plein milieu du cluster de pins | `text-opacity` 1 jusqu'à z12, 0 à partir de z14 — au zoom d'un balayage, le nom de la ville est redondant, on vient de la saisir |
| `highway_minor` | `hsl(0,0%,88%)` à `line-opacity: 0.9` | `line-color` à `hsl(0,0%,82%)`, `line-opacity` à 1 |
| `highway_major_casing` | `rgb(213,213,213)` | `line-color` à `rgb(198,198,198)` |
| `building` | `rgb(234,234,229)` | Inchangé. C'est ce qui donne la structure urbaine sans bruit |

Le contraste des deux couches de voirie est monté juste assez pour que les rues
restent suivables sous les pastilles, et pas au-delà : au-dessus de ces valeurs,
la voirie se met à concurrencer les pins et on reproduit le défaut de HOT.

Le cercle de rayon n'est **pas** un override : c'est notre propre couche. Son
opacité de trait actuelle (0.4) est trop faible sur un gris aussi clair ; valeur
de départ 0.7, largeur 1, remplissage inchangé à 0.03. Réglé dans notre code,
pas dans le style tiers.

## Parité de comportement

Tout ce qui suit existe aujourd'hui côté Leaflet et doit survivre à la
migration :

- Recadrage sur le cercle quand la zone de recherche change, **avec la garde
  `lastKey`** qui évite de recadrer quand ni le centre ni le rayon n'ont bougé.
- `panTo` sur le prospect sélectionné uniquement s'il sort du champ de vision
  (aujourd'hui `getBounds().pad(-0.1).contains()`).
- Couleurs de pin issues de `TIER_COLOR` / `scoreTier` — aucune couleur
  redéfinie dans le composant.
- Prospect en refus de démarchage : pin gris neutre et cercle barré en SVG.
- Prospect sans score : pin gris clair, libellé `…`.
- Pin sélectionné : contour indigo et passage au premier plan.
- Clic sur un pin → `onSelect(id)`.
- Infobulle : `<nom> — <score>/100`, ou `<nom> — écarté (<motif>)`.
- Attribution OpenFreeMap visible en permanence. Elle est obligatoire.

## Suppression du chemin Google Maps

Sa seule raison d'être était d'offrir un plus beau fond de carte. Positron
ajusté la fait disparaître. Ce qui part :

- `GoogleResultsMap` et ses helpers (~145 lignes de glue impérative), le bloc
  `declare global`, les types `GoogleMapInstance` & co., `loadGoogleMaps()`.
- La variable `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` dans `.env.local.example`.
- La section « Optionnel : fond de carte Google Maps » du README.

Trois raisons s'ajoutent à la disparition du besoin :

1. Le code utilise `maps.Marker`, que Google a déprécié début 2024 au profit de
   `AdvancedMarkerElement`. Le garder imposait une migration.
2. Les deux implémentations avaient déjà divergé : un refus de démarchage
   s'affichait en cercle barré SVG côté Leaflet et en simple `!` côté Google.
   C'est le symptôme classique de deux chemins qu'on ne regarde jamais côte à
   côte.
3. Il exigeait une clé exposée au navigateur et engageait un SKU facturé au
   chargement de carte, en contradiction avec l'argument coût du README.

## Dépendances

Sortent : `leaflet`, `react-leaflet`, `@types/leaflet`.
Entre : `maplibre-gl`.

Coût assumé : MapLibre pèse environ 200 Ko gzip contre environ 40 Ko pour
Leaflet. C'est cinq fois plus de JavaScript pour la carte, en échange du
contrôle du style, du zoom continu et de libellés nets à tout niveau. Le
compromis est accepté ; il doit être mesuré au build et non supposé.

## Tests

Testable dans la suite `node:test` existante, sans DOM :

- `circlePolygon()` — anneau fermé (premier point = dernier), rayon correct à la
  latitude de Tours, aplatissement en longitude corrigé, rayon nul et rayon très
  grand qui ne produisent pas de NaN.
- `patchPositronStyle()` — overrides appliqués sur un style d'exemple ; style
  dont une couche cible est absente qui **ne lève pas** et laisse le reste
  intact ; absence de mutation de l'objet d'entrée.

Non couvert, et dit franchement : le composant `ResultsMap` lui-même. Le dépôt
n'embarque ni DOM ni moteur de rendu dans sa suite de tests, et en ajouter un
pour ce seul composant serait disproportionné. La vérification du rendu reste
visuelle.

## Corrections de documentation induites

Deux inexactitudes portant sur la couche qu'on modifie, donc traitées ici :

1. Le README affirme qu'en mode `MOCK_EXTERNAL=1` l'application « ne fait aucun
   appel réseau ». C'est faux aujourd'hui et le restera : les tuiles partent
   chez OSM France, demain chez OpenFreeMap. La phrase doit distinguer les
   appels serveur aux API métier — bien tous coupés — du fond de carte chargé
   par le navigateur.
2. Le tableau des sources de données doit remplacer la ligne des tuiles OSM
   France par OpenFreeMap, sans TTL de cache : les tuiles ne passent pas par
   `cachedFetch()`, elles sont chargées côté client.

## Risques

- **Dépendance à un service tiers gratuit.** OpenFreeMap n'a pas de SLA. Si le
  service disparaît, la carte tombe. Atténuation disponible sans changement
  d'architecture : MapLibre lit aussi des PMTiles auto-hébergés, ce qui est la
  suite logique déjà identifiée.
- **Overrides silencieusement inopérants** si OpenFreeMap renomme ses couches.
  C'est un choix, pas un oubli : le mode de défaillance est la perte d'un
  réglage esthétique, jamais une carte blanche.
- **Poids du bundle.** À mesurer après implémentation, pas à supposer.
