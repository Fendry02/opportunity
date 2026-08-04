import { bodyAsJson, bodyAsText, cachedFetch, isMockMode } from "../cache";
import { getDb } from "../db";
import { haversineM } from "../geocode";
import type {
  PlaceDetails,
  PlaceSearchResult,
  PlacesErrorBody,
  SearchTextResponse,
} from "./types";

/**
 * Client Places API (New).
 *
 * Règle de facturation à ne jamais enfreindre : le champ le plus cher du
 * field mask fixe le SKU de TOUT l'appel. On sépare donc strictement :
 *   - `searchText` → masque « Pro » (identité, position, types) ;
 *   - `getDetails` → masque « Enterprise » (site, téléphone, note),
 *     appelé uniquement pour les résultats effectivement retenus.
 * Aucun champ Enterprise ne doit jamais entrer dans le masque de recherche.
 */

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const DETAILS_URL = "https://places.googleapis.com/v1/places";

/** Masques figés : toute modification a un impact direct sur la facture. */
export const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.formattedAddress",
  "places.businessStatus",
  "nextPageToken",
].join(",");

export const DETAILS_FIELD_MASK = [
  "id",
  "websiteUri",
  "nationalPhoneNumber",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
].join(",");

/** L'API renvoie au maximum 20 résultats par page, 3 pages. */
const PAGE_SIZE = 20;
const MAX_PAGES = 3;

/**
 * Plafond de sécurité, en plus des quotas configurés dans la console Google.
 * Compte les appels réellement partis sur le réseau aujourd'hui (les lectures
 * de cache ne comptent pas).
 */
const DAILY_CAP = Number(process.env.PLACES_DAILY_CAP ?? 300);

export class PlacesQuotaError extends Error {
  constructor(count: number) {
    super(
      `Plafond journalier atteint : ${count} appels Google ont déjà été passés ` +
        `aujourd'hui. Reprenez demain, ou relevez PLACES_DAILY_CAP dans ` +
        `.env.local si votre quota Google le permet.`,
    );
    this.name = "PlacesQuotaError";
  }
}

export class PlacesConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesConfigError";
  }
}

export function placesCallsToday(): number {
  const since = new Date().toISOString().slice(0, 10);
  const row = getDb()
    .prepare<[string], { n: number }>(
      `SELECT COUNT(*) AS n FROM api_cache
        WHERE source IN ('places_search', 'places_details')
          AND fetched_at >= ?`,
    )
    .get(since);
  return row?.n ?? 0;
}

function assertUnderCap(): void {
  if (isMockMode()) return;
  const n = placesCallsToday();
  if (n >= DAILY_CAP) throw new PlacesQuotaError(n);
}

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new PlacesConfigError(
      "GOOGLE_PLACES_API_KEY absente. Renseignez-la dans .env.local " +
        "(voir README § Setup Google Cloud) ou restez en MOCK_EXTERNAL=1.",
    );
  }
  return key;
}

function explain(status: number, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as PlacesErrorBody;
    if (parsed.error?.message) detail = parsed.error.message;
  } catch {
    /* corps non JSON : on garde l'extrait brut */
  }
  if (status === 400) {
    return `Requête refusée (400) — field mask ou paramètre invalide : ${detail}`;
  }
  if (status === 403) {
    return `Accès refusé (403) — clé restreinte ou Places API (New) non activée : ${detail}`;
  }
  if (status === 429) {
    return `Quota dépassé (429) : ${detail}`;
  }
  return `Places a répondu ${status} : ${detail}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SearchTextParams = {
  textQuery: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** Nom du fichier fixture à utiliser en mode mock. */
  fixture?: string;
  /** Limite le nombre de pages (donc d'appels facturés). Défaut : 3. */
  maxPages?: number;
};

/**
 * Text Search paginé (jusqu'à 60 résultats).
 * `nextPageToken` peut mettre 1 à 2 s à devenir exploitable : on réessaie.
 */
export async function searchText(
  params: SearchTextParams,
): Promise<PlaceSearchResult[]> {
  const results: PlaceSearchResult[] = [];
  let pageToken: string | undefined;
  const maxPages = Math.min(params.maxPages ?? MAX_PAGES, MAX_PAGES);

  for (let page = 0; page < maxPages; page++) {
    const body = JSON.stringify({
      textQuery: params.textQuery,
      languageCode: "fr",
      regionCode: "FR",
      pageSize: PAGE_SIZE,
      locationBias: {
        circle: {
          center: { latitude: params.lat, longitude: params.lng },
          // Google refuse un rayon > 50 km.
          radius: Math.min(params.radiusM, 50_000),
        },
      },
      ...(pageToken ? { pageToken } : {}),
    });

    let data: SearchTextResponse;
    try {
      data = await searchPage(body, params, page, searchCacheKey(params, page));
    } catch (err) {
      // Un `pageToken` relu du cache peut avoir expiré côté Google. Perdre les
      // résultats 21 à 60 d'un secteur vaut mieux que faire échouer le balayage.
      if (page > 0) break;
      throw err;
    }

    const places = data.places ?? [];
    results.push(...places);

    if (!data.nextPageToken) break;

    // `locationBias` est une préférence, pas une restriction : Google élargit
    // dès qu'il manque de résultats proches, et les renvoie par pertinence
    // décroissante. Une page entièrement hors rayon annonce donc des pages
    // suivantes qui seront jetées au filtrage : inutile de les payer.
    if (countWithinRadius(places, params) === 0) break;

    pageToken = data.nextPageToken;
  }

  return results;
}

function countWithinRadius(
  places: PlaceSearchResult[],
  params: SearchTextParams,
): number {
  const center = { lat: params.lat, lng: params.lng };
  return places.filter((place) => {
    if (!place.location) return false;
    const distance = haversineM(center, {
      lat: place.location.latitude,
      lng: place.location.longitude,
    });
    return distance <= params.radiusM;
  }).length;
}

/**
 * Clé de cache **sémantique**, volontairement découplée du corps de la requête.
 *
 * Deux raisons :
 *  - le `pageToken` change à chaque exécution ; s'il entrait dans la clé,
 *    les pages 2 et 3 seraient repayées à chaque recherche ;
 *  - le centre est arrondi à ~100 m (3 décimales). Relancer la même recherche
 *    depuis une adresse voisine ne doit pas repayer un appel : le filtrage fin
 *    par distance se fait de toute façon côté application, sur le centre exact.
 */
export function searchCacheKey(params: SearchTextParams, page: number): string {
  const round = (n: number) => n.toFixed(3);
  return [
    "searchText",
    params.textQuery.trim().toLowerCase(),
    `${round(params.lat)},${round(params.lng)}`,
    Math.min(params.radiusM, 50_000),
    `p${page}`,
  ].join("|");
}

async function searchPage(
  body: string,
  params: SearchTextParams,
  page: number,
  key: string,
): Promise<SearchTextResponse> {
  const fixture = params.fixture;
  assertUnderCap();

  // La 2e page n'est acceptée qu'après un court délai côté Google.
  const attempts = page === 0 ? 1 : 3;
  let lastError = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(1200 * attempt);

    const res = await cachedFetch("places_search", SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": isMockMode() ? "mock" : apiKey(),
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body,
      cacheKey: key,
      // Une page suivante porte un suffixe : deux pages d'une même recherche
      // ne doivent pas se recouvrir dans les fixtures.
      fixture: fixture && page > 0 ? fixture.replace(/\.json$/, `-p${page}.json`) : fixture,
    });

    if (res.status === 200) return bodyAsJson<SearchTextResponse>(res);
    lastError = res.error ?? explain(res.status, bodyAsText(res));
    // Un token pas encore valide se manifeste par un 400 : on retente.
    if (res.status !== 400 && res.status !== 0) break;
  }

  throw new Error(lastError || "Échec de la recherche Places");
}

/** Détails d'un lieu — SKU Enterprise, un appel par prospect retenu. */
export async function getDetails(placeId: string): Promise<PlaceDetails> {
  assertUnderCap();

  const url = `${DETAILS_URL}/${encodeURIComponent(placeId)}?languageCode=fr&regionCode=FR`;
  const res = await cachedFetch("places_details", url, {
    headers: {
      "X-Goog-Api-Key": isMockMode() ? "mock" : apiKey(),
      "X-Goog-FieldMask": DETAILS_FIELD_MASK,
    },
    fixture: `${placeId}.json`,
  });

  if (res.status !== 200) {
    throw new Error(res.error ?? explain(res.status, bodyAsText(res)));
  }
  return bodyAsJson<PlaceDetails>(res);
}

export const PLACES_DAILY_CAP = DAILY_CAP;
