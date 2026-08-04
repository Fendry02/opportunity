import fs from "node:fs";
import path from "node:path";
import type { CacheSource, CachedResponse, FetchOptions } from "./cache";

/**
 * Mode `MOCK_EXTERNAL=1` : `cachedFetch` lit `fixtures/` au lieu du réseau.
 * Tout le développement se fait ainsi, sans consommer un seul crédit Google.
 *
 * Résolution :
 *  - `opts.fixture` fourni      → fixtures/<source>/<fixture>
 *  - source `site`              → fixtures/site/<host>/<chemin>.html
 *                                 (host inconnu = site injoignable, status 0 ;
 *                                  page inconnue d'un host connu = 404)
 *  - `places_details` sans fichier dédié → entrée de fixtures/places_details/index.json
 *
 * Un fichier `<fixture>.headers.json` optionnel à côté permet de forcer des
 * en-têtes (utile pour tester les charsets exotiques).
 */

const FIXTURES_DIR =
  process.env.FIXTURES_DIR ?? path.join(process.cwd(), "fixtures");

class MissingFixtureError extends Error {
  constructor(source: CacheSource, url: string, expected: string) {
    super(
      `Fixture manquante pour ${source} (${url}). ` +
        `Créez ${expected} ou passez MOCK_EXTERNAL=0.`,
    );
    this.name = "MissingFixtureError";
  }
}

function readHeaders(filePath: string): Record<string, string> {
  const sidecar = `${filePath}.headers.json`;
  if (fs.existsSync(sidecar)) {
    return JSON.parse(fs.readFileSync(sidecar, "utf8")) as Record<string, string>;
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".json"
      ? "application/json; charset=utf-8"
      : ext === ".xml"
        ? "application/xml; charset=utf-8"
        : ext === ".txt"
          ? "text/plain; charset=utf-8"
          : "text/html; charset=utf-8";
  return { "content-type": contentType };
}

function respond(
  url: string,
  filePath: string,
  status = 200,
): CachedResponse {
  const headers = readHeaders(filePath);
  headers["x-final-url"] = url;
  headers["x-fixture"] = path.relative(FIXTURES_DIR, filePath);
  return {
    url,
    status,
    body: fs.readFileSync(filePath),
    headers,
    fromCache: true,
    fetchedAt: new Date().toISOString(),
  };
}

function notFound(url: string, status: number): CachedResponse {
  return {
    url,
    status,
    body: Buffer.alloc(0),
    headers: { "content-type": "text/plain", "x-final-url": url },
    fromCache: true,
    fetchedAt: new Date().toISOString(),
  };
}

function unreachable(url: string, reason: string): CachedResponse {
  return {
    url,
    status: 0,
    body: Buffer.alloc(0),
    headers: { "x-fetch-error": reason },
    fromCache: true,
    fetchedAt: new Date().toISOString(),
    error: reason,
  };
}

/** `/nos-services/` → `nos-services.html` ; `/` → `index.html`. */
function sitePageFile(pathname: string): string {
  const clean = pathname.replace(/^\/+|\/+$/g, "");
  if (clean === "") return "index.html";
  const flat = clean.replace(/\//g, "__");
  return /\.[a-z0-9]+$/i.test(flat) ? flat : `${flat}.html`;
}

function resolveSite(url: string): CachedResponse {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return unreachable(url, "URL invalide");
  }
  const host = parsed.hostname.replace(/^www\./, "");
  const hostDir = path.join(FIXTURES_DIR, "site", host);
  if (!fs.existsSync(hostDir)) {
    // Aucun dossier pour ce domaine : on simule un site mort (DNS).
    return unreachable(url, `getaddrinfo ENOTFOUND ${parsed.hostname}`);
  }
  const filePath = path.join(hostDir, sitePageFile(parsed.pathname));
  if (!fs.existsSync(filePath)) return notFound(url, 404);
  return respond(url, filePath);
}

type DetailsIndex = Record<string, unknown>;

function resolvePlacesDetailsIndex(
  url: string,
  fixture: string | undefined,
): CachedResponse | null {
  const indexPath = path.join(FIXTURES_DIR, "places_details", "index.json");
  if (!fs.existsSync(indexPath)) return null;
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as DetailsIndex;
  // L'id est soit le nom de fixture demandé, soit le dernier segment de l'URL.
  const idFromUrl = decodeURIComponent(
    new URL(url).pathname.split("/").filter(Boolean).pop() ?? "",
  );
  const id = fixture?.replace(/\.json$/, "") ?? idFromUrl;
  const entry = index[id];
  if (entry === undefined) return null;
  return {
    url,
    status: 200,
    body: Buffer.from(JSON.stringify(entry), "utf8"),
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-final-url": url,
      "x-fixture": `places_details/index.json#${id}`,
    },
    fromCache: true,
    fetchedAt: new Date().toISOString(),
  };
}

export function readFixture(
  source: CacheSource,
  url: string,
  opts: FetchOptions,
): CachedResponse {
  if (source === "site") return resolveSite(url);

  // turbopackIgnore : ces chemins sont résolus à l'exécution et volontairement
  // hors du graphe de modules — les tracer embarquerait tout le projet.
  const dir = path.join(/*turbopackIgnore: true*/ FIXTURES_DIR, source);
  if (opts.fixture) {
    const filePath = path.join(/*turbopackIgnore: true*/ dir, opts.fixture);
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      return respond(url, filePath);
    }
  }

  if (source === "places_details") {
    const fromIndex = resolvePlacesDetailsIndex(url, opts.fixture);
    if (fromIndex) return fromIndex;
  }

  // Les recherches Places sur un secteur sans fixture renvoient simplement
  // « aucun résultat » : cela permet de cocher n'importe quel secteur en mock.
  if (source === "places_search") {
    return {
      url,
      status: 200,
      body: Buffer.from(JSON.stringify({ places: [] }), "utf8"),
      headers: { "content-type": "application/json", "x-fixture": "(vide)" },
      fromCache: true,
      fetchedAt: new Date().toISOString(),
    };
  }

  throw new MissingFixtureError(
    source,
    url,
    path.join(/*turbopackIgnore: true*/ dir, opts.fixture ?? "<nom>.json"),
  );
}
