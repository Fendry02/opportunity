# Contributing to Opportunity

Thanks for taking the time. This document covers the setup, the invariants the
codebase relies on, and recipes for the two most common contributions.

A note on language: the codebase, comments, and UI are in **French**, because
the product targets the French market and depends on French public data (the
BAN address API). Documentation is in English. Both are fine in issues and pull
requests — write in whichever you are comfortable with.

## Setup

Requires Node 22 or newer.

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

`.env.local.example` ships with `MOCK_EXTERNAL=1`. In that mode the app reads
from `fixtures/` and makes **no external network calls at all**, so you can
develop and test the whole product without a Google Places key and without
spending a cent. This is the mode CI runs in, and it should be enough for the
large majority of contributions.

## Before opening a pull request

Run all four checks:

```bash
npm run lint
npm run typecheck
npm test
npm run db:check
```

CI runs exactly these, plus `npm run build`, on every pull request.

`npm run places:smoke` is deliberately excluded — it needs a real Google API key
and consumes billed quota. Only run it if you are working on the Places client
itself, and mention the result in your pull request rather than adding it to any
automated check.

## Architecture invariants

These boundaries are what keep the project cheap to run and easy to test.
Breaking one will be the first thing a reviewer asks about.

- **`lib/` never imports React.** It is plain TypeScript, callable from scripts
  and tests without a renderer.
- **`cachedFetch()` in `lib/cache.ts` is the only place that performs an
  external fetch.** Every network call goes through it, which is what makes
  `MOCK_EXTERNAL=1` a complete offline mode and what makes caching universal.
  If you find yourself reaching for `fetch()` anywhere else, that is the bug.
- **API routes validate their input (zod) and delegate to `lib/`.** No business
  logic in route handlers.
- **Components only talk to local API routes**, never to third-party APIs.
- **Scoring weights live in one place**, `lib/scoring.ts`. No magic numbers
  scattered across the analyzer.

## Recipe: add a sector

Sectors are the business categories a sweep looks for. Nothing else in the code
knows about trades, so this is a one-file change.

1. Add an entry to `SECTORS` in `config/sectors.ts`:
   - `id` — slug used in URLs, the database, and fixture filenames;
   - `query` — what gets sent to Google, phrased as `"<query> à <ville>"`;
   - `primaryTypes` — Google `primaryType` values used to label the prospect;
   - `default` — whether it is pre-checked in the search form.
2. To make it work in mock mode, add a fixture at
   `fixtures/places_search/<sectorId>-<citySlug>.json`. Without one, a sweep on
   that sector simply returns no results — it does not error.

## Recipe: add a scoring signal

This is the most valuable kind of contribution: everyone knows a way a small
business website can be broken. A signal touches five places.

1. **Detect it.** Add the field to `SiteSignals` in `lib/analyzer/signals.ts`
   and populate it in `analyzeSite()`.
2. **Persist it.** Add the column to `site_analyses` in the `migrate()` schema in
   `lib/db.ts`. If the table already exists in the wild, also add an
   `addColumnIfMissing()` call — migrations here are idempotent and have no
   version number, so an existing local database is upgraded in place.
3. **Weight it.** Add the points to `DEFECT_WEIGHTS`, `SEO_WEIGHTS`, or
   `BONUS_WEIGHTS` in `lib/scoring.ts`. Respect the caps: `MAX_DEFECTS` and
   `MAX_BONUS` exist so no single signal can dominate a score.
4. **Explain it.** Emit a `ScoreLine` in `defectLines()` with a label and a
   one-sentence rationale. That text is what the user reads in the diagnostic
   panel and in the generated brief, so write it for a salesperson, not for a
   developer: say what the business loses, not which tag is missing.
5. **Test it.** Add a case to `tests/scoring.test.mts`, and to
   `tests/analyzer.test.mts` if you added detection logic. If your signal needs
   a website to detect, add a fixture under `fixtures/site/<host>/`.

## Ethics

Opportunity looks at businesses, not people, and only at data those businesses
publish themselves. Two rules are not negotiable:

- **Opt-out signals are honoured.** A listing that says it does not want to be
  contacted about a website is excluded from scoring and from brief generation.
  See `lib/opt-out.ts`. Do not add a way to bypass this.
- **No mass automated outreach.** The output is a Markdown brief for a human to
  read before deciding whether to contact someone. Features that turn this into
  an automated emailing machine are out of scope — see the non-goals in the
  README.

## Commits and pull requests

- Conventional commit prefixes, matching the existing history: `feat:`, `fix:`,
  `docs:`, `refactor:`, `test:`, `chore:`.
- One logical change per pull request.
- If you touch scoring, say in the description how a score changes on a concrete
  example. Scoring changes are the ones most likely to surprise existing users.
- If you touch anything that spends Google quota, say so explicitly.

## License

Opportunity is licensed under the **GNU AGPL-3.0**. By contributing, you agree
that your contribution is licensed under the same terms.
