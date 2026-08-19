# Génération de sites : preuves de test

Cette fonctionnalité vient de la demande utilisateur, sans fichier de plan.

## Parcours couverts

Un utilisateur choisit des prospects dans une recherche, puis l'application
enrichit chaque fiche autorisée avant de créer un site et un prompt dans le
dossier `Programmes/websites`.

Un prospect qui affiche un refus de démarchage ne peut pas entrer dans le lot.
Si l'enrichissement d'une fiche échoue, les suivantes continuent leur route.

## Cycle RED puis GREEN

| Garantie | Test | RED | GREEN |
| --- | --- | --- | --- |
| Le générateur produit un prompt, une vitrine mobile, une carte Google Maps et la réputation Google disponible | `tests/site-generation.test.mts` | `ERR_MODULE_NOT_FOUND` pour `lib/site-generation` | `3` sous-tests passent |
| Le lot enrichit avant de générer, exclut les refus et isole une erreur | `tests/site-generation-batch.test.mts` | export `runWebsiteGeneration` absent | `2` sous-tests passent |
| La liste interdit la sélection d'un refus de démarchage | `tests/ui-filters.test.mts` | export `isWebsiteGenerationEligible` absent | sous-test ajouté, puis passant |

## Validation finale

| Commande | Résultat observé |
| --- | --- |
| `npm test` | 101 tests passent, 0 échec, durée 23,6 s |
| `npm run typecheck` | TypeScript ne remonte aucune erreur |
| `npm run lint` | ESLint ne remonte aucune erreur |
| `git diff --check` | Aucun espace final ou erreur de patch |

La suite ne fournit pas de commande de couverture ni de seuil configuré. Les
nouvelles branches métier passent donc par des tests unitaires ciblés, mais le
pourcentage global n'a pas été mesuré dans ce dépôt.

Le travail n'a pas créé de commit de contrôle : aucun commit n'a été demandé au
cours de cette session.
