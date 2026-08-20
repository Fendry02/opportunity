# Approche commerciale et publication : preuves de test

Cette extension vient de la demande utilisateur, sans fichier de plan.

## Parcours couverts

Un prospect reçoit un canal de contact, visite sur place ou e-mail. En choisissant
l'e-mail, l'enrichissement cherche une adresse publiée sur le site de
l'entreprise, notamment sur les pages de contact et de mentions légales. Une
adresse saisie à la main n'est jamais remplacée.

La génération enrichit aussi chaque prospect sélectionné. Quand le site est
prêt, la publication Vercel part séparément de la génération. Son URL sert
ensuite à préparer et enregistrer un brouillon d'e-mail interne, avec le devis
à 1 000 € HT. Aucun service de messagerie ne reçoit de demande.

## Cycle RED puis GREEN

| Garantie | Test | RED observé | GREEN observé |
| --- | --- | --- | --- |
| Le canal et le destinataire restent liés au prospect | `tests/outreach.test.mts` | `ERR_MODULE_NOT_FOUND` pour `lib/outreach` | sous-test passant |
| Le brouillon reprend le lien Vercel et le prix convenu | `tests/outreach.test.mts` | même exécution RED | sous-test passant |
| L'adresse de contact publique est préférée à une adresse personnelle | `tests/public-email.test.mts` | `ERR_MODULE_NOT_FOUND` pour `lib/enrich/public-email` | sous-test passant |
| Une adresse saisie manuellement reste prioritaire | `tests/outreach.test.mts` | même exécution RED | sous-test passant |
| Le brouillon est prêt dès la publication Vercel | `tests/website-deployment.test.mts` | brouillon absent après la publication simulée | sous-test passant |
| Vercel publie un site déjà prêt sans modifier son état de génération | `tests/website-deployment.test.mts` | `processPendingWebsiteDeployments is not a function` | sous-test passant |
| Une erreur de publication reste relançable sans régénérer le site | `tests/website-deployment.test.mts` | même exécution RED | sous-test passant |

## Validation finale

| Commande | Résultat observé |
| --- | --- |
| `./node_modules/.bin/tsx --test tests/public-email.test.mts tests/outreach.test.mts tests/website-deployment.test.mts` | 7 tests passent, 0 échec |
| `node --import tsx --test --experimental-test-coverage tests/*.test.mts` | 112 tests passent ; 82,49 % de lignes, 82,88 % de branches et 86,22 % de fonctions |
| `npm run typecheck` | TypeScript ne remonte aucune erreur |
| `npm run lint` | ESLint ne remonte aucune erreur |
| `npm run build` | Build Next.js terminé, routes d'approche et de publication incluses |
| Vérification navigateur locale | Accueil et fiche prospect rendus, sans overlay d'erreur ; devis téléchargé avec succès |

La publication Vercel réelle n'est pas lancée pendant les tests : elle demande
un jeton personnel et créerait un déploiement externe. Les tests injectent donc
un exécuteur Vercel simulé. Le cas sans jeton reste visible dans l'interface et
peut être relancé après ajout de `VERCEL_TOKEN` dans `.env.local`.
