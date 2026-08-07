# fixtures/

Réponses figées utilisées quand `MOCK_EXTERNAL=1` (mode de développement par
défaut). Aucun appel réseau n'est alors émis : `lib/cache.ts` délègue à
`lib/fixtures.ts`, qui lit ce dossier.

## Résolution des fichiers

| Source | Chemin attendu |
|---|---|
| `geocode` | `geocode/<ville-slugifiée>.json` (format api-adresse / BAN) |
| `places_search` | `places_search/<secteur>-<ville>.json` — pages suivantes : `…-p1.json` |
| `places_details` | `places_details/<place_id>.json`, sinon l'entrée `<place_id>` de `places_details/index.json` |
| `gouv` | `gouv/<slug>.json` (format recherche-entreprises) |
| `site` | `site/<domaine-sans-www>/<chemin>.html` — `/` → `index.html`, `/nos-services` → `nos-services.html`, `/a/b` → `a__b.html` |

Un fichier `<fichier>.headers.json` optionnel force les en-têtes de la réponse
(sert à simuler un `Content-Type: text/html; charset=iso-8859-1`).

Deux comportements par défaut, volontaires :

- **domaine absent de `site/`** → réponse `status: 0` : c'est un site mort
  (DNS qui ne résout pas). `coiffure-eclat.fr` s'appuie dessus.
- **page absente d'un domaine présent** → `404`. C'est ainsi qu'on modélise
  l'absence de `robots.txt` ou de `sitemap.xml`.
- **secteur sans fixture `places_search`** → `{"places": []}` : on peut cocher
  n'importe quel secteur du formulaire sans erreur.

## Jeu de données de démonstration (Tours)

Le jeu est centré sur **Tours** (47.3879 / 0.689, place Jean Jaurès) et
`NEXT_PUBLIC_DEFAULT_CITY=Tours` préremplit le formulaire. Les coordonnées et
les noms de rues sont réels, pour que les tuiles de la carte affichent une vraie
ville : le jeu était auparavant centré sur `[0, 0]`, en pleine mer, ce qui
donnait une carte vide.

Tout le reste est **fictif** — raisons sociales, numéros de téléphone, SIREN /
SIRET, dirigeants, notes et avis. Aucune entreprise réelle n'est décrite ici, et
les numéros de rue ne correspondent à aucun établissement existant.

Les positions relatives sont ce qui compte : les offsets par rapport au centre
sont calibrés pour qu'un rayon de 1 km retienne 10 prospects et en écarte 2.

| Prospect | Site | Ce qu'il illustre |
|---|---|---|
| Plomberie Atlas | aucun | prospect « sans site » (score plancher 80) |
| Plomberie Horizon | `plomberie-horizon.fr` | builder gratuit Wix |
| Plomberie Locale | — | hors rayon : doit être filtré par la distance haversine |
| Sanitaires Lebreton | — | `CLOSED_PERMANENTLY` : doit être écarté |
| Restaurant Ancien | `restaurant-ancien.fr` | vieux WordPress 4.9, jQuery 1.7, layout en tableaux, Flash, latin-1, copyright 2014, http |
| La Table Moderne | `latablemoderne.fr` | site sain — sert de témoin bas |
| Coiffure Éclat | `coiffure-eclat.fr` | domaine mort (aucune fixture) |
| L&N Coiffure | `ln-coiffure.fr` | pas de viewport, jQuery 1.7, pas de SEO |
| Garage Atelier | `garage-atelier.e-monsite.com` | builder gratuit e-monsite |
| Auto Services Demo | `demoauto.fr` | site correct mais sans Open Graph, favicon ni analytics |
