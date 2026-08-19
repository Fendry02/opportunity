# File de génération de sites : preuves de test

Cette extension vient de la demande utilisateur, sans fichier de plan.

## Parcours couverts

Après l'enrichissement et la création du squelette, l'application enregistre un
job dans SQLite. Le job lance Claude Code depuis le dossier du site, garde sa
sortie, puis passe à l'état prêt ou erreur. Un job arrêté par un redémarrage ne
reste pas bloqué : il peut être relancé depuis le panneau Sites.

## Cycle RED puis GREEN

| Garantie | Test | RED | GREEN |
| --- | --- | --- | --- |
| Un job garde le prospect, le dossier et l'état en attente | `tests/website-jobs.test.mts` | `ERR_MODULE_NOT_FOUND` pour `lib/website-jobs` | sous-test passant |
| L'exécuteur simule le lancement, conserve la sortie et incrémente les tentatives | `tests/website-jobs.test.mts` | même RED | sous-test passant |
| Un échec garde son message et peut retourner en attente | `tests/website-jobs.test.mts` | même RED | sous-test passant |
| L'API expose les jobs avec le prospect associé | `tests/website-jobs-api.test.mts` | `ERR_MODULE_NOT_FOUND` pour `app/api/websites/jobs/route` | sous-test passant |

## Validation finale

| Commande | Résultat observé |
| --- | --- |
| `./node_modules/.bin/tsx --test tests/website-jobs.test.mts` | 3 sous-tests passent après l'implémentation |
| `./node_modules/.bin/tsx --test tests/website-jobs-api.test.mts tests/website-jobs.test.mts` | 4 sous-tests passent |
| `npm test` | 105 tests passent, 0 échec, durée 23,5 s |
| `npm run typecheck` | TypeScript ne remonte aucune erreur |
| `npm run lint` | ESLint ne remonte aucune erreur |
| `npm run build` | Build Next.js terminé ; toutes les routes de suivi sont compilées |

Le dépôt ne fournit ni commande de couverture ni seuil configuré. Les branches
de persistance, d'exécution simulée et de reprise sont couvertes par les tests
ciblés ci-dessus. L'appel réel à Claude Code n'est pas lancé pendant les tests,
pour éviter une dépense et toute modification de dossiers locaux.
