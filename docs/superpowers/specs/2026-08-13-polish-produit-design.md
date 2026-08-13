# Polir Opportunity en un vrai produit — design

_2026-08-13_

## Intention

Élever un outil déjà soigné au rang de produit fini, sans sortir du périmètre
posé par le README : **local-first, pas de comptes, pas de SaaS, pas de LLM, pas
de CRM, pas de prospection automatisée.** On polit ; on ne dénature pas.

Le travail est mené en boucle autonome, restitué par lots, chaque lot vérifié
(`lint` + `typecheck` + `test` + `build`) avant de passer au suivant.

## Contraintes de design à respecter

- Design system « pro épuré clair » (Linear/Notion) : une seule couleur d'accent
  (indigo), pas de dégradés, pas d'ombres marquées, pas d'emojis décoratifs.
- Les seuls éléments vivement colorés restent les badges et pins de score.
- Interface en français ; chiffres en `tabular-nums`.
- Diagnostic déterministe : aucune de ces améliorations ne touche au score.

## Lots

### Lot 0 — Socle _(fait)_

Baseline verte : `lint`, `typecheck`, 72 tests, `build`. Rien à corriger.

### Lot 1 — Fiabilité réseau _(fait)_

Tous les `fetch` de l'interface passent par un helper unique
`lib/fetch-json.ts` : coupure réseau, API en erreur, délai dépassé ou réponse
illisible deviennent une `ApiError` au message français, au lieu d'un rejet non
géré qui fige l'écran. Le polling encaisse quelques échecs consécutifs avant de
rendre la main avec « Réessayer ». Chaque surface d'erreur (bandeau, fiche,
enrichissement) sait se relancer. Testé (`tests/fetch-json.test.mts`).

### Lot 2 — Design & UX + mode sombre

État vide plus actionnable ; squelettes de chargement pendant le balayage ;
micro-interactions et focus soignés ; raccourcis clavier utiles ; **mode sombre**
complet (variables CSS + bascule persistée) cohérent avec le style clair.

### Lot 3 — Fonctionnalités feuille de route

- **Export d'un balayage entier** : tous les briefs d'un coup, plutôt qu'un à la
  fois.
- **Suivi de la prise de contact** par prospect (à contacter / contacté / pas
  intéressé / client), persisté en SQLite, filtrable d'un balayage à l'autre.

### Lot 4 — Prêt à distribuer

Onboarding premier lancement, clarté de la clé API et du mode démo, vérification
du parcours d'installation, docs à jour.

## Hors périmètre (rappel)

Comptes, version hébergée, LLM, CRM, prospection automatisée, scraping au-delà
des pages publiques. Le géocodeur enfichable (sortir de France) reste une piste
séparée, non traitée ici.
