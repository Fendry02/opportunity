# Auto-hébergement facile (design)

_2026-08-13_

## Intention

Rendre Opportunity **facile à déployer en ligne**, chacun sa propre instance :

- Benoît héberge la sienne, toujours accessible, pour l'utiliser au quotidien.
- N'importe qui depuis GitHub déploie la sienne en quelques minutes, de son côté.

C'est un **prolongement du local-first, pas un SaaS** : chaque instance est
**mono-utilisateur** (son propriétaire), avec **ses données et sa clé Google**.
Aucun compte, aucune base partagée, aucun multi-tenant.

## Décisions

| Sujet | Choix | Pourquoi |
| --- | --- | --- |
| Cible | Serveur persistant (Fly.io), portable via Docker | Le process tourne en continu → le pipeline actuel et SQLite fonctionnent tels quels. |
| Données | **SQLite conservé**, sur un **volume persistant** | Mono-utilisateur : pas besoin de Postgres ni du refactor async. `OPPORTUNITY_DB_PATH` pointe sur le volume. |
| Clé Google | Variable d'environnement, par instance | Chaque déployeur met sa clé en secret — inchangé par rapport à aujourd'hui. |
| Protection | **Mot de passe unique** (`APP_PASSWORD`) | L'URL est publique et consomme la clé Google du propriétaire : un mot de passe suffit à en réserver l'usage. Pas de comptes. |

## Ce qu'on ajoute

- `next.config.ts` : `output: "standalone"` (image Docker minimale).
- **`Dockerfile`** multi-étapes sur base glibc (`node:22-slim`) — les binaires
  précompilés de `better-sqlite3` fonctionnent ; build et run partagent la base.
- **`.dockerignore`** pour une image légère.
- **`fly.toml`** : service HTTP, `[mounts]` d'un volume sur `/data`,
  `OPPORTUNITY_DB_PATH=/data/opportunity.db`.
- **Barrière mot de passe** :
  - `middleware.ts` : si `APP_PASSWORD` est défini, toute requête hors `/login`
    et assets exige un cookie de session valide, sinon redirection vers `/login`.
    **Si `APP_PASSWORD` est absent, la barrière est désactivée** (dev local libre).
  - `app/login/page.tsx` : formulaire minimal (POST classique, sans JS).
  - `app/api/login/route.ts` : compare le mot de passe en **temps constant**, pose
    un **cookie signé HMAC-SHA256** (clé = `APP_PASSWORD`), `httpOnly`, `secure`,
    `sameSite=lax`, avec expiration (30 j). `/api/logout` l'efface.
  - `lib/auth-gate.ts` : signature/vérif HMAC via **Web Crypto**, utilisable à la
    fois côté Edge (middleware) et Node (route).
- **Doc** : section README « Déployez votre instance » (Fly.io + Docker, secrets à
  poser), et ajustement du hors-périmètre (auto-hébergeable ; pas de SaaS hébergé
  par le projet).

## Ce qu'on ne change pas

Tout le reste : SQLite et le schéma, le pipeline en mémoire, le diagnostic
déterministe, l'UI. Aucune migration de données.

## Sécurité — notes

- La clé de signature du cookie est **dérivée de `APP_PASSWORD`** : un seul secret
  à définir pour se protéger. Changer le mot de passe invalide les sessions (voulu).
- Comparaison du mot de passe en temps constant (`crypto.timingSafeEqual`).
- Le cookie ne contient qu'`expiration.signature` : rien de sensible, infalsifiable
  sans le secret.
- HTTPS fourni par Fly.io ; cookie `secure`.

## Hors périmètre

Multi-comptes, Postgres, isolation multi-tenant, file de jobs, facturation :
inutiles pour un déploiement mono-utilisateur. Écartés.

## Jalons

1. Déployable : `output: standalone`, `Dockerfile`, `.dockerignore`, `fly.toml`.
2. Barrière mot de passe : `lib/auth-gate.ts`, `middleware.ts`, `/login`,
   `/api/login`, `/api/logout`.
3. Doc : README « Déployez votre instance ».
