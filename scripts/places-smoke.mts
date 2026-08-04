/**
 * Validation de la clé Google et des field masks avec le minimum d'appels
 * facturés : UNE recherche (SKU Pro) + UN détail (SKU Enterprise).
 *
 *   npx tsx scripts/places-smoke.mts "plombier à Zone demo"
 *
 * Les deux réponses partent en cache : relancer la commande est gratuit.
 */
import {
  DETAILS_FIELD_MASK,
  SEARCH_FIELD_MASK,
  getDetails,
  placesCallsToday,
  searchText,
} from "../lib/places/client";
import { geoSlug, geocode } from "../lib/geocode";
import { isMockMode } from "../lib/cache";

const query = process.argv[2] ?? "plombier à Zone demo";
const [subject, cityFromQuery] = query.split(" à ");
const city = process.argv[3] ?? cityFromQuery?.trim() ?? "Zone demo";
// En mode mock, la fixture suit la convention du pipeline : <sujet>-<ville>.json
const fixture = `${geoSlug(subject ?? query)}-${geoSlug(city)}.json`;

console.log(`Mode          : ${isMockMode() ? "MOCK (fixtures)" : "RÉEL (facturé)"}`);
console.log(`Masque search : ${SEARCH_FIELD_MASK}`);
console.log(`Masque details: ${DETAILS_FIELD_MASK}`);
console.log(`Appels Places aujourd'hui : ${placesCallsToday()}\n`);

const center = await geocode(city);
console.log(`Centre : ${center.label} (${center.lat}, ${center.lng})\n`);

const results = await searchText({
  textQuery: query,
  lat: center.lat,
  lng: center.lng,
  radiusM: 5000,
  fixture,
  // Une seule page : ce test doit coûter exactement 1 appel Pro.
  maxPages: 1,
});
console.log(`${results.length} résultat(s) — SKU Pro`);
for (const p of results.slice(0, 5)) {
  console.log(
    `  · ${p.displayName?.text ?? p.id} — ${p.primaryType ?? "?"} — ${p.formattedAddress ?? ""}`,
  );
}

const first = results[0];
if (!first) {
  console.log("\nAucun résultat : rien à détailler.");
  process.exit(0);
}

console.log(`\nDétail de « ${first.displayName?.text} » — SKU Enterprise`);
const details = await getDetails(first.id);
console.log(details);

console.log(`\nAppels Places aujourd'hui après ce test : ${placesCallsToday()}`);
