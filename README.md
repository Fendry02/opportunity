# Opportunity

**Find the local businesses whose website is absent, broken or outdated — and walk into the meeting with the brief already written.**

[![CI](https://github.com/Fendry02/opportunity/actions/workflows/ci.yml/badge.svg)](https://github.com/Fendry02/opportunity/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Node 22+](https://img.shields.io/badge/Node-22%2B-5FA04E)](https://nodejs.org)

![Opportunity: sweep a city, rank prospects, open a diagnostic, export a brief](public/screenshots/demo.gif)

## Why

If you sell website redesigns, the hard part is not the pitch — it is finding the
twenty businesses in your area whose site actually justifies the call. That means
opening hundreds of tabs, squinting at each site on a phone, and guessing.

Opportunity does the squinting. It sweeps a radius, checks every business's web
presence against a fixed list of defects, ranks them 0 to 100, and writes a
Markdown brief you can read in the car before the meeting.

It runs entirely on your machine. No account, no hosted backend, no LLM. The
diagnosis comes from deterministic heuristics, public data, and a local SQLite
cache you own.

> [!IMPORTANT]
> **Opportunity is France-focused.** Geocoding uses the French government's BAN
> API (`api-adresse.data.gouv.fr`) and business enrichment uses
> `recherche-entreprises.api.gouv.fr` — both cover France only. The interface is
> in French. Everything else (scoring, site analysis, Google Places) is
> country-agnostic, so adding another geocoder is the main work needed to use
> this elsewhere. See [Roadmap](#roadmap).

## What it does

- Sweep around a city or a precise street address, with a configurable radius.
- Cover several trades at once: plumbers, electricians, carpenters, restaurants,
  hair salons, garages — the list is [one editable file](config/sectors.ts).
- Score each business on commercial opportunity: no website, dead website, no
  mobile viewport, weak SEO basics, obsolete tech, no contact form, missing Open
  Graph tags, no favicon, heavy or slow pages.
- Show prospects on a map with score-coloured pins and a synchronized sortable
  list.
- Open a prospect without leaving the map, inspect the score breakdown, then
  export a Markdown brief ready for outreach.
- Cache geocoding, Places, website fetches and enrichment in SQLite, so a
  repeated search never spends quota twice.
- **Honour opt-out signals** such as `pas de démarchage pour un site` before
  scoring or briefing a business.

![The workspace: a 1 km sweep over Tours, ten prospects ranked by score, two excluded for opting out](public/screenshots/01-workspace.png)

## Quick start

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open <http://localhost:3000> and press **Lancer le balayage**.

`.env.local.example` sets `MOCK_EXTERNAL=1`. In that mode the app reads from
[`fixtures/`](fixtures/) and makes **no network calls at all** — you get a full
working demo on Tours, with ten fictional businesses, without a Google key and
without spending a cent. Everything below about Google Places only matters once
you switch that flag off.

## The output

The point of the tool is this file. One click on **Brief Markdown** produces it
for any prospect:

<details>
<summary><b>Example brief — Restaurant Ancien, 85/100</b> (generated from the demo fixtures)</summary>

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

Each defect carries its own commercial rationale, because the number alone does
not survive contact with a business owner.

<p align="center">
  <img src="public/screenshots/02-diagnostic.png" alt="Prospect panel: identity, then the scored diagnostic with a rationale per defect" width="620">
</p>

## How scoring works

A business with no website, or an unreachable one, starts high — it is the most
likely redesign conversation. An existing website is scored from visible defects
and commercial signals.

Main defects: no HTTPS; no mobile viewport; missing title, meta description, H1,
sitemap or robots; obsolete or free builders (Facebook pages, Wix, e-monsite);
no contact form; no Open Graph tags or favicon; stale copyright year; heavy or
slow pages.

Attractiveness bonuses consider reputation, review volume and phone
availability — a business nobody searches for is a worse prospect than a busy
one with a bad site.

All weights live in [`lib/scoring.ts`](lib/scoring.ts). Defects are capped
collectively (`MAX_DEFECTS`) so no single signal can dominate a score.

## What it costs to run

Nothing in mock mode. With `MOCK_EXTERNAL=0`, Opportunity hits two billed Google
SKUs, chosen by its frozen field masks in
[`lib/places/client.ts`](lib/places/client.ts):

| Call | SKU | Price (0–100k/month) | Free each month |
| --- | --- | ---: | ---: |
| Sector search | Text Search **Pro** | $32.00 / 1,000 | 5,000 |
| Prospect details | Place Details **Enterprise** | $20.00 / 1,000 | 1,000 |

Details land on Enterprise because the mask asks for `rating`,
`userRatingCount` and `regularOpeningHours` — the signals the scoring needs.
Search deliberately stays on Pro: no Enterprise field is ever allowed into the
search mask.

**A sweep retaining 100 prospects costs roughly $2.50** — about 100 Details
calls plus a dozen Text Search calls. The monthly free allowance covers around
**1,000 prospects before you are billed anything**.

Three guardrails keep it there:

- strict `X-Goog-FieldMask` values — changing them changes your bill;
- a local daily ceiling via `PLACES_DAILY_CAP` (default 300);
- SQLite caching, so re-running a search costs nothing.

Prices are Google's published USD list rates, checked 7 August 2026 against the
[Google Maps Platform pricing page](https://developers.google.com/maps/billing-and-pricing/pricing);
European accounts are billed in euros at Google's rate. Verify before relying on
them.

## Ethics

Opportunity looks at **businesses, not people**, and only at what those
businesses publish themselves. There is no personal data in the pipeline, no
email harvesting, and no scraping beyond fetching public pages a browser would
fetch anyway.

Two rules are load-bearing:

- **Opt-out is honoured.** A listing that signals it does not want to be
  approached about a website — in its name or on its site — is excluded from
  scoring and from brief generation ([`lib/opt-out.ts`](lib/opt-out.ts)). You
  can see this in the demo: two of the twelve businesses are struck through.
- **A brief is for a human to read.** The output is a document you review before
  deciding whether to contact someone. Turning this into an automated emailing
  machine is an explicit [non-goal](#non-goals).

## Google Places setup

Only needed when switching `MOCK_EXTERNAL=0`.

1. Create a Google Cloud project and attach billing.
2. Enable **Places API (New)**. Do *not* enable the legacy Places API.
3. Create an API key restricted to **Places API (New)**.
4. Add it to `.env.local`:

```bash
GOOGLE_PLACES_API_KEY=your_google_places_key
MOCK_EXTERNAL=0
PLACES_DAILY_CAP=300
```

Validate the key with a single call before running a real sweep:

```bash
npm run places:smoke -- "plombier à Tours"
```

### Optional: Google Maps background

For a local setup with the official Google Maps layer instead of OpenStreetMap:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$GOOGLE_PLACES_API_KEY
```

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is browser-visible by design — the Maps
JavaScript API runs client-side. Restrict that key in Google Cloud to
`http://localhost:3000/*` and to the Maps JavaScript API. Left empty,
Opportunity falls back to the OpenStreetMap France layer (what the screenshots
above show).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local app |
| `npm run build` | Build for production |
| `npm start` | Start the production build |
| `npm test` | Unit tests, no network access |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint |
| `npm run db:check` | Verify SQLite schema, WAL, cache and TTL behaviour |
| `npm run places:smoke` | One real Places search + details call |

The database lives at `data/opportunity.db` and is git-ignored. Delete it to
reset searches, cached responses and daily counters. Set `OPPORTUNITY_DB_PATH`
to put it elsewhere.

## Architecture

```text
app/            Next.js routes and API handlers
components/     UI: search, map, list, toolbar, prospect panels
config/         editable sectors and search defaults
fixtures/       mock data for demos and tests
lib/            business logic, cache, analyzers, scoring, enrichment
scripts/        smoke checks and database validation
tests/          node:test coverage for scoring, analyzer, memory, filters
```

Boundaries that keep this cheap and testable:

- `lib/` never imports React.
- API routes validate input and delegate to `lib/`.
- Components only talk to local API routes.
- `cachedFetch()` in [`lib/cache.ts`](lib/cache.ts) is the **only** place that
  performs an external fetch — which is what makes `MOCK_EXTERNAL=1` a complete
  offline mode.

## Data sources

| Source | Purpose | Cache TTL |
| --- | --- | --- |
| `api-adresse.data.gouv.fr` | French geocoding (BAN) | 365 days |
| Google Places Text Search | Local businesses by sector | 7 days |
| Google Places Details | Website, phone, rating, opening hours | 30 days |
| Prospect websites | Technical and content signals | 7 days |
| `recherche-entreprises.api.gouv.fr` | Business enrichment (SIREN, officers) | 90 days |

## Roadmap

Not promises — the directions that would most improve the tool, in rough order:

- **A pluggable geocoder**, so the app works outside France. This is the single
  biggest limitation today.
- More scoring signals. This is the easiest way to contribute — see the
  [dedicated issue template](.github/ISSUE_TEMPLATE/new_signal.yml).
- Export a whole sweep at once, not one brief at a time.
- Track outreach status per prospect across sweeps.

### Non-goals

Stated so nobody wastes a pull request on them:

- **No SaaS, no hosted version, no accounts.** It runs on your machine, on your
  data, with your API key.
- **No LLM.** The diagnosis is deterministic and reproducible; the same site
  scores the same twice.
- **No CRM.** It finds prospects; it is not where you manage them.
- **No automated outreach.** No bulk email, no auto-dialling, no sequences.
- **No scraping beyond public pages.** No logins, no paywalls, no personal data.

## Verification

```bash
npm run lint
npm run typecheck
npm test
npm run db:check
```

CI runs all four plus `npm run build` on every pull request.
`npm run places:smoke` is deliberately excluded: it needs a real key and spends
quota.

## Contributing

Bug reports, scoring signals and pull requests are welcome — see
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, the architecture invariants a
reviewer will check, and recipes for adding a sector or a scoring signal.

## License

[GNU AGPL-3.0](LICENSE). You can use, modify and redistribute it freely; if you
run a modified version as a network service, you must publish your changes.
