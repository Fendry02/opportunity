import { bodyAsJson, bodyAsText, cachedFetch, isMockMode, type CachedResponse } from "../cache";
import { haversineM } from "../geocode";
import { assertUnderCap, searchCacheKey, type SearchTextParams } from "./client";
import type { PlaceDetails, PlaceSearchResult } from "./types";

/**
 * Source alternative à Places API (New) : la recherche Google Maps de Scavio
 * (https://scavio.dev).
 *
 * Elle n'est utilisée que si `SCAVIO_API_KEY` est renseignée **et**
 * `GOOGLE_PLACES_API_KEY` vide : une installation existante ne change pas de
 * fournisseur. En mode `MOCK_EXTERNAL=1`, le jeu de démo Places reste servi.
 *
 * Différence utile avec Places : chaque résultat de recherche porte déjà le
 * site, le téléphone, la note et le nombre d'avis. Ces données sont rangées
 * dans `details` et le pipeline n'émet aucun appel de détails.
 */

const SEARCH_URL = "https://api.scavio.dev/api/v2/google/maps/search";

/** 20 résultats par page ; 3 pages au plus, comme pour Places. */
const PAGE_SIZE = 20;
const MAX_PAGES = 3;

/** Une recherche Maps répond souvent en 4 s, parfois en plus de 10 s. */
const TIMEOUT_MS = 30_000;

export function scavioSelected(): boolean {
  if (isMockMode()) return false;
  return Boolean(process.env.SCAVIO_API_KEY) && !process.env.GOOGLE_PLACES_API_KEY;
}

/** Sous-ensemble de la réponse réellement lu. */
type ScavioLocalResult = {
  place_id?: string;
  title?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  type?: string;
  types?: string[];
  address?: string;
  open_state?: string;
  operating_hours?: Record<string, string>;
  phone?: string;
  website?: string;
  rating?: number;
  reviews?: number;
};

type ScavioSearchResponse = { local_results?: ScavioLocalResult[] };

/**
 * Centre de la carte au format `@lat,lng,zoomz`.
 *
 * Sans lui, l'API se cale sur une ville par défaut du pays et renvoie des
 * résultats d'une autre commune : il est donc toujours envoyé. Google Maps
 * raisonne en zoom, pas en rayon : une vue de zoom z couvre environ
 * 40 000 km / 2^z, soit zoom 13 pour 5 km et zoom 10 pour 50 km. Le filtrage
 * strict par distance reste fait par le pipeline.
 */
export function mapCenter(lat: number, lng: number, radiusM: number): string {
  const radiusKm = Math.max(radiusM, 100) / 1000;
  const zoom = Math.round(Math.log2(40_000 / radiusKm));
  return `@${lat.toFixed(5)},${lng.toFixed(5)},${Math.min(16, Math.max(10, zoom))}z`;
}

export function scavioSearchBody(params: SearchTextParams, page: number): string {
  return JSON.stringify({
    query: params.textQuery,
    ll: mapCenter(params.lat, params.lng, params.radiusM),
    hl: "fr",
    gl: "fr",
    ...(page > 0 ? { start: page * PAGE_SIZE } : {}),
  });
}

function apiKey(): string {
  // Le mode mock ne choisit jamais Scavio, mais les tests appellent ce module
  // directement : aucune clé n'est alors nécessaire.
  if (isMockMode()) return "mock";
  const key = process.env.SCAVIO_API_KEY;
  if (!key) throw new Error("SCAVIO_API_KEY absente. Renseignez-la dans .env.local.");
  return key;
}

function explain(status: number, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) detail = parsed.error;
  } catch {
    /* corps non JSON : on garde l'extrait brut */
  }
  if (status === 401) return `Clé Scavio refusée (401) — vérifiez SCAVIO_API_KEY : ${detail}`;
  if (status === 402) return `Crédits Scavio épuisés (402) : ${detail}`;
  if (status === 429) return `Limite de requêtes Scavio atteinte (429) : ${detail}`;
  return `Scavio a répondu ${status} : ${detail}`;
}

/**
 * Recherche paginée (jusqu'à 60 résultats), même contrat que `searchText`.
 * Une page suivante en échec garde les résultats déjà obtenus.
 */
export async function searchScavio(
  params: SearchTextParams,
): Promise<PlaceSearchResult[]> {
  const results: PlaceSearchResult[] = [];
  const seen = new Set<string>();
  const maxPages = Math.min(params.maxPages ?? MAX_PAGES, MAX_PAGES);

  for (let page = 0; page < maxPages; page++) {
    let data: ScavioSearchResponse;
    try {
      data = await searchPage(params, page);
    } catch (err) {
      if (page > 0) break;
      throw err;
    }

    const items = Array.isArray(data.local_results) ? data.local_results : [];
    const places = items.map(toPlace).filter((p): p is PlaceSearchResult => p !== null);
    // Deux pages Maps consécutives se recouvrent parfois : un lieu déjà vu
    // serait sinon analysé deux fois.
    for (const place of places) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      results.push(place);
    }

    if (items.length < PAGE_SIZE) break;
    // Même règle que Places : une page entièrement hors rayon annonce des
    // pages suivantes qui seraient jetées au filtrage.
    if (!places.some((p) => withinRadius(p, params))) break;
  }

  return results;
}

async function searchPage(
  params: SearchTextParams,
  page: number,
): Promise<ScavioSearchResponse> {
  assertUnderCap();

  const fetchPage = (force: boolean): Promise<CachedResponse> =>
    cachedFetch("scavio_maps", SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: scavioSearchBody(params, page),
      // Même clé sémantique que Places, dans une source de cache distincte.
      cacheKey: searchCacheKey(params, page),
      timeoutMs: TIMEOUT_MS,
      force,
      fixture:
        params.fixture && page > 0
          ? params.fixture.replace(/\.json$/, `-p${page}.json`)
          : params.fixture,
    });

  let res = await fetchPage(false);
  // Une seule relance : sur un timeout ou un 5xx, et sur tout échec relu du
  // cache — un timeout y reste sinon 7 jours, une clé corrigée aussi.
  if (res.status !== 200 && (res.fromCache || res.status === 0 || res.status >= 500)) {
    res = await fetchPage(true);
  }

  if (res.status === 200) return bodyAsJson<ScavioSearchResponse>(res);
  throw new Error(res.error ?? explain(res.status, bodyAsText(res)));
}

function withinRadius(place: PlaceSearchResult, params: SearchTextParams): boolean {
  if (!place.location) return false;
  const distance = haversineM(
    { lat: params.lat, lng: params.lng },
    { lat: place.location.latitude, lng: place.location.longitude },
  );
  return distance <= params.radiusM;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** `{ lundi: "08:00–18:00", … }` → `["lundi: 08:00–18:00", …]`, du lundi au dimanche. */
function weekdayDescriptions(hours: unknown): string[] | undefined {
  if (!hours || typeof hours !== "object") return undefined;
  const entries = Object.entries(hours as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === "string",
  );
  if (entries.length === 0) return undefined;
  const rank = (day: string) => {
    const i = WEEKDAYS.indexOf(day.toLowerCase());
    return i === -1 ? WEEKDAYS.length : i;
  };
  return entries
    .sort((a, b) => rank(a[0]) - rank(b[0]))
    .map(([day, value]) => `${day}: ${value}`);
}

/** Google Maps n'a pas de statut structuré : seul le libellé l'indique. */
function businessStatus(openState: string | undefined): PlaceSearchResult["businessStatus"] {
  if (!openState) return undefined;
  if (/définitivement fermé|fermé définitivement|permanently closed/i.test(openState)) {
    return "CLOSED_PERMANENTLY";
  }
  if (/temporairement fermé|fermé temporairement|temporarily closed/i.test(openState)) {
    return "CLOSED_TEMPORARILY";
  }
  return "OPERATIONAL";
}

/**
 * Traduit un résultat Scavio dans la forme Places consommée par le pipeline.
 * `place_id` est le même identifiant que l'`id` de Places API (New) : un
 * prospect déjà connu via Places est reconnu tel quel.
 */
export function toPlace(item: ScavioLocalResult): PlaceSearchResult | null {
  const id = str(item.place_id);
  if (!id) return null;

  const lat = item.gps_coordinates?.latitude;
  const lng = item.gps_coordinates?.longitude;
  const types = Array.isArray(item.types)
    ? item.types.filter((t): t is string => typeof t === "string")
    : [];
  const hours = weekdayDescriptions(item.operating_hours);

  const details: PlaceDetails = {
    id,
    websiteUri: str(item.website),
    nationalPhoneNumber: str(item.phone),
    rating: num(item.rating),
    userRatingCount: num(item.reviews),
    ...(hours ? { regularOpeningHours: { weekdayDescriptions: hours } } : {}),
  };

  return {
    id,
    displayName: { text: str(item.title) ?? id, languageCode: "fr" },
    location:
      typeof lat === "number" && typeof lng === "number"
        ? { latitude: lat, longitude: lng }
        : undefined,
    types,
    // Libellé de catégorie affiché par Maps (« Plombier »), pas l'énumération
    // `primaryType` de Places (« plumber »).
    primaryType: str(item.type),
    formattedAddress: str(item.address),
    businessStatus: businessStatus(str(item.open_state)),
    details,
  };
}
