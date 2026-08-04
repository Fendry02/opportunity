import crypto from "node:crypto";
import { getDb } from "./db";
import { readFixture } from "./fixtures";

/**
 * Point de passage obligé de TOUS les appels externes.
 *
 * Deux garde-fous :
 *  - cache SQLite avec TTL par source (on ne repaye jamais deux fois le même
 *    appel Google pendant la durée de vie utile de la donnée) ;
 *  - `MOCK_EXTERNAL=1` : aucune requête réseau, les réponses viennent de
 *    `fixtures/`. C'est le mode de développement par défaut.
 */

export type CacheSource =
  | "places_search"
  | "places_details"
  | "site"
  | "gouv"
  | "geocode";

const TTL_DAYS: Record<CacheSource, number> = {
  places_search: 7,
  places_details: 30,
  site: 7,
  gouv: 90,
  geocode: 365,
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 Mo

export type FetchOptions = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /**
   * Nom de fichier à lire dans `fixtures/<source>/` en mode mock.
   * Les sources sans fixture explicite (site) sont résolues par host/chemin.
   */
  fixture?: string;
  /** Ignore l'entrée en cache et force un appel réseau (puis réécrit le cache). */
  force?: boolean;
  /**
   * Clé de cache explicite, à préférer dès que deux requêtes différentes dans
   * leur forme doivent partager une réponse (voir `places/client.ts`).
   */
  cacheKey?: string;
};

export type CachedResponse = {
  url: string;
  /** 0 = échec réseau (DNS, timeout, refus de connexion). */
  status: number;
  body: Buffer;
  headers: Record<string, string>;
  fromCache: boolean;
  fetchedAt: string;
  /** Renseigné uniquement si status === 0. */
  error?: string;
};

export function isMockMode(): boolean {
  return process.env.MOCK_EXTERNAL === "1";
}

function cacheKey(source: CacheSource, opts: FetchOptions, url: string): string {
  const method = opts.method ?? "GET";
  const identity = opts.cacheKey ?? `${method}|${url}|${opts.body ?? ""}`;
  return crypto.createHash("sha1").update(`${source}|${identity}`).digest("hex");
}

function expiresAt(source: CacheSource): string {
  const ms = TTL_DAYS[source] * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

type CacheRow = {
  url: string;
  status: number;
  body: Buffer;
  headers_json: string;
  fetched_at: string;
};

function readCache(key: string): CachedResponse | null {
  const row = getDb()
    .prepare<[string, string], CacheRow>(
      `SELECT url, status, body, headers_json, fetched_at
         FROM api_cache
        WHERE cache_key = ? AND expires_at > ?`,
    )
    .get(key, new Date().toISOString());
  if (!row) return null;

  const headers = JSON.parse(row.headers_json) as Record<string, string>;
  return {
    url: row.url,
    status: row.status,
    body: Buffer.isBuffer(row.body) ? row.body : Buffer.from(row.body),
    headers,
    fromCache: true,
    fetchedAt: row.fetched_at,
    error: row.status === 0 ? (headers["x-fetch-error"] ?? "échec réseau") : undefined,
  };
}

function writeCache(
  key: string,
  source: CacheSource,
  res: CachedResponse,
): void {
  getDb()
    .prepare(
      `INSERT INTO api_cache
         (cache_key, source, url, status, body, headers_json, fetched_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         status = excluded.status,
         body = excluded.body,
         headers_json = excluded.headers_json,
         fetched_at = excluded.fetched_at,
         expires_at = excluded.expires_at`,
    )
    .run(
      key,
      source,
      res.url,
      res.status,
      res.body,
      JSON.stringify(res.headers),
      res.fetchedAt,
      expiresAt(source),
    );
}

/**
 * Requête réseau brute, bornée en temps et en taille.
 * Ne lève jamais : un échec réseau devient un `status: 0` (information utile
 * pour l'analyseur — « site injoignable » est un signal, pas une exception).
 */
async function rawFetch(
  url: string,
  opts: FetchOptions,
): Promise<CachedResponse> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
      redirect: "follow",
    });

    const chunks: Buffer[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        chunks.push(Buffer.from(value));
        if (total >= maxBytes) {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    // `res.url` reflète l'URL finale après redirections (utile pour https://).
    headers["x-final-url"] = res.url || url;

    return {
      url,
      status: res.status,
      body: Buffer.concat(chunks).subarray(0, maxBytes),
      headers,
      fromCache: false,
      fetchedAt,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `timeout après ${timeoutMs} ms`
          : err.message
        : String(err);
    return {
      url,
      status: 0,
      body: Buffer.alloc(0),
      headers: { "x-fetch-error": message },
      fromCache: false,
      fetchedAt,
      error: message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function cachedFetch(
  source: CacheSource,
  url: string,
  opts: FetchOptions = {},
): Promise<CachedResponse> {
  if (isMockMode()) {
    return readFixture(source, url, opts);
  }

  const key = cacheKey(source, opts, url);
  if (!opts.force) {
    const hit = readCache(key);
    if (hit) return hit;
  }

  const res = await rawFetch(url, opts);
  // Les 5xx sont transitoires : les cacher masquerait un site qui remarche.
  // Les échecs réseau (0) et les 4xx, eux, sont des signaux stables.
  if (res.status < 500) {
    writeCache(key, source, res);
  }
  return res;
}

/** Décode le corps en texte. Les octets bruts restent disponibles pour iconv. */
export function bodyAsText(res: CachedResponse): string {
  return res.body.toString("utf8");
}

export function bodyAsJson<T = unknown>(res: CachedResponse): T {
  return JSON.parse(bodyAsText(res)) as T;
}

export function purgeExpired(): number {
  return getDb()
    .prepare(`DELETE FROM api_cache WHERE expires_at <= ?`)
    .run(new Date().toISOString()).changes;
}

export function cacheStats(): { source: string; n: number }[] {
  return getDb()
    .prepare<[], { source: string; n: number }>(
      `SELECT source, COUNT(*) AS n FROM api_cache GROUP BY source ORDER BY source`,
    )
    .all();
}
