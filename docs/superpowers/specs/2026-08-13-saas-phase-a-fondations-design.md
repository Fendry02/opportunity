# SaaS ouvert — Phase A : fondations multi-utilisateur (design)

_2026-08-13_

> [!WARNING]
> **Spec caduque — remplacée par
> [2026-08-13-auto-hebergement-design.md](2026-08-13-auto-hebergement-design.md).**
> Le besoin réel s'est révélé bien plus simple : une application **auto-hébergeable
> mono-utilisateur** (chacun déploie la sienne, protégée par un mot de passe), et
> non un SaaS multi-tenant. On garde SQLite, aucun refactor lourd.

## Intention

Transformer Opportunity, aujourd'hui outil **local-first mono-utilisateur**, en un
**service hébergé à inscription publique**, où chaque utilisateur a ses données
isolées et **fournit sa propre clé Google Places** (chiffrée au repos).

Cette phase pose les fondations sans lesquelles rien d'autre n'existe : comptes,
base multi-tenant, isolation, clé par utilisateur, déploiement. Le résultat est
un **MVP en ligne réellement utilisable** : on s'inscrit, on renseigne sa clé, on
balaie, on retrouve ses balayages.

> [!IMPORTANT]
> Ce pivot **renverse des décisions affichées du README** (« pas de SaaS, pas de
> comptes »). Le README et le « hors périmètre » devront être réécrits. L'AGPL
> impose de publier les modifications puisqu'on exploite un service en réseau —
> c'est compatible, mais à assumer.

## Décisions de stack (arrêtées)

| Sujet | Choix | Pourquoi |
| --- | --- | --- |
| Hébergement | **Fly.io**, serveur Node persistant | Process toujours actif → le pipeline actuel (en mémoire, reprise au boot) survit ; pas de cold start qui couperait un balayage. |
| Base de données | **Postgres géré (Neon)** | Multi-tenant, concurrent, gratuit au départ. Remplace le SQLite mono-fichier. |
| Auth | **Auth.js / NextAuth v5** | Standard Next.js, open-source, aucun coût par utilisateur, cohérent AGPL. |
| Clé Google | **Par utilisateur, chiffrée** (AES-256-GCM) | Aucun coût ni risque d'abus côté hébergeur ; chaque utilisateur paie sa propre consommation Google. |

## Ce qui change, en une image

- `lib/db.ts` : `better-sqlite3` **synchrone** → `pg` **asynchrone**. Conséquence
  structurante : **tous les appels base deviennent `async`** (queries, pipeline,
  contact, cache, routes). Refactor massif mais mécanique.
- Le diagnostic déterministe reste **intact** : `lib/scoring.ts`,
  `lib/analyzer/*`, `lib/brief.ts`, `config/*` ne changent pas. On ne touche qu'à
  la persistance et à l'accès.
- Toute lecture/écriture est désormais **cadrée par l'utilisateur courant**
  (`session.user.id`).

## Modèle de données multi-tenant

Principe retenu : **isolation par utilisateur de bout en bout**, y compris le
cache d'API. C'est plus simple à raisonner et plus sûr côté conditions Google
(on ne partage pas entre comptes des données Places récupérées avec la clé d'un
autre).

Changements de schéma (Postgres) :

- **`users`** — géré par l'adaptateur Auth.js (id, email, comptes OAuth, sessions).
- **`user_secrets`** — clé Google chiffrée par utilisateur : `user_id`,
  `google_key_ciphertext`, `google_key_iv`, `updated_at`. Jamais renvoyée en clair
  au client ; on n'expose qu'un booléen « configurée ».
- **`searches`** — ajoute `user_id` (FK, `ON DELETE CASCADE`).
- **`businesses`** — la clé primaire n'est plus le `place_id` global (il
  collisionnerait entre utilisateurs). Passage à un **id surrogate** + `user_id` +
  `place_id`, avec `UNIQUE (user_id, place_id)`. Les tables filles
  (`site_analyses`, `scores`, `enrichments`, `search_results`) pointent sur cet id
  surrogate → naturellement cadrées par utilisateur.
- **`contact_status`** — reste porté par `businesses` (désormais par utilisateur),
  donc le suivi est bien propre à chaque compte.
- **`api_cache`** — ajoute `user_id`. Le cache des sources **publiques et sans
  clé** (géocodage BAN, récupération de sites, enrichissement gouv) pourrait être
  mutualisé, mais pour l'isolation et la simplicité du MVP on scope **tout** par
  utilisateur. Optimisation possible plus tard.

## Authentification

- **Auth.js v5** avec adaptateur Postgres. Fournisseurs : **e-mail + mot de passe**
  et/ou **Google OAuth** (à trancher en implémentation ; OAuth évite de gérer les
  mots de passe). Sessions en base.
- **Toutes** les routes applicatives et d'API exigent une session ; chaque
  handler dérive `user_id` de la session et ne requête que les données de cet
  utilisateur. Une page prospect ou une recherche d'un autre compte renvoie 404,
  jamais le contenu.
- Pages : inscription, connexion, déconnexion, mot de passe oublié (si e-mail).

## Clé Google par utilisateur

- Page **Réglages** : coller sa clé Places, la valider par un appel témoin
  (`places:smoke` factorisé côté serveur), l'enregistrer chiffrée.
- Chiffrement **AES-256-GCM** avec un secret serveur `ENCRYPTION_KEY` (32 octets,
  injecté en secret Fly). Déchiffrée uniquement côté serveur, au moment d'un appel.
- Le pipeline lit la clé de l'utilisateur courant au lieu de
  `process.env.GOOGLE_PLACES_API_KEY`. Le mode `MOCK_EXTERNAL` reste dispo en dev.
- Le bandeau d'onboarding (déjà présent) devient : « Ajoutez votre clé Google dans
  Réglages pour lancer un balayage ».

## Déploiement

- **Dockerfile** (Next.js `output: "standalone"`), `fly.toml`, région proche
  (CDG). Un seul process web pour commencer.
- Secrets Fly : `DATABASE_URL` (Neon), `AUTH_SECRET`, `ENCRYPTION_KEY`, et les
  identifiants OAuth le cas échéant.
- **Migrations** versionnées (`node-pg-migrate` ou équivalent), jouées au déploiement.
- CI : conserver `lint` + `typecheck` + `test` + `build` ; ajouter la vérif que
  les migrations s'appliquent sur une base neuve.

## Hors Phase A (phases suivantes)

- **Phase B — file de jobs** : sortir le pipeline du process (queue + worker),
  utile à l'échelle. Repoussé grâce au serveur persistant.
- **Légal** : RGPD (registre, suppression de compte et purge des données), ToS,
  page mentions. À faire avant une vraie ouverture publique.
- **Facturation** : sans objet (chacun sa clé).
- Vérification d'e-mail, limites anti-abus fines, tableau d'administration.

## Risques et inconnues

- **Ampleur du refactor sync → async** : c'est le gros du travail et le principal
  risque de régression. Mitigation : migrer la couche `lib/db` + `lib/queries`
  d'abord, garder les tests verts à chaque étape, convertir les appelants ensuite.
- **Reprise du pipeline en mémoire** sous plusieurs utilisateurs concurrents :
  vérifier que deux balayages simultanés (comptes différents) n'interfèrent pas.
- **Coûts Google côté utilisateur** : bien expliquer, dans l'UI, que la clé
  engage *leur* facturation Google.
- **Neon en veille / limites de connexions** : utiliser le pooler Neon ; borner
  le pool `pg`.

## Découpage en jalons

Chaque jalon a son propre plan d'implémentation ; on ne code pas avant que cette
spec soit validée.

1. **Couche données Postgres** — schéma + migrations + réécriture `lib/db.ts`,
   `lib/cache.ts`, `lib/queries.ts` (async), sans multi-utilisateur encore
   (une base, un « user système »). Tests verts.
2. **Auth** — Auth.js, tables users/sessions, pages login/inscription, protection
   des routes.
3. **Isolation** — `user_id` partout, cadrage de chaque requête, clé surrogate
   `businesses`, contact par utilisateur.
4. **Clé Google par utilisateur** — `user_secrets` chiffré, page Réglages,
   pipeline branché sur la clé du compte.
5. **Déploiement Fly.io + Neon** — Dockerfile, fly.toml, secrets, migrations au
   déploiement, premier balayage réel en ligne.
6. **Doc** — réécrire README (périmètre), guide de déploiement.
