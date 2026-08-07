<!--
Thanks for contributing. Keep this short — a few honest lines beat a filled-in
form. Delete any section that does not apply.
-->

## What this changes

<!-- One or two sentences. Link the issue if there is one: Closes #123 -->

## Why

<!-- The problem it solves. Skip if the issue already covers it. -->

## Checks

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run db:check`

## If this touches scoring

<!--
Scoring changes are the ones most likely to surprise existing users. Give a
concrete before/after so a reviewer can sanity-check the weight:

  Plomberie Horizon: 52 → 58 (+6, new "phone as image" defect)
-->

## If this spends Google quota

<!--
Say which SKU and roughly how many extra calls per sweep. If you ran
`npm run places:smoke`, paste the outcome — CI cannot run it.
-->

## Constraints

- [ ] Works in mock mode (`MOCK_EXTERNAL=1`)
- [ ] `lib/` still imports no React
- [ ] External fetches still go only through `cachedFetch()`
- [ ] Opt-out handling is unchanged or strengthened
