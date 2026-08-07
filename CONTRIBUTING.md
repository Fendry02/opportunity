# Contribuer à Opportunity

Merci d'y consacrer du temps. Ce document couvre l'installation, les invariants
sur lesquels repose le code, et les recettes pour les deux contributions les
plus courantes.

Une note sur la langue : le projet est **intégralement en français** — code,
commentaires, interface et documentation. Le produit vise le marché français et
dépend de données publiques françaises (l'API adresse BAN), donc l'unité de
langue est plus utile qu'une traduction partielle. Une documentation anglaise
redeviendra pertinente le jour où le géocodeur enfichable permettra de sortir de
France (voir la feuille de route du README). En attendant, une issue ou une pull
request en anglais reste évidemment la bienvenue.

## Installation

Nécessite Node 22 ou plus récent.

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

`.env.local.example` est livré avec `MOCK_EXTERNAL=1`. Dans ce mode,
l'application lit `fixtures/` et ne fait **aucun appel réseau externe** : vous
pouvez développer et tester tout le produit sans clé Google Places et sans
dépenser un centime. C'est le mode dans lequel tourne le CI, et il devrait
suffire à la grande majorité des contributions.

## Avant d'ouvrir une pull request

Lancez les quatre vérifications :

```bash
npm run lint
npm run typecheck
npm test
npm run db:check
```

Le CI exécute exactement celles-ci, plus `npm run build`, sur chaque pull
request.

`npm run places:smoke` en est volontairement exclu — il exige une vraie clé
Google et consomme du quota facturé. Ne le lancez que si vous travaillez sur le
client Places lui-même, et mentionnez le résultat dans votre pull request plutôt
que de l'ajouter à une vérification automatique.

## Invariants d'architecture

Ces frontières sont ce qui garde le projet peu coûteux à faire tourner et facile
à tester. En casser une sera la première chose sur laquelle un relecteur
reviendra.

- **`lib/` n'importe jamais React.** C'est du TypeScript simple, appelable
  depuis des scripts et des tests sans moteur de rendu.
- **`cachedFetch()` dans `lib/cache.ts` est le seul endroit qui effectue une
  requête externe.** Tout appel réseau passe par là : c'est ce qui fait de
  `MOCK_EXTERNAL=1` un mode hors-ligne complet et ce qui rend le cache
  universel. Si vous vous surprenez à écrire `fetch()` ailleurs, c'est le bug.
- **Les routes d'API valident leur entrée (zod) et délèguent à `lib/`.** Aucune
  logique métier dans les handlers de route.
- **Les composants ne parlent qu'aux routes d'API locales**, jamais à des API
  tierces.
- **Les poids du score vivent à un seul endroit**, `lib/scoring.ts`. Pas de
  nombres magiques éparpillés dans l'analyseur.

## Recette : ajouter un secteur

Les secteurs sont les catégories d'entreprises qu'un balayage recherche. Rien
d'autre dans le code ne connaît les métiers : c'est donc une modification d'un
seul fichier.

1. Ajoutez une entrée à `SECTORS` dans `config/sectors.ts` :
   - `id` — slug utilisé dans les URL, la base et les noms de fixtures ;
   - `query` — ce qui part vers Google, formulé comme `"<query> à <ville>"` ;
   - `primaryTypes` — les valeurs `primaryType` de Google servant à étiqueter le
     prospect ;
   - `default` — s'il est pré-coché dans le formulaire de recherche.
2. Pour que ça fonctionne en mode mock, ajoutez une fixture dans
   `fixtures/places_search/<sectorId>-<citySlug>.json`. Sans elle, un balayage
   sur ce secteur ne renvoie simplement aucun résultat — il n'échoue pas.

## Recette : ajouter un signal de score

C'est le type de contribution le plus précieux : tout le monde connaît une façon
dont le site d'une petite entreprise peut être raté. Un signal touche cinq
endroits.

1. **Le détecter.** Ajoutez le champ à `SiteSignals` dans
   `lib/analyzer/signals.ts` et renseignez-le dans `analyzeSite()`.
2. **Le persister.** Ajoutez la colonne à `site_analyses` dans le schéma
   `migrate()` de `lib/db.ts`. Si la table existe déjà dans la nature, ajoutez
   aussi un appel à `addColumnIfMissing()` — les migrations sont idempotentes et
   sans numéro de version, donc une base locale existante est mise à niveau sur
   place.
3. **Le pondérer.** Ajoutez les points à `DEFECT_WEIGHTS`, `SEO_WEIGHTS` ou
   `BONUS_WEIGHTS` dans `lib/scoring.ts`. Respectez les plafonds : `MAX_DEFECTS`
   et `MAX_BONUS` existent pour qu'aucun signal isolé ne domine un score.
4. **L'expliquer.** Émettez une `ScoreLine` dans `defectLines()` avec un libellé
   et un argument d'une phrase. Ce texte est ce que l'utilisateur lit dans le
   panneau de diagnostic et dans le brief généré : écrivez-le pour un
   commercial, pas pour un développeur — dites ce que l'entreprise perd, pas
   quelle balise manque.
5. **Le tester.** Ajoutez un cas à `tests/scoring.test.mts`, et à
   `tests/analyzer.test.mts` si vous avez ajouté de la détection. Si votre
   signal a besoin d'un site pour être détecté, ajoutez une fixture sous
   `fixtures/site/<host>/`.

## Éthique

Opportunity regarde des entreprises, pas des personnes, et uniquement des
données que ces entreprises publient elles-mêmes. Deux règles ne sont pas
négociables :

- **Les refus de démarchage sont respectés.** Une fiche qui indique ne pas
  vouloir être contactée à propos d'un site est exclue du score et de la
  génération de brief. Voir `lib/opt-out.ts`. N'ajoutez pas de moyen de
  contourner ça.
- **Pas de prospection automatisée de masse.** La sortie est un brief Markdown
  qu'un humain lit avant de décider de contacter quelqu'un. Les fonctionnalités
  qui en feraient une machine à e-mailing automatique sont hors périmètre — voir
  la section correspondante du README.

## Commits et pull requests

- Préfixes de commit conventionnels, conformes à l'historique existant :
  `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Une modification logique par pull request.
- Si vous touchez au score, indiquez dans la description comment un score évolue
  sur un exemple concret. Les changements de score sont ceux qui risquent le
  plus de surprendre les utilisateurs existants.
- Si vous touchez à quoi que ce soit qui consomme du quota Google, dites-le
  explicitement.

## Licence

Opportunity est distribué sous **GNU AGPL-3.0**. En contribuant, vous acceptez
que votre contribution soit soumise aux mêmes termes.
