import { bodyAsJson, cachedFetch } from "./cache";

/**
 * Géocodage via api-adresse.data.gouv.fr (BAN) : gratuit, sans clé,
 * bien meilleur que Google sur les communes françaises.
 */

const ENDPOINT = "https://api-adresse.data.gouv.fr/search/";

export type GeoPlace = {
  label: string;
  city: string;
  postcode: string;
  lat: number;
  lng: number;
};

type BanFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    label: string;
    city?: string;
    postcode?: string;
    citycode?: string;
    type?: string;
  };
};

type BanResponse = { features?: BanFeature[] };

function toPlace(f: BanFeature): GeoPlace {
  const [lng, lat] = f.geometry.coordinates;
  return {
    label: f.properties.label,
    city: f.properties.city ?? f.properties.label,
    postcode: f.properties.postcode ?? "",
    lat,
    lng,
  };
}

/**
 * Résout une commune **ou une adresse précise**. Partir d'une adresse plutôt
 * que du centre-ville change le centre du rayon, donc les prospects retenus.
 */
export async function geocodeCandidates(
  query: string,
  limit = 5,
): Promise<GeoPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = `${ENDPOINT}?q=${encodeURIComponent(trimmed)}&limit=${limit}`;
  const res = await cachedFetch("geocode", url, {
    fixture: `${slug(trimmed)}.json`,
  });
  if (res.status !== 200) {
    throw new Error(
      `Géocodage indisponible (${res.status}${res.error ? ` : ${res.error}` : ""})`,
    );
  }
  const data = bodyAsJson<BanResponse>(res);
  return (data.features ?? []).map(toPlace);
}

/** Résout une ville en un point unique. Lève si rien ne correspond. */
export async function geocode(query: string): Promise<GeoPlace> {
  const [first] = await geocodeCandidates(query, 1);
  if (!first) throw new Error(`Commune introuvable : « ${query} »`);
  return first;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Distance haversine en mètres — sert au filtrage strict par rayon. */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export { slug as geoSlug };
