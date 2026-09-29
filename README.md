# Opportunity

**Trouvez les entreprises locales dont le site est absent, cassé ou dépassé — et arrivez au rendez-vous avec le brief déjà rédigé.**

[![CI](https://github.com/Fendry02/opportunity/actions/workflows/ci.yml/badge.svg)](https://github.com/Fendry02/opportunity/actions/workflows/ci.yml)
[![Licence : AGPL v3](https://img.shields.io/badge/Licence-AGPL_v3-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Node 22+](https://img.shields.io/badge/Node-22%2B-5FA04E)](https://nodejs.org)

![Opportunity : balayer une ville, classer les prospects par score, ouvrir le diagnostic d'un prospect](public/screenshots/demo.gif)

## Pourquoi

Quand on vend des refontes de sites, le difficile n'est pas le pitch — c'est de
trouver les vingt entreprises du secteur dont le site justifie vraiment l'appel.
Concrètement : ouvrir des centaines d'onglets, plisser les yeux sur chaque site
depuis un téléphone, et deviner.

Opportunity plisse les yeux à votre place. Il balaie un rayon, confronte la
présence web de chaque entreprise à une liste fixe de défauts, les classe de 0 à
100, et rédige un brief Markdown lisible dans la voiture avant le rendez-vous.

La recherche et le diagnostic tournent sur votre machine, sans compte ni LLM :
ils utilisent des heuristiques déterministes, des données publiques et un cache
SQLite local. La création assistée de vitrines est une fonction distincte qui
utilise Claude Code et peut publier sur Vercel si vous l'activez.

> [!IMPORTANT]
> **Opportunity est centré sur la France.** Le géocodage passe par l'API BAN de
> l'État (`api-adresse.data.gouv.fr`) et l'enrichissement par
> `recherche-entreprises.api.gouv.fr` — les deux ne couvrent que la France.
> L'interface est en français. Tout le reste (score, analyse de site, Google
> Places) est indépendant du pays : brancher un autre géocodeur est l'essentiel
> du travail pour s'en servir ailleurs. Voir la [feuille de
> route](#feuille-de-route).

## Ce qu'il fait

- Balayer autour d'une ville ou d'une adresse précise, avec un rayon
  configurable.
- Couvrir plusieurs métiers d'un coup : plombiers, électriciens, menuisiers,
  restaurants, coiffeurs, garages — la liste tient dans [un seul fichier
  éditable](config/sectors.ts).
- Noter chaque entreprise sur l'opportunité commerciale : pas de site, site
  mort, pas de viewport mobile, bases SEO faibles, technologie obsolète, pas de
  formulaire de contact, balises Open Graph manquantes, pas de favicon, pages
  lourdes ou lentes.
- Afficher les prospects sur une carte avec des pastilles colorées par score et
  une liste triable synchronisée.
- Ouvrir un prospect sans quitter la carte, inspecter le détail du score, puis
  exporter un brief Markdown prêt pour la prise de contact.
- Exporter tout un balayage d'un coup : un seul Markdown réunit les briefs de
  tous les prospects notés, triés par score.
- Cocher jusqu'à 12 prospects et générer pour chacun une première vitrine,
  précédée de son enrichissement, dans le dossier `../websites` par défaut.
- Suivre la prise de contact prospect par prospect — à contacter, contacté, pas
  intéressé, client — un statut qui suit l'entreprise d'un balayage à l'autre.
- Choisir une visite sur place ou un e-mail pour chaque prospect. L'adresse de
  contact publique est recherchée, puis le brouillon est préparé avec le lien
  du site publié et un devis de travail.
- Travailler en thème clair ou sombre, au choix ou selon le réglage du système.
- Mettre en cache géocodage, Places, récupérations de sites et enrichissement
  dans SQLite : une recherche relancée pendant la durée du cache évite les
  mêmes appels facturables.
- **Respecter les refus de démarchage** du type `pas de démarchage pour un site`
  avant de noter ou de briefer une entreprise.

![L'espace de travail : un balayage de 1 km sur Tours, dix prospects classés par score, deux exclus pour refus de démarchage](public/screenshots/01-workspace.png)

## Démarrage rapide

Installez Node.js 22 ou plus récent, puis :

```bash
git clone https://github.com/Fendry02/opportunity.git
cd opportunity
npm ci
cp .env.local.example .env.local
npm run dev
```

Ouvrez <http://localhost:3000> et cliquez sur **Lancer le balayage**.

`.env.local.example` positionne `MOCK_EXTERNAL=1`. Dans ce mode, la recherche,
l'analyse et l'enrichissement lisent [`fixtures/`](fixtures/) : vous pouvez
essayer le balayage de Tours, la carte, les scores et les briefs avec des
entreprises fictives, sans clé Google ni quota facturé. Saisissez **Tours** :
les fixtures ne couvrent pas les autres villes.

Le fond de carte est chargé par le navigateur depuis CARTO, même en mode mock.
La finalisation par Claude Code et la publication Vercel, si vous les lancez,
sont également indépendantes de `MOCK_EXTERNAL`. Le mode mock simule les sources
de données du balayage ; il ne rend pas toute l'application hors ligne.

| Usage | À fournir | Résultat |
| --- | --- | --- |
| Démo locale | Node 22+, aucune clé | Balayage de Tours, diagnostic et briefs |
| Vraies recherches | Clé Google Places et `MOCK_EXTERNAL=0` | Balayages en France avec quota Google |
| Vitrines assistées | Claude Code installé et connecté | Prototype local puis finalisation par agent |
| Publication | `VERCEL_TOKEN` et CLI Vercel accessible | Déploiement de la vitrine finalisée |

## Le résultat

Le tout est fait pour produire ce fichier. Un clic sur **Brief Markdown** le
génère pour n'importe quel prospect :

<details>
<summary><b>Exemple de brief — Restaurant Ancien, 85/100</b> (généré depuis les fixtures de démo)</summary>

```markdown
# Restaurant Ancien

**Score d'opportunité : 85/100** — Prioritaire

## Identité

- **Secteur** : Restaurant
- **Adresse** : 21 rue Nationale, 37000 Tours, France
- **Téléphone** : 01 00 00 00 00
- **Site web** : http://www.restaurant-ancien.fr/
- **Réputation Google** : 4.4/5 sur 213 avis

## Interlocuteur

_Non identifié._ Lancer l'enrichissement depuis la fiche, ou appeler en demandant « le responsable » à l'accueil.

## Diagnostic

| Critère | Points | Constat |
| --- | ---: | --- |
| Pas adapté au mobile | 14 | Aucune balise viewport : le site s'affiche en version bureau sur téléphone, illisible pour la majorité des visiteurs. |
| Pas de HTTPS | 12 | Connexion non chiffrée : les navigateurs affichent « Non sécurisé » et Google déclasse la page. |
| Technologie obsolète | 10 | Détecté : WordPress 4.9.8 (obsolète, non maintenu) ; jQuery 1.7.2 (version de 2013 ou antérieure) ; Mise en page en tableaux HTML ; Contenu Flash (plus lu par aucun navigateur). |
| Référencement incomplet | 7 | Éléments manquants : meta description, titre h1, sitemap.xml, robots.txt. |
| Site visiblement abandonné | 7 | Le pied de page affiche encore 2014 : 12 ans sans mise à jour visible. |
| Pas de formulaire de contact | 6 | Aucun moyen de laisser une demande depuis le site : les prospects du soir et du week-end sont perdus. |
| Pas de balises Open Graph | 4 | Partagé sur Facebook ou WhatsApp, le lien s'affiche sans titre ni image. |
| Pas de mesure d'audience | 4 | Aucun outil de statistiques : impossible de savoir ce que le site rapporte. |
| Pas de favicon | 3 | Onglet et favoris affichent une icône vide : détail visible, effet amateur. |
| Pas de réseaux sociaux | 3 | Aucun lien vers un réseau social depuis le site. |
| Visibilité Google | +5 | 213 avis Google : l'établissement est déjà cherché en ligne. |
| Forte notoriété locale | +3 | Plus de 50 avis : audience suffisante pour rentabiliser un site. |
| Bonne réputation | +4 | Note de 4.4/5 : la qualité est là, la vitrine ne suit pas. |
| Joignable directement | +3 | Téléphone public : prise de contact immédiate possible. |

**Total : 85/100**

## Recommandations

1. Refonte responsive en priorité absolue : sur ce type d'activité, la majorité des visites viennent du mobile. Montrer le site sur son propre téléphone pendant le rendez-vous.
2. Installer un certificat TLS (gratuit via Let's Encrypt) et forcer la redirection. Faire constater l'avertissement « Non sécurisé » du navigateur.
3. Reconstruire sur une base maintenue. Insister sur le risque : un CMS non mis à jour est la première porte d'entrée des piratages de sites vitrines.
4. Reprendre les balises de base (title, meta description, h1) et publier sitemap.xml + robots.txt.
5. Le site donne l'impression d'une entreprise à l'arrêt. Argument fort auprès d'un dirigeant qui, lui, sait que son activité tourne.

### Angle d'attaque

- L'établissement est déjà cherché en ligne : la demande existe, seule la vitrine manque.
- Audience suffisante pour rentabiliser rapidement une refonte.
- La qualité perçue est excellente — le site ne lui rend pas justice.
```

</details>

Chaque défaut porte son propre argument commercial, parce que le chiffre seul ne
survit pas au contact d'un dirigeant.

## Préparer des sites par lot

Dans la liste des résultats, cochez les établissements à traiter, puis cliquez
sur **Créer N sites**. Une confirmation rappelle le lancement de Claude Code et
la publication automatique si Vercel est configuré. L'application enrichit
ensuite chaque fiche avant de préparer sa vitrine, puis la place dans une file
locale. Un refus de démarchage n'affiche pas de case et ne peut pas entrer dans
le lot.

Chaque projet arrive dans `../websites/<nom-du-prospect>/` (ou dans le dossier
défini par `OPPORTUNITY_WEBSITES_DIR`) avec :

- `index.html`, une vitrine statique déjà ouvrable, adaptée au mobile, avec
  appels à l'action, animations discrètes, note et volume d'avis Google, puis
  carte et lien d'itinéraire Google Maps ;
- `PROMPT.md`, le brief lu par Claude Code pour poursuivre le travail dans ce
  seul dossier ;
- `DEVIS.md`, un brouillon de devis à 1 000 € HT, à compléter avec vos mentions
  légales et vos conditions de vente avant envoi ;
- `site.json`, la trace de la génération et de la fiche source.

Le bouton **Sites** du bandeau ouvre le suivi : attente, exécution, site prêt ou
erreur. Un projet prêt s'ouvre dans un nouvel onglet; le prompt reste
consultable, et un échec peut être relancé. Claude Code démarre depuis le
dossier de chaque vitrine, avec les outils `Read`, `Edit`, `Write`, `Glob` et
`Grep`, sans shell ni publication.

Par défaut, Opportunity cherche la commande `claude` et plafonne son budget à
3 USD par vitrine. **Créer des sites lance cet agent et peut donc engendrer des
frais.** Installez et connectez Claude Code avant de créer un lot, ou modifiez
`OPPORTUNITY_WEBSITE_AGENT_COMMAND` et
`OPPORTUNITY_WEBSITE_AGENT_MAX_BUDGET_USD` dans `.env.local`. Si la commande
manque, le prototype `index.html` est quand même créé, mais le job passe en
erreur avec le diagnostic et reste relançable.

Les répertoires existants ne sont jamais remplacés. Relancer une création pour
le même nom le signale comme ignorée, ce qui évite d'écraser une retouche en
cours. Définissez `OPPORTUNITY_WEBSITES_DIR` si les vitrines doivent vivre sur
un autre volume.

## Préparer la prise de contact

La fiche d'un prospect contient un choix de canal : **Visite sur place** ou
**E-mail**. Dans le premier cas, le devis sert de support de rendez-vous. Dans
le second, Opportunity enrichit le prospect et cherche une adresse affichée sur
son site public, en priorité sur les pages de contact et de mentions légales.
L'adresse trouvée est indiquée dans la fiche ; une adresse saisie manuellement
reste toujours prioritaire. Si aucune adresse publique n'est disponible, vous
pouvez simplement la renseigner vous-même.

La même recherche est lancée avant chaque génération de site, y compris pour
une sélection de prospects. Dès que Vercel a publié le site, Opportunity prépare
et conserve automatiquement le sujet et le texte avec l'URL de production et le
devis. Il ne crée pas de message dans votre boîte mail et n'envoie rien lui-même.

La publication démarre après la génération locale. Renseignez `VERCEL_TOKEN`
dans `.env.local`, puis, si besoin, `VERCEL_SCOPE` pour une équipe Vercel. Le
programme `npx` doit être disponible et peut télécharger le CLI Vercel lors de
la première publication. Sans jeton, le site reste prêt localement et le panneau
**Sites** affiche l'erreur ; après avoir ajouté le jeton, cliquez sur
**Relancer Vercel**. Cette relance ne demande pas une nouvelle génération.

<p align="center">
  <img src="public/screenshots/02-diagnostic.png" alt="Fiche prospect : identité, puis le diagnostic chiffré avec un argument commercial par défaut" width="620">
</p>

## Comment le score est calculé

Une entreprise sans site, ou dont le site est injoignable, démarre haut — c'est
la conversation de refonte la plus probable. Un site existant est noté à partir
de ses défauts visibles et de signaux commerciaux.

Principaux défauts : pas de HTTPS ; pas de viewport mobile ; title, meta
description, H1, sitemap ou robots manquants ; technologie obsolète ou
constructeurs gratuits (pages Facebook, Wix, e-monsite) ; pas de formulaire de
contact ; pas de balises Open Graph ni de favicon ; année de copyright figée ;
pages lourdes ou lentes.

Les bonus d'attractivité tiennent compte de la réputation, du volume d'avis et
de la disponibilité d'un téléphone — une entreprise que personne ne cherche est
un moins bon prospect qu'une entreprise très demandée avec un mauvais site.

Tous les poids vivent dans [`lib/scoring.ts`](lib/scoring.ts). Les défauts sont
plafonnés collectivement (`MAX_DEFECTS`) pour qu'aucun signal isolé ne domine un
score.

## Ce que ça coûte à l'usage

Rien en mode mock pour les sources du balayage. Avec `MOCK_EXTERNAL=0`,
Opportunity effectue des appels Google Places facturables. Les SKU dépendent
des masques de champs de [`lib/places/client.ts`](lib/places/client.ts) :
Text Search utilise des champs Pro ; Place Details demande notamment `rating`,
`userRatingCount` et `regularOpeningHours`, qui relèvent d'Enterprise.
Consultez la [tarification Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing)
et les quotas de votre projet avant d'activer les recherches réelles.
Pour estimer un balayage, comptez les appels Text Search par secteur et les
appels Place Details par établissement retenu ; le cache évite les appels
répétés jusqu'à l'expiration des données.

Trois garde-fous limitent la consommation :

- des valeurs `X-Goog-FieldMask` strictes — les modifier modifie votre facture ;
- un plafond quotidien local via `PLACES_DAILY_CAP` (300 par défaut) ;
- le cache SQLite, qui rend gratuite une recherche relancée.

La finalisation par Claude Code et la publication Vercel ont leurs propres
conditions et coûts éventuels ; `PLACES_DAILY_CAP` ne les limite pas.

## Éthique

Opportunity regarde des **entreprises, pas des personnes**, et uniquement ce que
ces entreprises publient elles-mêmes. Le pipeline ne recherche que les adresses
de contact déjà affichées par l'entreprise sur son propre site, sans source
authentifiée ni collecte d'adresses privées. Aucun scraping ne va au-delà de
pages publiques qu'un navigateur récupérerait de toute façon.

Deux règles sont structurantes :

- **Le refus de démarchage est respecté.** Une fiche qui signale ne pas vouloir
  être démarchée à propos d'un site — dans son nom ou sur son site — est exclue
  du score et de la génération de brief ([`lib/opt-out.ts`](lib/opt-out.ts)).
  C'est visible dans la démo : deux entreprises sont barrées.
- **Un brief est fait pour être lu par un humain.** La sortie est un document
  que vous relisez avant de décider de contacter quelqu'un. En faire une machine
  à e-mailing automatique est un [hors périmètre](#hors-périmètre) explicite.

## Configuration Google Places

Nécessaire uniquement pour passer à `MOCK_EXTERNAL=0`.

1. Créez un projet Google Cloud et rattachez-y une facturation.
2. Activez **Places API (New)**. N'activez *pas* l'ancienne Places API.
3. Créez une clé d'API restreinte à **Places API (New)**.
4. Ajoutez-la dans `.env.local` :

```bash
GOOGLE_PLACES_API_KEY=votre_cle_google_places
MOCK_EXTERNAL=0
PLACES_DAILY_CAP=300
```

Validez la clé avec un seul appel avant de lancer un vrai balayage :

```bash
npm run places:smoke -- "plombier à Tours"
```

## Déployer votre instance

Opportunity est fait pour tourner en local, mais rien n'empêche d'en héberger
une **instance personnelle**, toujours accessible. Elle reste
**mono-utilisateur** : vos données, votre clé, protégée par un mot de passe. Pas
de comptes, pas de multi-tenant — chacun déploie la sienne.

Le dépôt fournit tout le nécessaire : `Dockerfile`, `.dockerignore` et un
`fly.toml` d'exemple pour [Fly.io](https://fly.io).

### Sur Fly.io

```bash
fly launch --copy-config --no-deploy   # choisissez un nom d'app unique et une région
fly volumes create opportunity_data --size 1 --region cdg  # adaptez la région
fly secrets set APP_PASSWORD=un_mot_de_passe_solide
fly deploy
```

- `fly.toml` démarre en mode démo (`MOCK_EXTERNAL=1`). Pour les vraies recherches,
  ajoutez `GOOGLE_PLACES_API_KEY` avec `fly secrets set`, passez
  `MOCK_EXTERNAL` à `0` dans `fly.toml`, puis redéployez.
- **`APP_PASSWORD`** protège l'instance : sans lui, quiconque connaît l'URL
  pourrait lancer des balayages sur *votre* clé Google. Défini → une page de
  connexion apparaît ; absent → l'instance est ouverte (pratique en local).
- **`GOOGLE_PLACES_API_KEY`** : votre clé (voir § Configuration Google Places).
- La base et les vitrines générées vivent sur le volume `/data`
  (`OPPORTUNITY_DB_PATH` et `OPPORTUNITY_WEBSITES_DIR`) et survivent aux
  redéploiements. Se déconnecter : `POST /api/logout`.

L'image Docker fournie n'installe pas Claude Code. Le balayage, les diagnostics,
les briefs et les prototypes HTML fonctionnent ; la finalisation automatique
des vitrines requiert un agent installé et connecté **dans le conteneur**, puis
un nouveau build de l'image. La publication Vercel requiert également son jeton.

### Ailleurs (Docker)

L'image est un conteneur standard, déployable sur n'importe quel hôte Docker
(Render, Railway, un VPS…) :

```bash
docker build -t opportunity .
docker run -p 3000:3000 \
  -e APP_PASSWORD=un_mot_de_passe_solide \
  -e MOCK_EXTERNAL=1 \
  -v opportunity_data:/data \
  opportunity
```

Montez un volume sur `/data` pour conserver la base et les vitrines. Pour les
vraies recherches, ajoutez la clé Google et passez `MOCK_EXTERNAL` à `0`.

## Le fond de carte

Données OpenStreetMap, rendues par [CARTO
Voyager](https://carto.com/basemaps) — gratuit, sans compte, sans clé d'API.
Aucune configuration.

Le fond est volontairement en palette sourde : les pastilles de score sont
rouges et orangées, et un fond coloré entre en concurrence chromatique avec
elles dès qu'un balayage est dense. Voyager conserve malgré tout des routes
contrastées, ce qui permet de suivre une rue sous un amas de pins — c'est ce
qui l'a fait préférer à Positron, plus épuré mais trop délavé pour ça.

Un fond vectoriel donnerait un contrôle complet du style et un zoom continu.
Le travail est commencé sur la branche `carte/fond-vectoriel` mais **ne rend
pas** : MapLibre s'initialise sans erreur puis ne demande jamais ses tuiles. Le
diagnostic est consigné dans le message de commit de cette branche.

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Démarrer l'application en local |
| `npm run build` | Construire pour la production |
| `npm start` | Démarrer le build de production |
| `npm test` | Tests unitaires, sans accès réseau |
| `npm run typecheck` | Vérifications TypeScript |
| `npm run lint` | ESLint |
| `npm run db:check` | Vérifier le schéma SQLite, le WAL, le cache et les TTL |
| `npm run places:smoke` | Un vrai appel Places search + details |

La base vit dans `data/opportunity.db` et est ignorée par git. Supprimez-la pour
remettre à zéro recherches, réponses en cache et compteurs journaliers.
Définissez `OPPORTUNITY_DB_PATH` pour la placer ailleurs.

## Architecture

```text
app/            routes Next.js et handlers d'API
components/     UI : recherche, carte, liste, barre d'outils, fiches prospect
config/         secteurs éditables et réglages de recherche par défaut
fixtures/       données simulées pour les démos et les tests
lib/            logique métier, cache, analyseurs, score, enrichissement
scripts/        vérifications smoke et validation de la base
tests/          couverture node:test : score, analyseur, mémoire, filtres, briefs, réseau
```

Les frontières qui gardent le projet peu coûteux et testable :

- `lib/` n'importe jamais React.
- Les routes d'API valident leur entrée et délèguent à `lib/`.
- Les composants ne parlent qu'aux routes d'API locales.
- Les sources de données du balayage passent par `cachedFetch()` dans
  [`lib/cache.ts`](lib/cache.ts). `MOCK_EXTERNAL=1` les remplace par les fixtures.
  Les tuiles CARTO, Claude Code et Vercel ont des flux séparés.

## Sources de données

| Source | Rôle | TTL du cache |
| --- | --- | --- |
| `api-adresse.data.gouv.fr` | Géocodage français (BAN) | 365 jours |
| Google Places Text Search | Entreprises locales par secteur | 7 jours |
| Google Places Details | Site web, téléphone, note, horaires | 30 jours |
| Sites des prospects | Signaux techniques, contenu et adresse de contact affichée | 7 jours |
| `recherche-entreprises.api.gouv.fr` | Enrichissement entreprise (SIREN, dirigeants) | 90 jours |
| `basemaps.cartocdn.com` | Tuiles du fond de carte | — (chargé par le navigateur) |

## Feuille de route

Pas des promesses — les directions qui amélioreraient le plus l'outil, dans un
ordre approximatif :

- **Un géocodeur enfichable**, pour que l'application fonctionne hors de France.
  C'est de loin la plus grosse limite aujourd'hui.
- Plus de signaux de score. C'est la façon la plus simple de contribuer — voir
  le [gabarit d'issue dédié](.github/ISSUE_TEMPLATE/new_signal.yml).

### Hors périmètre

Énoncé pour que personne ne gaspille une pull request dessus :

- **Pas de SaaS multi-comptes, pas de service hébergé par le projet.** Chaque
  instance est mono-utilisateur — la vôtre, sur vos données, avec votre clé. On
  peut l'[auto-héberger](#déployer-votre-instance), mais il n'y a ni comptes
  multiples, ni serveur central.
- **Pas de LLM pour le diagnostic.** Le même site obtient deux fois le même
  score. La finalisation facultative d'une vitrine utilise Claude Code.
- **Pas de CRM.** L'outil trouve des prospects ; il n'est pas là où vous les
  gérez.
- **Pas de prospection automatisée.** Ni e-mailing de masse, ni appels
  automatiques, ni séquences.
- **Pas de scraping au-delà des pages publiques.** Pas d'authentification, pas
  de contenu payant, pas de données personnelles.

## Vérification

```bash
npm run lint
npm run typecheck
npm test
npm run db:check
```

Le CI exécute ces quatre commandes plus `npm run build` sur chaque pull request.
`npm run places:smoke` en est volontairement exclu : il exige une vraie clé et
consomme du quota.

## Contribuer

Rapports de bugs, signaux de score et pull requests sont les bienvenus — voir
[CONTRIBUTING.md](CONTRIBUTING.md) pour l'installation, les invariants
d'architecture qu'un relecteur vérifiera, et les recettes pour ajouter un
secteur ou un signal de score.

## Licence

[GNU AGPL-3.0](LICENSE). Vous pouvez l'utiliser, le modifier et le redistribuer
librement ; si vous exécutez une version modifiée comme service en réseau, vous
devez publier vos modifications.
